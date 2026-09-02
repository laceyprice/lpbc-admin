import { NextRequest, NextResponse } from 'next/server'
export const dynamic = 'force-dynamic'
import { createServerClient } from '@/lib/supabase'
import { sendUserWelcomeEmail } from '@/lib/resend'

// Look up a project (job plan) title for the welcome email.
async function projectTitle(supabase: any, projectId: string | null | undefined): Promise<string | null> {
  if (!projectId) return null
  const { data } = await supabase.from('job_plans').select('title').eq('id', projectId).single()
  return data?.title || null
}

// Insert/update tolerant of columns that aren't migrated yet — drops whatever
// column PostgREST complains about and retries (handles assigned_*_ids etc.).
function strippedColumn(message: string): string | null {
  return message.match(/could not find the '(\w+)' column/i)?.[1]
    || message.match(/column "?(\w+)"? .*does not exist/i)?.[1]
    || null
}
async function insertTolerant(supabase: any, payload: Record<string, any>) {
  let p = { ...payload }
  for (let i = 0; i < 6; i++) {
    const { data, error } = await supabase.from('user_roles').insert(p).select().single()
    if (!error) return { data, error: null }
    const col = strippedColumn(error.message); if (!col || !(col in p)) return { data: null, error }
    delete p[col]
  }
  return { data: null, error: { message: 'insert failed' } as any }
}
async function updateTolerant(supabase: any, id: string, payload: Record<string, any>) {
  let p = { ...payload }
  for (let i = 0; i < 6; i++) {
    const { data, error } = await supabase.from('user_roles').update(p).eq('id', id).select().single()
    if (!error) return { data, error: null }
    const col = strippedColumn(error.message); if (!col || !(col in p)) return { data: null, error }
    delete p[col]
  }
  return { data: null, error: { message: 'update failed' } as any }
}
// Normalize a possibly-multi assignment into { ids[], first }.
function idList(arr: any, single: any): { ids: string[]; first: string | null } {
  const ids = Array.isArray(arr) ? arr.filter((x: any) => typeof x === 'string' && x) : (single ? [single] : [])
  return { ids, first: ids[0] || null }
}

export async function GET() {
  const supabase = createServerClient()
  const { data, error } = await supabase
    .from('user_roles')
    .select('*')
    .order('created_at', { ascending: true })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

// POST — create a new user in Supabase Auth + assign a role
export async function POST(req: NextRequest) {
  const supabase = createServerClient()
  const body = await req.json()
  const { email, password, display_name, role, assigned_account_id, assigned_project_id, assigned_account_ids, assigned_project_ids, send_welcome_email, welcome_message } = body

  if (!email || !password || !role) {
    return NextResponse.json({ error: 'email, password, and role are required' }, { status: 400 })
  }
  if (!['admin', 'bookkeeper', 'invoicing', 'customer'].includes(role)) {
    return NextResponse.json({ error: 'role must be admin, bookkeeper, invoicing, or customer' }, { status: 400 })
  }

  const projects = idList(assigned_project_ids, assigned_project_id)
  const accounts = idList(assigned_account_ids, assigned_account_id)

  // Create auth user
  const { data: authData, error: authErr } = await supabase.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  })
  if (authErr) return NextResponse.json({ error: authErr.message }, { status: 500 })

  // Insert role. Arrays carry the multi-assignment; the singular columns mirror
  // the first id for back-compat. insertTolerant drops un-migrated columns.
  const { data, error } = await insertTolerant(supabase, {
    user_id: authData.user.id,
    email,
    display_name: display_name || email.split('@')[0],
    role,
    assigned_account_id: accounts.first,
    assigned_project_id: projects.first,
    assigned_account_ids: accounts.ids,
    assigned_project_ids: projects.ids,
  })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Send welcome email (optional, fire-and-forget so DB success isn't gated on email)
  let emailError: string | null = null
  if (send_welcome_email !== false) {
    try {
      // Reference the assigned project in the welcome email.
      const assignedAccountName: string | null = await projectTitle(supabase, projects.first)
      const result: any = await sendUserWelcomeEmail({
        to: email,
        displayName: display_name || email.split('@')[0],
        // Magic-link login — no password to share
        role,
        assignedAccountName,
        customMessage: welcome_message || null,
      })
      if (result?.error) emailError = result.error.message || String(result.error)
    } catch (e: any) {
      emailError = e?.message || String(e)
      console.error('Welcome email send failed:', e)
    }
  }

  return NextResponse.json({ ...data, emailError }, { status: 201 })
}

export async function PATCH(req: NextRequest) {
  const supabase = createServerClient()
  const body = await req.json()
  const { id, ...updates } = body
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })

  // Keep the singular columns mirrored to the first id of any multi-assignment.
  if ('assigned_project_ids' in updates) {
    const p = idList(updates.assigned_project_ids, null); updates.assigned_project_ids = p.ids; updates.assigned_project_id = p.first
  }
  if ('assigned_account_ids' in updates) {
    const a = idList(updates.assigned_account_ids, null); updates.assigned_account_ids = a.ids; updates.assigned_account_id = a.first
  }

  const { data, error } = await updateTolerant(supabase, id, updates)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function DELETE(req: NextRequest) {
  const supabase = createServerClient()
  const id = req.nextUrl.searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })

  // Get user_id before deleting role
  const { data: role } = await supabase.from('user_roles').select('user_id').eq('id', id).single()
  if (!role) return NextResponse.json({ error: 'Role not found' }, { status: 404 })

  // Delete role record
  const { error } = await supabase.from('user_roles').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Delete auth user
  await supabase.auth.admin.deleteUser(role.user_id)

  return NextResponse.json({ success: true })
}
