import { NextRequest, NextResponse } from 'next/server'
export const dynamic = 'force-dynamic'
import { consumeGoogleOAuthState, saveGoogleRefreshToken } from '@/lib/google-token'

// Google sends you here after the consent screen. If the sign-in was started from
// Settings → Google Connection (valid one-time state), the new token is saved straight
// into the database — nothing to copy, no Flux change, no redeploy.
const esc = (s: unknown) => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!))
const page = (body: string) => new NextResponse(
  `<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body style="font-family:Arial,sans-serif;max-width:600px;margin:40px auto;padding:20px">${body}</body></html>`,
  { headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' } })

export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get('code')
  const state = req.nextUrl.searchParams.get('state')
  if (!code) return page(`<h1>No code received</h1><p>${esc(req.nextUrl.searchParams.get('error') || '')}</p>`)

  try {
    const { google } = await import('googleapis')
    const redirectUri = `${process.env.NEXT_PUBLIC_APP_URL || req.nextUrl.origin}/api/google-callback`
    const oauth2Client = new google.auth.OAuth2(process.env.GOOGLE_CLIENT_ID, process.env.GOOGLE_CLIENT_SECRET, redirectUri)
    const { tokens } = await oauth2Client.getToken(code)
    const trusted = await consumeGoogleOAuthState(state)

    if (trusted && tokens.refresh_token) {
      const err = await saveGoogleRefreshToken(tokens.refresh_token)
      if (!err) return page(`
        <h1 style="color:#16a34a">✅ Google is connected</h1>
        <p>The new connection was saved and is live now. <b>Nothing else to do</b> — no token to copy, no Flux update, no redeploy.</p>
        <p style="color:#666;font-size:14px">Permissions granted: ${esc(tokens.scope)}</p>
        <p style="color:#999;font-size:12px">You can close this tab and refresh the Google Connection page.</p>`)
    }

    // Fallback: not started from the app (or the save failed) — show the token for a manual paste.
    return page(`
      <h1 style="color:#d97706">Google authorized — one more step</h1>
      <p>${trusted ? 'The token could not be saved automatically.' : 'This sign-in wasn’t started from the app’s Google Connection page (or the link expired), so it wasn’t saved automatically.'}
      Easiest fix: go to <b>Settings → Google Connection</b> and press <b>Reconnect Google</b> again. Or copy the token below and paste it in Step 2 there.</p>
      <div style="background:#f1f5f9;padding:16px;border-radius:8px;word-break:break-all;font-family:monospace;font-size:13px;margin:16px 0">
        ${esc(tokens.refresh_token || 'NOT RETURNED — your existing token may still work')}
      </div>
      <p style="color:#666;font-size:14px">Permissions: ${esc(tokens.scope)}</p>`)
  } catch (err: any) {
    return page(`<h1 style="color:#dc2626">❌ Google connection failed</h1><p>${esc(err?.message)}</p><p>Go back to <b>Settings → Google Connection</b> and press Reconnect Google to try again.</p>`)
  }
}
