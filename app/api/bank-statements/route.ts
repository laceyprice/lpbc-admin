import { NextRequest, NextResponse } from 'next/server'
export const dynamic = 'force-dynamic'
import { createServerClient } from '@/lib/supabase'
import { attachSignedUrls, signedUrlFor } from '@/lib/signed-url'

const BUCKET = 'bank-statements'

// GET /api/bank-statements — list all uploaded statements
export async function GET() {
  const supabase = createServerClient()
  const { data, error } = await supabase
    .from('bank_statements')
    .select('*')
    .order('statement_date', { ascending: false })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  // bank_statements uses storage_path instead of file_path
  await attachSignedUrls(supabase, BUCKET, data, 'storage_path' as any)
  return NextResponse.json(data)
}

// POST /api/bank-statements — upload a PDF statement
export async function POST(req: NextRequest) {
  const supabase = createServerClient()
  const form = await req.formData()
  const file = form.get('file') as File | null
  const label = (form.get('label') as string) || ''
  const statement_date = (form.get('statement_date') as string) || null

  if (!file) return NextResponse.json({ error: 'file is required' }, { status: 400 })

  const ext = (file.name.split('.').pop() || 'pdf').toLowerCase()
  const stamp = Date.now()
  const rand = Math.random().toString(36).slice(2, 8)
  const filePath = `${stamp}_${rand}.${ext}`

  const buf = await file.arrayBuffer()
  const { error: upErr } = await supabase.storage
    .from(BUCKET)
    .upload(filePath, buf, { contentType: file.type || 'application/pdf' })
  if (upErr) return NextResponse.json({ error: upErr.message }, { status: 500 })

  // Bucket is private; signed URLs regenerate on every read.
  const signedNow = await signedUrlFor(supabase, BUCKET, filePath)

  const { data, error } = await supabase.from('bank_statements').insert({
    file_name: file.name,
    file_url: signedNow || '',
    storage_path: filePath,
    label: label || file.name.replace(/\.[^.]+$/, ''),
    statement_date,
  }).select().single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json(data, { status: 201 })
}

// DELETE /api/bank-statements?id=xxx
export async function DELETE(req: NextRequest) {
  const supabase = createServerClient()
  const id = req.nextUrl.searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })

  // Get storage path before deleting
  const { data: stmt } = await supabase.from('bank_statements').select('storage_path').eq('id', id).single()
  if (!stmt) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  // Delete from storage
  await supabase.storage.from(BUCKET).remove([stmt.storage_path])

  // Delete record
  const { error } = await supabase.from('bank_statements').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ success: true })
}
