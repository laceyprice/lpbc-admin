import { NextRequest, NextResponse } from 'next/server'
export const dynamic = 'force-dynamic'
import { createServerClient } from '@/lib/supabase'

// GET  ?action=list                → admin: list all requests
// GET  ?token=xxx                  → public: get one request by token
// POST action=send                 → create request + send signing email (FormData)
// POST action=sign                 → record signature (public, called from /sign/[token])
// POST action=decline              → signer declines (public)
// POST action=resend               → resend the signing email
// POST action=void                 → admin voids a request
// DELETE ?id=xxx                   → hard delete

const BUCKET = 'vendor-documents'
const APP = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'

export async function GET(req: NextRequest) {
  const supabase = createServerClient()
  const action = req.nextUrl.searchParams.get('action')
  const token = req.nextUrl.searchParams.get('token')

  // Public: fetch by token — used by the /sign/[token] page
  if (token) {
    const { data, error } = await supabase
      .from('signature_requests')
      .select('id, document_name, document_url, document_text, signer_name, signer_email, sender_message, status, token, signed_at, expires_at, created_at')
      .eq('token', token)
      .single()
    if (error || !data) return NextResponse.json({ error: 'Request not found' }, { status: 404 })
    return NextResponse.json(data)
  }

  // Admin: list all
  const { data, error } = await supabase
    .from('signature_requests')
    .select('*')
    .order('created_at', { ascending: false })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data ?? [])
}

export async function POST(req: NextRequest) {
  const supabase = createServerClient()
  const action = req.nextUrl.searchParams.get('action')

  // ── Send a new signature request ─────────────────────────────────────────
  if (action === 'send') {
    const fd = await req.formData()
    const documentName = fd.get('document_name') as string
    const signerName = fd.get('signer_name') as string
    const signerEmail = fd.get('signer_email') as string
    const senderMessage = fd.get('sender_message') as string | null
    const documentText = fd.get('document_text') as string | null
    const expiryDays = parseInt(fd.get('expiry_days') as string || '30', 10)
    const file = fd.get('file') as File | null

    if (!documentName || !signerName || !signerEmail) {
      return NextResponse.json({ error: 'document_name, signer_name, signer_email are required' }, { status: 400 })
    }

    let documentUrl: string | null = null
    let documentPath: string | null = null

    // Upload PDF if provided
    if (file && file.size > 0) {
      const stamp = Date.now()
      const rand = Math.random().toString(36).slice(2, 8)
      const ext = file.name.split('.').pop() || 'pdf'
      const filePath = `agreements/${stamp}_${rand}.${ext}`
      const buf = Buffer.from(await file.arrayBuffer())
      const { error: upErr } = await supabase.storage
        .from(BUCKET)
        .upload(filePath, buf, { contentType: file.type, upsert: false })
      if (upErr) return NextResponse.json({ error: `Upload failed: ${upErr.message}` }, { status: 500 })

      // Generate a signed URL valid for 365 days
      const { data: signed } = await supabase.storage
        .from(BUCKET)
        .createSignedUrl(filePath, 60 * 60 * 24 * 365)
      documentUrl = signed?.signedUrl || null
      documentPath = filePath
    }

    // Generate token (32 hex chars = 128 bits of randomness)
    const token = Array.from(crypto.getRandomValues(new Uint8Array(32)))
      .map(b => b.toString(16).padStart(2, '0')).join('')

    const expiresAt = new Date(Date.now() + expiryDays * 24 * 60 * 60 * 1000).toISOString()

    const { data: request, error: insertErr } = await supabase
      .from('signature_requests')
      .insert({
        document_name: documentName,
        document_url: documentUrl,
        document_path: documentPath,
        document_text: documentText || null,
        signer_name: signerName,
        signer_email: signerEmail,
        sender_message: senderMessage || null,
        status: 'pending',
        token,
        expires_at: expiresAt,
      })
      .select()
      .single()

    if (insertErr) return NextResponse.json({ error: insertErr.message }, { status: 500 })

    // Send email to signer
    const signingUrl = `${APP}/sign/${token}`
    try {
      const { sendSignatureRequestEmail } = await import('@/lib/resend')
      await sendSignatureRequestEmail({
        to: signerEmail,
        signerName,
        documentName,
        signingUrl,
        senderMessage: senderMessage || undefined,
        expiresAt,
      })
    } catch (emailErr: any) {
      console.error('Signature email failed:', emailErr.message)
      // Don't fail the whole request — record was saved, link still works
    }

    return NextResponse.json({ request, signingUrl }, { status: 201 })
  }

  // ── Record a signature (public — called from /sign/[token]) ──────────────
  if (action === 'sign') {
    const body = await req.json()
    const { token, signature_data } = body
    if (!token || !signature_data) {
      return NextResponse.json({ error: 'token and signature_data required' }, { status: 400 })
    }

    // Fetch the request
    const { data: sigReq, error: fetchErr } = await supabase
      .from('signature_requests')
      .select('*')
      .eq('token', token)
      .single()

    if (fetchErr || !sigReq) return NextResponse.json({ error: 'Request not found' }, { status: 404 })
    if (sigReq.status === 'signed') return NextResponse.json({ error: 'Already signed' }, { status: 400 })
    if (sigReq.status === 'void') return NextResponse.json({ error: 'This request has been voided' }, { status: 400 })
    if (new Date(sigReq.expires_at) < new Date()) {
      await supabase.from('signature_requests').update({ status: 'expired' }).eq('id', sigReq.id)
      return NextResponse.json({ error: 'This signing request has expired' }, { status: 400 })
    }

    const ip = req.headers.get('x-forwarded-for') || req.headers.get('x-real-ip') || 'unknown'
    const signedAt = new Date().toISOString()

    const { error: updateErr } = await supabase
      .from('signature_requests')
      .update({
        status: 'signed',
        signature_data,
        signed_at: signedAt,
        ip_address: ip,
      })
      .eq('id', sigReq.id)

    if (updateErr) return NextResponse.json({ error: updateErr.message }, { status: 500 })

    // Send confirmation email to signer
    try {
      const { sendSignatureConfirmationEmail } = await import('@/lib/resend')
      await sendSignatureConfirmationEmail({
        to: sigReq.signer_email,
        signerName: sigReq.signer_name,
        documentName: sigReq.document_name,
        signedAt,
      })
    } catch (e: any) {
      console.error('Confirmation email failed:', e.message)
    }

    // Notify admin
    try {
      const { sendSignedNotificationEmail } = await import('@/lib/resend')
      await sendSignedNotificationEmail({
        documentName: sigReq.document_name,
        signerName: sigReq.signer_name,
        signerEmail: sigReq.signer_email,
        signedAt,
        signatureData: signature_data,
      })
    } catch (e: any) {
      console.error('Admin notification email failed:', e.message)
    }

    return NextResponse.json({ success: true, signedAt })
  }

  // ── Signer declines ───────────────────────────────────────────────────────
  if (action === 'decline') {
    const body = await req.json()
    const { token } = body
    if (!token) return NextResponse.json({ error: 'token required' }, { status: 400 })

    const { data: sigReq } = await supabase
      .from('signature_requests')
      .select('id, status')
      .eq('token', token)
      .single()

    if (!sigReq) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    if (sigReq.status !== 'pending') return NextResponse.json({ error: 'Request is not pending' }, { status: 400 })

    await supabase.from('signature_requests').update({ status: 'declined' }).eq('id', sigReq.id)
    return NextResponse.json({ success: true })
  }

  // ── Resend the signing email ──────────────────────────────────────────────
  if (action === 'resend') {
    const body = await req.json()
    const { id } = body
    if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })

    const { data: sigReq } = await supabase
      .from('signature_requests')
      .select('*')
      .eq('id', id)
      .single()

    if (!sigReq) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    const signingUrl = `${APP}/sign/${sigReq.token}`
    try {
      const { sendSignatureRequestEmail } = await import('@/lib/resend')
      await sendSignatureRequestEmail({
        to: sigReq.signer_email,
        signerName: sigReq.signer_name,
        documentName: sigReq.document_name,
        signingUrl,
        senderMessage: sigReq.sender_message || undefined,
        expiresAt: sigReq.expires_at,
      })
    } catch (e: any) {
      return NextResponse.json({ error: `Email failed: ${e.message}` }, { status: 500 })
    }

    return NextResponse.json({ success: true, signingUrl })
  }

  // ── Admin voids a request ─────────────────────────────────────────────────
  if (action === 'void') {
    const body = await req.json()
    const { id } = body
    if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })
    await supabase.from('signature_requests').update({ status: 'void' }).eq('id', id)
    return NextResponse.json({ success: true })
  }

  return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
}

export async function DELETE(req: NextRequest) {
  const supabase = createServerClient()
  const id = req.nextUrl.searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })

  // Fetch to get document path for cleanup
  const { data: sigReq } = await supabase
    .from('signature_requests')
    .select('document_path')
    .eq('id', id)
    .single()

  if (sigReq?.document_path) {
    await supabase.storage.from(BUCKET).remove([sigReq.document_path])
  }

  const { error } = await supabase.from('signature_requests').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
