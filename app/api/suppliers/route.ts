import { NextRequest, NextResponse } from 'next/server'
export const dynamic = 'force-dynamic'
import { createServerClient } from '@/lib/supabase'

// GET    /api/suppliers              → list all active suppliers
// GET    /api/suppliers?id=uuid      → single supplier with their inventory items
// POST   /api/suppliers              → create
// PATCH  /api/suppliers              → update (body: { id, ...fields })
// DELETE /api/suppliers?id=uuid      → soft-delete

export async function GET(req: NextRequest) {
  const supabase = createServerClient()
  const id = req.nextUrl.searchParams.get('id')

  if (id) {
    const { data: supplier, error } = await supabase
      .from('suppliers')
      .select('*')
      .eq('id', id)
      .single()
    if (error) return NextResponse.json({ error: error.message }, { status: 404 })

    const { data: items } = await supabase
      .from('inventory_items')
      .select('id, name, category, unit, unit_cost, quantity_on_hand, reorder_point')
      .eq('supplier_id', id)
      .eq('is_active', true)
      .order('name')

    return NextResponse.json({ ...supplier, items: items || [] })
  }

  const { data, error } = await supabase
    .from('suppliers')
    .select('*, items:inventory_items(count)')
    .eq('is_active', true)
    .order('name')
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data || [])
}

export async function POST(req: NextRequest) {
  const supabase = createServerClient()
  const body = await req.json()
  if (!body.name) return NextResponse.json({ error: 'name required' }, { status: 400 })
  const { data, error } = await supabase.from('suppliers').insert({
    name: body.name,
    contact_name: body.contact_name || null,
    contact_email: body.contact_email || null,
    contact_phone: body.contact_phone || null,
    website: body.website || null,
    account_number: body.account_number || null,
    address: body.address || null,
    notes: body.notes || null,
    is_active: true,
  }).select().single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data, { status: 201 })
}

export async function PATCH(req: NextRequest) {
  const supabase = createServerClient()
  const body = await req.json()
  const { id, items, ...updates } = body
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })
  const { data, error } = await supabase.from('suppliers').update(updates).eq('id', id).select().single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function DELETE(req: NextRequest) {
  const supabase = createServerClient()
  const id = req.nextUrl.searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })
  // Soft delete to preserve history
  await supabase.from('suppliers').update({ is_active: false }).eq('id', id)
  return NextResponse.json({ success: true })
}
