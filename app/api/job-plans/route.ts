import { NextRequest, NextResponse } from 'next/server'
export const dynamic = 'force-dynamic'
import { createServerClient } from '@/lib/supabase'
import { signedUrlFor } from '@/lib/signed-url'

const BUCKET = 'job-planning'

// Some columns are added via migration and may not exist yet on all environments.
// PostgREST rejects the WHOLE write if an unknown column is included, silently
// losing every other field in the same save.  Detect these missing-column errors
// and retry without the offending field so the core data always lands.
function isMissingColumn(message: string | undefined | null, col: string) {
  return !!message && new RegExp(`could not find the '${col}' column`, 'i').test(message)
}
function isMissingDesignColumnError(message: string | undefined | null) {
  return isMissingColumn(message, 'design')
}
function stripMissingCols(payload: Record<string, any>, error: string | undefined | null): Record<string, any> {
  // Strip any column that PostgREST says is missing, then retry
  const match = (error ?? '').match(/could not find the '(\w+)' column/i)
  if (!match) return payload
  const col = match[1]
  const { [col]: _dropped, ...rest } = payload
  console.warn(`job_plans column '${col}' missing — dropping it from write (run the migration)`)
  return rest
}

// GET    /api/job-plans                  → list (?archived=true to include archived)
// GET    /api/job-plans?id=uuid          → fetch one (refreshes signed URLs on attachments)
// POST   /api/job-plans                  → create
// PATCH  /api/job-plans                  → update (id required)
// DELETE /api/job-plans?id=uuid          → permanent delete (also wipes bucket files)

export async function GET(req: NextRequest) {
  const supabase = createServerClient()
  const id = req.nextUrl.searchParams.get('id')
  const archived = req.nextUrl.searchParams.get('archived') === 'true'

  if (id) {
    const { data, error } = await supabase.from('job_plans').select('*').eq('id', id).single()
    if (error) return NextResponse.json({ error: error.message }, { status: 404 })
    // Refresh signed URLs on each attachment so loading the plan shows working thumbnails
    if (Array.isArray(data.attachments)) {
      data.attachments = await Promise.all(
        data.attachments.map(async (att: any) => ({
          ...att,
          signed_url: att?.path ? await signedUrlFor(supabase, BUCKET, att.path, 60 * 60 * 24) : null,
        }))
      )
    }
    // Refresh signed URLs inside the Design Studio blob too (board items,
    // sketches, before/after comparison pairs all reference storage paths).
    if (data.design && typeof data.design === 'object') {
      const sign = async (path: string | null | undefined) => path ? await signedUrlFor(supabase, BUCKET, path, 60 * 60 * 24) : null
      const d = data.design as any
      if (Array.isArray(d.board)) {
        d.board = await Promise.all(d.board.map(async (b: any) => ({ ...b, signed_url: await sign(b?.path) })))
      }
      if (Array.isArray(d.sketches)) {
        d.sketches = await Promise.all(d.sketches.map(async (s: any) => ({ ...s, signed_url: await sign(s?.path) })))
      }
      if (Array.isArray(d.comparisons)) {
        d.comparisons = await Promise.all(d.comparisons.map(async (c: any) => ({
          ...c,
          before_signed_url: await sign(c?.before_path),
          after_signed_url: await sign(c?.after_path),
        })))
      }
      data.design = d
    }
    return NextResponse.json(data)
  }

  let query = supabase
    .from('job_plans')
    .select('id, title, description, session_id, estimate, estimate_generated_at, is_archived, status, worksite_id, shared_with_account_id, worksite:worksites(id, address, city), created_at, updated_at')
    .order('updated_at', { ascending: false })
  if (!archived) query = query.eq('is_archived', false)
  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data ?? [])
}

export async function POST(req: NextRequest) {
  const supabase = createServerClient()
  const body = await req.json()
  if (!body.session_id) return NextResponse.json({ error: 'session_id required' }, { status: 400 })

  // Derive title from first non-empty line of description if not provided
  const title = (body.title?.trim()) || deriveTitle(body.description) || 'Untitled Plan'

  let insertPayload: Record<string, any> = {
    title,
    description: body.description || '',
    measurements: body.measurements || '',
    session_id: body.session_id,
    attachments: body.attachments || [],
    estimate: body.estimate || null,
    estimate_generated_at: body.estimate ? new Date().toISOString() : null,
    design: body.design || {},
    worksite_id: body.worksite_id || null,
    status: body.status || 'draft',
    shared_with_account_id: body.shared_with_account_id || null,
    drive_folder_id: body.drive_folder_id || null,
    drive_folder_name: body.drive_folder_name || null,
  }
  let { data, error } = await supabase.from('job_plans').insert(insertPayload).select().single()
  // Retry stripping any unknown columns until the insert succeeds (handles environments
  // where not all migrations have been applied yet)
  let retries = 0
  while (error && retries < 5) {
    retries++
    const stripped = stripMissingCols(insertPayload, error.message)
    if (JSON.stringify(stripped) === JSON.stringify(insertPayload)) break // no column removed, different error
    insertPayload = stripped
    ;({ data, error } = await supabase.from('job_plans').insert(insertPayload).select().single())
  }
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data, { status: 201 })
}

export async function PATCH(req: NextRequest) {
  const supabase = createServerClient()
  const body = await req.json()
  const { id, ...updates } = body
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })
  updates.updated_at = new Date().toISOString()
  // Auto-stamp estimate_generated_at when estimate is added/updated
  if (updates.estimate && !updates.estimate_generated_at) {
    updates.estimate_generated_at = new Date().toISOString()
  }
  let updatePayload: Record<string, any> = { ...updates }
  let { data, error } = await supabase.from('job_plans').update(updatePayload).eq('id', id).select().single()
  // Retry stripping any unknown columns
  let retries = 0
  while (error && retries < 5) {
    retries++
    const stripped = stripMissingCols(updatePayload, error.message)
    if (JSON.stringify(stripped) === JSON.stringify(updatePayload)) break
    updatePayload = stripped
    ;({ data, error } = await supabase.from('job_plans').update(updatePayload).eq('id', id).select().single())
  }
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function DELETE(req: NextRequest) {
  const supabase = createServerClient()
  const id = req.nextUrl.searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })

  // Fetch the plan to find attachment paths to delete
  const { data: plan } = await supabase.from('job_plans').select('attachments, session_id').eq('id', id).single()
  if (plan) {
    const paths = (plan.attachments as any[] || []).map(a => a?.path).filter(Boolean)
    if (paths.length) await supabase.storage.from(BUCKET).remove(paths)
  }
  const { error } = await supabase.from('job_plans').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}

function deriveTitle(description: string | undefined): string {
  if (!description) return ''
  const firstLine = description.split(/[\n.]/)[0].trim()
  return firstLine.slice(0, 80)
}
