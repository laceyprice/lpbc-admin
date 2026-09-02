import { NextRequest, NextResponse } from 'next/server'
export const dynamic = 'force-dynamic'
export const maxDuration = 120
import { createServerClient } from '@/lib/supabase'
import { signedUrlFor } from '@/lib/signed-url'
import { webSafeImage } from '@/lib/heic'

const JOB_PLANNING_BUCKET = 'job-planning'
const MAX_IMPORT = 30

// Google deprecated broad Library API listing — the current way to let a user
// bring in their own photos is the Google Photos Picker API: create a session,
// the user picks photos in Google's own UI, then we read the selected items.
async function getAccessToken(): Promise<string> {
  const { google } = await import('googleapis')
  if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET || !process.env.GOOGLE_REFRESH_TOKEN) {
    throw new Error('Google OAuth not configured')
  }
  const o = new google.auth.OAuth2(process.env.GOOGLE_CLIENT_ID, process.env.GOOGLE_CLIENT_SECRET)
  o.setCredentials({ refresh_token: process.env.GOOGLE_REFRESH_TOKEN })
  const { token } = await o.getAccessToken()
  if (!token) throw new Error('Could not get a Google access token')
  return token as string
}

// POST /api/google-photos?action=create-session            → { sessionId, pickerUri }
// POST /api/google-photos?action=import  { sessionId, session_id } → { pending } | { uploaded }
export async function POST(req: NextRequest) {
  const action = req.nextUrl.searchParams.get('action')
  let token: string
  try { token = await getAccessToken() } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Google not connected' }, { status: 500 })
  }
  const H: Record<string, string> = { Authorization: `Bearer ${token}` }

  if (action === 'create-session') {
    const res = await fetch('https://photospicker.googleapis.com/v1/sessions', {
      method: 'POST', headers: { ...H, 'Content-Type': 'application/json' }, body: '{}',
    })
    const d = await res.json().catch(() => ({}))
    if (!res.ok) {
      const msg = d?.error?.message || 'Could not start the Google Photos picker'
      // 403 usually means the Photos scope wasn't granted yet
      return NextResponse.json({ error: msg, needsAuth: res.status === 403 }, { status: res.status === 403 ? 403 : 500 })
    }
    return NextResponse.json({ sessionId: d.id, pickerUri: d.pickerUri })
  }

  if (action === 'import') {
    const body = await req.json().catch(() => ({}))
    const sessionId = body.sessionId
    const planSession = body.session_id || `plan_${Date.now()}`
    if (!sessionId) return NextResponse.json({ error: 'sessionId required' }, { status: 400 })

    // Has the user finished picking yet?
    const sRes = await fetch(`https://photospicker.googleapis.com/v1/sessions/${sessionId}`, { headers: H })
    const sData = await sRes.json().catch(() => ({}))
    if (!sRes.ok) return NextResponse.json({ error: sData?.error?.message || 'Picker session error' }, { status: 500 })
    if (!sData.mediaItemsSet) return NextResponse.json({ pending: true })

    const supabase = createServerClient()
    const uploaded: any[] = []
    let pageToken: string | undefined
    do {
      const url = new URL('https://photospicker.googleapis.com/v1/mediaItems')
      url.searchParams.set('sessionId', sessionId)
      url.searchParams.set('pageSize', '50')
      if (pageToken) url.searchParams.set('pageToken', pageToken)
      const mRes = await fetch(url.toString(), { headers: H })
      const mData = await mRes.json().catch(() => ({}))
      if (!mRes.ok) return NextResponse.json({ error: mData?.error?.message || 'Could not list the picked photos' }, { status: 500 })
      for (const item of (mData.mediaItems || [])) {
        if (uploaded.length >= MAX_IMPORT) break
        const mf = item.mediaFile || {}
        const mime: string = mf.mimeType || 'image/jpeg'
        if (!mime.startsWith('image/') || !mf.baseUrl) continue   // photos only
        try {
          const dl = await fetch(`${mf.baseUrl}=d`, { headers: H })   // =d → full-resolution download
          if (!dl.ok) continue
          const raw = Buffer.from(await dl.arrayBuffer())
          const safe = await webSafeImage(raw, mime, mf.filename || `photo_${item.id}.jpg`)
          const safeName = safe.name.replace(/[^a-z0-9._-]+/gi, '_')
          const path = `${planSession}/${Date.now()}_${safeName}`
          const { error: upErr } = await supabase.storage.from(JOB_PLANNING_BUCKET).upload(path, safe.buffer, { contentType: safe.contentType, upsert: false })
          if (upErr) continue
          const signed = await signedUrlFor(supabase, JOB_PLANNING_BUCKET, path, 60 * 60 * 24)
          uploaded.push({ path, name: safe.name, type: safe.contentType, size: safe.buffer.length, signed_url: signed })
        } catch { /* skip a bad item, keep going */ }
      }
      pageToken = mData.nextPageToken
    } while (pageToken && uploaded.length < MAX_IMPORT)

    // Best-effort cleanup of the picker session.
    try { await fetch(`https://photospicker.googleapis.com/v1/sessions/${sessionId}`, { method: 'DELETE', headers: H }) } catch {}

    return NextResponse.json({ uploaded })
  }

  return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
}
