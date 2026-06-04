import { NextRequest, NextResponse } from 'next/server'
export const dynamic = 'force-dynamic'
export const maxDuration = 60
import { createServerClient } from '@/lib/supabase'
import { getAnthropicClient } from '@/lib/anthropic'

// POST /api/estimate-job
// body: { description: string }
//
// Pulls historical job-cost data from bookkeeping (categorized accounting
// entries + invoice records) and asks Claude to produce an estimate
// structured as JSON: estimated_total, materials_breakdown, labor_estimate,
// duration_days, process_steps, design_pm_fee, design_pm_fee_rationale,
// confidence, similar_past_jobs.

export async function POST(req: NextRequest) {
  const { description } = await req.json()
  if (!description || description.trim().length < 10) {
    return NextResponse.json({ error: 'Provide a job description (at least 10 characters)' }, { status: 400 })
  }

  const supabase = createServerClient()

  // ── Historical context ────────────────────────────────────────────────
  // 1. Past invoices with non-zero amounts — useful for end-customer pricing
  const { data: pastInvoices } = await supabase
    .from('invoices')
    .select('invoice_number, service_type, service_description, amount_due, service_date, job_address')
    .gt('amount_due', 0)
    .order('service_date', { ascending: false })
    .limit(50)

  // 2. Recent expense entries (materials, labor, subs) — useful for job costs
  const { data: pastExpenses } = await supabase
    .from('accounting_entries')
    .select('description, payee, amount, transaction_date, category')
    .lt('amount', 0)               // outflows = job costs
    .order('transaction_date', { ascending: false })
    .limit(200)

  // 3. Most-used vendors so the estimate names suppliers Lacey actually uses
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

  // Build a compact context block (token budget conscious)
  const invoiceLines = (pastInvoices ?? []).slice(0, 25).map(i =>
    `• ${i.service_date || '?'} | $${Number(i.amount_due).toFixed(2)} | ${i.service_type || 'Service'} | ${(i.service_description || '').slice(0, 120)}`
  ).join('\n')

  const expenseLines = (pastExpenses ?? []).slice(0, 60).map(e =>
    `• ${e.transaction_date} | $${Math.abs(Number(e.amount)).toFixed(2)} | ${e.payee || '?'} | ${(e.description || '').slice(0, 80)}`
  ).join('\n')

  const vendorLines = topVendors.map(v =>
    `• ${v.name} — ${v.transactions} txns, total $${v.total_spent.toFixed(2)}`
  ).join('\n')

  const systemPrompt = `You are a construction estimator for L. Price Building Co. (LPBC), a residential building contractor in Florida. The owner is asking for a job estimate. Use the historical data provided to anchor your numbers to what THIS contractor actually pays/charges in THIS market. Do not use national averages if local data is available.

You MUST respond with a single valid JSON object matching this exact schema (no markdown, no prose outside the JSON):
{
  "estimated_total": number,                       // total job cost including materials + labor + subs (NOT including the design/PM fee)
  "materials_breakdown": [                          // 3-8 line items
    { "category": "string", "estimated_cost": number, "notes": "string" }
  ],
  "labor_estimate": { "hours": number, "rate_per_hour": number, "total": number },
  "subcontractor_estimate": number,                 // 0 if none needed
  "duration_business_days": number,
  "process_steps": [                                // 3-10 ordered steps
    { "step": number, "title": "string", "description": "string", "estimated_days": number }
  ],
  "design_pm_fee": number,                          // recommended dollar amount for design + project management
  "design_pm_fee_percent": number,                  // as a % of estimated_total (e.g. 12.5)
  "design_pm_fee_rationale": "string",              // 1-2 sentences explaining why this fee is appropriate
  "confidence": "low" | "medium" | "high",
  "confidence_rationale": "string",                 // why this level of confidence
  "similar_past_jobs": [                            // 0-3 invoices that informed the estimate
    { "service_date": "string", "amount": number, "description": "string" }
  ],
  "assumptions": ["string"],                        // 2-5 explicit assumptions you made
  "risks": ["string"]                               // 1-4 things that could blow the budget
}

Pricing guidance:
- Anchor materials to the Top Vendors list — those are LPBC's actual suppliers (Ferguson, Home Depot, Lowe's, etc.)
- Labor rate: estimate from past expense entries for "Labor" / "Subcontractor" payees, or use $65-85/hr if no data
- Design/PM fee should reflect complexity: simple service work might be 8-12% of total; full remodels with permits/coordination 15-22%
- Be specific and grounded — every number should be defensible from the historical context or a stated assumption.`

  const userPrompt = `JOB DESCRIPTION:
${description}

HISTORICAL CONTEXT FROM LPBC'S BOOKS:

== Past invoices (most recent first) ==
${invoiceLines || '(none yet)'}

== Recent expense ledger (most recent first) ==
${expenseLines || '(none yet)'}

== Top vendors / cost centers ==
${vendorLines || '(none yet)'}

Produce the JSON estimate now.`

  try {
    const client = getAnthropicClient()
    const resp = await client.messages.create({
      model: 'claude-sonnet-4-5',
      max_tokens: 4000,
      system: systemPrompt,
      messages: [{ role: 'user', content: userPrompt }],
    })
    const text = resp.content
      .filter((b: any) => b.type === 'text')
      .map((b: any) => b.text)
      .join('')

    // Extract JSON (Claude sometimes wraps in code fences despite instructions)
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
      },
    })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Estimate failed' }, { status: 500 })
  }
}
