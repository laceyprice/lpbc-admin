import { NextRequest, NextResponse } from 'next/server'
export const dynamic = 'force-dynamic'
import { createServerClient } from '@/lib/supabase'

// GET  /api/bank-accounts           → list all active accounts
// POST /api/bank-accounts           → create account
// PATCH /api/bank-accounts          → update account
// DELETE /api/bank-accounts?id=uuid → deactivate (soft delete)

export async function GET(req: NextRequest) {
  const supabase = createServerClient()
  const { data, error } = await supabase
    .from('bank_accounts')
    .select('*')
    .eq('is_active', true)
    .order('created_at', { ascending: true })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data || [])
}

export async function POST(req: NextRequest) {
  const supabase = createServerClient()
  const body = await req.json()
  if (!body.name) return NextResponse.json({ error: 'Account name required' }, { status: 400 })
  const { data, error } = await supabase.from('bank_accounts').insert({
    name: body.name,
    account_type: body.account_type || 'checking',
    institution: body.institution || null,
    last_four: body.last_four || null,
    notes: body.notes || null,
    is_active: true,
  }).select().single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data, { status: 201 })
}

export async function PATCH(req: NextRequest) {
  const supabase = createServerClient()
  const body = await req.json()
  const { id, ...updates } = body
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })
  const { data, error } = await supabase.from('bank_accounts').update(updates).eq('id', id).select().single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function DELETE(req: NextRequest) {
  const supabase = createServerClient()
  const id = req.nextUrl.searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })
  // Soft delete — keep transactions intact
  await supabase.from('bank_accounts').update({ is_active: false }).eq('id', id)
  return NextResponse.json({ success: true })
}
