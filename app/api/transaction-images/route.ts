import { NextRequest, NextResponse } from 'next/server'
export const dynamic = 'force-dynamic'
import { createServerClient } from '@/lib/supabase'

const BUCKET = 'bookkeeping-images'

// ------------------------------------------------------------
// GET  /api/transaction-images?type=receipt|check&matched=true|false
// ------------------------------------------------------------
export async function GET(req: NextRequest) {
  const supabase = createServerClient()
  const type = req.nextUrl.searchParams.get('type')
  const matched = req.nextUrl.searchParams.get('matched')
  let query = supabase
    .from('transaction_images')
    .select('*, matched_tx:bank_transactions(id, transaction_date, description, amount, check_number)')
    .order('created_at', { ascending: false })
  if (type) query = query.eq('image_type', type)
  if (matched === 'true') query = query.not('matched_bank_transaction_id', 'is', null)
  if (matched === 'false') query = query.is('matched_bank_transaction_id', null)
  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

// ------------------------------------------------------------
// POST  /api/transaction-images?action=upload   (multipart form)
//   form fields: file, image_type, check_number?, vendor?, amount?, receipt_date?, notes?
// POST  /api/transaction-images?action=match
//   json body: { id, bank_transaction_id }
// ------------------------------------------------------------
export async function POST(req: NextRequest) {
  const supabase = createServerClient()
  const action = req.nextUrl.searchParams.get('action') || 'upload'

  if (action === 'upload') {
    const form = await req.formData()
    const file = form.get('file') as File | null
    const image_type = (form.get('image_type') as string) || 'receipt'
    if (!file) return NextResponse.json({ error: 'file is required' }, { status: 400 })
    if (!['receipt', 'check'].includes(image_type)) {
      return NextResponse.json({ error: 'image_type must be receipt or check' }, { status: 400 })
    }

    const ext = (file.name.split('.').pop() || 'jpg').toLowerCase()
    const stamp = Date.now()
    const rand = Math.random().toString(36).slice(2, 8)
    const filePath = `${image_type}/${stamp}_${rand}.${ext}`

    const buf = await file.arrayBuffer()
    const { error: upErr } = await supabase.storage
      .from(BUCKET)
      .upload(filePath, buf, { contentType: file.type || undefined, upsert: false })
    if (upErr) return NextResponse.json({ error: `Storage upload failed: ${upErr.message}` }, { status: 500 })

    const { data: urlData } = supabase.storage.from(BUCKET).getPublicUrl(filePath)

    const check_number = (form.get('check_number') as string) || null
    const vendor = (form.get('vendor') as string) || null
    const amountRaw = form.get('amount') as string | null
    const amount = amountRaw ? parseFloat(amountRaw) : null
    const receipt_date = (form.get('receipt_date') as string) || null
    const notes = (form.get('notes') as string) || null

    const { data: row, error: insErr } = await supabase
      .from('transaction_images')
      .insert({
        image_type,
        file_url: urlData.publicUrl,
        file_path: filePath,
        file_name: file.name,
        mime_type: file.type || null,
        size_bytes: file.size || null,
        check_number,
        vendor,
        amount,
        receipt_date,
        notes,
      })
      .select()
      .single()
    if (insErr) return NextResponse.json({ error: insErr.message }, { status: 500 })

    // Auto-match: if this is a check and we have a check_number, look for an unmatched
    // bank transaction whose description contains the check number OR check_number column matches.
    if (image_type === 'check' && check_number) {
      const { data: candidates } = await supabase
        .from('bank_transactions')
        .select('id, description, check_number, check_image_id')
        .or(`check_number.eq.${check_number},description.ilike.%${check_number}%`)
        .is('check_image_id', null)
        .limit(1)
      if (candidates && candidates.length > 0) {
        const txId = candidates[0].id
        await supabase.from('transaction_images').update({ matched_bank_transaction_id: txId }).eq('id', row.id)
        await supabase.from('bank_transactions').update({ check_image_id: row.id, check_number }).eq('id', txId)
        return NextResponse.json({ ...row, auto_matched_bank_transaction_id: txId }, { status: 201 })
      }
    }

    // ── Auto-OCR: call parse-receipt in the background ──────────
    // We fire-and-forget so the upload response is fast.
    // The OCR result updates the row and returns suggestions via
    // a separate call from the UI.
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'
    fetch(`${appUrl}/api/parse-receipt`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ image_id: row.id }),
    }).catch(() => { /* non-blocking — UI polls separately */ })

    return NextResponse.json(row, { status: 201 })
  }

  if (action === 'match') {
    const { id, bank_transaction_id } = await req.json()
    if (!id || !bank_transaction_id) {
      return NextResponse.json({ error: 'id and bank_transaction_id required' }, { status: 400 })
    }

    // Fetch the image to know its type
    const { data: img, error: imgErr } = await supabase
      .from('transaction_images')
      .select('*')
      .eq('id', id)
      .single()
    if (imgErr || !img) return NextResponse.json({ error: 'Image not found' }, { status: 404 })

    // Update image
    const { error: updImgErr } = await supabase
      .from('transaction_images')
      .update({ matched_bank_transaction_id: bank_transaction_id })
      .eq('id', id)
    if (updImgErr) return NextResponse.json({ error: updImgErr.message }, { status: 500 })

    // Back-link on bank_transactions
    const linkCol = img.image_type === 'check' ? 'check_image_id' : 'receipt_image_id'
    const extraUpdate: Record<string, unknown> = { [linkCol]: id }
    if (img.image_type === 'check' && img.check_number) {
      extraUpdate.check_number = img.check_number
    }
    const { error: updTxErr } = await supabase
      .from('bank_transactions')
      .update(extraUpdate)
      .eq('id', bank_transaction_id)
    if (updTxErr) return NextResponse.json({ error: updTxErr.message }, { status: 500 })

    return NextResponse.json({ success: true })
  }

  if (action === 'unmatch') {
    const { id } = await req.json()
    if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })

    const { data: img } = await supabase
      .from('transaction_images')
      .select('*')
      .eq('id', id)
      .single()
    if (!img) return NextResponse.json({ error: 'Image not found' }, { status: 404 })

    if (img.matched_bank_transaction_id) {
      const linkCol = img.image_type === 'check' ? 'check_image_id' : 'receipt_image_id'
      await supabase
        .from('bank_transactions')
        .update({ [linkCol]: null })
        .eq('id', img.matched_bank_transaction_id)
    }
    await supabase.from('transaction_images').update({ matched_bank_transaction_id: null }).eq('id', id)
    return NextResponse.json({ success: true })
  }

  return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 })
}

// ------------------------------------------------------------
// PATCH /api/transaction-images   — update metadata
// ------------------------------------------------------------
export async function PATCH(req: NextRequest) {
  const supabase = createServerClient()
  const body = await req.json()
  const { id, ...updates } = body
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })
  // whitelist columns we allow to be updated from the client
  const allowed = ['check_number', 'vendor', 'amount', 'receipt_date', 'notes']
  const clean: Record<string, unknown> = {}
  for (const k of allowed) if (k in updates) clean[k] = updates[k]
  const { data, error } = await supabase
    .from('transaction_images')
    .update(clean)
    .eq('id', id)
    .select()
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

// ------------------------------------------------------------
// DELETE /api/transaction-images?id=...
//   Also removes the file from storage and clears any back-links.
// ------------------------------------------------------------
export async function DELETE(req: NextRequest) {
  const supabase = createServerClient()
  const id = req.nextUrl.searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })

  const { data: img } = await supabase.from('transaction_images').select('*').eq('id', id).single()
  if (!img) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  // Remove storage object
  if (img.file_path) {
    await supabase.storage.from(BUCKET).remove([img.file_path])
  }

  // Clear back-link on any matched bank transaction
  if (img.matched_bank_transaction_id) {
    const linkCol = img.image_type === 'check' ? 'check_image_id' : 'receipt_image_id'
    await supabase
      .from('bank_transactions')
      .update({ [linkCol]: null })
      .eq('id', img.matched_bank_transaction_id)
  }

  const { error } = await supabase.from('transaction_images').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
