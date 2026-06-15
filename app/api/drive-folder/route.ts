import { NextRequest, NextResponse } from 'next/server'
export const dynamic = 'force-dynamic'

// Shared Drive client factory
async function getDrive() {
  if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_REFRESH_TOKEN) {
    throw Object.assign(new Error('Google credentials not configured — set GOOGLE_CLIENT_ID and GOOGLE_REFRESH_TOKEN'), { needsAuth: true })
  }
  const { google } = await import('googleapis')
  const auth = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
  )
  auth.setCredentials({ refresh_token: process.env.GOOGLE_REFRESH_TOKEN })
  return google.drive({ version: 'v3', auth })
}

function driveError(err: any) {
  const msg = err?.message ?? 'Drive error'
  const status = err?.needsAuth ? 503 : (err?.code === 404 ? 404 : 500)
  return NextResponse.json({ error: msg, needsAuth: !!err?.needsAuth }, { status })
}

// ── GET ────────────────────────────────────────────────────────────────────
// ?action=list&folder_id=xxx       → list files in folder
// ?action=folder-info&folder_id=xxx → name + webViewLink
export async function GET(req: NextRequest) {
  const action   = req.nextUrl.searchParams.get('action')
  const folderId = req.nextUrl.searchParams.get('folder_id')

  try {
    const drive = await getDrive()

    if (action === 'list') {
      if (!folderId) return NextResponse.json({ error: 'folder_id required' }, { status: 400 })
      const res = await drive.files.list({
        q: `'${folderId}' in parents and trashed = false`,
        fields: 'files(id,name,mimeType,size,modifiedTime,webViewLink,thumbnailLink,iconLink)',
        orderBy: 'modifiedTime desc',
        pageSize: 100,
      })
      return NextResponse.json({ files: res.data.files ?? [] })
    }

    if (action === 'folder-info') {
      if (!folderId) return NextResponse.json({ error: 'folder_id required' }, { status: 400 })
      const res = await drive.files.get({
        fileId: folderId,
        fields: 'id,name,webViewLink',
      })
      return NextResponse.json({ folder: res.data })
    }

    return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
  } catch (err: any) {
    return driveError(err)
  }
}

// ── POST ───────────────────────────────────────────────────────────────────
// ?action=create-folder   body: { name, parent_id? }   → creates folder + makes link-viewable
// ?action=upload          form: { folder_id, file }     → uploads file into folder
// ?action=share           body: { folder_id, email?, make_public? }
export async function POST(req: NextRequest) {
  const action = req.nextUrl.searchParams.get('action')

  try {
    const drive = await getDrive()

    // ── Create folder ───────────────────────────────────────────────────
    if (action === 'create-folder') {
      const body = await req.json().catch(() => ({}))
      const name     = (body.name as string) || 'Project Documents'
      const parentId = (body.parent_id as string) || null

      const res = await drive.files.create({
        requestBody: {
          name,
          mimeType: 'application/vnd.google-apps.folder',
          ...(parentId ? { parents: [parentId] } : {}),
        },
        fields: 'id,name,webViewLink',
      })
      // Make viewable by anyone with the link (read-only)
      await drive.permissions.create({
        fileId: res.data.id!,
        requestBody: { role: 'reader', type: 'anyone' },
      })
      return NextResponse.json({ folder: res.data })
    }

    // ── Upload file into folder ─────────────────────────────────────────
    if (action === 'upload') {
      const formData = await req.formData()
      const folderId = formData.get('folder_id') as string
      const file     = formData.get('file')     as File | null
      if (!folderId || !file) {
        return NextResponse.json({ error: 'folder_id and file required' }, { status: 400 })
      }
      const { Readable } = await import('stream')
      const buffer = Buffer.from(await file.arrayBuffer())
      const stream = Readable.from(buffer)

      const res = await drive.files.create({
        requestBody: {
          name: file.name,
          parents: [folderId],
        },
        media: {
          mimeType: file.type || 'application/octet-stream',
          body: stream,
        },
        fields: 'id,name,webViewLink,mimeType,size,modifiedTime',
      })
      return NextResponse.json({ file: res.data })
    }

    // ── Make folder writable by anyone with link ────────────────────────
    if (action === 'share') {
      const body     = await req.json().catch(() => ({}))
      const folderId = body.folder_id as string
      const email    = body.email    as string | undefined
      if (!folderId) return NextResponse.json({ error: 'folder_id required' }, { status: 400 })

      if (email) {
        // Share directly with a specific email (editor)
        await drive.permissions.create({
          fileId: folderId,
          requestBody: { role: 'writer', type: 'user', emailAddress: email },
          sendNotificationEmail: true,
        })
      } else {
        // Make writable by anyone with the link — useful for subs to upload COIs
        await drive.permissions.create({
          fileId: folderId,
          requestBody: { role: 'writer', type: 'anyone' },
        })
      }
      const info = await drive.files.get({ fileId: folderId, fields: 'id,name,webViewLink' })
      return NextResponse.json({ folder: info.data })
    }

    return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
  } catch (err: any) {
    return driveError(err)
  }
}
