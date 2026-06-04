import { NextRequest, NextResponse } from 'next/server'
export const dynamic = 'force-dynamic'
import { createServerClient } from '@/lib/supabase'

// GET    /api/vault-accounts                  → list (?includeInactive=true to include archived)
// GET    /api/vault-accounts?action=suggest   → suggest recurring vault entries from bank ledger
// POST   /api/vault-accounts                  → create
// PATCH  /api/vault-accounts                  → update (id required)
// DELETE /api/vault-accounts?id=uuid          → hard delete

export async function GET(req: NextRequest) {
  const supabase = createServerClient()
  const action = req.nextUrl.searchParams.get('action')

  if (action === 'suggest') {
    return suggestRecurring(supabase)
  }

  const includeInactive = req.nextUrl.searchParams.get('includeInactive') === 'true'
  let query = supabase
    .from('vault_accounts')
    .select('*')
    .order('category', { ascending: true })
    .order('name', { ascending: true })
  if (!includeInactive) query = query.eq('is_active', true)
  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data ?? [])
}

export async function POST(req: NextRequest) {
  const supabase = createServerClient()
  const body = await req.json()
  if (!body.name) return NextResponse.json({ error: 'name required' }, { status: 400 })
  const { data, error } = await supabase.from('vault_accounts').insert({
    category: body.category || 'Other',
    name: body.name,
    username: body.username || null,
    password: body.password || null,
    passkey: body.passkey || null,
    url: body.url || null,
    notes: body.notes || null,
    is_recurring: !!body.is_recurring,
    amount: body.amount != null && body.amount !== '' ? body.amount : null,
    frequency: body.frequency || null,
    next_due_date: body.next_due_date || null,
    matched_payee: body.matched_payee || null,
  }).select().single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data, { status: 201 })
}

export async function PATCH(req: NextRequest) {
  const supabase = createServerClient()
  const body = await req.json()
  const { id, ...updates } = body
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })
  updates.updated_at = new Date().toISOString()
  // Normalize empty strings to null for nullable columns so they clear, not blank-string.
  for (const k of ['username','password','passkey','url','notes','frequency','next_due_date','matched_payee'] as const) {
    if (updates[k] === '') updates[k] = null
  }
  if (updates.amount === '') updates.amount = null
  const { data, error } = await supabase
    .from('vault_accounts')
    .update(updates)
    .eq('id', id)
    .select().single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function DELETE(req: NextRequest) {
  const supabase = createServerClient()
  const id = req.nextUrl.searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })
  const { error } = await supabase.from('vault_accounts').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}

// ── Recurring suggestions ───────────────────────────────────────────────────
// Scan the last 120 days of bank transactions for payees that appear 2+ times
// with amounts that look like a subscription (debit, similar amounts). Group
// by normalized payee/description and return summary stats. Frontend offers a
// one-click "Add to vault" for each.
async function suggestRecurring(supabase: any) {
  const since = new Date(Date.now() - 120 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
  const { data: txs, error } = await supabase
    .from('bank_transactions')
    .select('payee, description, amount, transaction_date')
    .lt('amount', 0)           // outflows only
    .gte('transaction_date', since)
    .limit(2000)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Pull existing vault entries' matched_payee so we don't re-suggest already-tracked ones
  const { data: existing } = await supabase
    .from('vault_accounts')
    .select('matched_payee')
    .eq('is_recurring', true)
  const already = new Set<string>((existing ?? []).map((r: any) => normalize(r.matched_payee)).filter(Boolean))

  // Group transactions by normalized payee
  const groups = new Map<string, { rawNames: Set<string>; amounts: number[]; dates: string[] }>()
  for (const t of txs ?? []) {
    const raw = t.payee || t.description || ''
    const key = normalize(raw)
    if (!key || already.has(key)) continue
    if (!groups.has(key)) groups.set(key, { rawNames: new Set(), amounts: [], dates: [] })
    const g = groups.get(key)!
    g.rawNames.add(raw)
    g.amounts.push(Math.abs(Number(t.amount)))
    g.dates.push(t.transaction_date)
  }

  const suggestions: any[] = []
  for (const [key, g] of groups) {
    if (g.amounts.length < 2) continue
    const avg = g.amounts.reduce((s, n) => s + n, 0) / g.amounts.length
    // Sort dates and compute average gap in days
    const sortedDates = g.dates.slice().sort()
    const gaps: number[] = []
    for (let i = 1; i < sortedDates.length; i++) {
      const a = new Date(sortedDates[i - 1]).getTime()
      const b = new Date(sortedDates[i]).getTime()
      gaps.push(Math.round((b - a) / (1000 * 60 * 60 * 24)))
    }
    const avgGap = gaps.length ? gaps.reduce((s, n) => s + n, 0) / gaps.length : 0
    // Classify cadence
    let frequency: string | null = null
    if (avgGap >= 6 && avgGap <= 9) frequency = 'weekly'
    else if (avgGap >= 25 && avgGap <= 35) frequency = 'monthly'
    else if (avgGap >= 80 && avgGap <= 100) frequency = 'quarterly'
    else if (avgGap >= 350 && avgGap <= 380) frequency = 'annual'
    if (!frequency) continue   // skip noisy non-recurring payees
    // Confidence: variance of amount and gap
    const amountVariance = g.amounts.reduce((s, n) => s + Math.abs(n - avg), 0) / g.amounts.length / (avg || 1)
    if (amountVariance > 0.25) continue  // skip wildly varying amounts
    suggestions.push({
      payee_key: key,
      payee_display: Array.from(g.rawNames)[0],
      avg_amount: Number(avg.toFixed(2)),
      occurrences: g.amounts.length,
      frequency,
      last_date: sortedDates[sortedDates.length - 1],
    })
  }
  suggestions.sort((a, b) => b.avg_amount - a.avg_amount)
  return NextResponse.json({ suggestions })
}

function normalize(s: string | null | undefined): string {
  if (!s) return ''
  return s.toLowerCase()
    .replace(/[^a-z0-9 ]+/g, ' ')
    .replace(/\b(payment|pmt|recurring|autopay|aut|web|inc|llc|co|the)\b/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}
