import { NextRequest, NextResponse } from 'next/server'
export const dynamic = 'force-dynamic'
import { createClient } from '@supabase/supabase-js'
import { createServerClient } from '@/lib/supabase'

// Customer-portal calendar. Returns the signed-in customer's OWN appointments —
// matched by their email or by the address of a worksite on a project shared
// with them. Read-only; internal/other-customer appointments are never exposed.
//
// Auth: `Authorization: Bearer <access_token>` from the customer's Supabase
// session, verified server-side.

// Assigned project/account ids (arrays, falling back to the singular columns).
function assignedIds(roleRow: any): { projectIds: string[]; accountIds: string[] } {
  const pa = Array.isArray(roleRow.assigned_project_ids) && roleRow.assigned_project_ids.length
    ? roleRow.assigned_project_ids : (roleRow.assigned_project_id ? [roleRow.assigned_project_id] : [])
  const aa = Array.isArray(roleRow.assigned_account_ids) && roleRow.assigned_account_ids.length
    ? roleRow.assigned_account_ids : (roleRow.assigned_account_id ? [roleRow.assigned_account_id] : [])
  return { projectIds: pa.filter(Boolean), accountIds: aa.filter(Boolean) }
}

const norm = (s: any) => String(s || '').trim().toLowerCase().replace(/\s+/g, ' ')

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('authorization') || ''
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null
  if (!token) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

  const anon = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!)
  const { data: userData, error: userErr } = await anon.auth.getUser(token)
  if (userErr || !userData?.user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

  const supabase = createServerClient()
  const { data: roleRow } = await supabase.from('user_roles').select('*').eq('user_id', userData.user.id).single()
  if (!roleRow) return NextResponse.json({ error: 'No account found' }, { status: 404 })
  if (roleRow.role !== 'customer') return NextResponse.json({ error: 'This view is for customer accounts only' }, { status: 403 })

  const email = norm(roleRow.email)
  const { projectIds, accountIds } = assignedIds(roleRow)

  // Collect the addresses of worksites on projects shared with this customer, so
  // appointments booked at that address (even under a different email) show up.
  const addresses = new Set<string>()
  if (projectIds.length || accountIds.length) {
    const collect = (rows: any[] | null) => (rows || []).forEach((p: any) => { const a = norm(p.worksite?.address); if (a) addresses.add(a) })
    if (projectIds.length) collect((await supabase.from('job_plans').select('worksite:worksites(address)').in('id', projectIds)).data)
    if (accountIds.length) collect((await supabase.from('job_plans').select('worksite:worksites(address)').in('shared_with_account_id', accountIds)).data)
  }

  // Pull appointments in a reasonable window and match to this customer.
  const now = new Date()
  const timeMin = new Date(now.getFullYear(), now.getMonth() - 2, 1).toISOString()
  const timeMax = new Date(now.getFullYear(), now.getMonth() + 7, 0).toISOString()
  const { data: rows } = await supabase
    .from('appointments')
    .select('id, title, customer_name, customer_email, service_address, service_type, notes, start_time, end_time, status')
    .gte('start_time', timeMin).lte('start_time', timeMax)
    .order('start_time', { ascending: true })

  const mine = (rows || []).filter((a: any) =>
    (email && norm(a.customer_email) === email) || (a.service_address && addresses.has(norm(a.service_address)))
  ).map((a: any) => ({
    id: a.id,
    title: a.title || a.service_type || 'Appointment',
    service_address: a.service_address || '',
    service_type: a.service_type || '',
    notes: a.notes || '',
    start_time: a.start_time,
    end_time: a.end_time || a.start_time,
    status: a.status || 'scheduled',
  }))

  return NextResponse.json({ appointments: mine })
}
