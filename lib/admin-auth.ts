import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'

// Server-side gate for admin-only API routes. Most routes in this app are open
// (no session check); anything holding financial/personal data should call this
// first and return its result when non-null:
//
//   const denied = await requireAdmin(req); if (denied) return denied
//
// The caller must send `Authorization: Bearer <access_token>` (see lib/admin-fetch.ts).
// A user with no user_roles row counts as admin, matching AdminAuthGuard.
export async function requireAdmin(req: NextRequest): Promise<NextResponse | null> {
  const token = req.headers.get('authorization')?.replace(/^Bearer\s+/i, '')
  if (!token) return NextResponse.json({ error: 'Not signed in' }, { status: 401 })

  const supabase = createServerClient()
  const { data, error } = await supabase.auth.getUser(token)
  if (error || !data?.user) return NextResponse.json({ error: 'Invalid or expired session' }, { status: 401 })

  const { data: roleRow } = await supabase.from('user_roles').select('role').eq('user_id', data.user.id).maybeSingle()
  const role = roleRow?.role || 'admin'
  if (role !== 'admin') return NextResponse.json({ error: 'Admin only' }, { status: 403 })
  return null
}
