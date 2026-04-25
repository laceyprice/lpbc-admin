import { NextRequest, NextResponse } from 'next/server'
export const dynamic = 'force-dynamic'

// Temporary callback route — displays the auth code so you can copy it
export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get('code')
  if (!code) {
    return new NextResponse('<h1>No code received</h1>', {
      headers: { 'Content-Type': 'text/html' },
    })
  }

  // Exchange the code for tokens right here
  try {
    const { google } = await import('googleapis')
    const redirectUri = process.env.NEXT_PUBLIC_APP_URL
      ? `${process.env.NEXT_PUBLIC_APP_URL}/api/google-callback`
      : `${req.nextUrl.origin}/api/google-callback`
    const oauth2Client = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET,
      redirectUri
    )
    const { tokens } = await oauth2Client.getToken(code)

    return new NextResponse(`
      <html><body style="font-family:Arial,sans-serif;max-width:600px;margin:40px auto;padding:20px">
        <h1 style="color:#16a34a">✅ Google Authorization Successful!</h1>
        <p>Copy this new refresh token and update your <code>.env.local</code> and Flux environment:</p>
        <div style="background:#f1f5f9;padding:16px;border-radius:8px;word-break:break-all;font-family:monospace;font-size:13px;margin:16px 0">
          GOOGLE_REFRESH_TOKEN=${tokens.refresh_token || 'NOT RETURNED — your existing token may still work'}
        </div>
        <p style="color:#666;font-size:14px">Scopes: ${tokens.scope}</p>
        <p style="color:#999;font-size:12px">You can close this page now.</p>
      </body></html>
    `, { headers: { 'Content-Type': 'text/html' } })
  } catch (err: any) {
    return new NextResponse(`
      <html><body style="font-family:Arial,sans-serif;max-width:600px;margin:40px auto;padding:20px">
        <h1 style="color:#dc2626">❌ Token Exchange Failed</h1>
        <p>${err.message}</p>
        <p>The auth code was: <code style="word-break:break-all">${code}</code></p>
        <p>Try running: <code>node scripts/google-auth.js ${code}</code></p>
      </body></html>
    `, { headers: { 'Content-Type': 'text/html' } })
  }
}
