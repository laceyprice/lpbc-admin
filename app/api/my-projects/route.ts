import { NextRequest, NextResponse } from 'next/server'
export const dynamic = 'force-dynamic'
import { createClient } from '@supabase/supabase-js'
import { createServerClient } from '@/lib/supabase'

// GET /api/my-projects
// Customer-portal endpoint — returns a read-only view of the job plans/estimates
// that have been shared with the signed-in customer's assigned account.
//
// Auth: expects `Authorization: Bearer <access_token>` from the customer's
// Supabase session. We verify the token server-side (never trust a client-sent
// account id), look up their assigned_account_id from user_roles, then return
// only plans explicitly shared with that account and not still in 'draft'.
export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('authorization') || ''
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null
  if (!token) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

  // Verify the token against Supabase Auth using the anon client
  const anon = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
  const { data: userData, error: userErr } = await anon.auth.getUser(token)
  if (userErr || !userData?.user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

  const supabase = createServerClient()

  const { data: roleRow, error: roleErr } = await supabase
    .from('user_roles')
    .select('role, assigned_account_id, display_name')
    .eq('user_id', userData.user.id)
    .single()

  if (roleErr || !roleRow) return NextResponse.json({ error: 'No account found' }, { status: 404 })
  if (roleRow.role !== 'customer') return NextResponse.json({ error: 'This view is for customer accounts only' }, { status: 403 })
  if (!roleRow.assigned_account_id) return NextResponse.json({ projects: [], display_name: roleRow.display_name })

  const { data: plans, error } = await supabase
    .from('job_plans')
    .select('id, title, description, estimate, estimate_generated_at, status, updated_at, worksite:worksites(id, address, city, state)')
    .eq('shared_with_account_id', roleRow.assigned_account_id)
    .neq('status', 'draft')
    .order('updated_at', { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Strip internal-only fields from the estimate before sending to the customer
  // (similar_past_jobs references other clients' invoice history — not for them to see)
  const sanitized = (plans ?? []).map(p => {
    let estimate = p.estimate as any
    if (estimate) {
      const { similar_past_jobs, confidence_rationale, ...rest } = estimate
      estimate = rest
    }
    return { ...p, estimate }
  })

  return NextResponse.json({ projects: sanitized, display_name: roleRow.display_name })
}
