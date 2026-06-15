import { NextRequest, NextResponse } from 'next/server'
export const dynamic = 'force-dynamic'
import { createServerClient } from '@/lib/supabase'

// GET  /api/job-plan-tasks?plan_id=uuid   → list tasks for a plan
// POST /api/job-plan-tasks                → create task (body: { plan_id, title, … })
// PATCH /api/job-plan-tasks               → update task (body: { id, …fields })
// DELETE /api/job-plan-tasks?id=uuid      → delete a task

export async function GET(req: NextRequest) {
  const planId = req.nextUrl.searchParams.get('plan_id')
  if (!planId) return NextResponse.json({ error: 'plan_id required' }, { status: 400 })

  const supabase = createServerClient()
  const { data, error } = await supabase
    .from('job_plan_tasks')
    .select('*')
    .eq('plan_id', planId)
    .order('start_date', { ascending: true, nullsFirst: false })
    .order('sort_order', { ascending: true })
    .order('created_at', { ascending: true })

  if (error) {
    // Table may not exist yet — return empty array with migration hint
    if (/relation.*job_plan_tasks.*does not exist/i.test(error.message) ||
        /column.*not found/i.test(error.message)) {
      return NextResponse.json({ tasks: [], needsMigration: true })
    }
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  return NextResponse.json({ tasks: data ?? [] })
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}))
  if (!body.plan_id || !body.title) {
    return NextResponse.json({ error: 'plan_id and title required' }, { status: 400 })
  }
  const supabase = createServerClient()
  const { data, error } = await supabase
    .from('job_plan_tasks')
    .insert({
      plan_id:     body.plan_id,
      title:       body.title,
      description: body.description  ?? '',
      task_type:   body.task_type    ?? 'task',
      status:      body.status       ?? 'pending',
      assigned_to: body.assigned_to  ?? '',
      start_date:  body.start_date   ?? null,
      end_date:    body.end_date     ?? null,
      color:       body.color        ?? '#2f5a5e',
      sort_order:  body.sort_order   ?? 0,
    })
    .select()
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ task: data }, { status: 201 })
}

export async function PATCH(req: NextRequest) {
  const body = await req.json().catch(() => ({}))
  const { id, ...updates } = body
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })

  const supabase = createServerClient()
  const { data, error } = await supabase
    .from('job_plan_tasks')
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select()
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ task: data })
}

export async function DELETE(req: NextRequest) {
  const id = req.nextUrl.searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })

  const supabase = createServerClient()
  const { error } = await supabase.from('job_plan_tasks').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
