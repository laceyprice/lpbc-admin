import { NextRequest, NextResponse } from 'next/server'
export const dynamic = 'force-dynamic'
import { createServerClient } from '@/lib/supabase'

const BUCKET = 'bookkeeping-images'

// ------------------------------------------------------------
// GET  /api/invoice-attachments?invoice_id=...
//   Lists all files stored under invoices/{invoice_id}/ in storage
// ------------------------------------------------------------
export async function GET(req: NextRequest) {
  const supabase = createServerClient()
  const invoiceId = req.nextUrl.searchParams.get('invoice_id')
  if (!invoiceId) return NextResponse.json({ error: 'invoice_id required' }, { status: 400 })

  const folder = `invoices/${invoiceId}`
  const { data, error } = await supabase.storage.from(BUCKET).list(folder, { sortBy: { column: 'created_at', order: 'desc' } })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const files = (data || [])
    .filter(f => f.name !== '.emptyFolderPlaceholder')
    .map(f => {
      const filePath = `${folder}/${f.name}`
      const { data: urlData } = supabase.storage.from(BUCKET).getPublicUrl(filePath)
      // Extract the type prefix from filename: "check_..." or "receipt_..."
      const docType = f.name.startsWith('check_') ? 'check' : 'receipt'
      return {
        name: f.name,
        path: filePath,
        url: urlData.publicUrl,
        doc_type: docType,
        created_at: f.created_at,
        size: (f.metadata as any)?.size || null,
      }
    })

  return NextResponse.json(files)
}

// ------------------------------------------------------------
// POST  /api/invoice-attachments   (multipart form)
//   form fields: file, invoice_id, doc_type (check|receipt)
// ------------------------------------------------------------
export async function POST(req: NextRequest) {
  const supabase = createServerClient()
  const form = await req.formData()
  const file = form.get('file') as File | null
  const invoiceId = form.get('invoice_id') as string | null
  const docType = (form.get('doc_type') as string) || 'receipt'

  if (!file) return NextResponse.json({ error: 'file is required' }, { status: 400 })
  if (!invoiceId) return NextResponse.json({ error: 'invoice_id is required' }, { status: 400 })
  if (!['receipt', 'check'].includes(docType)) {
    return NextResponse.json({ error: 'doc_type must be receipt or check' }, { status: 400 })
  }

  const ext = (file.name.split('.').pop() || 'jpg').toLowerCase()
  const stamp = Date.now()
  const rand = Math.random().toString(36).slice(2, 8)
  const filePath = `invoices/${invoiceId}/${docType}_${stamp}_${rand}.${ext}`

  const buf = await file.arrayBuffer()
  const { error: upErr } = await supabase.storage
    .from(BUCKET)
    .upload(filePath, buf, { contentType: file.type || undefined, upsert: false })
  if (upErr) return NextResponse.json({ error: `Upload failed: ${upErr.message}` }, { status: 500 })

  const { data: urlData } = supabase.storage.from(BUCKET).getPublicUrl(filePath)

  return NextResponse.json({
    name: `${docType}_${stamp}_${rand}.${ext}`,
    path: filePath,
    url: urlData.publicUrl,
    doc_type: docType,
  }, { status: 201 })
}

// ------------------------------------------------------------
// DELETE  /api/invoice-attachments?path=...
// ------------------------------------------------------------
export async function DELETE(req: NextRequest) {
  const supabase = createServerClient()
  const filePath = req.nextUrl.searchParams.get('path')
  if (!filePath) return NextResponse.json({ error: 'path required' }, { status: 400 })

  // Safety: only allow deleting from invoices/ prefix
  if (!filePath.startsWith('invoices/')) {
    return NextResponse.json({ error: 'Invalid path' }, { status: 400 })
  }

  const { error } = await supabase.storage.from(BUCKET).remove([filePath])
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ success: true })
}
