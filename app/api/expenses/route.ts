import { NextRequest, NextResponse } from 'next/server'
export const dynamic = 'force-dynamic'
import { createServerClient } from '@/lib/supabase'
import { requireAdmin } from '@/lib/admin-auth'
import { suggestRecurring, normalizePayee } from '@/lib/recurring'

// Recurring business + personal expenses. ADMIN ONLY (every handler checks).
// GET    /api/expenses?scope=business|personal[&includeInactive=true]
// GET    /api/expenses?action=suggest         → repeating bank charges not yet tracked
// POST   /api/expenses                        → create
// POST   /api/expenses?action=import-vault    → import recurring rows from the Account Vault
// PATCH  /api/expenses   { id, ...fields }    → update
// DELETE /api/expenses?id=uuid                → delete

const SCOPES = ['business', 'personal']
const FREQUENCIES = ['weekly', 'biweekly', 'monthly', 'quarterly', 'semiannual', 'annual', 'one_time']
const NULLABLE_TEXT = ['category', 'vendor', 'matched_payee', 'notes', 'next_due_date']

export async function GET(req: NextRequest) {
  const denied = await requireAdmin(req); if (denied) return denied
  const supabase = createServerClient()
  const action = req.nextUrl.searchParams.get('action')

  if (action === 'suggest') {
    const { data: existing } = await supabase.from('recurring_expenses').select('name, matched_payee').eq('scope', 'business')
    const tracked = new Set<string>()
    for (const r of existing ?? []) {
      const a = normalizePayee(r.matched_payee); if (a) tracked.add(a)
      const b = normalizePayee(r.name); if (b) tracked.add(b)
    }
    try {
      return NextResponse.json({ suggestions: await suggestRecurring(supabase, tracked) })
    } catch (e: any) {
      return NextResponse.json({ error: e.message }, { status: 500 })
    }
  }

  const scope = req.nextUrl.searchParams.get('scope') || 'business'
  if (!SCOPES.includes(scope)) return NextResponse.json({ error: 'invalid scope' }, { status: 400 })
  let q = supabase.from('recurring_expenses').select('*').eq('scope', scope).order('category').order('name')
  if (req.nextUrl.searchParams.get('includeInactive') !== 'true') q = q.eq('is_active', true)
  const { data, error } = await q
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data || [])
}

export async function POST(req: NextRequest) {
  const denied = await requireAdmin(req); if (denied) return denied
  const supabase = createServerClient()

  // POST ?action=import-vault → copy the Account Vault's recurring payments over.
  // Selects only the payment fields — usernames/passwords/passkeys are never read.
  if (req.nextUrl.searchParams.get('action') === 'import-vault') {
    const { data: vault, error: vErr } = await supabase.from('vault_accounts')
      .select('name, category, amount, frequency, next_due_date, matched_payee')
      .eq('is_recurring', true).eq('is_active', true)
    if (vErr) return NextResponse.json({ error: vErr.message }, { status: 500 })
    const { data: existing } = await supabase.from('recurring_expenses').select('name').eq('scope', 'business')
    const have = new Set((existing ?? []).map((r: any) => normalizePayee(r.name)))
    const rows = (vault ?? [])
      .filter((v: any) => v.name && !have.has(normalizePayee(v.name)))
      .map((v: any) => ({
        scope: 'business', name: v.name, category: v.category || null, amount: Number(v.amount) || 0,
        frequency: FREQUENCIES.includes(v.frequency) ? v.frequency : 'monthly',
        next_due_date: v.next_due_date || null, matched_payee: v.matched_payee || null,
        notes: 'Imported from Account Vault',
      }))
    if (rows.length) {
      const { error: iErr } = await supabase.from('recurring_expenses').insert(rows)
      if (iErr) return NextResponse.json({ error: iErr.message }, { status: 500 })
    }
    return NextResponse.json({ imported: rows.length, skipped: (vault ?? []).length - rows.length })
  }

  const body = await req.json()
  const err = validate(body, true)
  if (err) return NextResponse.json({ error: err }, { status: 400 })
  const { data, error } = await supabase.from('recurring_expenses').insert({
    scope: body.scope || 'business',
    name: String(body.name).trim(),
    category: body.category || null,
    amount: Number(body.amount) || 0,
    frequency: body.frequency || 'monthly',
    next_due_date: body.next_due_date || null,
    vendor: body.vendor || null,
    matched_payee: body.matched_payee || null,
    notes: body.notes || null,
  }).select().single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data, { status: 201 })
}

export async function PATCH(req: NextRequest) {
  const denied = await requireAdmin(req); if (denied) return denied
  const supabase = createServerClient()
  const { id, ...rest } = await req.json()
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })
  const err = validate(rest, false)
  if (err) return NextResponse.json({ error: err }, { status: 400 })

  const updates: Record<string, any> = { updated_at: new Date().toISOString() }
  for (const k of ['scope', 'name', 'amount', 'frequency', 'is_active', ...NULLABLE_TEXT]) {
    if (rest[k] === undefined) continue
    updates[k] = NULLABLE_TEXT.includes(k) && rest[k] === '' ? null : rest[k]
  }
  if (updates.amount !== undefined) updates.amount = Number(updates.amount) || 0
  const { data, error } = await supabase.from('recurring_expenses').update(updates).eq('id', id).select().single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function DELETE(req: NextRequest) {
  const denied = await requireAdmin(req); if (denied) return denied
  const supabase = createServerClient()
  const id = req.nextUrl.searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })
  const { error } = await supabase.from('recurring_expenses').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}

function validate(b: any, creating: boolean): string | null {
  if (creating && !String(b.name || '').trim()) return 'name required'
  if (b.name !== undefined && !String(b.name).trim()) return 'name required'
  if (b.scope !== undefined && !SCOPES.includes(b.scope)) return 'invalid scope'
  if (b.frequency !== undefined && !FREQUENCIES.includes(b.frequency)) return 'invalid frequency'
  if (b.amount !== undefined && (isNaN(Number(b.amount)) || Number(b.amount) < 0)) return 'amount must be a non-negative number'
  return null
}
