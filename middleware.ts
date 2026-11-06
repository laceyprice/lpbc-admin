import { NextRequest, NextResponse } from 'next/server'
import { decide } from '@/lib/api-gate'

// Default-deny gate for every /api/* route. Which routes are public, which need any
// signed-in user, and which need staff is decided in lib/api-gate.ts (unit-tested).
// A brand-new API route is therefore PROTECTED unless it is deliberately listed there.

export const config = { matcher: '/api/:path*' }

// Short-lived cache so a page that fires ten API calls doesn't make ten auth round trips.
const cache = new Map<string, { exp: number; who: { id: string; role: string } | null }>()
const TTL = 60_000

async function whoIs(token: string): Promise<{ id: string; role: string } | null> {
  const hit = cache.get(token)
  if (hit && hit.exp > Date.now()) return hit.who

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!url || !anon) return null
  let who: { id: string; role: string } | null = null
  try {
    const u = await fetch(`${url}/auth/v1/user`, { headers: { apikey: anon, Authorization: `Bearer ${token}` } })
    if (u.ok) {
      const user = await u.json()
      // user_roles is readable by any signed-in user (RLS policy "Admin full access … TO authenticated").
      // No row = the original owner account = admin (same rule as AdminAuthGuard / requireAdmin).
      const r = await fetch(`${url}/rest/v1/user_roles?select=role&user_id=eq.${encodeURIComponent(user.id)}&limit=1`, {
        headers: { apikey: anon, Authorization: `Bearer ${token}` },
      })
      const rows = r.ok ? await r.json() : null
      if (rows) who = { id: user.id, role: rows[0]?.role || 'admin' }
    }
  } catch { who = null }
  if (cache.size > 500) cache.clear()
  cache.set(token, { exp: Date.now() + TTL, who: who })
  return who
}

export async function middleware(req: NextRequest) {
  const { pathname, searchParams } = req.nextUrl
  const result = decide({
    method: req.method,
    path: pathname,
    query: Object.fromEntries(searchParams.entries()),
    hasStripeSignature: !!req.headers.get('stripe-signature'),
  })
  if (result.level === 'public') return NextResponse.next()

  const token = req.headers.get('authorization')?.replace(/^Bearer\s+/i, '')
  if (!token) return NextResponse.json({ error: 'Not signed in' }, { status: 401 })
  const who = await whoIs(token)
  if (!who) return NextResponse.json({ error: 'Invalid or expired session' }, { status: 401 })

  if (result.level === 'user') return NextResponse.next()           // route checks the user itself (customer portal)
  if (!result.allowedRoles.includes(who.role)) return NextResponse.json({ error: 'Not allowed' }, { status: 403 })
  return NextResponse.next()
}
