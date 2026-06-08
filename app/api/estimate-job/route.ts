import { NextRequest } from 'next/server'
export const dynamic = 'force-dynamic'
export const maxDuration = 300
import { createServerClient } from '@/lib/supabase'
import { getAnthropicClient } from '@/lib/anthropic'

const BUCKET = 'job-planning'

// POST /api/estimate-job
// Streams Server-Sent Events. Keeps the connection alive past nginx's 60s
// timeout because bytes flow continuously while Claude generates tokens.
//
// Event types:
//   event: progress   data: { tokens_so_far }
//   event: result     data: { estimate, historical_data_used }
//   event: error      data: { error }
export async function POST(req: NextRequest) {
  const { description, measurements, attachments } = await req.json()
  if (!description || description.trim().length < 10) {
    return new Response(JSON.stringify({ error: 'Provide a job description (at least 10 characters)' }), { status: 400, headers: { 'Content-Type': 'application/json' } })
  }

  const supabase = createServerClient()

  // ── Historical context ────────────────────────────────────────────────
  const { data: pastInvoices } = await supabase
    .from('invoices')
    .select('invoice_number, service_type, service_description, amount_due, service_date, job_address')
    .gt('amount_due', 0)
    .order('service_date', { ascending: false })
    .limit(20)

  const { data: pastExpenses } = await supabase
    .from('accounting_entries')
    .select('description, payee, amount, transaction_date, category')
    .lt('amount', 0)
    .order('transaction_date', { ascending: false })
    .limit(80)

  const vendorCounts = new Map<string, { count: number; total: number }>()
  for (const e of pastExpenses ?? []) {
    if (!e.payee) continue
    const k = e.payee.trim()
    if (!vendorCounts.has(k)) vendorCounts.set(k, { count: 0, total: 0 })
    const v = vendorCounts.get(k)!
    v.count += 1
    v.total += Math.abs(Number(e.amount))
  }
  const topVendors = Array.from(vendorCounts.entries())
    .sort((a, b) => b[1].count - a[1].count)
    .slice(0, 15)
    .map(([name, v]) => ({ name, transactions: v.count, total_spent: Number(v.total.toFixed(2)) }))

  const invoiceLines = (pastInvoices ?? []).slice(0, 15).map(i =>
    `• ${i.service_date || '?'} | $${Number(i.amount_due).toFixed(2)} | ${i.service_type || 'Service'} | ${(i.service_description || '').slice(0, 100)}`
  ).join('\n')
  const expenseLines = (pastExpenses ?? []).slice(0, 40).map(e =>
    `• ${e.transaction_date} | $${Math.abs(Number(e.amount)).toFixed(2)} | ${e.payee || '?'} | ${(e.description || '').slice(0, 60)}`
  ).join('\n')
  const vendorLines = topVendors.map(v =>
    `• ${v.name} — ${v.transactions} txns, total $${v.total_spent.toFixed(2)}`
  ).join('\n')

  // ── Attachments ────────────────────────────────────────────────────────
  const imageAttachments: Array<{ name: string; mediaType: string; base64: string }> = []
  const otherAttachments: Array<{ name: string; type: string; size: number }> = []
  if (Array.isArray(attachments)) {
    for (const att of attachments) {
      if (!att?.path) continue
      const isImage = typeof att.type === 'string' && att.type.startsWith('image/')
      if (isImage) {
        try {
          const { data: blob, error } = await supabase.storage.from(BUCKET).download(att.path)
          if (error || !blob) continue
          const arrayBuf = await (blob as Blob).arrayBuffer()
          const base64 = Buffer.from(arrayBuf).toString('base64')
          if (imageAttachments.length < 10) {
            imageAttachments.push({ name: att.name, mediaType: att.type || 'image/jpeg', base64 })
          }
        } catch { /* skip unreadable file */ }
      } else {
        otherAttachments.push({ name: att.name, type: att.type || 'unknown', size: att.size || 0 })
      }
    }
  }

  const systemPrompt = `You are a construction estimator for L. Price Building Co. (LPBC), a residential building contractor in Florida. The owner is asking for a job estimate. Use the historical data + any provided photos and measurements to anchor your numbers to what THIS contractor actually pays/charges in THIS market. Do not use national averages if local data is available.

You MUST respond with a single valid JSON object matching this exact schema (no markdown, no prose outside the JSON):
{
  "estimated_total": number,
  "materials_breakdown": [
    { "category": "string", "estimated_cost": number, "notes": "string" }
  ],
  "duration_business_days": number,
  "process_steps": [
    { "step": number, "title": "string", "description": "string", "estimated_days": number }
  ],
  "design_pm_fee": number,
  "design_pm_fee_percent": number,
  "design_pm_fee_rationale": "string",
  "confidence": "low" | "medium" | "high",
  "confidence_rationale": "string",
  "similar_past_jobs": [
    { "service_date": "string", "amount": number, "description": "string" }
  ],
  "assumptions": ["string"],
  "risks": ["string"],
  "photo_observations": ["string"]
}

When photos are provided, populate "photo_observations" with 2–5 specific things you SEE in the images that affect pricing. If no photos, return an empty array.

IMPORTANT — "materials_breakdown" is really a UNIFIED BUDGET BREAKDOWN, not materials-only:
- Do NOT return separate labor_estimate or subcontractor_estimate fields — they no longer exist in this schema.
- Instead, fold EVERY cost into "materials_breakdown" as individual line items — materials AND labor AND subcontractor work all belong in this same list, each as its own line with a clear category.
- Use categories like "Labor — Demo & Framing", "Labor — Finish Carpentry / Paint", "Subcontractor — Plumbing Rough-in", "Subcontractor — Electrical", alongside material categories like "Tile & Flooring Materials", "Cabinetry & Countertops", etc.
- For labor line items, show your math in "notes" (e.g. "approx. 40 hrs @ $75/hr — demo, framing, drywall").
- "estimated_total" = the sum of every line in materials_breakdown (materials + labor + subs combined). Do not add anything on top of that sum.

Pricing guidance:
- Anchor pricing to the Top Vendors list — those are LPBC's actual suppliers — but DO NOT name any retail chain or store (e.g. Lowe's, Home Depot, Menards, Ferguson, etc.) anywhere in your output, including materials_breakdown notes, assumptions, risks, or rationale — UNLESS that exact business name appears verbatim in the Top Vendors list provided to you. Never guess or suggest a generic big-box retailer as a sourcing location. Describe materials generically instead (e.g. "mid-grade stock cabinets," "standard porcelain tile," "supplier-sourced fixtures").
- Labor rate: estimate from past expense entries for labor/subcontractor payees, or use $65-85/hr if no data — and bake the resulting dollar total directly into its own line item(s) as described above.
- Design/PM fee: LPBC's standard baseline is 20% of job cost — use 20% by default. Only deviate from it when complexity clearly warrants: simple, single-trade service work with no design/sourcing involved can go as low as ~15%; highly complex multi-trade remodels with heavy permitting/coordination can go up to ~25%. Explain any deviation from the 20% baseline in design_pm_fee_rationale.
- Be specific and grounded.`

  const userContent: any[] = []
  userContent.push({
    type: 'text',
    text: `JOB DESCRIPTION:
${description}

${measurements?.trim() ? `MEASUREMENTS / SCOPE NOTES:\n${measurements.trim()}\n` : ''}
${otherAttachments.length ? `NON-IMAGE ATTACHMENTS (referenced — content not viewable to you):\n${otherAttachments.map(a => `• ${a.name} (${a.type}, ${(a.size/1024/1024).toFixed(1)}MB)`).join('\n')}\n` : ''}
HISTORICAL CONTEXT FROM LPBC'S BOOKS:

== Past invoices (most recent first) ==
${invoiceLines || '(none yet)'}

== Recent expense ledger (most recent first) ==
${expenseLines || '(none yet)'}

== Top vendors / cost centers ==
${vendorLines || '(none yet)'}

${imageAttachments.length ? `\n${imageAttachments.length} photo(s) of the project follow.\n` : ''}

Produce the JSON estimate now.`
  })
  for (const img of imageAttachments) {
    userContent.push({
      type: 'image',
      source: { type: 'base64', media_type: img.mediaType, data: img.base64 },
    })
  }

  // ── Stream response ────────────────────────────────────────────────────
  const encoder = new TextEncoder()
  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: string, data: any) => {
        controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`))
      }
      const heartbeat = setInterval(() => {
        try { controller.enqueue(encoder.encode(':keepalive\n\n')) } catch {}
      }, 5000)

      try {
        send('start', { images: imageAttachments.length, expenses: pastExpenses?.length || 0, invoices: pastInvoices?.length || 0 })

        const client = getAnthropicClient()
        // Use messages.create() (not .stream()) — the streaming SDK method uses a
        // different internal fetch transport that fails in this container environment,
        // while .create() works fine (same transport as parse-receipt).
        // The SSE wrapper + heartbeat is still here to keep the nginx proxy alive
        // during the wait (can be 30-90s), so we don't get a 504.
        // NOTE: claude-3-5-haiku-20241022 has been retired by Anthropic (404
        // not_found_error as of mid-2026) — switched to claude-sonnet-4-5,
        // which is confirmed live in this app (see inventory/route.ts).
        send('progress', { tokens_so_far: 0, status: 'calling_claude' })
        const resp = await client.messages.create({
          model: 'claude-sonnet-4-5',
          max_tokens: 8000,
          system: systemPrompt,
          messages: [{ role: 'user', content: userContent }],
        })
        const fullText = resp.content
          .filter((b: any) => b.type === 'text')
          .map((b: any) => b.text)
          .join('')
        send('progress', { tokens_so_far: fullText.length, status: 'parsing' })
        if (resp.stop_reason === 'max_tokens') {
          console.error('estimate-job: response truncated by max_tokens', { len: fullText.length })
        }

        // Extract JSON from the accumulated text — try several strategies
        let jsonStr = fullText.trim()
        let estimate: any
        const extractStrategies = [
          // 1. Direct parse
          () => jsonStr,
          // 2. Code fence with json marker
          () => { const m = jsonStr.match(/```json\s*([\s\S]*?)\s*```/); return m?.[1] ?? null },
          // 3. Code fence without marker
          () => { const m = jsonStr.match(/```\s*([\s\S]*?)\s*```/); return m?.[1] ?? null },
          // 4. First { ... } block spanning the whole output
          () => { const m = jsonStr.match(/(\{[\s\S]*\})/); return m?.[1] ?? null },
        ]
        for (const strategy of extractStrategies) {
          try {
            const candidate = strategy()
            if (!candidate) continue
            estimate = JSON.parse(candidate)
            break
          } catch {}
        }
        if (!estimate) {
          console.error('estimate-job: could not parse JSON', { raw: fullText.slice(0, 2000), stop_reason: resp.stop_reason, len: fullText.length })
          const truncatedNote = resp.stop_reason === 'max_tokens' ? ' (response was cut off — hit max_tokens limit)' : ''
          send('error', {
            error: `AI returned malformed JSON — try again${truncatedNote}`,
            detail: `model:claude-sonnet-4-5 stop_reason:${resp.stop_reason || '?'} output_chars:${fullText.length}`,
            raw: (fullText.slice(0, 600) + (fullText.length > 600 ? `\n…[+${fullText.length - 600} more chars, stop_reason=${resp.stop_reason}]` : '')),
          })
          clearInterval(heartbeat)
          controller.close()
          return
        }

        send('result', {
          estimate,
          historical_data_used: {
            invoices_considered: pastInvoices?.length ?? 0,
            expenses_considered: pastExpenses?.length ?? 0,
            top_vendors: topVendors.length,
            images_analyzed: imageAttachments.length,
            other_files: otherAttachments.length,
          },
        })
      } catch (e: any) {
        const errDetail = {
          message: e?.message,
          status: e?.status,
          type: e?.error?.type,
          cause: e?.cause?.code || e?.cause?.message,
          name: e?.name,
        }
        console.error('estimate-job stream failed', errDetail)
        send('error', {
          error: e?.message || 'Estimate failed',
          detail: `model:claude-sonnet-4-5 status:${e?.status || '?'} type:${e?.error?.type || '?'} cause:${e?.cause?.code || e?.cause?.message || '?'}`,
        })
      } finally {
        clearInterval(heartbeat)
        try { controller.close() } catch {}
      }
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      'X-Accel-Buffering': 'no',          // disable nginx response buffering
      'Connection': 'keep-alive',
    },
  })
}
