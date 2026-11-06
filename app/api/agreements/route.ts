import { NextRequest, NextResponse } from 'next/server'
export const dynamic = 'force-dynamic'
import { createServerClient } from '@/lib/supabase'
import { nextServiceDate } from '@/lib/agreements'

// Recurring service agreements (annual inspections, maintenance contracts).
// GET    /api/agreements                    → all (soonest due first)
// POST   /api/agreements                    → create
// POST   /api/agreements?action=serviced    { id, date? } → mark done today; moves next_service_date forward by the frequency
// PATCH  /api/agreements                    { id, ...fields }
// DELETE /api/agreements?id=uuid
// The daily cron turns anything due within 30 days into a Todo (and emails the customer if remind_customer is on).

const today = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}` }
const FIELDS = ['customer_name', 'customer_email', 'customer_phone', 'service_address', 'service_description', 'amount', 'frequency', 'next_service_date', 'last_service_date', 'remind_customer', 'is_active', 'notes']
const pick = (b: any) => { const o: Record<string, any> = {}; for (const k of FIELDS) if (k in b) o[k] = b[k] === '' ? null : b[k]; return o }

export async function GET() {
  const { data, error } = await createServerClient().from('service_agreements').select('*').order('next_service_date', { ascending: true, nullsFirst: false })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data || [])
}

export async function POST(req: NextRequest) {
  const supabase = createServerClient()
  const b = await req.json().catch(() => ({}))
  if (req.nextUrl.searchParams.get('action') === 'serviced') {
    const { data: a } = await supabase.from('service_agreements').select('*').eq('id', b.id).single()
    if (!a) return NextResponse.json({ error: 'Agreement not found' }, { status: 404 })
    const done = b.date || today()
    const next = nextServiceDate(a.next_service_date, a.frequency, today())
    const { data, error } = await supabase.from('service_agreements').update({ last_service_date: done, next_service_date: next, updated_at: new Date().toISOString() }).eq('id', a.id).select().single()
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json(data)
  }
  if (!String(b.customer_name || '').trim()) return NextResponse.json({ error: 'Customer name is required' }, { status: 400 })
  const { data, error } = await supabase.from('service_agreements').insert(pick(b)).select().single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data, { status: 201 })
}

export async function PATCH(req: NextRequest) {
  const b = await req.json().catch(() => ({}))
  if (!b.id) return NextResponse.json({ error: 'id required' }, { status: 400 })
  const { data, error } = await createServerClient().from('service_agreements').update({ ...pick(b), updated_at: new Date().toISOString() }).eq('id', b.id).select().single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function DELETE(req: NextRequest) {
  const id = req.nextUrl.searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })
  const { error } = await createServerClient().from('service_agreements').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
