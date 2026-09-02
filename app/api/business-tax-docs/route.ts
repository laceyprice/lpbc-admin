import { NextRequest, NextResponse } from 'next/server'
export const dynamic = 'force-dynamic'
import { createServerClient } from '@/lib/supabase'

// Business (S-corp) tax document repository.
// GET    /api/business-tax-docs[?year=YYYY]   → list
// POST   /api/business-tax-docs?action=upload → multipart file → { path, url, name }
// POST   /api/business-tax-docs               → create record
// PATCH  /api/business-tax-docs               → update { id, ...fields }
// DELETE /api/business-tax-docs               → { id } (removes file too)

const BUCKET = 'tax-documents'

export async function GET(req: NextRequest) {
  const supabase = createServerClient()
  const year = req.nextUrl.searchParams.get('year')
  let q = supabase.from('business_tax_docs').select('*').order('created_at', { ascending: false })
  if (year) q = q.eq('tax_year', parseInt(year))
  const { data, error } = await q
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data || [])
}

export async function POST(req: NextRequest) {
  const supabase = createServerClient()
  const action = req.nextUrl.searchParams.get('action')

  if (action === 'upload') {
    const form = await req.formData()
    const file = form.get('file') as File | null
    if (!file) return NextResponse.json({ error: 'file required' }, { status: 400 })
    const ext = (file.name.split('.').pop() || 'pdf').toLowerCase().replace(/[^a-z0-9]/g, '')
    const path = `business/${Date.now()}_${Math.random().toString(36).slice(2, 8)}.${ext}`
    const buf = Buffer.from(await file.arrayBuffer())
    const { error: upErr } = await supabase.storage.from(BUCKET).upload(path, buf, { contentType: file.type || undefined, upsert: false })
    if (upErr) return NextResponse.json({ error: `Upload failed: ${upErr.message}` }, { status: 500 })
    const { data: urlData } = supabase.storage.from(BUCKET).getPublicUrl(path)
    return NextResponse.json({ path, url: urlData.publicUrl, name: file.name })
  }

  const body = await req.json()
  if (!body.category || !body.doc_type) return NextResponse.json({ error: 'category and doc_type required' }, { status: 400 })
  const { data, error } = await supabase.from('business_tax_docs').insert({
    category: body.category,
    doc_type: body.doc_type,
    tax_year: body.tax_year || null,
    file_path: body.file_path || null,
    file_url: body.file_url || null,
    file_name: body.file_name || null,
    notes: body.notes || null,
  }).select().single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data, { status: 201 })
}

export async function PATCH(req: NextRequest) {
  const supabase = createServerClient()
  const body = await req.json()
  const { id, ...updates } = body
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })
  const { data, error } = await supabase.from('business_tax_docs').update(updates).eq('id', id).select().single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function DELETE(req: NextRequest) {
  const supabase = createServerClient()
  const body = await req.json()
  const { id } = body
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })
  const { data: existing } = await supabase.from('business_tax_docs').select('file_path').eq('id', id).single()
  if (existing?.file_path) { try { await supabase.storage.from(BUCKET).remove([existing.file_path]) } catch {} }
  const { error } = await supabase.from('business_tax_docs').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
