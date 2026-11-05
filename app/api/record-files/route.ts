import { NextRequest, NextResponse } from 'next/server'
export const dynamic = 'force-dynamic'
import { createServerClient } from '@/lib/supabase'
import { requireRole } from '@/lib/admin-auth'

// Documents & images attached to licenses and permits. admin + bookkeeper only.
//
// GET    /api/record-files?entity_type=license&entity_id=uuid   → files (with fresh signed URLs)
// POST   /api/record-files?action=upload       multipart: file, entity_type, entity_id
//          → saved to private storage; also copied to Google Drive when the saved Google
//            authorization allows writing (response.drive says what happened)
// POST   /api/record-files?action=import-drive  json: { fileId, entity_type, entity_id }
//          → pulls a file from Google Drive into the record
// DELETE /api/record-files?id=uuid              → removes the file (the Drive copy is left alone)

const BUCKET = 'record-files'
const ROLES = ['admin', 'bookkeeper']
const DRIVE_ROOT = 'Licenses & Permits'
const SUBFOLDER: Record<string, string> = { license: 'Licenses', permit: 'Permits' }
const TYPES = ['license', 'permit']

const safeName = (n: string) => (n || 'file').replace(/[^\w.\- ]+/g, '_').slice(0, 120)

async function getDrive() {
  if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET || !process.env.GOOGLE_REFRESH_TOKEN) throw new Error('Google isn\'t connected')
  const { google } = await import('googleapis')
  const auth = new google.auth.OAuth2(process.env.GOOGLE_CLIENT_ID, process.env.GOOGLE_CLIENT_SECRET)
  auth.setCredentials({ refresh_token: process.env.GOOGLE_REFRESH_TOKEN })
  return google.drive({ version: 'v3', auth })
}

// Find a folder by name under a parent (or create it).
async function ensureFolder(drive: any, name: string, parentId?: string) {
  const q = [`name = '${name.replace(/'/g, "\\'")}'`, `mimeType = 'application/vnd.google-apps.folder'`, 'trashed = false', parentId ? `'${parentId}' in parents` : `'root' in parents`].join(' and ')
  const found = await drive.files.list({ q, fields: 'files(id)', pageSize: 1 })
  if (found.data.files?.[0]?.id) return found.data.files[0].id as string
  const made = await drive.files.create({
    requestBody: { name, mimeType: 'application/vnd.google-apps.folder', ...(parentId ? { parents: [parentId] } : {}) },
    fields: 'id',
  })
  return made.data.id as string
}

// Best-effort copy to Drive. Never throws: the Supabase copy is the source of truth.
async function backupToDrive(entityType: string, fileName: string, mime: string, buf: Buffer) {
  try {
    const drive = await getDrive()
    const root = await ensureFolder(drive, DRIVE_ROOT)
    const folder = await ensureFolder(drive, SUBFOLDER[entityType] || 'Other', root)
    const { Readable } = await import('stream')
    const res = await drive.files.create({
      requestBody: { name: fileName, parents: [folder] },
      media: { mimeType: mime || 'application/octet-stream', body: Readable.from(buf) },
      fields: 'id, webViewLink',
    })
    return { ok: true as const, id: res.data.id as string, url: (res.data.webViewLink as string) || null }
  } catch (e: any) {
    const msg = String(e?.message || '')
    const needsWrite = /insufficient|scope|permission|forbidden|403/i.test(msg)
    return { ok: false as const, reason: needsWrite ? 'needs-write-access' : msg.slice(0, 160) || 'failed' }
  }
}

async function ensureBucket(supabase: any) {
  await supabase.storage.createBucket(BUCKET, { public: false })   // no-op if it already exists
}

async function saveRecord(supabase: any, p: { entity_type: string; entity_id: string; file_name: string; mime: string; buf: Buffer; drive?: { id: string; url: string | null } | null }) {
  const path = `${p.entity_type}/${p.entity_id}/${Date.now()}_${Math.random().toString(36).slice(2, 7)}_${safeName(p.file_name)}`
  const { error: upErr } = await supabase.storage.from(BUCKET).upload(path, p.buf, { contentType: p.mime || undefined, upsert: false })
  if (upErr) throw new Error(`Upload failed: ${upErr.message}`)
  const { data, error } = await supabase.from('record_files').insert({
    entity_type: p.entity_type, entity_id: p.entity_id, file_name: p.file_name, mime_type: p.mime || null,
    size_bytes: p.buf.length, storage_path: path, drive_file_id: p.drive?.id || null, drive_url: p.drive?.url || null,
  }).select().single()
  if (error) { await supabase.storage.from(BUCKET).remove([path]); throw new Error(error.message) }
  return data
}

export async function GET(req: NextRequest) {
  const denied = await requireRole(req, ROLES); if (denied) return denied
  const supabase = createServerClient()
  const type = req.nextUrl.searchParams.get('entity_type') || ''
  const id = req.nextUrl.searchParams.get('entity_id')
  if (!TYPES.includes(type) || !id) return NextResponse.json({ error: 'entity_type and entity_id required' }, { status: 400 })

  const { data, error } = await supabase.from('record_files').select('*').eq('entity_type', type).eq('entity_id', id).order('created_at', { ascending: false })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  const withUrls = await Promise.all((data || []).map(async (f: any) => {
    const { data: signed } = await supabase.storage.from(BUCKET).createSignedUrl(f.storage_path, 60 * 60)
    return { ...f, url: signed?.signedUrl || null }
  }))
  return NextResponse.json(withUrls)
}

export async function POST(req: NextRequest) {
  const denied = await requireRole(req, ROLES); if (denied) return denied
  const supabase = createServerClient()
  const action = req.nextUrl.searchParams.get('action')

  try {
    if (action === 'upload') {
      const form = await req.formData()
      const file = form.get('file') as File | null
      const entity_type = String(form.get('entity_type') || '')
      const entity_id = String(form.get('entity_id') || '')
      if (!file || !TYPES.includes(entity_type) || !entity_id) return NextResponse.json({ error: 'file, entity_type and entity_id required' }, { status: 400 })
      if (file.size > 25 * 1024 * 1024) return NextResponse.json({ error: 'That file is over 25 MB' }, { status: 413 })

      await ensureBucket(supabase)
      const buf = Buffer.from(await file.arrayBuffer())
      const name = file.name || `scan-${Date.now()}.jpg`
      const drive = await backupToDrive(entity_type, name, file.type, buf)
      const record = await saveRecord(supabase, { entity_type, entity_id, file_name: name, mime: file.type, buf, drive: drive.ok ? { id: drive.id, url: drive.url } : null })
      return NextResponse.json({ record, drive: drive.ok ? { ok: true } : { ok: false, reason: drive.reason } }, { status: 201 })
    }

    if (action === 'import-drive') {
      const { fileId, entity_type, entity_id } = await req.json()
      if (!fileId || !TYPES.includes(entity_type) || !entity_id) return NextResponse.json({ error: 'fileId, entity_type and entity_id required' }, { status: 400 })
      const drive = await getDrive()
      const meta = await drive.files.get({ fileId, fields: 'name, mimeType, webViewLink' })
      let mime = meta.data.mimeType || 'application/octet-stream'
      let name = meta.data.name || `drive-${fileId}`
      let buf: Buffer
      if (mime.startsWith('application/vnd.google-apps')) {          // Docs/Sheets/Slides → PDF
        const exp = await drive.files.export({ fileId, mimeType: 'application/pdf' }, { responseType: 'arraybuffer' })
        buf = Buffer.from(exp.data as ArrayBuffer); mime = 'application/pdf'
        if (!/\.pdf$/i.test(name)) name += '.pdf'
      } else {
        const r = await drive.files.get({ fileId, alt: 'media' }, { responseType: 'arraybuffer' })
        buf = Buffer.from(r.data as ArrayBuffer)
      }
      await ensureBucket(supabase)
      const record = await saveRecord(supabase, { entity_type, entity_id, file_name: name, mime, buf, drive: { id: fileId, url: (meta.data.webViewLink as string) || null } })
      return NextResponse.json({ record }, { status: 201 })
    }

    return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Failed' }, { status: 500 })
  }
}

export async function DELETE(req: NextRequest) {
  const denied = await requireRole(req, ROLES); if (denied) return denied
  const supabase = createServerClient()
  const id = req.nextUrl.searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })
  const { data: row } = await supabase.from('record_files').select('storage_path').eq('id', id).maybeSingle()
  if (row?.storage_path) await supabase.storage.from(BUCKET).remove([row.storage_path])
  const { error } = await supabase.from('record_files').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
