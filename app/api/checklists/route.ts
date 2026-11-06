import { NextRequest, NextResponse } from 'next/server'
export const dynamic = 'force-dynamic'
import { createServerClient } from '@/lib/supabase'
import { runPassed, templateById, unanswered } from '@/lib/checklists'

// Completed safety / pressure-test checklists, each with the customer's or tech's signature.
// GET    /api/checklists            → recent runs (no signature image, to keep it light)
// GET    /api/checklists?id=uuid    → one run including the signature
// POST   /api/checklists            { template, answers, job_address?, customer_name?, tech_name?, invoice_id?, notes?, signature, signed_by }
// DELETE /api/checklists?id=uuid
export async function GET(req: NextRequest) {
  const supabase = createServerClient()
  const id = req.nextUrl.searchParams.get('id')
  if (id) {
    const { data, error } = await supabase.from('checklist_runs').select('*').eq('id', id).single()
    if (error) return NextResponse.json({ error: error.message }, { status: 404 })
    return NextResponse.json(data)
  }
  const { data, error } = await supabase.from('checklist_runs').select('id,template,title,job_address,customer_name,tech_name,passed,signed_by,signed_at,created_at').order('created_at', { ascending: false }).limit(200)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data || [])
}

export async function POST(req: NextRequest) {
  const b = await req.json().catch(() => ({}))
  const t = templateById(b.template)
  if (!t) return NextResponse.json({ error: 'Unknown checklist' }, { status: 400 })
  const answers = b.answers && typeof b.answers === 'object' ? b.answers : {}
  const missing = unanswered(t, answers)
  if (missing.length) return NextResponse.json({ error: `Answer every item before signing (${missing.length} left)` }, { status: 400 })
  if (!String(b.signature || '').startsWith('data:image/')) return NextResponse.json({ error: 'A signature is required' }, { status: 400 })
  if (String(b.signature).length > 400_000) return NextResponse.json({ error: 'Signature image is too large' }, { status: 413 })
  if (!String(b.signed_by || '').trim()) return NextResponse.json({ error: 'Enter the name of the person signing' }, { status: 400 })
  const { data, error } = await createServerClient().from('checklist_runs').insert({
    template: t.id, title: t.name, answers, passed: runPassed(t, answers),
    job_address: String(b.job_address || '').trim() || null, customer_name: String(b.customer_name || '').trim() || null,
    tech_name: String(b.tech_name || '').trim() || null, invoice_id: b.invoice_id || null, notes: String(b.notes || '').trim() || null,
    signature: b.signature, signed_by: String(b.signed_by).trim(), signed_at: new Date().toISOString(),
  }).select('id,passed').single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data, { status: 201 })
}

export async function DELETE(req: NextRequest) {
  const id = req.nextUrl.searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })
  const { error } = await createServerClient().from('checklist_runs').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
