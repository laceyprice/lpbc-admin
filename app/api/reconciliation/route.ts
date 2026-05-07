import { NextRequest, NextResponse } from 'next/server'
export const dynamic = 'force-dynamic'
import { createServerClient } from '@/lib/supabase'

export async function GET(req: NextRequest) {
  const supabase = createServerClient()
  const financialAccountId = req.nextUrl.searchParams.get('financial_account_id')

  // Fetch bank transactions sorted by date ascending (for running balance)
  // Optionally filtered to a specific financial_account so each account
  // reconciles separately.
  let q = supabase
    .from('bank_transactions')
    .select('transaction_date, amount, account_id, financial_account_id')
    .order('transaction_date', { ascending: true })
  if (financialAccountId) q = q.eq('financial_account_id', financialAccountId)
  const { data: transactions, error } = await q

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Group by month YYYY-MM
  const monthMap = new Map<string, {
    credits: number
    debits: number
    txCount: number
    uncategorizedCount: number
  }>()

  for (const tx of transactions || []) {
    const month = (tx.transaction_date as string)?.slice(0, 7)
    if (!month) continue
    if (!monthMap.has(month)) {
      monthMap.set(month, { credits: 0, debits: 0, txCount: 0, uncategorizedCount: 0 })
    }
    const m = monthMap.get(month)!
    if (Number(tx.amount) > 0) m.credits += Number(tx.amount)
    else m.debits += Math.abs(Number(tx.amount))
    m.txCount++
    if (!tx.account_id) m.uncategorizedCount++
  }

  // Sort months ascending to compute running balance
  const months = Array.from(monthMap.keys()).sort()

  let runningBalance = 0
  const monthlyData = months.map(month => {
    const m = monthMap.get(month)!
    const beginning_balance = runningBalance
    const net = m.credits - m.debits
    const ending_balance = runningBalance + net
    runningBalance = ending_balance

    const avg_balance = (beginning_balance + ending_balance) / 2

    // Avg collected balance: daily average of inflows
    const [year, mo] = month.split('-').map(Number)
    const daysInMonth = new Date(year, mo, 0).getDate()
    const avg_collected_balance = m.credits / daysInMonth

    // Low balance: minimum of beginning and ending (simplified approximation)
    const low_balance = Math.min(beginning_balance, ending_balance)

    const auto_status = m.uncategorizedCount > 0 ? 'not_reconciled' : 'auto_reconciled'

    return {
      month,
      beginning_balance,
      ending_balance,
      credits: m.credits,
      debits: m.debits,
      net,
      avg_balance,
      avg_collected_balance,
      low_balance,
      tx_count: m.txCount,
      uncategorized_count: m.uncategorizedCount,
      auto_status,
    }
  })

  // Fetch manual reconciliation statuses
  const { data: statuses } = await supabase
    .from('monthly_reconciliation')
    .select('*')

  const statusMap = new Map<string, any>()
  for (const s of statuses || []) statusMap.set(s.month, s)

  // Merge status — return newest month first
  const result = [...monthlyData].reverse().map(m => {
    const rec = statusMap.get(m.month)
    const status = rec?.status === 'verified' ? 'verified' : m.auto_status
    return {
      ...m,
      status,
      reconciliation_id: rec?.id || null,
      notes: rec?.notes || null,
      verified_at: rec?.verified_at || null,
    }
  })

  return NextResponse.json(result)
}

export async function PATCH(req: NextRequest) {
  const supabase = createServerClient()
  const body = await req.json()
  const { month, status, notes } = body

  if (!month) return NextResponse.json({ error: 'Missing month' }, { status: 400 })

  const { data: existing } = await supabase
    .from('monthly_reconciliation')
    .select('id')
    .eq('month', month)
    .maybeSingle()

  const payload: any = {
    month,
    status,
    notes: notes || null,
    verified_at: status === 'verified' ? new Date().toISOString() : null,
    updated_at: new Date().toISOString(),
  }

  if (existing?.id) {
    const { data, error } = await supabase
      .from('monthly_reconciliation')
      .update(payload)
      .eq('month', month)
      .select()
      .single()
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json(data)
  } else {
    const { data, error } = await supabase
      .from('monthly_reconciliation')
      .insert(payload)
      .select()
      .single()
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json(data)
  }
}
