import { NextRequest, NextResponse } from 'next/server'
export const dynamic = 'force-dynamic'
import { createServerClient } from '@/lib/supabase'

// GET  /api/permits                          → list all permits
// GET  /api/permits?status=issued            → filter by status
// GET  /api/permits?action=sync-invoices     → auto-extract from invoices
// GET  /api/permits?action=scan-emails       → scan Gmail for permit emails
// POST /api/permits                          → create permit
// PATCH /api/permits                         → update permit
// DELETE /api/permits?id=uuid                → delete

export async function GET(req: NextRequest) {
  const supabase = createServerClient()
  const action = req.nextUrl.searchParams.get('action')
  const status = req.nextUrl.searchParams.get('status')
  const search = req.nextUrl.searchParams.get('search')
  const id = req.nextUrl.searchParams.get('id')

  if (action === 'sync-invoices') return syncFromInvoices(supabase)
  if (action === 'scan-emails') return scanPermitEmails(supabase, req)

  if (id) {
    const { data, error } = await supabase.from('permits').select(`
      *, jurisdiction:permit_jurisdictions(*),
      contact:contacts(id, first_name, last_name, email, phone),
      invoice:invoices(id, invoice_number, service_date)
    `).eq('id', id).single()
    if (error) return NextResponse.json({ error: error.message }, { status: 404 })
    return NextResponse.json(data)
  }

  let query = supabase
    .from('permits')
    .select(`
      *, jurisdiction:permit_jurisdictions(id, name, website_url, permit_office_phone),
      contact:contacts(id, first_name, last_name),
      invoice:invoices(id, invoice_number)
    `)
    .order('created_at', { ascending: false })

  if (status && status !== 'all') query = query.eq('status', status)
  if (search) {
    query = query.or(`job_address.ilike.%${search}%,permit_number.ilike.%${search}%,customer_name.ilike.%${search}%,jurisdiction_name.ilike.%${search}%`)
  }

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data || [])
}

export async function POST(req: NextRequest) {
  const supabase = createServerClient()
  const body = await req.json()

  const { data, error } = await supabase.from('permits').insert({
    permit_number: body.permit_number || null,
    permit_type: body.permit_type || 'gas',
    description: body.description || null,
    job_address: body.job_address,
    city: body.city || null,
    state: body.state || null,
    jurisdiction_id: body.jurisdiction_id || null,
    jurisdiction_name: body.jurisdiction_name || null,
    contact_id: body.contact_id || null,
    customer_name: body.customer_name || null,
    invoice_id: body.invoice_id || null,
    status: body.status || 'pending_application',
    application_date: body.application_date || null,
    approved_date: body.approved_date || null,
    issued_date: body.issued_date || null,
    expiry_date: body.expiry_date || null,
    inspection_date: body.inspection_date || null,
    final_date: body.final_date || null,
    inspector_name: body.inspector_name || null,
    inspector_phone: body.inspector_phone || null,
    inspector_notes: body.inspector_notes || null,
    permit_fee: body.permit_fee || null,
    fee_paid: body.fee_paid || false,
    source: body.source || 'manual',
    email_message_id: body.email_message_id || null,
    notes: body.notes || null,
  }).select().single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data, { status: 201 })
}

export async function PATCH(req: NextRequest) {
  const supabase = createServerClient()
  const body = await req.json()
  // Strip joined relation objects — not actual columns in the permits table
  const { id, contact, jurisdiction, invoice, created_at, updated_at, ...updates } = body
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })
  const { data, error } = await supabase.from('permits').update(updates).eq('id', id).select().single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function DELETE(req: NextRequest) {
  const supabase = createServerClient()
  const id = req.nextUrl.searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })
  await supabase.from('permits').delete().eq('id', id)
  return NextResponse.json({ success: true })
}

// ══════════════════════════════════════════════════════════════
// Auto-sync from invoice line items / descriptions
// ══════════════════════════════════════════════════════════════

const PERMIT_KEYWORDS = [
  /permit\s+required/i,
  /permit\s+pull(ed)?/i,
  /pull(ed)?\s+permit/i,
  /permit\s+applied/i,
  /permit\s+application/i,
  /permit\s+submitted/i,
  /applied\s+for\s+permit/i,
  /permit\s+#?\s*[A-Z0-9\-]+/i,
  /building\s+permit/i,
  /gas\s+permit/i,
  /mechanical\s+permit/i,
]

const PERMIT_NUMBER_RE = /permit\s*#?\s*([A-Z0-9\-]{4,})/i

async function syncFromInvoices(supabase: any) {
  const { data: invoices } = await supabase
    .from('invoices')
    .select('id, invoice_number, service_description, notes, job_address, customer_name, contact_id, service_date, line_items')
    .order('service_date', { ascending: false })
    .limit(500)

  if (!invoices?.length) return NextResponse.json({ imported: 0, scanned: 0 })

  // Get existing invoice links to avoid duplicates
  const { data: existing } = await supabase
    .from('permits')
    .select('invoice_id')
    .not('invoice_id', 'is', null)
  const linkedInvoiceIds = new Set((existing || []).map((r: any) => r.invoice_id))

  let imported = 0

  for (const inv of invoices) {
    if (linkedInvoiceIds.has(inv.id)) continue

    const searchText = [
      inv.service_description || '',
      inv.notes || '',
      ...(Array.isArray(inv.line_items)
        ? inv.line_items.map((li: any) => li.description || li.name || '')
        : []),
    ].join(' ')

    const hasPermit = PERMIT_KEYWORDS.some(re => re.test(searchText))
    if (!hasPermit) continue

    const permitNumMatch = searchText.match(PERMIT_NUMBER_RE)
    const permitNumber = permitNumMatch ? permitNumMatch[1] : null

    const { error } = await supabase.from('permits').insert({
      invoice_id: inv.id,
      customer_name: inv.customer_name || null,
      contact_id: inv.contact_id || null,
      job_address: inv.job_address || 'See invoice',
      permit_number: permitNumber,
      permit_type: 'gas',
      status: permitNumber ? 'issued' : 'pending_application',
      application_date: inv.service_date || null,
      source: 'invoice',
      description: `Auto-detected from invoice #${inv.invoice_number}`,
    })

    if (!error) { imported++; linkedInvoiceIds.add(inv.id) }
  }

  return NextResponse.json({ imported, scanned: invoices.length })
}

// ══════════════════════════════════════════════════════════════
// Gmail scan for permit confirmations
// ══════════════════════════════════════════════════════════════

async function scanPermitEmails(supabase: any, req: NextRequest) {
  if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_REFRESH_TOKEN) {
    return NextResponse.json({ error: 'Gmail not configured', needsAuth: true }, { status: 403 })
  }

  try {
    const { google } = await import('googleapis')
    const auth = new google.auth.OAuth2(process.env.GOOGLE_CLIENT_ID, process.env.GOOGLE_CLIENT_SECRET)
    auth.setCredentials({ refresh_token: process.env.GOOGLE_REFRESH_TOKEN })
    const gmail = google.gmail({ version: 'v1', auth })

    const q = [
      'newer_than:90d',
      '-in:sent -in:drafts -in:spam',
      '(',
      'subject:permit',
      'OR subject:"permit number"',
      'OR subject:"permit approved"',
      'OR subject:"permit issued"',
      'OR subject:"permit confirmation"',
      'OR subject:"permit application"',
      'OR subject:"permit ready"',
      'OR subject:"inspection scheduled"',
      'OR subject:"permit received"',
      ')',
    ].join(' ')

    const listRes = await gmail.users.messages.list({ userId: 'me', q, maxResults: 100 })
    const messages = listRes.data.messages || []
    const msgIds = messages.map(m => m.id!).filter(Boolean)

    const { data: existing } = await supabase
      .from('permits')
      .select('email_message_id')
      .not('email_message_id', 'is', null)
      .in('email_message_id', msgIds)
    const processedIds = new Set((existing || []).map((r: any) => r.email_message_id))
    const newMessages = messages.filter(m => m.id && !processedIds.has(m.id))

    let imported = 0

    for (const msgRef of newMessages.slice(0, 30)) {
      const messageId = msgRef.id!
      try {
        const msg = await gmail.users.messages.get({ userId: 'me', id: messageId, format: 'full' })
        const headers = msg.data.payload?.headers || []
        const subject = headers.find((h: any) => h.name === 'Subject')?.value || ''
        const from = headers.find((h: any) => h.name === 'From')?.value || ''
        const dateHeader = headers.find((h: any) => h.name === 'Date')?.value || ''

        // Extract body text
        const bodyText = extractEmailBody(msg.data.payload)
        const fullText = `${subject} ${bodyText}`

        // Extract permit number
        const permitNumMatch = fullText.match(/permit\s*(?:number|#|no\.?)?\s*:?\s*([A-Z0-9\-]{4,20})/i)
        const permitNumber = permitNumMatch ? permitNumMatch[1].trim() : null

        // Extract address
        const addressMatch = bodyText.match(/\d+\s+[A-Za-z][A-Za-z\s,\.]+(?:Street|St|Avenue|Ave|Road|Rd|Drive|Dr|Lane|Ln|Blvd|Boulevard|Court|Ct|Way|Circle|Cir)[^,\n]*/i)
        const address = addressMatch ? addressMatch[0].trim() : 'See email'

        // Determine status from subject
        let status = 'applied'
        const subjectLower = subject.toLowerCase()
        if (subjectLower.includes('approved') || subjectLower.includes('issued') || subjectLower.includes('ready')) status = 'issued'
        else if (subjectLower.includes('inspection')) status = 'inspection_scheduled'
        else if (subjectLower.includes('received') || subjectLower.includes('confirmation')) status = 'applied'

        const emailDate = dateHeader ? new Date(dateHeader).toISOString().split('T')[0] : new Date().toISOString().split('T')[0]

        await supabase.from('permits').insert({
          permit_number: permitNumber,
          job_address: address,
          status,
          source: 'email',
          email_message_id: messageId,
          description: subject.slice(0, 255),
          application_date: emailDate,
          issued_date: status === 'issued' ? emailDate : null,
          notes: `From: ${from}\nSubject: ${subject}`,
        })

        imported++
      } catch (e) { /* skip failed message */ }
    }

    return NextResponse.json({ imported, scanned: messages.length, newChecked: newMessages.length })
  } catch (err: any) {
    if (err?.status === 403 || err?.message?.includes('insufficient')) {
      return NextResponse.json({ error: 'Gmail not authorized', needsAuth: true }, { status: 403 })
    }
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}

function extractEmailBody(payload: any, depth = 0): string {
  if (!payload || depth > 5) return ''
  if (payload.body?.data) {
    try {
      return Buffer.from(payload.body.data.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8')
    } catch { return '' }
  }
  if (payload.parts) {
    for (const part of payload.parts) {
      const text = extractEmailBody(part, depth + 1)
      if (text) return text
    }
  }
  return ''
}
