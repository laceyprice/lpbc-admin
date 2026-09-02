import { NextRequest, NextResponse } from 'next/server'
export const dynamic = 'force-dynamic'
import { createClient } from '@supabase/supabase-js'
import { createServerClient } from '@/lib/supabase'
import { signedUrlFor } from '@/lib/signed-url'

const PLAN_BUCKET = 'job-planning'

// Customer-portal endpoint.
//   GET   → read-only view of the projects (job plans) assigned/shared to the
//           signed-in customer, including their finish/sourcing links.
//   PATCH → lets the customer add/edit their own finish links on a project they
//           are authorized for (the only writable part of the portal).
//
// Auth: `Authorization: Bearer <access_token>` from the customer's Supabase
// session, verified server-side. We never trust a client-sent account/project id
// beyond checking it against what this customer is actually allowed to see.

async function authCustomer(req: NextRequest): Promise<
  { ok: true; supabase: any; roleRow: any } | { ok: false; res: NextResponse }
> {
  const authHeader = req.headers.get('authorization') || ''
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null
  if (!token) return { ok: false, res: NextResponse.json({ error: 'Not authenticated' }, { status: 401 }) }

  const anon = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!)
  const { data: userData, error: userErr } = await anon.auth.getUser(token)
  if (userErr || !userData?.user) return { ok: false, res: NextResponse.json({ error: 'Not authenticated' }, { status: 401 }) }

  const supabase = createServerClient()
  // select('*') so missing columns (un-migrated assigned_*_ids) never error.
  const { data: roleRow, error: roleErr } = await supabase
    .from('user_roles').select('*').eq('user_id', userData.user.id).single()
  if (roleErr || !roleRow) return { ok: false, res: NextResponse.json({ error: 'No account found' }, { status: 404 }) }
  if (roleRow.role !== 'customer') return { ok: false, res: NextResponse.json({ error: 'This view is for customer accounts only' }, { status: 403 }) }
  return { ok: true, supabase, roleRow }
}

// A customer's assigned project ids + account ids (arrays, falling back to the
// single columns when the multi-assign migration hasn't been run).
export function assignedIds(roleRow: any): { projectIds: string[]; accountIds: string[] } {
  const pa = Array.isArray(roleRow.assigned_project_ids) && roleRow.assigned_project_ids.length
    ? roleRow.assigned_project_ids : (roleRow.assigned_project_id ? [roleRow.assigned_project_id] : [])
  const aa = Array.isArray(roleRow.assigned_account_ids) && roleRow.assigned_account_ids.length
    ? roleRow.assigned_account_ids : (roleRow.assigned_account_id ? [roleRow.assigned_account_id] : [])
  return { projectIds: pa.filter(Boolean), accountIds: aa.filter(Boolean) }
}

// Is this customer allowed to see/edit the given project?
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

const str = (v: any, max: number) => (typeof v === 'string' ? v.slice(0, max) : '')
function sanitizeLink(l: any) {
  return {
    id: str(l?.id, 40) || `fin_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    category: str(l?.category, 40) || 'Other',
    label: str(l?.label, 200),
    url: str(l?.url, 1000),
    price: Number(l?.price) || 0,
    room: str(l?.room, 60),
    notes: str(l?.notes, 500),
    // Preserve the pulled product-image path so a customer save can't drop it.
    image_path: str(l?.image_path, 300) || null,
  }
}

export async function GET(req: NextRequest) {
  const auth = await authCustomer(req)
  if (!auth.ok) return auth.res
  const { supabase, roleRow } = auth
  const { projectIds, accountIds } = assignedIds(roleRow)
  if (!projectIds.length && !accountIds.length) {
    return NextResponse.json({ projects: [], display_name: roleRow.display_name })
  }

  const SELECT = 'id, title, description, estimate, estimate_generated_at, status, updated_at, design, attachments, drive_folder_id, drive_folder_name, worksite:worksites(id, address, city, state)'
  const byId: Record<string, any> = {}
  // Projects assigned directly (any of them) — shown regardless of status.
  if (projectIds.length) {
    const { data: directs } = await supabase.from('job_plans').select(SELECT).in('id', projectIds)
    for (const p of (directs || [])) byId[p.id] = p
  }
  // Plus any plans shared with any of their accounts (legacy account-sharing).
  if (accountIds.length) {
    const { data: shared } = await supabase.from('job_plans').select(SELECT)
      .in('shared_with_account_id', accountIds).neq('status', 'draft')
    for (const p of (shared || [])) byId[p.id] = p
  }
  const plans = Object.values(byId).sort((a: any, b: any) => (b.updated_at || '').localeCompare(a.updated_at || ''))

  // Project schedule items (the tasks the admin adds on a project's Schedule tab)
  // — these are the customer's calendar. Grouped by plan; empty if un-migrated.
  const planIds = plans.map((p: any) => p.id)
  const tasksByPlan: Record<string, any[]> = {}
  if (planIds.length) {
    const { data: taskRows } = await supabase.from('job_plan_tasks')
      .select('id, plan_id, title, description, task_type, status, assigned_to, start_date, end_date, color')
      .in('plan_id', planIds)
    for (const t of (taskRows || [])) { (tasksByPlan[t.plan_id] ||= []).push(t) }
  }

  // Surface the design studio content the customer is allowed to SEE (read-only):
  // mood board, before/after, floor plan (for 3D), finishes + messages. Internal
  // estimate fields and storage paths are stripped; images get fresh signed URLs.
  const sign = async (path: any) => (typeof path === 'string' && path) ? await signedUrlFor(supabase, PLAN_BUCKET, path, 60 * 60 * 24) : null
  const sanitized = await Promise.all(plans.map(async (p: any) => {
    let estimate = p.estimate as any
    if (estimate) {
      const { similar_past_jobs, confidence_rationale, ...rest } = estimate
      estimate = rest
    }
    const d = p.design || {}
    const finish_links = await Promise.all((Array.isArray(d.finish_links) ? d.finish_links : []).map(async (l: any) => {
      const s = sanitizeLink(l)
      return { ...s, image_url: s.image_path ? await sign(s.image_path) : null }
    }))
    const messages = Array.isArray(d.messages) ? d.messages : []
    const board = await Promise.all((Array.isArray(d.board) ? d.board : []).map(async (b: any) => ({
      id: b.id, label: b.label || b.name || '', room: b.room || 'Other', notes: b.notes || '', price: Number(b.price) || 0,
      link: typeof b.link === 'string' ? b.link : null, signed_url: await sign(b.path),
    })))
    const comparisons = await Promise.all((Array.isArray(d.comparisons) ? d.comparisons : []).map(async (c: any) => ({
      id: c.id, note: c.note || '', before_signed_url: await sign(c.before_path), after_signed_url: await sign(c.after_path),
    })))
    const sketches = await Promise.all((Array.isArray(d.sketches) ? d.sketches : []).map(async (s: any) => ({
      id: s.id, name: s.name || 'Floor Plan', signed_url: await sign(s.path),
    }))).then(list => list.filter((s: any) => s.signed_url))
    const ai_suggestions = (Array.isArray(d.ai_suggestions) ? d.ai_suggestions : []).map((s: any) => ({
      id: s.id, style_name: s.style_name, description: s.description, key_materials: s.key_materials, color_palette: s.color_palette, why_it_fits: s.why_it_fits,
    }))
    // Active floor plan (for the 3D viewer) — geometry only.
    const floorplan = (d.floorplan && typeof d.floorplan === 'object')
      ? d.floorplan
      : (Array.isArray(d.floorplans) ? (d.floorplans.find((s: any) => s.id === d.activeFloorplan) || d.floorplans[0])?.doc : null) || null
    // ALL floor-plan sheets/drafts — each viewable in 3D by the customer.
    const floorplans = (Array.isArray(d.floorplans) ? d.floorplans : [])
      .map((s: any) => ({ id: s.id, name: s.name || 'Floor Plan', doc: s.doc }))
      .filter((s: any) => s.doc && Array.isArray(s.doc.walls) && s.doc.walls.length > 0)
    // Project files (uploaded photos/videos/docs) — read-only, fresh signed URLs.
    const attachments = await Promise.all((Array.isArray(p.attachments) ? p.attachments : []).map(async (a: any) => ({
      name: a.name || 'File', type: a.type || '', size: Number(a.size) || 0, url: a.path ? await sign(a.path) : (typeof a.url === 'string' ? a.url : null),
    }))).then(list => list.filter((a: any) => a.url))
    const { design, attachments: _a, ...rest } = p
    return { ...rest, estimate, finish_links, messages, board, comparisons, ai_suggestions, sketches, floorplan, floorplans, attachments, tasks: tasksByPlan[p.id] || [] }
  }))

  return NextResponse.json({ projects: sanitized, display_name: roleRow.display_name })
}

// PATCH /api/my-projects  { projectId, finish_links } → save the customer's links
export async function PATCH(req: NextRequest) {
  const auth = await authCustomer(req)
  if (!auth.ok) return auth.res
  const { supabase, roleRow } = auth

  const body = await req.json().catch(() => ({}))
  const projectId = typeof body?.projectId === 'string' ? body.projectId : null
  if (!projectId) return NextResponse.json({ error: 'projectId required' }, { status: 400 })
  if (!(await customerCanAccess(supabase, roleRow, projectId))) {
    return NextResponse.json({ error: 'Not allowed' }, { status: 403 })
  }

  const links = Array.isArray(body.finish_links) ? body.finish_links.slice(0, 200).map(sanitizeLink) : []
  const { data: plan, error: readErr } = await supabase.from('job_plans').select('design').eq('id', projectId).single()
  if (readErr) return NextResponse.json({ error: readErr.message }, { status: 500 })
  const design = (plan?.design && typeof plan.design === 'object') ? plan.design : {}
  const { error } = await supabase.from('job_plans').update({ design: { ...design, finish_links: links } }).eq('id', projectId)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, finish_links: links })
}
