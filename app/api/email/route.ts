import { NextRequest, NextResponse } from 'next/server'
export const dynamic = 'force-dynamic'

// Gmail-backed inbox API for Lacey@LaceyNPrice.com
//
//   GET  /api/email                                   → list inbox messages
//   GET  /api/email?folder=sent|drafts|all           → other folders
//   GET  /api/email?id=<msgId>                       → full message body + attachments
//   GET  /api/email?id=<msgId>&attachmentId=<aId>    → download attachment (base64)
//   POST /api/email                                   → send (body: { to, cc, bcc, subject, html, attachments })
//   PATCH /api/email                                  → modify labels (body: { id, markRead?, markUnread?, archive? })
//
// Auth: uses GOOGLE_CLIENT_ID/SECRET + GOOGLE_REFRESH_TOKEN env vars.
// Required Gmail scopes: gmail.readonly, gmail.send, gmail.modify, gmail.compose
// Re-auth via /api/email-scan?action=auth-url after expanding scopes in that route.

async function getGmail() {
  if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_REFRESH_TOKEN) {
    throw new Error('Gmail not configured — missing GOOGLE_CLIENT_ID or GOOGLE_REFRESH_TOKEN')
  }
  const { google } = await import('googleapis')
  const auth = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
  )
  auth.setCredentials({ refresh_token: process.env.GOOGLE_REFRESH_TOKEN })
  return google.gmail({ version: 'v1', auth })
}

// Decode RFC 2822 body — recursively walk parts to find text/html or text/plain
function extractBody(payload: any): { html: string; text: string; attachments: any[] } {
  let html = ''
  let text = ''
  const attachments: any[] = []

  function walk(part: any) {
    if (!part) return
    const mime = part.mimeType || ''
    const filename = part.filename || ''
    const body = part.body || {}
    if (filename && body.attachmentId) {
      attachments.push({
        attachmentId: body.attachmentId,
        filename,
        mimeType: mime,
        size: body.size || 0,
      })
    } else if (mime === 'text/html' && body.data) {
      html += Buffer.from(body.data, 'base64').toString('utf-8')
    } else if (mime === 'text/plain' && body.data) {
      text += Buffer.from(body.data, 'base64').toString('utf-8')
    }
    if (part.parts) for (const p of part.parts) walk(p)
  }
  walk(payload)
  return { html, text, attachments }
}

function header(headers: any[], name: string): string {
  const h = (headers || []).find((x: any) => (x.name || '').toLowerCase() === name.toLowerCase())
  return h?.value || ''
}

export async function GET(req: NextRequest) {
  try {
    const gmail = await getGmail()
    const id = req.nextUrl.searchParams.get('id')
    const attachmentId = req.nextUrl.searchParams.get('attachmentId')

    // Single-attachment download
    if (id && attachmentId) {
      const att = await gmail.users.messages.attachments.get({ userId: 'me', messageId: id, id: attachmentId })
      return NextResponse.json({ data: att.data.data || '', size: att.data.size || 0 })
    }

    // Single-message detail
    if (id) {
      const msg = await gmail.users.messages.get({ userId: 'me', id, format: 'full' })
      const headers = msg.data.payload?.headers || []
      const { html, text, attachments } = extractBody(msg.data.payload)
      return NextResponse.json({
        id: msg.data.id,
        threadId: msg.data.threadId,
        from: header(headers, 'From'),
        to: header(headers, 'To'),
        cc: header(headers, 'Cc'),
        subject: header(headers, 'Subject'),
        date: header(headers, 'Date'),
        snippet: msg.data.snippet || '',
        labelIds: msg.data.labelIds || [],
        unread: (msg.data.labelIds || []).includes('UNREAD'),
        html,
        text,
        attachments,
      })
    }

    // Folder listing
    const folder = (req.nextUrl.searchParams.get('folder') || 'inbox').toLowerCase()
    const search = req.nextUrl.searchParams.get('q') || undefined

    // Drafts use a different API — list returns draft IDs alongside message IDs
    if (folder === 'drafts') {
      const list = await gmail.users.drafts.list({ userId: 'me', maxResults: 50, q: search })
      const drafts = list.data.drafts || []
      const messages = await Promise.all(drafts.map(async d => {
        if (!d.message?.id) return null
        const m = await gmail.users.messages.get({
          userId: 'me',
          id: d.message.id,
          format: 'metadata',
          metadataHeaders: ['From', 'To', 'Subject', 'Date'],
        })
        const headers = m.data.payload?.headers || []
        return {
          id: m.data.id,
          draftId: d.id,           // <-- draft ID for update/delete operations
          threadId: m.data.threadId,
          from: header(headers, 'From'),
          to: header(headers, 'To'),
          subject: header(headers, 'Subject'),
          date: header(headers, 'Date'),
          snippet: m.data.snippet || '',
          unread: false,
          hasAttachment: (m.data.labelIds || []).includes('HAS_ATTACHMENT'),
          isDraft: true,
        }
      }))
      const filtered = messages.filter(Boolean) as any[]
      return NextResponse.json({ messages: filtered, total: filtered.length })
    }

    const labelMap: Record<string, string[]> = {
      inbox: ['INBOX'],
      sent: ['SENT'],
      all: [],
    }
    const labelIds = labelMap[folder] ?? ['INBOX']

    const list = await gmail.users.messages.list({
      userId: 'me',
      labelIds: labelIds.length ? labelIds : undefined,
      maxResults: 50,
      q: search,
    })

    const ids = (list.data.messages || []).map(m => m.id!).filter(Boolean)
    // Fetch metadata for each in parallel (subject, from, date, snippet)
    const messages = await Promise.all(ids.map(async msgId => {
      const m = await gmail.users.messages.get({
        userId: 'me',
        id: msgId,
        format: 'metadata',
        metadataHeaders: ['From', 'To', 'Subject', 'Date'],
      })
      const headers = m.data.payload?.headers || []
      return {
        id: m.data.id,
        threadId: m.data.threadId,
        from: header(headers, 'From'),
        to: header(headers, 'To'),
        subject: header(headers, 'Subject'),
        date: header(headers, 'Date'),
        snippet: m.data.snippet || '',
        unread: (m.data.labelIds || []).includes('UNREAD'),
        hasAttachment: (m.data.labelIds || []).includes('HAS_ATTACHMENT'),
      }
    }))

    return NextResponse.json({ messages, total: list.data.resultSizeEstimate || messages.length })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}

// Build an RFC 2822 multipart MIME message with optional attachments
function buildMime(opts: {
  from: string; to: string; cc?: string; bcc?: string; subject: string; html: string;
  attachments?: { name: string; mimeType: string; base64: string }[];
  inReplyTo?: string; references?: string;
}) {
  const boundary = `__b_${Date.now().toString(36)}__`
  const altBoundary = `__alt_${Date.now().toString(36)}__`
  const hasAttachments = (opts.attachments || []).length > 0

  const headers = [
    `From: ${opts.from}`,
    `To: ${opts.to}`,
    opts.cc ? `Cc: ${opts.cc}` : '',
    opts.bcc ? `Bcc: ${opts.bcc}` : '',
    `Subject: ${opts.subject}`,
    `Date: ${new Date().toUTCString()}`,
    `MIME-Version: 1.0`,
    opts.inReplyTo ? `In-Reply-To: ${opts.inReplyTo}` : '',
    opts.references ? `References: ${opts.references}` : '',
  ].filter(Boolean)

  // Strip HTML tags for plain-text alternative
  const plainText = opts.html
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()

  const altPart = [
    `Content-Type: multipart/alternative; boundary="${altBoundary}"`,
    ``,
    `--${altBoundary}`,
    `Content-Type: text/plain; charset=UTF-8`,
    `Content-Transfer-Encoding: 7bit`,
    ``,
    plainText,
    ``,
    `--${altBoundary}`,
    `Content-Type: text/html; charset=UTF-8`,
    `Content-Transfer-Encoding: 7bit`,
    ``,
    opts.html,
    ``,
    `--${altBoundary}--`,
  ].join('\r\n')

  let body: string
  if (hasAttachments) {
    headers.push(`Content-Type: multipart/mixed; boundary="${boundary}"`)
    const parts = [
      `--${boundary}`,
      altPart,
      ``,
    ]
    for (const att of opts.attachments!) {
      parts.push(`--${boundary}`)
      parts.push(`Content-Type: ${att.mimeType}; name="${att.name}"`)
      parts.push(`Content-Disposition: attachment; filename="${att.name}"`)
      parts.push(`Content-Transfer-Encoding: base64`)
      parts.push(``)
      // Wrap base64 at 76 chars per RFC
      parts.push(att.base64.replace(/(.{76})/g, '$1\r\n'))
      parts.push(``)
    }
    parts.push(`--${boundary}--`)
    body = parts.join('\r\n')
  } else {
    headers.push(`Content-Type: multipart/alternative; boundary="${altBoundary}"`)
    body = altPart.split('\r\n').slice(2).join('\r\n')   // drop the leading Content-Type since we put it in headers
  }

  return [...headers, '', body].join('\r\n')
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const action = req.nextUrl.searchParams.get('action')
    const { to, cc, bcc, subject, html, attachments, inReplyTo, threadId, draftId } = body

    const gmail = await getGmail()
    const fromEmail = process.env.RESEND_FROM_EMAIL || 'Lacey@LaceyNPrice.com'
    const from = `L. Price Building Company <${fromEmail}>`

    const mime = buildMime({
      from, to: to || '', cc, bcc, subject: subject || '(no subject)',
      html: html || '',
      attachments,
      inReplyTo,
      references: inReplyTo,
    })

    const encoded = Buffer.from(mime, 'utf-8')
      .toString('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '')

    // Save as draft (or update existing draft)
    if (action === 'draft') {
      if (draftId) {
        const updated = await gmail.users.drafts.update({
          userId: 'me',
          id: draftId,
          requestBody: { message: { raw: encoded, threadId: threadId || undefined } },
        })
        return NextResponse.json({ draftId: updated.data.id, messageId: updated.data.message?.id, ok: true })
      } else {
        const created = await gmail.users.drafts.create({
          userId: 'me',
          requestBody: { message: { raw: encoded, threadId: threadId || undefined } },
        })
        return NextResponse.json({ draftId: created.data.id, messageId: created.data.message?.id, ok: true })
      }
    }

    // Send (with required fields)
    if (!to || !subject) return NextResponse.json({ error: 'to and subject required' }, { status: 400 })

    // If sending an existing draft, use drafts.send so it disappears from Drafts
    if (draftId) {
      const sent = await gmail.users.drafts.send({
        userId: 'me',
        requestBody: { id: draftId, message: { raw: encoded, threadId: threadId || undefined } },
      })
      return NextResponse.json({ id: sent.data.id, threadId: sent.data.threadId, ok: true })
    }

    const sent = await gmail.users.messages.send({
      userId: 'me',
      requestBody: { raw: encoded, threadId: threadId || undefined },
    })
    return NextResponse.json({ id: sent.data.id, threadId: sent.data.threadId, ok: true })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const body = await req.json()
    const { id, markRead, markUnread, archive, trash } = body
    if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })
    const gmail = await getGmail()
    if (trash) {
      // Move to trash — recoverable for 30 days, then auto-purged
      await gmail.users.messages.trash({ userId: 'me', id })
      return NextResponse.json({ ok: true, trashed: true })
    }
    const addLabelIds: string[] = []
    const removeLabelIds: string[] = []
    if (markRead) removeLabelIds.push('UNREAD')
    if (markUnread) addLabelIds.push('UNREAD')
    if (archive) removeLabelIds.push('INBOX')
    await gmail.users.messages.modify({ userId: 'me', id, requestBody: { addLabelIds, removeLabelIds } })
    return NextResponse.json({ ok: true })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}

// DELETE /api/email?draftId=...   → permanently delete a draft
// DELETE /api/email?id=...         → permanently delete a message (skips trash)
export async function DELETE(req: NextRequest) {
  try {
    const draftId = req.nextUrl.searchParams.get('draftId')
    const id = req.nextUrl.searchParams.get('id')
    const gmail = await getGmail()
    if (draftId) {
      await gmail.users.drafts.delete({ userId: 'me', id: draftId })
      return NextResponse.json({ ok: true, deleted: 'draft' })
    }
    if (id) {
      await gmail.users.messages.delete({ userId: 'me', id })
      return NextResponse.json({ ok: true, deleted: 'message' })
    }
    return NextResponse.json({ error: 'id or draftId required' }, { status: 400 })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
