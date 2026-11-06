import { NextRequest, NextResponse } from 'next/server'
export const dynamic = 'force-dynamic'
import { createServerClient } from '@/lib/supabase'
import { subFlags, threshold1099 } from '@/lib/subs'

// Subcontractors and what you've paid them (for 1099-NEC at year end).
// GET    /api/subcontractors?year=2026          → subs with paid_ytd + flags, plus { threshold }
// GET    /api/subcontractors?id=uuid&year=…     → one sub's payments
// POST   /api/subcontractors                    → create sub      PATCH → update sub {id,…}
// POST   /api/subcontractors?action=payment     { subcontractor_id, amount, pay_date?, description?, invoice_id? }
// DELETE /api/subcontractors?id=uuid            → remove sub (and its payments)
// DELETE /api/subcontractors?payment_id=uuid    → remove one payment
// Only the LAST 4 of a tax ID is ever stored — keep the W-9 itself in Insurance & Other Docs.

const num = (v: any) => Number(v) || 0
const todayStr = () => new Date().toISOString().slice(0, 10)
const FIELDS = ['name', 'business_name', 'trade', 'email', 'phone', 'tax_id_last4', 'w9_on_file', 'coi_expiry', 'is_active', 'notes']
const pick = (b: any) => { const o: Record<string, any> = {}; for (const k of FIELDS) if (k in b) o[k] = b[k] === '' ? null : b[k]; if (o.tax_id_last4) o.tax_id_last4 = String(o.tax_id_last4).replace(/\D/g, '').slice(-4) || null; return o }

export async function GET(req: NextRequest) {
  const supabase = createServerClient()
  const year = Number(req.nextUrl.searchParams.get('year')) || new Date().getFullYear()
  const id = req.nextUrl.searchParams.get('id')
  const range = (q: any) => q.gte('pay_date', `${year}-01-01`).lte('pay_date', `${year}-12-31`)
  if (id) {
    const { data, error } = await range(supabase.from('sub_payments').select('*').eq('subcontractor_id', id)).order('pay_date', { ascending: false })
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json(data || [])
  }
  const [subs, pays] = await Promise.all([
    supabase.from('subcontractors').select('*').order('name'),
    range(supabase.from('sub_payments').select('subcontractor_id,amount')),
  ])
  if (subs.error) return NextResponse.json({ error: subs.error.message }, { status: 500 })
  const paid = new Map<string, number>()
  for (const p of pays.data || []) paid.set(p.subcontractor_id, (paid.get(p.subcontractor_id) || 0) + num(p.amount))
  const out = (subs.data || []).map((s: any) => { const y = paid.get(s.id) || 0; return { ...s, paid_ytd: y, flags: subFlags(s, y, year, todayStr()) } })
  return NextResponse.json({ subs: out, year, threshold: threshold1099(year) })
}

export async function POST(req: NextRequest) {
  const supabase = createServerClient()
  const b = await req.json().catch(() => ({}))
  if (req.nextUrl.searchParams.get('action') === 'payment') {
    if (!b.subcontractor_id) return NextResponse.json({ error: 'subcontractor_id required' }, { status: 400 })
    if (!(num(b.amount) > 0)) return NextResponse.json({ error: 'Enter the amount paid' }, { status: 400 })
    const { data, error } = await supabase.from('sub_payments').insert({ subcontractor_id: b.subcontractor_id, amount: num(b.amount), pay_date: b.pay_date || todayStr(), description: String(b.description || '').trim() || null, invoice_id: b.invoice_id || null }).select().single()
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json(data, { status: 201 })
  }
  if (!String(b.name || '').trim()) return NextResponse.json({ error: 'Name is required' }, { status: 400 })
  const { data, error } = await supabase.from('subcontractors').insert(pick(b)).select().single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data, { status: 201 })
}

export async function PATCH(req: NextRequest) {
  const b = await req.json().catch(() => ({}))
  if (!b.id) return NextResponse.json({ error: 'id required' }, { status: 400 })
  const { data, error } = await createServerClient().from('subcontractors').update(pick(b)).eq('id', b.id).select().single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function DELETE(req: NextRequest) {
  const supabase = createServerClient()
  const paymentId = req.nextUrl.searchParams.get('payment_id'), id = req.nextUrl.searchParams.get('id')
  if (paymentId) { const { error } = await supabase.from('sub_payments').delete().eq('id', paymentId); return error ? NextResponse.json({ error: error.message }, { status: 500 }) : NextResponse.json({ success: true }) }
  if (!id) return NextResponse.json({ error: 'id or payment_id required' }, { status: 400 })
  const { error } = await supabase.from('subcontractors').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
