import { NextRequest, NextResponse } from 'next/server'
export const dynamic = 'force-dynamic'
import { createServerClient } from '@/lib/supabase'

// GET    /api/todos                → list all (open first, then done)
// GET    /api/todos?status=open    → filter
// POST   /api/todos                → create
// PATCH  /api/todos                → update (body: { id, ...fields })
// DELETE /api/todos?id=uuid        → delete

export async function GET(req: NextRequest) {
  const supabase = createServerClient()
  const status = req.nextUrl.searchParams.get('status')
  let q = supabase.from('todos').select('*')
  if (status) q = q.eq('status', status)
  // Open first, then by priority, then most recent
  const { data, error } = await q.order('status').order('priority').order('created_at', { ascending: false })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data || [])
}

export async function POST(req: NextRequest) {
  const supabase = createServerClient()
  const body = await req.json()
  if (!body.title) return NextResponse.json({ error: 'title required' }, { status: 400 })

  // Avoid duplicates when re-adding the same AI suggestion
  if (body.source_ref) {
    const { data: existing } = await supabase
      .from('todos')
      .select('id')
      .eq('source_ref', body.source_ref)
      .maybeSingle()
    if (existing) return NextResponse.json(existing)
  }

  const { data, error } = await supabase.from('todos').insert({
    title: body.title,
    description: body.description || null,
    priority: body.priority || 'medium',
    category: body.category || 'general',
    action_url: body.action_url || null,
    due_date: body.due_date || null,
    status: body.status || 'open',
    source: body.source || 'manual',
    source_ref: body.source_ref || null,
    assigned_to_user_id: body.assigned_to_user_id || null,
    assigned_to_name: body.assigned_to_name || null,
  }).select().single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data, { status: 201 })
}

export async function PATCH(req: NextRequest) {
  const supabase = createServerClient()
  const body = await req.json()
  const { id, ...updates } = body
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })

  // Auto-stamp completed_at when marking done
  if (updates.status === 'done' && !updates.completed_at) {
    updates.completed_at = new Date().toISOString()
  }
  if (updates.status === 'open') updates.completed_at = null

  const { data, error } = await supabase.from('todos').update(updates).eq('id', id).select().single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function DELETE(req: NextRequest) {
  const supabase = createServerClient()
  const id = req.nextUrl.searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })
  const { error } = await supabase.from('todos').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
