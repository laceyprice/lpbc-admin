import { NextRequest, NextResponse } from 'next/server'
export const dynamic = 'force-dynamic'
import { createServerClient } from '@/lib/supabase'
import { requireAdmin } from '@/lib/admin-auth'

// Running notepad entries. ADMIN ONLY (every handler checks).
// GET    /api/notepad[?q=text]      → newest first
// POST   /api/notepad   { body }    → add an entry
// PATCH  /api/notepad   { id, body }
// DELETE /api/notepad?id=uuid

export async function GET(req: NextRequest) {
  const denied = await requireAdmin(req); if (denied) return denied
  const supabase = createServerClient()
  const q = req.nextUrl.searchParams.get('q')?.trim()
  let query = supabase.from('notepad_entries').select('*').order('created_at', { ascending: false }).limit(1000)
  if (q) query = query.ilike('body', `%${q.replace(/[%_]/g, m => '\\' + m)}%`)
  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data || [])
}

export async function POST(req: NextRequest) {
  const denied = await requireAdmin(req); if (denied) return denied
  const supabase = createServerClient()
  const { body } = await req.json()
  if (!String(body || '').trim()) return NextResponse.json({ error: 'Nothing to save' }, { status: 400 })
  const { data, error } = await supabase.from('notepad_entries').insert({ body: String(body).trim() }).select().single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data, { status: 201 })
}

export async function PATCH(req: NextRequest) {
  const denied = await requireAdmin(req); if (denied) return denied
  const supabase = createServerClient()
  const { id, body } = await req.json()
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })
  if (!String(body || '').trim()) return NextResponse.json({ error: 'Entry can\'t be empty (delete it instead)' }, { status: 400 })
  const { data, error } = await supabase.from('notepad_entries')
    .update({ body: String(body).trim(), updated_at: new Date().toISOString() }).eq('id', id).select().single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function DELETE(req: NextRequest) {
  const denied = await requireAdmin(req); if (denied) return denied
  const supabase = createServerClient()
  const id = req.nextUrl.searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })
  const { error } = await supabase.from('notepad_entries').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
