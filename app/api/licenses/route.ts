import { NextRequest, NextResponse } from 'next/server'
export const dynamic = 'force-dynamic'
import { createServerClient } from '@/lib/supabase'

// GET    /api/licenses                    → list all (with jurisdiction join)
// GET    /api/licenses?id=uuid            → single
// GET    /api/licenses?status=active      → filter
// POST   /api/licenses                    → create
// PATCH  /api/licenses                    → update (body: { id, ...fields })
// DELETE /api/licenses?id=uuid            → delete

export async function GET(req: NextRequest) {
  const supabase = createServerClient()
  const id = req.nextUrl.searchParams.get('id')
  const status = req.nextUrl.searchParams.get('status')
  const search = req.nextUrl.searchParams.get('search')

  if (id) {
    const { data, error } = await supabase
      .from('licenses')
      .select(`*, jurisdiction:permit_jurisdictions(id, name, state, agency_type, website_url)`)
      .eq('id', id)
      .single()
    if (error) return NextResponse.json({ error: error.message }, { status: 404 })
    return NextResponse.json(data)
  }

  let query = supabase
    .from('licenses')
    .select(`*, jurisdiction:permit_jurisdictions(id, name, state, agency_type, website_url)`)
    .order('expiry_date', { ascending: true, nullsFirst: false })

  if (status) query = query.eq('status', status)
  if (search) query = query.or(`license_number.ilike.%${search}%,holder_name.ilike.%${search}%,classification.ilike.%${search}%`)

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Annotate with days-until-expiry for the UI
  const now = new Date()
  const enriched = (data || []).map((lic: any) => {
    if (!lic.expiry_date) return { ...lic, days_until_expiry: null, is_expiring_soon: false, is_expired: false }
    const expiry = new Date(lic.expiry_date + 'T00:00:00')
    const daysLeft = Math.floor((expiry.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
    return {
      ...lic,
      days_until_expiry: daysLeft,
      is_expiring_soon: daysLeft >= 0 && daysLeft <= 60,
      is_expired: daysLeft < 0,
    }
  })

  return NextResponse.json(enriched)
}

export async function POST(req: NextRequest) {
  const supabase = createServerClient()
  const body = await req.json()
  if (!body.holder_name) return NextResponse.json({ error: 'holder_name required' }, { status: 400 })

  const { data, error } = await supabase.from('licenses').insert({
    license_number: body.license_number || null,
    license_type: body.license_type || 'contractor',
    classification: body.classification || null,
    description: body.description || null,
    holder_name: body.holder_name,
    holder_type: body.holder_type || 'business',
    jurisdiction_id: body.jurisdiction_id || null,
    jurisdiction_name: body.jurisdiction_name || null,
    status: body.status || 'active',
    application_date: body.application_date || null,
    issue_date: body.issue_date || null,
    expiry_date: body.expiry_date || null,
    last_renewed_date: body.last_renewed_date || null,
    renewal_url: body.renewal_url || null,
    renewal_period_months: body.renewal_period_months ?? 12,
    fee: body.fee || null,
    fee_paid: body.fee_paid ?? false,
    source: body.source || 'manual',
    notes: body.notes || null,
  }).select().single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data, { status: 201 })
}

export async function PATCH(req: NextRequest) {
  const supabase = createServerClient()
  const body = await req.json()
  // Strip joined relations + auto-managed fields before update
  const { id, jurisdiction, days_until_expiry, is_expiring_soon, is_expired, created_at, updated_at, ...updates } = body
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })

  const { data, error } = await supabase
    .from('licenses')
    .update(updates)
    .eq('id', id)
    .select()
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function DELETE(req: NextRequest) {
  const supabase = createServerClient()
  const id = req.nextUrl.searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })
  const { error } = await supabase.from('licenses').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
