import { NextRequest, NextResponse } from 'next/server'
export const dynamic = 'force-dynamic'
import { createClient } from '@supabase/supabase-js'
import { createServerClient } from '@/lib/supabase'
import { sendProjectMessageEmail } from '@/lib/resend'

// Project messages = a conversation thread between the builder and the customer,
// stored on the job_plan's `design.messages` (no migration). Posting emails the
// other party. The customer is authenticated by their Supabase session token;
// the admin posts without a token (consistent with the rest of the admin API).

const str = (v: any, max: number) => (typeof v === 'string' ? v.slice(0, max) : '')

// Assigned project + account ids (arrays, falling back to the single columns).
function assignedIds(roleRow: any): { projectIds: string[]; accountIds: string[] } {
  const pa = Array.isArray(roleRow.assigned_project_ids) && roleRow.assigned_project_ids.length
    ? roleRow.assigned_project_ids : (roleRow.assigned_project_id ? [roleRow.assigned_project_id] : [])
  const aa = Array.isArray(roleRow.assigned_account_ids) && roleRow.assigned_account_ids.length
    ? roleRow.assigned_account_ids : (roleRow.assigned_account_id ? [roleRow.assigned_account_id] : [])
  return { projectIds: pa.filter(Boolean), accountIds: aa.filter(Boolean) }
}

async function customerFromToken(token: string): Promise<any | null> {
  const anon = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!)
  const { data, error } = await anon.auth.getUser(token)
  if (error || !data?.user) return null
  const supabase = createServerClient()
  const { data: row } = await supabase.from('user_roles').select('*').eq('user_id', data.user.id).single()
  return row && row.role === 'customer' ? row : null
}

async function customerCanAccess(supabase: any, roleRow: any, projectId: string): Promise<boolean> {
  const { projectIds, accountIds } = assignedIds(roleRow)
  if (projectIds.includes(projectId)) return true
  if (accountIds.length) {
    const { data } = await supabase.from('job_plans').select('id')
      .eq('id', projectId).in('shared_with_account_id', accountIds).maybeSingle()
    if (data) return true
  }
  return false
}

// Customers (by direct project assignment or shared account) who should be emailed.
async function customerRecipients(supabase: any, projectId: string, sharedAccountId: string | null) {
  const out = new Map<string, { email: string; name: string }>()
  const { data } = await supabase.from('user_roles').select('*').eq('role', 'customer')
  for (const u of (data || [])) {
    if (!u.email) continue
    const { projectIds, accountIds } = assignedIds(u)
    const match = projectIds.includes(projectId) || (sharedAccountId && accountIds.includes(sharedAccountId))
    if (match) out.set(u.email.toLowerCase(), { email: u.email, name: u.display_name || 'there' })
  }
  return Array.from(out.values())
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}))
  const projectId = str(body.projectId, 60)
  const text = str(body.body, 4000).trim()
  if (!projectId || !text) return NextResponse.json({ error: 'projectId and body required' }, { status: 400 })

  const supabase = createServerClient()
  const authHeader = req.headers.get('authorization') || ''
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null

  let role: 'admin' | 'customer' = 'admin'
  let authorName = 'L. Price Building Co.'
  if (token) {
    const cust = await customerFromToken(token)
    if (!cust) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
    if (!(await customerCanAccess(supabase, cust, projectId))) return NextResponse.json({ error: 'Not allowed' }, { status: 403 })
    role = 'customer'
    authorName = cust.display_name || 'Customer'
  }

  const { data: plan, error } = await supabase.from('job_plans').select('design, title, shared_with_account_id').eq('id', projectId).single()
  if (error || !plan) return NextResponse.json({ error: 'Project not found' }, { status: 404 })
  const design = (plan.design && typeof plan.design === 'object') ? plan.design : {}
  const existing = Array.isArray(design.messages) ? design.messages : []
  const msg = { id: `msg_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`, role, name: authorName, body: text, created_at: new Date().toISOString() }
  const messages = [...existing, msg].slice(-500)
  const { error: upErr } = await supabase.from('job_plans').update({ design: { ...design, messages } }).eq('id', projectId)
  if (upErr) return NextResponse.json({ error: upErr.message }, { status: 500 })

  // Email the other party (best-effort — never block the message save on email).
  try {
    if (role === 'admin') {
      const recips = await customerRecipients(supabase, projectId, plan.shared_with_account_id || null)
      for (const r of recips) {
        await sendProjectMessageEmail({ to: r.email, toName: r.name, fromName: authorName, fromRole: 'admin', projectTitle: plan.title, body: text, recipient: 'customer' })
      }
    } else {
      await sendProjectMessageEmail({ to: process.env.ADMIN_EMAIL || 'Lacey@LaceyNPrice.com', fromName: authorName, fromRole: 'customer', projectTitle: plan.title, body: text, recipient: 'admin' })
    }
  } catch (e) { console.error('project message email failed:', e) }

  return NextResponse.json({ messages })
}
