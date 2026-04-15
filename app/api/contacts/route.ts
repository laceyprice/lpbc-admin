import { NextRequest, NextResponse } from 'next/server'
export const dynamic = 'force-dynamic'
import { createServerClient } from '@/lib/supabase'

const JUNK_NAMES = ['unknown', 'n/a', 'na', 'none', 'test', '']

function isJunkName(first: string | null, last: string | null): boolean {
  const f = (first || '').trim().toLowerCase()
  const l = (last || '').trim().toLowerCase()
  return JUNK_NAMES.includes(f) && (!l || JUNK_NAMES.includes(l))
}

export async function GET() {
  const supabase = createServerClient()

  // Auto-clean contacts with junk names
  await supabase.from('contacts').delete().or(
    JUNK_NAMES.filter(n => n).map(n =>
      `and(first_name.ilike.${n},or(last_name.is.null,last_name.eq.,last_name.ilike.${n}))`
    ).join(',')
  )
  // Also delete where first_name is null or empty
  await supabase.from('contacts').delete().or('first_name.is.null,first_name.eq.')

  const { data, error } = await supabase
    .from('contacts')
    .select('*')
    .order('created_at', { ascending: false })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function POST(req: NextRequest) {
  const supabase = createServerClient()
  const body = await req.json()
  const { data, error } = await supabase
    .from('contacts')
    .insert({
      first_name: body.first_name,
      last_name: body.last_name,
      email: body.email || null,
      phone: body.phone || null,
      address: body.address || null,
      city: body.city || null,
      state: body.state || null,
      zip: body.zip || null,
      company_name: body.company_name || body.company || null,
      notes: body.notes || null,
      source: body.source || 'manual',
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
  if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 })
  const { data, error } = await supabase
    .from('contacts')
    .update(updates)
    .eq('id', id)
    .select()
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function DELETE(req: NextRequest) {
  const supabase = createServerClient()
  const body = await req.json()
  const { id } = body
  if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 })
  const { error } = await supabase.from('contacts').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
