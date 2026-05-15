import { NextRequest, NextResponse } from 'next/server'
export const dynamic = 'force-dynamic'
import { createServerClient } from '@/lib/supabase'
import { attachSignedUrls, signedUrlFor } from '@/lib/signed-url'

const BUCKET = 'bank-statements'

// GET /api/bank-statements[?account_id=<uuid>]  — list statements; filter by account if provided
export async function GET(req: NextRequest) {
  const supabase = createServerClient()
  const accountId = req.nextUrl.searchParams.get('account_id')

  let query = supabase
    .from('bank_statements')
    .select('*')
    .order('statement_date', { ascending: false })
  if (accountId) query = query.eq('financial_account_id', accountId)

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  await attachSignedUrls(supabase, BUCKET, data, 'storage_path' as any)
  return NextResponse.json(data)
}

// POST /api/bank-statements — upload a PDF statement (optionally with financial_account_id)
export async function POST(req: NextRequest) {
  const supabase = createServerClient()
  const form = await req.formData()
  const file = form.get('file') as File | null
  const label = (form.get('label') as string) || ''
  const statement_date = (form.get('statement_date') as string) || null
  const financial_account_id = (form.get('financial_account_id') as string) || null

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

  const signedNow = await signedUrlFor(supabase, BUCKET, filePath)

  const { data, error } = await supabase.from('bank_statements').insert({
    file_name: file.name,
    file_url: signedNow || '',
    storage_path: filePath,
    label: label || file.name.replace(/\.[^.]+$/, ''),
    statement_date,
    financial_account_id: financial_account_id || null,
  }).select().single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json(data, { status: 201 })
}

// PATCH /api/bank-statements — update statement metadata (e.g. account assignment, label, date)
export async function PATCH(req: NextRequest) {
  const supabase = createServerClient()
  const body = await req.json()
  const { id, ...rawUpdates } = body
  if (!id) return NextResponse.json({ error: 'id is required' }, { status: 400 })

  // Whitelist updatable fields
  const allowed = ['financial_account_id', 'label', 'statement_date']
  const updates: Record<string, any> = {}
  for (const k of allowed) {
    if (k in rawUpdates) updates[k] = rawUpdates[k]
  }
  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: 'no allowed fields to update' }, { status: 400 })
  }

  const { data, error } = await supabase
    .from('bank_statements')
    .update(updates)
    .eq('id', id)
    .select()
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

// DELETE /api/bank-statements?id=xxx
export async function DELETE(req: NextRequest) {
  const supabase = createServerClient()
  const id = req.nextUrl.searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })

  const { data: stmt } = await supabase.from('bank_statements').select('storage_path').eq('id', id).single()
  if (!stmt) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  await supabase.storage.from(BUCKET).remove([stmt.storage_path])

  const { error } = await supabase.from('bank_statements').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ success: true })
}
