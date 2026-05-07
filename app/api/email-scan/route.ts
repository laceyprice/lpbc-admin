import { NextRequest, NextResponse } from 'next/server'
export const dynamic = 'force-dynamic'
import { createServerClient } from '@/lib/supabase'

const BUCKET = 'bookkeeping-images'

// ── GET /api/email-scan?action=auth-url   → OAuth URL to grant Gmail access
// ── GET /api/email-scan?action=status     → recent scan log
// ── POST /api/email-scan                  → run the scan
//    body: { days_back?: number, dry_run?: boolean }

export async function GET(req: NextRequest) {
  const action = req.nextUrl.searchParams.get('action')

  if (action === 'auth-url') {
    if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET) {
      return NextResponse.json({ error: 'Google OAuth not configured' }, { status: 400 })
    }
    const { google } = await import('googleapis')
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || req.nextUrl.origin
    const oauth2Client = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET,
      `${baseUrl}/api/google-callback`
    )
    const authUrl = oauth2Client.generateAuthUrl({
      access_type: 'offline',
      prompt: 'consent',
      state: 'gmail-reauth',
      scope: [
        'https://www.googleapis.com/auth/calendar',
        'https://www.googleapis.com/auth/gmail.readonly',
        'https://www.googleapis.com/auth/gmail.send',
        'https://www.googleapis.com/auth/gmail.modify',
        'https://www.googleapis.com/auth/gmail.compose',
        'https://www.googleapis.com/auth/drive.readonly',
      ],
    })
    return NextResponse.json({ authUrl })
  }

  if (action === 'status') {
    const supabase = createServerClient()
    const { data: recentScans } = await supabase
      .from('email_scan_log')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(30)
    const { count: emailImported } = await supabase
      .from('transaction_images')
      .select('id', { count: 'exact', head: true })
      .ilike('notes', 'email:%')
    return NextResponse.json({
      recentScans: recentScans || [],
      totalEmailImported: emailImported || 0,
    })
  }

  return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
}

export async function POST(req: NextRequest) {
  const supabase = createServerClient()
  const body = await req.json().catch(() => ({}))
  const daysBack: number = body.days_back ?? 30
  const dryRun: boolean = body.dry_run ?? false

  if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_REFRESH_TOKEN) {
    return NextResponse.json({
      error: 'Google OAuth not configured',
      needsAuth: true,
      message: 'Google credentials are missing. Contact your administrator.',
    }, { status: 403 })
  }

  try {
    const { google } = await import('googleapis')
    const auth = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET,
    )
    auth.setCredentials({ refresh_token: process.env.GOOGLE_REFRESH_TOKEN })

    const gmail = google.gmail({ version: 'v1', auth })

    // Verify Gmail scope is available by listing labels
    try {
      await gmail.users.labels.list({ userId: 'me' })
    } catch (err: any) {
      const msg = err?.message || ''
      if (err?.status === 403 || msg.includes('insufficient') || msg.includes('scope')) {
        return NextResponse.json({
          error: 'Gmail access not authorized',
          needsAuth: true,
          message: 'Gmail read permission has not been granted. Click "Authorize Gmail Access" below to add it.',
        }, { status: 403 })
      }
      throw err
    }

    // Search Gmail for receipt / invoice / W9 / COI emails
    const searchQuery = [
      `newer_than:${daysBack}d`,
      '-in:sent',
      '-in:drafts',
      '-in:spam',
      '(',
      'subject:receipt',
      'OR subject:invoice',
      'OR subject:bill',
      'OR subject:"order confirmation"',
      'OR subject:"payment confirmation"',
      'OR subject:"purchase confirmation"',
      'OR subject:"your order"',
      'OR subject:w-9',
      'OR subject:w9',
      'OR subject:"certificate of insurance"',
      'OR subject:COI',
      'OR subject:"cert of insurance"',
      'OR subject:"insurance certificate"',
      'OR (has:attachment (receipt OR invoice OR bill OR w9 OR "certificate of insurance"))',
      ')',
    ].join(' ')

    const listRes = await gmail.users.messages.list({
      userId: 'me',
      q: searchQuery,
      maxResults: 200,
    })

    const messages = listRes.data.messages || []
    const msgIds = messages.map(m => m.id!).filter(Boolean)

    // Find which ones we've already processed
    const { data: existingLog } = await supabase
      .from('email_scan_log')
      .select('gmail_message_id')
      .in('gmail_message_id', msgIds)
    const processedIds = new Set((existingLog || []).map(r => r.gmail_message_id))
    const newMessages = messages.filter(m => m.id && !processedIds.has(m.id))

    if (dryRun) {
      return NextResponse.json({
        totalFound: messages.length,
        alreadyProcessed: processedIds.size,
        newToProcess: newMessages.length,
        dryRun: true,
      })
    }

    let totalImported = 0
    let totalSkipped = 0
    let totalFailed = 0
    const results: any[] = []

    // Process up to 50 new messages per run
    for (const msgRef of newMessages.slice(0, 50)) {
      const messageId = msgRef.id!
      try {
        const msg = await gmail.users.messages.get({
          userId: 'me',
          id: messageId,
          format: 'full',
        })

        const headers = msg.data.payload?.headers || []
        const subject = headers.find(h => h.name === 'Subject')?.value || '(no subject)'
        const fromHeader = headers.find(h => h.name === 'From')?.value || ''
        const dateHeader = headers.find(h => h.name === 'Date')?.value || ''
        const emailDate = safeDate(dateHeader)

        // Find all attachments (images + PDFs)
        const attachments = findAttachments(msg.data.payload)
        const importedIds: string[] = []

        // Detect if this email is a W9 or COI
        const emailDocType = detectDocType(subject, fromHeader)

        for (const att of attachments) {
          try {
            // Download the attachment
            let rawData: string | null = null
            if (att.body?.data) {
              rawData = att.body.data
            } else if (att.body?.attachmentId) {
              const attRes = await gmail.users.messages.attachments.get({
                userId: 'me',
                messageId,
                id: att.body.attachmentId,
              })
              rawData = attRes.data.data ?? null
            }
            if (!rawData) continue

            // base64url → Buffer
            const buf = Buffer.from(
              rawData.replace(/-/g, '+').replace(/_/g, '/'),
              'base64'
            )

            const mimeType = att.mimeType || 'image/jpeg'
            const ext = mimeExtension(mimeType)
            const stamp = Date.now()
            const rand = Math.random().toString(36).slice(2, 8)
            const fileName = att.filename || `email_${emailDocType}_${stamp}.${ext}`
            const notesStr = `email:${messageId}|from:${fromHeader.slice(0, 100)}|subject:${subject.slice(0, 150)}`

            // Detect file-level doc type (filename may say "w9" or "coi")
            const fileDocType = detectDocTypeFromFilename(att.filename || '', emailDocType)

            if (fileDocType === 'w9' || fileDocType === 'coi') {
              // ── Route to vendor_documents ─────────────────────
              const vendorBucket = 'vendor-documents'
              const filePath = `${fileDocType}/${stamp}_${rand}.${ext}`

              const { error: upErr } = await supabase.storage
                .from(vendorBucket)
                .upload(filePath, buf, { contentType: mimeType, upsert: false })
              if (upErr) {
                console.error('Vendor doc upload error:', upErr.message)
                continue
              }

              // Bucket is private; the GET endpoint regenerates signed URLs
              // on every read. file_url is just a placeholder.
              const vendorName = extractVendorFromFrom(fromHeader)

              const { data: docRec, error: docErr } = await supabase
                .from('vendor_documents')
                .insert({
                  doc_type: fileDocType,
                  vendor_name: vendorName,
                  file_url: '',
                  file_path: filePath,
                  file_name: fileName,
                  mime_type: mimeType,
                  size_bytes: buf.length,
                  issued_date: emailDate,
                  source: 'email',
                  email_message_id: messageId,
                  notes: notesStr,
                })
                .select('id')
                .single()

              if (docErr) {
                console.error('Vendor doc insert error:', docErr.message)
                continue
              }
              if (docRec?.id) {
                importedIds.push(docRec.id)
                totalImported++
              }
            } else {
              // ── Route to bookkeeping receipts ─────────────────
              // Skip PDFs in receipt flow (Claude can't parse them for receipts)
              // but still store them so user can review
              const filePath = `receipt/${stamp}_${rand}.${ext}`

              const { error: upErr } = await supabase.storage
                .from(BUCKET)
                .upload(filePath, buf, { contentType: mimeType, upsert: false })
              if (upErr) {
                console.error('Storage upload error:', upErr.message)
                continue
              }

              const { data: imgRec, error: imgErr } = await supabase
                .from('transaction_images')
                .insert({
                  image_type: 'receipt',
                  file_url: '',
                  file_path: filePath,
                  file_name: fileName,
                  mime_type: mimeType,
                  size_bytes: buf.length,
                  receipt_date: emailDate,
                  notes: notesStr,
                })
                .select('id')
                .single()

              if (imgErr) {
                console.error('DB insert error:', imgErr.message)
                continue
              }
              if (imgRec?.id) {
                importedIds.push(imgRec.id)
                totalImported++
              }
            }
          } catch (attErr: any) {
            console.error('Attachment processing error:', attErr.message)
          }
        }

        const status = importedIds.length > 0 ? 'processed' : 'skipped'
        if (status === 'skipped') totalSkipped++

        // Log this email
        await supabase.from('email_scan_log').upsert({
          gmail_message_id: messageId,
          gmail_thread_id: msg.data.threadId ?? null,
          from_email: fromHeader.slice(0, 255),
          subject: subject.slice(0, 255),
          email_date: emailDate,
          attachment_count: attachments.length,
          imported_count: importedIds.length,
          status,
          transaction_image_ids: importedIds.length > 0
            ? importedIds.map(id => id as any)
            : [],
        }, { onConflict: 'gmail_message_id' })

        if (importedIds.length > 0) {
          results.push({
            subject,
            from: fromHeader,
            date: emailDate,
            attachments: importedIds.length,
          })
        }
      } catch (msgErr: any) {
        console.error(`Error processing message ${messageId}:`, msgErr.message)
        totalFailed++
        // Log as failed so we don't retry endlessly
        await supabase.from('email_scan_log').upsert({
          gmail_message_id: messageId,
          status: 'failed',
          error_message: msgErr.message?.slice(0, 255) ?? 'Unknown error',
        }, { onConflict: 'gmail_message_id' }).catch(() => {})
      }
    }

    return NextResponse.json({
      totalFound: messages.length,
      alreadyProcessed: processedIds.size,
      newChecked: Math.min(newMessages.length, 50),
      totalImported,
      totalSkipped,
      totalFailed,
      results,
    })
  } catch (err: any) {
    console.error('Email scan error:', err)
    if (err?.status === 403 || err?.message?.includes('insufficient')) {
      return NextResponse.json({
        error: 'Gmail access not authorized',
        needsAuth: true,
        message: 'Gmail read permission has not been granted. Click "Authorize Gmail Access" to add it.',
      }, { status: 403 })
    }
    return NextResponse.json({ error: err.message ?? 'Scan failed' }, { status: 500 })
  }
}

// ── Helpers ──────────────────────────────────────────────────

/** Recursively find image + PDF parts in a Gmail message payload */
function findAttachments(payload: any, depth = 0): any[] {
  if (!payload || depth > 8) return []
  const results: any[] = []

  const mime = payload.mimeType || ''
  const isImage = mime.startsWith('image/')
  const isPDF = mime === 'application/pdf'
  const hasData = payload.body?.data || payload.body?.attachmentId
  const hasName = payload.filename && payload.filename.length > 0

  if ((isImage || isPDF) && hasData && hasName) {
    results.push(payload)
  }

  if (payload.parts) {
    for (const part of payload.parts) {
      results.push(...findAttachments(part, depth + 1))
    }
  }

  return results
}

function safeDate(dateStr: string): string {
  try {
    if (!dateStr) return new Date().toISOString().split('T')[0]
    const d = new Date(dateStr)
    if (isNaN(d.getTime())) return new Date().toISOString().split('T')[0]
    return d.toISOString().split('T')[0]
  } catch {
    return new Date().toISOString().split('T')[0]
  }
}

/** Classify email as receipt | w9 | coi based on subject/sender */
function detectDocType(subject: string, from: string): string {
  const combined = (subject + ' ' + from).toLowerCase()
  if (combined.includes('w-9') || combined.includes('w9') || combined.includes('w 9')) return 'w9'
  if (
    combined.includes('certificate of insurance') ||
    combined.includes('cert of insurance') ||
    combined.includes('insurance certificate') ||
    combined.includes(' coi ') ||
    combined.includes('coi.')
  ) return 'coi'
  return 'receipt'
}

/** Classify attachment by filename, falling back to emailDocType */
function detectDocTypeFromFilename(filename: string, fallback: string): string {
  const f = filename.toLowerCase()
  if (f.includes('w-9') || f.includes('w9') || f.startsWith('w 9')) return 'w9'
  if (
    f.includes('coi') ||
    f.includes('certificate_of_insurance') ||
    f.includes('cert_of_insurance') ||
    f.includes('insurance_cert')
  ) return 'coi'
  return fallback
}

/** Extract a clean vendor name from a From: header like "ACME Corp <acme@example.com>" */
function extractVendorFromFrom(from: string): string {
  const match = from.match(/^([^<]+)</)
  if (match) return match[1].trim().replace(/^["']|["']$/g, '')
  const emailMatch = from.match(/<([^>]+)>/) || from.match(/([^\s]+@[^\s]+)/)
  if (emailMatch) return emailMatch[1].split('@')[0].replace(/[._-]/g, ' ')
  return from.slice(0, 80).trim()
}

function mimeExtension(mime: string): string {
  const map: Record<string, string> = {
    'image/jpeg': 'jpg',
    'image/jpg': 'jpg',
    'image/png': 'png',
    'image/gif': 'gif',
    'image/webp': 'webp',
    'image/heic': 'heic',
    'image/heif': 'heif',
    'application/pdf': 'pdf',
  }
  return map[mime] || 'jpg'
}
