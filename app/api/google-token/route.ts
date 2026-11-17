import { NextRequest, NextResponse } from 'next/server'
export const dynamic = 'force-dynamic'
import { createServerClient } from '@/lib/supabase'
import { requireAdmin } from '@/lib/admin-auth'
import { getGoogleRefreshToken, clearGoogleTokenCache } from '@/lib/google-token'

// Admin-only. Lets the Google refresh token be replaced from the app (Admin → Google
// Connect) instead of editing the Flux environment.
// GET  /api/google-token                → { source: 'database'|'env'|'none', valid, scopes[] }
// POST /api/google-token { token }      → checks the token with Google, then saves it

async function inspect(token: string) {
  const { google } = await import('googleapis')
  const auth = new google.auth.OAuth2(process.env.GOOGLE_CLIENT_ID, process.env.GOOGLE_CLIENT_SECRET)
  auth.setCredentials({ refresh_token: token })
  const { token: access } = await auth.getAccessToken()
  if (!access) throw new Error('Google did not return an access token')
  const info = await auth.getTokenInfo(access)
  return (info.scopes || []) as string[]
}

export async function GET(req: NextRequest) {
  const denied = await requireAdmin(req); if (denied) return denied
  clearGoogleTokenCache()
  const supabase = createServerClient()
  const { data } = await supabase.from('app_secrets').select('updated_at').eq('key', 'google_refresh_token').maybeSingle()
  const token = await getGoogleRefreshToken()
  if (!token) return NextResponse.json({ source: 'none', valid: false, scopes: [] })
  const source = data ? 'database' : 'env'
  try {
    return NextResponse.json({ source, valid: true, scopes: await inspect(token), updated_at: data?.updated_at || null })
  } catch (e: any) {
    return NextResponse.json({ source, valid: false, scopes: [], error: e?.message || 'Token rejected by Google' })
  }
}

export async function POST(req: NextRequest) {
  const denied = await requireAdmin(req); if (denied) return denied
  const { token } = await req.json().catch(() => ({}))
  const value = String(token || '').trim().replace(/^GOOGLE_REFRESH_TOKEN=/, '')
  if (!value) return NextResponse.json({ error: 'Paste the token first' }, { status: 400 })
  let scopes: string[]
  try { scopes = await inspect(value) } catch (e: any) {
    return NextResponse.json({ error: `Google rejected that token (${e?.message || 'invalid'}). Copy it again from the authorization page.` }, { status: 400 })
  }
  const { error } = await createServerClient().from('app_secrets').upsert({ key: 'google_refresh_token', value, updated_at: new Date().toISOString() })
  if (error) return NextResponse.json({ error: /app_secrets/.test(error.message) ? 'Run the 032_app_secrets.sql migration in Supabase first.' : error.message }, { status: 500 })
  clearGoogleTokenCache()
  return NextResponse.json({ ok: true, scopes })
}
