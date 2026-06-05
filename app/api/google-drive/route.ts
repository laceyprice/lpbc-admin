import { NextRequest, NextResponse } from 'next/server'
export const dynamic = 'force-dynamic'
export const maxDuration = 120
import { createServerClient } from '@/lib/supabase'
import { signedUrlFor } from '@/lib/signed-url'

const BUCKET = 'bookkeeping-images'
const JOB_PLANNING_BUCKET = 'job-planning'

// Build a Google Drive client using stored refresh token
async function getDriveClient() {
  const { google } = await import('googleapis')
  if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET || !process.env.GOOGLE_REFRESH_TOKEN) {
    throw new Error('Google OAuth not configured')
  }
  const oauth2Client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET
  )
  oauth2Client.setCredentials({ refresh_token: process.env.GOOGLE_REFRESH_TOKEN })
  return google.drive({ version: 'v3', auth: oauth2Client })
}

// ── GET /api/google-drive?action=list[&folderId=<id>][&q=<search>][&pageToken=<t>]
//        Lists files & folders. If no folderId, lists from root.
// ── GET /api/google-drive?action=download&fileId=<id>
//        Streams a file back (used by client to preview). Not typically needed.
export async function GET(req: NextRequest) {
  const action = req.nextUrl.searchParams.get('action')

  if (action === 'list') {
    try {
      const drive = await getDriveClient()
      const folderId = req.nextUrl.searchParams.get('folderId') || 'root'
      const search = req.nextUrl.searchParams.get('q') || ''
      const pageToken = req.nextUrl.searchParams.get('pageToken') || undefined

      // Build the query — children of folderId, not trashed, optional name search
      let q = `'${folderId}' in parents and trashed = false`
      if (search) {
        q += ` and name contains '${search.replace(/'/g, "\\'")}'`
      }

      const res = await drive.files.list({
        q,
        pageSize: 100,
        pageToken,
        fields: 'nextPageToken, files(id, name, mimeType, size, modifiedTime, iconLink, thumbnailLink, webViewLink)',
        orderBy: 'folder,name',
      })

      // Resolve current folder name for breadcrumb (skip if root)
      let folderName = 'My Drive'
      if (folderId !== 'root') {
        try {
          const folder = await drive.files.get({ fileId: folderId, fields: 'name, parents' })
          folderName = folder.data.name || 'Folder'
        } catch {}
      }

      return NextResponse.json({
        folderId,
        folderName,
        files: res.data.files || [],
        nextPageToken: res.data.nextPageToken || null,
      })
    } catch (err: any) {
      return NextResponse.json({ error: err.message || 'Failed to list Drive' }, { status: 500 })
    }
  }

  if (action === 'download') {
    try {
      const drive = await getDriveClient()
      const fileId = req.nextUrl.searchParams.get('fileId')
      if (!fileId) return NextResponse.json({ error: 'Missing fileId' }, { status: 400 })

      const meta = await drive.files.get({ fileId, fields: 'name, mimeType' })
      const fileRes = await drive.files.get({ fileId, alt: 'media' }, { responseType: 'arraybuffer' })
      const buf = Buffer.from(fileRes.data as ArrayBuffer)

      return new NextResponse(buf, {
        headers: {
          'Content-Type': meta.data.mimeType || 'application/octet-stream',
          'Content-Disposition': `inline; filename="${meta.data.name || 'file'}"`,
        },
      })
    } catch (err: any) {
      return NextResponse.json({ error: err.message || 'Download failed' }, { status: 500 })
    }
  }

  return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
}

// ── POST /api/google-drive?action=import
//      body: { fileId, fileName, mimeType, target: 'receipt'|'check'|'document'|'statement', financial_account_id?, vendor?, amount?, receipt_date?, notes? }
//      Downloads from Drive → uploads to Supabase storage → creates DB row
export async function POST(req: NextRequest) {
  const action = req.nextUrl.searchParams.get('action')
  const body = await req.json().catch(() => ({})) as any

  // Bulk import to the job-planning bucket (used by Plan New Job page)
  if (action === 'import-to-job-planning') {
    const { session_id, files } = body
    if (!session_id) return NextResponse.json({ error: 'session_id required' }, { status: 400 })
    if (!Array.isArray(files) || !files.length) return NextResponse.json({ error: 'No files' }, { status: 400 })
    try {
      const drive = await getDriveClient()
      const supabase = createServerClient()
      const uploaded: Array<{ path: string; name: string; type: string; size: number; signed_url: string | null }> = []
      for (const f of files) {
        const fileId = f.fileId
        if (!fileId) continue
        const meta = await drive.files.get({ fileId, fields: 'name, mimeType, size' })
        const safeName = (f.fileName || meta.data.name || `drive-${fileId}`).replace(/[^a-z0-9._-]+/gi, '_')
        const safeMime = f.mimeType || meta.data.mimeType || 'application/octet-stream'
        // Skip Workspace docs — they aren't usable as image input
        if (safeMime.startsWith('application/vnd.google-apps')) continue
        const fileRes = await drive.files.get({ fileId, alt: 'media' }, { responseType: 'arraybuffer' })
        const buf = Buffer.from(fileRes.data as ArrayBuffer)
        const storagePath = `${session_id}/${Date.now()}_${safeName}`
        const { error: upErr } = await supabase.storage.from(JOB_PLANNING_BUCKET).upload(storagePath, buf, {
          contentType: safeMime,
          upsert: false,
        })
        if (upErr) continue
        const signed = await signedUrlFor(supabase, JOB_PLANNING_BUCKET, storagePath, 60 * 60 * 24)
        uploaded.push({ path: storagePath, name: safeName, type: safeMime, size: buf.length, signed_url: signed })
      }
      return NextResponse.json({ uploaded })
    } catch (err: any) {
      return NextResponse.json({ error: err.message || 'Drive import failed' }, { status: 500 })
    }
  }

  if (action !== 'import') {
    return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
  }

  const { fileId, fileName, mimeType, target = 'receipt', financial_account_id, vendor, amount, receipt_date, notes } = body
  if (!fileId) return NextResponse.json({ error: 'Missing fileId' }, { status: 400 })

  try {
    const drive = await getDriveClient()
    const supabase = createServerClient()

    // 1. Download the file bytes from Drive
    const meta = await drive.files.get({ fileId, fields: 'name, mimeType, size' })
    const safeName = fileName || meta.data.name || `drive-${fileId}`
    const safeMime = mimeType || meta.data.mimeType || 'application/octet-stream'

    let buf: Buffer
    // Google Workspace files (Docs, Sheets, Slides) need export instead of download
    if (safeMime.startsWith('application/vnd.google-apps')) {
      const exportMime = safeMime === 'application/vnd.google-apps.spreadsheet'
        ? 'application/pdf'
        : safeMime === 'application/vnd.google-apps.document'
          ? 'application/pdf'
          : 'application/pdf'
      const exp = await drive.files.export({ fileId, mimeType: exportMime }, { responseType: 'arraybuffer' })
      buf = Buffer.from(exp.data as ArrayBuffer)
    } else {
      const fileRes = await drive.files.get({ fileId, alt: 'media' }, { responseType: 'arraybuffer' })
      buf = Buffer.from(fileRes.data as ArrayBuffer)
    }

    // 2. Upload to Supabase storage
    const ext = safeName.split('.').pop() || 'bin'
    const storagePath = `drive-import/${Date.now()}-${fileId}.${ext}`
    const { error: upErr } = await supabase.storage.from(BUCKET).upload(storagePath, buf, {
      contentType: safeMime,
      upsert: false,
    })
    if (upErr) throw upErr

    const { data: pub } = supabase.storage.from(BUCKET).getPublicUrl(storagePath)
    const fileUrl = pub.publicUrl

    // 3. Insert DB row depending on target type
    if (target === 'document' || target === 'statement') {
      // vendor_documents table for COIs, W9s, etc.
      const { data, error } = await supabase
        .from('vendor_documents')
        .insert({
          file_url: fileUrl,
          file_path: storagePath,
          file_name: safeName,
          mime_type: safeMime,
          notes: notes || `imported from Google Drive (${fileId})`,
        })
        .select()
        .single()
      if (error) throw error
      return NextResponse.json({ ok: true, record: data })
    } else {
      // transaction_images for receipts/checks
      const imageType = target === 'check' ? 'check' : 'receipt'
      const { data, error } = await supabase
        .from('transaction_images')
        .insert({
          file_url: fileUrl,
          file_path: storagePath,
          file_name: safeName,
          mime_type: safeMime,
          image_type: imageType,
          vendor: vendor || null,
          amount: amount ?? null,
          receipt_date: receipt_date || null,
          financial_account_id: financial_account_id || null,
          notes: notes || `imported from Google Drive (${fileId})`,
        })
        .select()
        .single()
      if (error) throw error
      return NextResponse.json({ ok: true, record: data })
    }
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Import failed' }, { status: 500 })
  }
}
