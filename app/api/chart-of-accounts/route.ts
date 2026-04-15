import { NextRequest, NextResponse } from 'next/server'
export const dynamic = 'force-dynamic'
import { createServerClient } from '@/lib/supabase'

export async function GET(req: NextRequest) {
  const supabase = createServerClient()
  const type = req.nextUrl.searchParams.get('type')
  const includeInactive = req.nextUrl.searchParams.get('includeInactive') === 'true'
  let query = supabase
    .from('chart_of_accounts')
    .select('*')
    .order('sort_order', { ascending: true })
    .order('name', { ascending: true })
  if (type) query = query.eq('account_type', type)
  if (!includeInactive) query = query.eq('is_active', true)
  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function POST(req: NextRequest) {
  const supabase = createServerClient()
  const body = await req.json()
  if (!body.name || !body.account_type) {
    return NextResponse.json({ error: 'name and account_type are required' }, { status: 400 })
  }
  const { data, error } = await supabase
    .from('chart_of_accounts')
    .insert({
      account_type: body.account_type,
      name: body.name,
      report_group: body.report_group || null,
      sort_order: body.sort_order ?? 100,
      is_active: body.is_active ?? true,
    })
    .select()
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data, { status: 201 })
}

export async function PATCH(req: NextRequest) {
  const supabase = createServerClient()
  const body = await req.json()
  const { id, ...updates } = body
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })
  const { data, error } = await supabase
    .from('chart_of_accounts')
    .update(updates)
    .eq('id', id)
    .select()
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

// Soft delete by setting is_active = false so historical transactions keep
// their FK intact. Pass ?hard=true to hard-delete (will fail if referenced).
export async function DELETE(req: NextRequest) {
  const supabase = createServerClient()
  const id = req.nextUrl.searchParams.get('id')
  const hard = req.nextUrl.searchParams.get('hard') === 'true'
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })
  if (hard) {
    const { error } = await supabase.from('chart_of_accounts').delete().eq('id', id)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ success: true, hard: true })
  }
  const { error } = await supabase
    .from('chart_of_accounts')
    .update({ is_active: false })
    .eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true, hard: false })
}
