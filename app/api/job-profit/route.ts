import { NextRequest, NextResponse } from 'next/server'
export const dynamic = 'force-dynamic'
import { createServerClient } from '@/lib/supabase'
import { getSettings } from '@/lib/settings'

// Job profitability. A "job" is an invoice: revenue = what was billed, minus labor (time entries)
// and other costs (materials, subs, permits…) logged against it.
//
// GET    /api/job-profit                    → every non-quote job with revenue, labor, costs, profit, margin
// GET    /api/job-profit?invoice_id=uuid    → that job's time entries + cost entries
// POST   /api/job-profit?action=time        { invoice_id, hours, hourly_rate?, worker?, work_date?, notes? }
// POST   /api/job-profit?action=cost        { invoice_id, amount, category?, description?, vendor?, cost_date? }
// DELETE /api/job-profit?kind=time|cost&id=uuid

const num = (v: any) => Number(v) || 0

export async function GET(req: NextRequest) {
  const supabase = createServerClient()
  const invoiceId = req.nextUrl.searchParams.get('invoice_id')

  if (invoiceId) {
    const [t, c] = await Promise.all([
      supabase.from('time_entries').select('*').eq('invoice_id', invoiceId).order('work_date', { ascending: false }),
      supabase.from('job_costs').select('*').eq('invoice_id', invoiceId).order('cost_date', { ascending: false }),
    ])
    if (t.error || c.error) return NextResponse.json({ error: (t.error || c.error)!.message }, { status: 500 })
    return NextResponse.json({ time: t.data || [], costs: c.data || [] })
  }

  const [inv, t, c, s] = await Promise.all([
    supabase.from('invoices').select('id,invoice_number,invoice_type,invoice_status,customer_name,job_address,amount_due,amount_paid,created_at,service_date')
      .neq('invoice_type', 'quote').not('invoice_status', 'in', '(cancelled,draft)').order('created_at', { ascending: false }).limit(500),
    supabase.from('time_entries').select('invoice_id,hours,hourly_rate'),
    supabase.from('job_costs').select('invoice_id,amount'),
    getSettings(),
  ])
  if (inv.error) return NextResponse.json({ error: inv.error.message }, { status: 500 })
  // time_entries / job_costs missing (migration not run) → treat as no entries
  const labor = new Map<string, { hours: number; cost: number }>()
  for (const r of t.data || []) { const k = r.invoice_id; const cur = labor.get(k) || { hours: 0, cost: 0 }; cur.hours += num(r.hours); cur.cost += num(r.hours) * num(r.hourly_rate); labor.set(k, cur) }
  const costs = new Map<string, number>()
  for (const r of c.data || []) costs.set(r.invoice_id, (costs.get(r.invoice_id) || 0) + num(r.amount))

  const jobs = (inv.data || []).map((i: any) => {
    const revenue = i.invoice_status === 'uncollectible' ? num(i.amount_paid) : num(i.amount_due)   // written off → only what was actually collected counts
    const l = labor.get(i.id) || { hours: 0, cost: 0 }
    const other = costs.get(i.id) || 0
    const profit = revenue - l.cost - other
    return { ...i, revenue, hours: l.hours, labor_cost: l.cost, other_costs: other, profit, margin: revenue > 0 ? profit / revenue : null, has_costs: l.hours > 0 || other > 0 }
  })
  return NextResponse.json({ jobs, default_rate: num(s.default_hourly_rate) })
}

export async function POST(req: NextRequest) {
  const supabase = createServerClient()
  const action = req.nextUrl.searchParams.get('action')
  const b = await req.json().catch(() => ({}))
  if (!b.invoice_id) return NextResponse.json({ error: 'invoice_id required' }, { status: 400 })

  if (action === 'time') {
    const hours = num(b.hours)
    if (!(hours > 0)) return NextResponse.json({ error: 'Enter the hours worked' }, { status: 400 })
    const rate = b.hourly_rate === undefined || b.hourly_rate === '' ? num((await getSettings()).default_hourly_rate) : num(b.hourly_rate)
    const { data, error } = await supabase.from('time_entries').insert({
      invoice_id: b.invoice_id, hours, hourly_rate: rate, worker: String(b.worker || '').trim() || null,
      work_date: b.work_date || new Date().toISOString().slice(0, 10), notes: String(b.notes || '').trim() || null,
    }).select().single()
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json(data, { status: 201 })
  }
  if (action === 'cost') {
    const amount = num(b.amount)
    if (!(amount > 0)) return NextResponse.json({ error: 'Enter the amount' }, { status: 400 })
    const { data, error } = await supabase.from('job_costs').insert({
      invoice_id: b.invoice_id, amount, category: b.category || 'materials', description: String(b.description || '').trim() || null,
      vendor: String(b.vendor || '').trim() || null, cost_date: b.cost_date || new Date().toISOString().slice(0, 10),
    }).select().single()
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json(data, { status: 201 })
  }
  return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
}

export async function DELETE(req: NextRequest) {
  const kind = req.nextUrl.searchParams.get('kind')
  const id = req.nextUrl.searchParams.get('id')
  if (!id || (kind !== 'time' && kind !== 'cost')) return NextResponse.json({ error: 'kind and id required' }, { status: 400 })
  const { error } = await createServerClient().from(kind === 'time' ? 'time_entries' : 'job_costs').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
