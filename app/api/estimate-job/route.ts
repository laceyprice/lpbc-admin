import { NextRequest, NextResponse } from 'next/server'
export const dynamic = 'force-dynamic'
export const maxDuration = 120
import { createServerClient } from '@/lib/supabase'
import { getAnthropicClient } from '@/lib/anthropic'

const BUCKET = 'job-planning'

// POST /api/estimate-job
// body: {
//   description: string,
//   measurements?: string,               // free-form measurements / scope notes
//   attachments?: [{ path, name, type, size }]   // from /api/job-planning upload
// }

export async function POST(req: NextRequest) {
  const { description, measurements, attachments } = await req.json()
  if (!description || description.trim().length < 10) {
    return NextResponse.json({ error: 'Provide a job description (at least 10 characters)' }, { status: 400 })
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

  // ── Attachments: split into images (Claude vision) vs other (referenced) ──
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
          // Cap to ~10 images to control token cost + Claude limits
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
  "labor_estimate": { "hours": number, "rate_per_hour": number, "total": number },
  "subcontractor_estimate": number,
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

When photos are provided, populate "photo_observations" with 2–5 specific things you SEE in the images that affect pricing (e.g. "existing tile is mud-set — demo will be heavier", "wall behind toilet shows water damage"). If no photos, return an empty array.

Pricing guidance:
- Anchor materials to the Top Vendors list — those are LPBC's actual suppliers
- Labor rate: estimate from past expense entries for labor/subcontractor payees, or use $65-85/hr if no data
- Design/PM fee should reflect complexity: simple service work 8-12% of total; full remodels with permits/coordination 15-22%
- Be specific and grounded — every number defensible from the historical context, the photos, the measurements, or a stated assumption.`

  // Build user content blocks: text + images
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

${imageAttachments.length ? `\n${imageAttachments.length} photo(s) of the project follow. Examine them carefully for scope, condition, materials in place, and anything that affects cost.\n` : ''}

Produce the JSON estimate now.`
  })

  for (const img of imageAttachments) {
    userContent.push({
      type: 'image',
      source: {
        type: 'base64',
        media_type: img.mediaType,
        data: img.base64,
      },
    })
  }

  try {
    const client = getAnthropicClient()
    // Use Haiku for speed — FluxCloud's ingress times out connections at 60s,
    // and Sonnet vision with bookkeeping context routinely takes 70-90s.
    // Haiku 4.5 supports vision and produces structured JSON reliably.
    const resp = await client.messages.create({
      model: 'claude-haiku-4-5',
      max_tokens: 3000,
      system: systemPrompt,
      messages: [{ role: 'user', content: userContent }],
    })
    const text = resp.content
      .filter((b: any) => b.type === 'text')
      .map((b: any) => b.text)
      .join('')

    let jsonStr = text.trim()
    const fenceMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*?)\s*```/)
    if (fenceMatch) jsonStr = fenceMatch[1].trim()
    let estimate: any
    try { estimate = JSON.parse(jsonStr) }
    catch (e) {
      return NextResponse.json({ error: 'AI returned malformed JSON', raw: text }, { status: 502 })
    }

    return NextResponse.json({
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
    // Surface as much detail as possible — Anthropic SDK errors have status,
    // error, and headers properties that explain network vs API failures.
    console.error('estimate-job failed', {
      message: e?.message, status: e?.status, type: e?.error?.type,
      cause: e?.cause?.code, name: e?.name,
      images: imageAttachments.length,
      imageBytesTotal: imageAttachments.reduce((s, i) => s + i.base64.length, 0),
    })
    const detail = e?.error?.message || e?.cause?.code || e?.cause?.message || ''
    return NextResponse.json({
      error: e?.message || 'Estimate failed',
      detail,
      status: e?.status,
      name: e?.name,
      type: e?.error?.type,
    }, { status: 500 })
  }
}
