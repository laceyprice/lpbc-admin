import { NextRequest, NextResponse } from 'next/server'
export const dynamic = 'force-dynamic'
import { createServerClient } from '@/lib/supabase'

// GET  ?action=list                → admin: list all requests
// GET  ?action=doc&token=xxx       → public: stream the PDF (same-origin, for the viewer)
// GET  ?token=xxx                  → public: get one request + the current signer's fields
// POST action=send                 → create request + send signing emails (FormData; multi-signer)
// POST action=sign                 → record one signer's signature (public)
// POST action=decline              → a signer declines (public)
// POST action=resend               → resend the signing email(s)
// POST action=void                 → admin voids a request
// DELETE ?id=xxx                   → hard delete

const BUCKET = 'vendor-documents'
const APP = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'

const genToken = () => Array.from(crypto.getRandomValues(new Uint8Array(32))).map(b => b.toString(16).padStart(2, '0')).join('')

// Find a request by any signer token (multi-signer) or the legacy token column.
async function findByToken(supabase: any, token: string) {
  const { data: multi } = await supabase.from('signature_requests').select('*').contains('signers', [{ token }]).maybeSingle()
  if (multi) return multi
  const { data: legacy } = await supabase.from('signature_requests').select('*').eq('token', token).maybeSingle()
  return legacy || null
}

export async function GET(req: NextRequest) {
  const supabase = createServerClient()
  const action = req.nextUrl.searchParams.get('action')
  const token = req.nextUrl.searchParams.get('token')

  // Public: stream the document PDF (same-origin so the pdf.js viewer avoids CORS)
  if (action === 'doc' && token) {
    const reqRow = await findByToken(supabase, token)
    if (!reqRow) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    if (reqRow.document_path) {
      const { data, error } = await supabase.storage.from(BUCKET).download(reqRow.document_path)
      if (error || !data) return NextResponse.json({ error: 'File unavailable' }, { status: 404 })
      return new Response(data, { headers: { 'Content-Type': 'application/pdf', 'Cache-Control': 'private, max-age=300' } })
    }
    if (reqRow.document_url) {
      const r = await fetch(reqRow.document_url)
      return new Response(r.body, { headers: { 'Content-Type': 'application/pdf' } })
    }
    return NextResponse.json({ error: 'No document' }, { status: 404 })
  }

  // Public: fetch by token — used by the /sign/[token] page
  if (token) {
    const data = await findByToken(supabase, token)
    if (!data) return NextResponse.json({ error: 'Request not found' }, { status: 404 })

    const signers: any[] = Array.isArray(data.signers) ? data.signers : []
    const current = signers.find(s => s.token === token)
      || (data.token === token ? { id: 'legacy', name: data.signer_name, email: data.signer_email, token: data.token, status: data.status === 'signed' ? 'signed' : 'pending', signed_at: data.signed_at } : null)
    const hasDoc = !!(data.document_path || data.document_url)

    return NextResponse.json({
      id: data.id,
      document_name: data.document_name,
      document_text: data.document_text,
      doc_url: hasDoc ? `${APP}/api/signature-requests?action=doc&token=${token}` : null,
      sender_message: data.sender_message,
      status: data.status,
      signed_at: data.signed_at,
      expires_at: data.expires_at,
      created_at: data.created_at,
      fields: (Array.isArray(data.fields) ? data.fields : []).filter((f: any) => !current || f.signer_id === current.id || signers.length === 0),
      all_fields: Array.isArray(data.fields) ? data.fields : [],
      signer: current ? { id: current.id, name: current.name, email: current.email, status: current.status, signed_at: current.signed_at } : null,
      signers: signers.map(s => ({ id: s.id, name: s.name, status: s.status })),
    })
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
    const senderMessage = fd.get('sender_message') as string | null
    const documentText = fd.get('document_text') as string | null
    const expiryDays = parseInt(fd.get('expiry_days') as string || '30', 10)
    const file = fd.get('file') as File | null

    // Recipients: prefer the multi-signer JSON; fall back to the legacy single pair.
    let signerInput: Array<{ id?: string; name: string; email: string }> = []
    try { const raw = fd.get('signers') as string | null; if (raw) signerInput = JSON.parse(raw) } catch {}
    if (!signerInput.length) {
      const n = fd.get('signer_name') as string, e = fd.get('signer_email') as string
      if (n && e) signerInput = [{ id: 'r1', name: n, email: e }]
    }
    signerInput = (signerInput || []).filter(s => s && s.name && s.email)

    if (!documentName || !signerInput.length) {
      return NextResponse.json({ error: 'document_name and at least one recipient (name + email) are required' }, { status: 400 })
    }

    let documentUrl: string | null = null
    let documentPath: string | null = null
    if (file && file.size > 0) {
      const filePath = `agreements/${Date.now()}_${Math.random().toString(36).slice(2, 8)}.${(file.name.split('.').pop() || 'pdf')}`
      const buf = Buffer.from(await file.arrayBuffer())
      const { error: upErr } = await supabase.storage.from(BUCKET).upload(filePath, buf, { contentType: file.type || 'application/pdf', upsert: false })
      if (upErr) return NextResponse.json({ error: `Upload failed: ${upErr.message}` }, { status: 500 })
      const { data: signed } = await supabase.storage.from(BUCKET).createSignedUrl(filePath, 60 * 60 * 24 * 365)
      documentUrl = signed?.signedUrl || null
      documentPath = filePath
    }

    // Build signers with per-recipient tokens (keeping the client id so placed
    // fields still reference the right person).
    const signers = signerInput.map(s => ({
      id: s.id || `r_${Math.random().toString(36).slice(2, 8)}`,
      name: s.name, email: s.email,
      token: genToken(), status: 'pending' as const,
      signed_at: null as string | null, signature_data: null as string | null, ip_address: null as string | null,
    }))
    const idset = new Set(signers.map(s => s.id))
    let fields: any[] = []
    try { const raw = fd.get('fields') as string | null; if (raw) fields = JSON.parse(raw) } catch {}
    fields = (fields || []).filter((f: any) => f && idset.has(f.signer_id))

    const expiresAt = new Date(Date.now() + expiryDays * 24 * 60 * 60 * 1000).toISOString()

    const { data: request, error: insertErr } = await supabase
      .from('signature_requests')
      .insert({
        document_name: documentName,
        document_url: documentUrl,
        document_path: documentPath,
        document_text: documentText || null,
        signer_name: signers[0].name,      // legacy mirror (first signer)
        signer_email: signers[0].email,
        sender_message: senderMessage || null,
        status: 'pending',
        token: signers[0].token,
        expires_at: expiresAt,
        signers,
        fields,
      })
      .select()
      .single()

    if (insertErr) return NextResponse.json({ error: insertErr.message }, { status: 500 })

    // Email each signer their own link
    const { sendSignatureRequestEmail } = await import('@/lib/resend')
    const results: Array<{ name: string; email: string; signingUrl: string }> = []
    for (const s of signers) {
      const signingUrl = `${APP}/sign/${s.token}`
      results.push({ name: s.name, email: s.email, signingUrl })
      try {
        await sendSignatureRequestEmail({ to: s.email, signerName: s.name, documentName, signingUrl, senderMessage: senderMessage || undefined, expiresAt })
      } catch (e: any) { console.error('Signature email failed:', e?.message) }
    }

    return NextResponse.json({ request, signingUrl: results[0].signingUrl, recipients: results }, { status: 201 })
  }

  // ── Record a signature (public — called from /sign/[token]) ──────────────
  if (action === 'sign') {
    const body = await req.json()
    const { token, signature_data } = body
    if (!token || !signature_data) return NextResponse.json({ error: 'token and signature_data required' }, { status: 400 })

    const sigReq = await findByToken(supabase, token)
    if (!sigReq) return NextResponse.json({ error: 'Request not found' }, { status: 404 })
    if (sigReq.status === 'void') return NextResponse.json({ error: 'This request has been voided' }, { status: 400 })
    if (new Date(sigReq.expires_at) < new Date()) {
      await supabase.from('signature_requests').update({ status: 'expired' }).eq('id', sigReq.id)
      return NextResponse.json({ error: 'This signing request has expired' }, { status: 400 })
    }

    const ip = req.headers.get('x-forwarded-for') || req.headers.get('x-real-ip') || 'unknown'
    const signedAt = new Date().toISOString()
    const signers: any[] = Array.isArray(sigReq.signers) ? sigReq.signers : []

    if (signers.length) {
      const idx = signers.findIndex(s => s.token === token)
      if (idx < 0) return NextResponse.json({ error: 'Signer not found' }, { status: 404 })
      if (signers[idx].status === 'signed') return NextResponse.json({ error: 'You have already signed' }, { status: 400 })
      signers[idx] = { ...signers[idx], status: 'signed', signature_data, signed_at: signedAt, ip_address: ip }
      const allSigned = signers.every(s => s.status === 'signed')
      const patch: any = { signers }
      if (allSigned) { patch.status = 'signed'; patch.signed_at = signedAt }
      const { error: uErr } = await supabase.from('signature_requests').update(patch).eq('id', sigReq.id)
      if (uErr) return NextResponse.json({ error: uErr.message }, { status: 500 })

      const me = signers[idx]
      try {
        const { sendSignatureConfirmationEmail } = await import('@/lib/resend')
        await sendSignatureConfirmationEmail({ to: me.email, signerName: me.name, documentName: sigReq.document_name, signedAt })
      } catch (e: any) { console.error('Confirmation email failed:', e?.message) }
      try {
        const { sendSignedNotificationEmail } = await import('@/lib/resend')
        await sendSignedNotificationEmail({ documentName: sigReq.document_name + (allSigned ? '' : ` (${signers.filter(s => s.status === 'signed').length}/${signers.length} signed)`), signerName: me.name, signerEmail: me.email, signedAt, signatureData: signature_data })
      } catch (e: any) { console.error('Admin notification failed:', e?.message) }

      return NextResponse.json({ success: true, signedAt, allSigned })
    }

    // Legacy single-signer row
    if (sigReq.status === 'signed') return NextResponse.json({ error: 'Already signed' }, { status: 400 })
    const { error: updateErr } = await supabase.from('signature_requests')
      .update({ status: 'signed', signature_data, signed_at: signedAt, ip_address: ip }).eq('id', sigReq.id)
    if (updateErr) return NextResponse.json({ error: updateErr.message }, { status: 500 })
    try {
      const { sendSignatureConfirmationEmail } = await import('@/lib/resend')
      await sendSignatureConfirmationEmail({ to: sigReq.signer_email, signerName: sigReq.signer_name, documentName: sigReq.document_name, signedAt })
    } catch {}
    try {
      const { sendSignedNotificationEmail } = await import('@/lib/resend')
      await sendSignedNotificationEmail({ documentName: sigReq.document_name, signerName: sigReq.signer_name, signerEmail: sigReq.signer_email, signedAt, signatureData: signature_data })
    } catch {}
    return NextResponse.json({ success: true, signedAt, allSigned: true })
  }

  // ── Signer declines ───────────────────────────────────────────────────────
  if (action === 'decline') {
    const body = await req.json()
    const { token } = body
    if (!token) return NextResponse.json({ error: 'token required' }, { status: 400 })
    const sigReq = await findByToken(supabase, token)
    if (!sigReq) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    if (sigReq.status === 'signed') return NextResponse.json({ error: 'Already completed' }, { status: 400 })

    const signers: any[] = Array.isArray(sigReq.signers) ? sigReq.signers : []
    if (signers.length) {
      const idx = signers.findIndex(s => s.token === token)
      if (idx >= 0) signers[idx] = { ...signers[idx], status: 'declined' }
    }
    await supabase.from('signature_requests').update({ status: 'declined', signers }).eq('id', sigReq.id)
    return NextResponse.json({ success: true })
  }

  // ── Resend the signing email(s) ───────────────────────────────────────────
  if (action === 'resend') {
    const body = await req.json()
    const { id } = body
    if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })
    const { data: sigReq } = await supabase.from('signature_requests').select('*').eq('id', id).single()
    if (!sigReq) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    const { sendSignatureRequestEmail } = await import('@/lib/resend')
    const signers: any[] = Array.isArray(sigReq.signers) && sigReq.signers.length
      ? sigReq.signers
      : [{ name: sigReq.signer_name, email: sigReq.signer_email, token: sigReq.token, status: sigReq.status }]
    const pending = signers.filter(s => s.status !== 'signed' && s.status !== 'declined')
    try {
      for (const s of (pending.length ? pending : signers)) {
        await sendSignatureRequestEmail({ to: s.email, signerName: s.name, documentName: sigReq.document_name, signingUrl: `${APP}/sign/${s.token}`, senderMessage: sigReq.sender_message || undefined, expiresAt: sigReq.expires_at })
      }
    } catch (e: any) { return NextResponse.json({ error: `Email failed: ${e.message}` }, { status: 500 }) }
    return NextResponse.json({ success: true })
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

  const { data: sigReq } = await supabase.from('signature_requests').select('document_path').eq('id', id).single()
  if (sigReq?.document_path) await supabase.storage.from(BUCKET).remove([sigReq.document_path])

  const { error } = await supabase.from('signature_requests').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
