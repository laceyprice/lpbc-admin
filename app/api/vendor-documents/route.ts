import { NextRequest, NextResponse } from 'next/server'
export const dynamic = 'force-dynamic'
import { createServerClient } from '@/lib/supabase'

const BUCKET = 'vendor-documents'

// GET  /api/vendor-documents?type=w9|coi|all  → list docs
// GET  /api/vendor-documents?id=uuid           → single doc
// POST /api/vendor-documents?action=upload     → multipart upload
// POST /api/vendor-documents                   → create record (JSON)
// PATCH /api/vendor-documents                  → update record
// DELETE /api/vendor-documents?id=uuid         → delete

export async function GET(req: NextRequest) {
  const supabase = createServerClient()
  const id = req.nextUrl.searchParams.get('id')
  const type = req.nextUrl.searchParams.get('type')
  const expiring = req.nextUrl.searchParams.get('expiring') // days

  if (id) {
    const { data, error } = await supabase.from('vendor_documents').select('*').eq('id', id).single()
    if (error) return NextResponse.json({ error: error.message }, { status: 404 })
    return NextResponse.json(data)
  }

  let query = supabase
    .from('vendor_documents')
    .select('*, contact:contacts(id, first_name, last_name)')
    .order('created_at', { ascending: false })

  if (type && type !== 'all') query = query.eq('doc_type', type)

  if (expiring) {
    const days = parseInt(expiring, 10)
    const cutoff = new Date()
    cutoff.setDate(cutoff.getDate() + days)
    query = query
      .not('expiry_date', 'is', null)
      .lte('expiry_date', cutoff.toISOString().split('T')[0])
      .gte('expiry_date', new Date().toISOString().split('T')[0])
  }

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data || [])
}

export async function POST(req: NextRequest) {
  const supabase = createServerClient()
  const action = req.nextUrl.searchParams.get('action')

  if (action === 'upload') {
    const form = await req.formData()
    const file = form.get('file') as File | null
    const doc_type = (form.get('doc_type') as string) || 'other'
    const vendor_name = (form.get('vendor_name') as string) || null
    const expiry_date = (form.get('expiry_date') as string) || null
    const notes = (form.get('notes') as string) || null

    if (!file) return NextResponse.json({ error: 'file required' }, { status: 400 })

    const ext = (file.name.split('.').pop() || 'pdf').toLowerCase()
    const stamp = Date.now()
    const rand = Math.random().toString(36).slice(2, 8)
    const filePath = `${doc_type}/${stamp}_${rand}.${ext}`

    const buf = await file.arrayBuffer()
    const { error: upErr } = await supabase.storage
      .from(BUCKET)
      .upload(filePath, buf, { contentType: file.type || 'application/octet-stream', upsert: false })
    if (upErr) return NextResponse.json({ error: `Upload failed: ${upErr.message}` }, { status: 500 })

    const { data: urlData } = supabase.storage.from(BUCKET).getPublicUrl(filePath)

    const { data, error } = await supabase.from('vendor_documents').insert({
      doc_type,
      vendor_name,
      file_url: urlData.publicUrl,
      file_path: filePath,
      file_name: file.name,
      mime_type: file.type || null,
      size_bytes: file.size,
      expiry_date: expiry_date || null,
      notes,
      source: 'manual',
    }).select('*').single()

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json(data)
  }

  // JSON create
  const body = await req.json()
  const { data, error } = await supabase.from('vendor_documents').insert(body).select('*').single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function PATCH(req: NextRequest) {
  const supabase = createServerClient()
  const body = await req.json()
  const { id, ...updates } = body
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })
  const { data, error } = await supabase.from('vendor_documents').update(updates).eq('id', id).select('*').single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function DELETE(req: NextRequest) {
  const supabase = createServerClient()
  const id = req.nextUrl.searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })

  // Get the record to delete from storage too
  const { data: doc } = await supabase.from('vendor_documents').select('file_path').eq('id', id).single()
  if (doc?.file_path) {
    await supabase.storage.from(BUCKET).remove([doc.file_path])
  }
  await supabase.from('vendor_documents').delete().eq('id', id)
  return NextResponse.json({ success: true })
}
