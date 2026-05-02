import { NextRequest, NextResponse } from 'next/server'
export const dynamic = 'force-dynamic'
import { createServerClient } from '@/lib/supabase'

export async function GET() {
  const supabase = createServerClient()
  const { data, error } = await supabase
    .from('user_roles')
    .select('*')
    .order('created_at', { ascending: true })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

// POST — create a new user in Supabase Auth + assign a role
export async function POST(req: NextRequest) {
  const supabase = createServerClient()
  const body = await req.json()
  const { email, password, display_name, role, assigned_account_id } = body

  if (!email || !password || !role) {
    return NextResponse.json({ error: 'email, password, and role are required' }, { status: 400 })
  }
  if (!['admin', 'bookkeeper', 'invoicing', 'customer'].includes(role)) {
    return NextResponse.json({ error: 'role must be admin, bookkeeper, invoicing, or customer' }, { status: 400 })
  }

  // Create auth user
  const { data: authData, error: authErr } = await supabase.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  })
  if (authErr) return NextResponse.json({ error: authErr.message }, { status: 500 })

  // Insert role
  const { data, error } = await supabase.from('user_roles').insert({
    user_id: authData.user.id,
    email,
    display_name: display_name || email.split('@')[0],
    role,
    assigned_account_id: assigned_account_id || null,
  }).select().single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json(data, { status: 201 })
}

export async function PATCH(req: NextRequest) {
  const supabase = createServerClient()
  const body = await req.json()
  const { id, ...updates } = body
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })
  const { data, error } = await supabase
    .from('user_roles')
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

  // Get user_id before deleting role
  const { data: role } = await supabase.from('user_roles').select('user_id').eq('id', id).single()
  if (!role) return NextResponse.json({ error: 'Role not found' }, { status: 404 })

  // Delete role record
  const { error } = await supabase.from('user_roles').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Delete auth user
  await supabase.auth.admin.deleteUser(role.user_id)

  return NextResponse.json({ success: true })
}
