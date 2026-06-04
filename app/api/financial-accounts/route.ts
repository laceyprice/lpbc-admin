import { NextRequest, NextResponse } from 'next/server'
export const dynamic = 'force-dynamic'
import { createServerClient } from '@/lib/supabase'

export async function GET() {
  const supabase = createServerClient()
  const { data, error } = await supabase
    .from('financial_accounts')
    .select('*')
    .order('name')
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data ?? [])
}

export async function POST(req: NextRequest) {
  const supabase = createServerClient()
  const body = await req.json()
  if (!body.name) return NextResponse.json({ error: 'name required' }, { status: 400 })
  const { data, error } = await supabase
    .from('financial_accounts')
    .insert({
      name: body.name,
      description: body.description ?? null,
      account_number: body.account_number ?? null,
      color: body.color ?? '#b8895a',
    })
    .select().single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data, { status: 201 })
}

export async function PATCH(req: NextRequest) {
  const supabase = createServerClient()
  const body = await req.json()
  // Whitelist editable fields
  const { id, name, description, account_number, color, is_active, closed_period_start, closed_period_end } = body
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })
  const updates: Record<string, any> = {}
  if (name !== undefined) updates.name = name
  if (description !== undefined) updates.description = description || null
  if (account_number !== undefined) updates.account_number = account_number || null
  if (color !== undefined) updates.color = color
  if (is_active !== undefined) updates.is_active = !!is_active
  if (closed_period_start !== undefined) updates.closed_period_start = closed_period_start || null
  if (closed_period_end !== undefined) updates.closed_period_end = closed_period_end || null
  const { data, error } = await supabase
    .from('financial_accounts')
    .update(updates)
    .eq('id', id)
    .select().single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function DELETE(req: NextRequest) {
  const supabase = createServerClient()
  const id = req.nextUrl.searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })
  const { error } = await supabase
    .from('financial_accounts')
    .update({ is_active: false })
    .eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
