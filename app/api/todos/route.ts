import { NextRequest, NextResponse } from 'next/server'
export const dynamic = 'force-dynamic'
import { createServerClient } from '@/lib/supabase'
import { webSafeImage } from '@/lib/heic'

// GET    /api/todos                → list all (open first, then done)
// GET    /api/todos?status=open    → filter
// POST   /api/todos                → create
// POST   /api/todos?action=upload  → upload an attachment (multipart) → {path,name,type,size,url}
// PATCH  /api/todos                → update (body: { id, ...fields, attachments })
// DELETE /api/todos?id=uuid        → delete (removes attachment files too)

const BUCKET = 'todo-attachments'
const stripAtt = (a: any) => ({ path: a?.path || '', name: a?.name || 'File', type: a?.type || '', size: Number(a?.size) || 0 })
async function signAttachments(supabase: any, atts: any[]) {
  return Promise.all((Array.isArray(atts) ? atts : []).map(async (a: any) => {
    if (!a?.path) return a
    const { data } = await supabase.storage.from(BUCKET).createSignedUrl(a.path, 60 * 60 * 24 * 7)
    return { ...a, url: data?.signedUrl || a.url || null }
  }))
}

export async function GET(req: NextRequest) {
  const supabase = createServerClient()
  const status = req.nextUrl.searchParams.get('status')
  let q = supabase.from('todos').select('*')
  if (status) q = q.eq('status', status)
  // Open first, then by priority, then most recent
  const { data, error } = await q.order('status').order('priority').order('created_at', { ascending: false })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  const withUrls = await Promise.all((data || []).map(async (t: any) => ({ ...t, attachments: await signAttachments(supabase, t.attachments) })))
  return NextResponse.json(withUrls)
}

export async function POST(req: NextRequest) {
  const supabase = createServerClient()
  const action = req.nextUrl.searchParams.get('action')

  // ── Upload an attachment (image or document) ─────────────────────────────
  if (action === 'upload') {
    const form = await req.formData()
    const file = form.get('file') as File | null
    if (!file) return NextResponse.json({ error: 'file required' }, { status: 400 })
    await supabase.storage.createBucket(BUCKET, { public: false })   // no-op if it already exists
    // Compress/HEIC-convert images (leaves PDFs/docs untouched) to save storage.
    const raw = Buffer.from(await file.arrayBuffer())
    const safe = await webSafeImage(raw, file.type || 'application/octet-stream', file.name)
    const ext = (safe.name.split('.').pop() || 'bin').toLowerCase().replace(/[^a-z0-9]/g, '')
    const path = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}.${ext}`
    const { error: upErr } = await supabase.storage.from(BUCKET).upload(path, safe.buffer, { contentType: safe.contentType, upsert: false })
    if (upErr) return NextResponse.json({ error: `Upload failed: ${upErr.message}` }, { status: 500 })
    const { data: signed } = await supabase.storage.from(BUCKET).createSignedUrl(path, 60 * 60 * 24 * 7)
    return NextResponse.json({ path, name: safe.name, type: safe.contentType, size: safe.buffer.length, url: signed?.signedUrl || null })
  }

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
    attachments: Array.isArray(body.attachments) ? body.attachments.map(stripAtt) : [],
  }).select().single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ...data, attachments: await signAttachments(supabase, data.attachments) }, { status: 201 })
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
  if ('attachments' in updates) updates.attachments = Array.isArray(updates.attachments) ? updates.attachments.map(stripAtt) : []

  const { data, error } = await supabase.from('todos').update(updates).eq('id', id).select().single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ...data, attachments: await signAttachments(supabase, data.attachments) })
}

export async function DELETE(req: NextRequest) {
  const supabase = createServerClient()
  const id = req.nextUrl.searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })
  const { data: existing } = await supabase.from('todos').select('attachments').eq('id', id).single()
  const paths = (Array.isArray(existing?.attachments) ? existing!.attachments : []).map((a: any) => a?.path).filter(Boolean)
  if (paths.length) { try { await supabase.storage.from(BUCKET).remove(paths) } catch {} }
  const { error } = await supabase.from('todos').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
