import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'

export const dynamic = 'force-dynamic'

// GET /api/reports?type=pnl|balance-sheet|cash-flow|reconciliation
//     &from=YYYY-MM-DD&to=YYYY-MM-DD   (optional date range)
//     &year=2026                         (for balance sheet opening balances)

export async function GET(req: NextRequest) {
  const supabase = createServerClient()
  const type = req.nextUrl.searchParams.get('type') || 'pnl'
  const from = req.nextUrl.searchParams.get('from')
  const to = req.nextUrl.searchParams.get('to')
  const year = parseInt(req.nextUrl.searchParams.get('year') || String(new Date().getFullYear()), 10)

  try {
    if (type === 'pnl') return NextResponse.json(await getPnL(supabase, from, to))
    if (type === 'balance-sheet') return NextResponse.json(await getBalanceSheet(supabase, year, to))
    if (type === 'cash-flow') return NextResponse.json(await getCashFlow(supabase, from, to))
    if (type === 'reconciliation') return NextResponse.json(await getReconciliation(supabase, from, to))
    return NextResponse.json({ error: 'Unknown report type' }, { status: 400 })
  } catch (err: any) {
    console.error('Report error:', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}

// ─── PROFIT & LOSS ──────────────────────────────────────────
async function getPnL(supabase: any, from: string | null, to: string | null) {
  // Get all accounts
  const { data: accounts } = await supabase
    .from('chart_of_accounts')
    .select('*')
    .eq('is_active', true)
    .order('sort_order')

  // Get accounting entries in range
  let query = supabase.from('accounting_entries').select('*')
  if (from) query = query.gte('transaction_date', from)
  if (to) query = query.lte('transaction_date', to)
  const { data: entries } = await query

  const txs = entries || []
  const accts = accounts || []

  // Group totals by account_id
  const byAccount: Record<string, number> = {}
  const uncategorized = { revenue: 0, expense: 0 }

  for (const tx of txs) {
    if (tx.account_id) {
      byAccount[tx.account_id] = (byAccount[tx.account_id] || 0) + Number(tx.amount)
    } else {
      // Fall back to amount sign
      if (tx.amount > 0) uncategorized.revenue += Number(tx.amount)
      else uncategorized.expense += Math.abs(Number(tx.amount))
    }
  }

  // Build revenue and expense lines
  const revenueAccounts = accts.filter((a: any) => a.account_type === 'revenue')
  const expenseAccounts = accts.filter((a: any) => a.account_type === 'expense')
  const distributionAccounts = accts.filter((a: any) => a.account_type === 'distribution')

  const revenueLines = revenueAccounts.map((a: any) => ({
    id: a.id, name: a.name, group: a.report_group, total: byAccount[a.id] || 0,
  }))
  const expenseLines = expenseAccounts.map((a: any) => ({
    id: a.id, name: a.name, group: a.report_group, total: Math.abs(byAccount[a.id] || 0),
  }))
  const distributionLines = distributionAccounts.map((a: any) => ({
    id: a.id, name: a.name, group: a.report_group, total: Math.abs(byAccount[a.id] || 0),
  }))

  const totalRevenue = revenueLines.reduce((s: number, l: any) => s + l.total, 0) + uncategorized.revenue
  const totalExpenses = expenseLines.reduce((s: number, l: any) => s + l.total, 0) + uncategorized.expense
  const totalDistributions = distributionLines.reduce((s: number, l: any) => s + l.total, 0)
  const netIncome = totalRevenue - totalExpenses - totalDistributions

  return {
    revenue: revenueLines,
    expenses: expenseLines,
    distributions: distributionLines,
    uncategorized,
    totalRevenue,
    totalExpenses,
    totalDistributions,
    netIncome,
    transactionCount: txs.length,
  }
}

// ─── BALANCE SHEET ──────────────────────────────────────────
async function getBalanceSheet(supabase: any, year: number, asOf: string | null) {
  const { data: accounts } = await supabase
    .from('chart_of_accounts')
    .select('*')
    .eq('is_active', true)
    .order('sort_order')

  // Opening balances for the year
  const { data: openings } = await supabase
    .from('opening_balances')
    .select('*')
    .eq('year', year)

  // All accounting entries up to asOf date (or all time)
  let query = supabase.from('accounting_entries').select('*')
  if (asOf) query = query.lte('transaction_date', asOf)
  const { data: entries } = await query

  const txs = entries || []
  const accts = accounts || []
  const openMap: Record<string, number> = {}
  for (const o of (openings || [])) {
    openMap[o.account_id] = Number(o.opening_amount)
  }

  // Sum activity by account
  const activity: Record<string, number> = {}
  for (const tx of txs) {
    if (tx.account_id) {
      activity[tx.account_id] = (activity[tx.account_id] || 0) + Number(tx.amount)
    }
  }

  function buildLines(types: string[]) {
    return accts
      .filter((a: any) => types.includes(a.account_type))
      .map((a: any) => ({
        id: a.id,
        name: a.name,
        group: a.report_group,
        type: a.account_type,
        opening: openMap[a.id] || 0,
        activity: activity[a.id] || 0,
        balance: (openMap[a.id] || 0) + (activity[a.id] || 0),
      }))
  }

  const assets = buildLines(['asset'])
  const liabilities = buildLines(['liability'])
  const equity = buildLines(['equity'])

  const totalAssets = assets.reduce((s: number, l: any) => s + l.balance, 0)
  const totalLiabilities = liabilities.reduce((s: number, l: any) => s + l.balance, 0)
  const totalEquity = equity.reduce((s: number, l: any) => s + l.balance, 0)

  // Retained earnings = net income from activity (revenue - expenses - distributions)
  const revAcctIds = accts.filter((a: any) => a.account_type === 'revenue').map((a: any) => a.id)
  const expAcctIds = accts.filter((a: any) => a.account_type === 'expense').map((a: any) => a.id)
  const distAcctIds = accts.filter((a: any) => a.account_type === 'distribution').map((a: any) => a.id)
  const netIncome = revAcctIds.reduce((s: number, id: string) => s + (activity[id] || 0), 0)
    + expAcctIds.reduce((s: number, id: string) => s + (activity[id] || 0), 0) // expenses are negative
    + distAcctIds.reduce((s: number, id: string) => s + (activity[id] || 0), 0)

  return {
    assets,
    liabilities,
    equity,
    totalAssets,
    totalLiabilities,
    totalEquity,
    netIncome,
    totalLiabilitiesAndEquity: totalLiabilities + totalEquity + netIncome,
    year,
  }
}

// ─── CASH FLOW ──────────────────────────────────────────────
async function getCashFlow(supabase: any, from: string | null, to: string | null) {
  let query = supabase.from('bank_transactions').select('*')
  if (from) query = query.gte('transaction_date', from)
  if (to) query = query.lte('transaction_date', to)
  query = query.order('transaction_date', { ascending: true })
  const { data: txs } = await query

  const { data: accounts } = await supabase
    .from('chart_of_accounts')
    .select('id, name, account_type, report_group')
    .eq('is_active', true)

  const acctMap: Record<string, any> = {}
  for (const a of (accounts || [])) acctMap[a.id] = a

  const transactions = txs || []

  // Group by month
  const monthly: Record<string, { inflows: number; outflows: number }> = {}
  // Group by account
  const byAccount: Record<string, { name: string; type: string; total: number }> = {}

  let totalInflows = 0
  let totalOutflows = 0

  for (const tx of transactions) {
    const month = tx.transaction_date.substring(0, 7) // YYYY-MM
    if (!monthly[month]) monthly[month] = { inflows: 0, outflows: 0 }

    const amt = Number(tx.amount)
    if (amt >= 0) {
      monthly[month].inflows += amt
      totalInflows += amt
    } else {
      monthly[month].outflows += Math.abs(amt)
      totalOutflows += Math.abs(amt)
    }

    if (tx.account_id && acctMap[tx.account_id]) {
      const a = acctMap[tx.account_id]
      if (!byAccount[tx.account_id]) byAccount[tx.account_id] = { name: a.name, type: a.account_type, total: 0 }
      byAccount[tx.account_id].total += amt
    }
  }

  return {
    monthly: Object.entries(monthly).map(([month, v]) => ({ month, ...v, net: v.inflows - v.outflows })),
    byAccount: Object.values(byAccount),
    totalInflows,
    totalOutflows,
    netCashFlow: totalInflows - totalOutflows,
    transactionCount: transactions.length,
  }
}

// ─── RECONCILIATION ─────────────────────────────────────────
async function getReconciliation(supabase: any, from: string | null, to: string | null) {
  // Bank transactions
  let bankQ = supabase.from('bank_transactions').select('*')
  if (from) bankQ = bankQ.gte('transaction_date', from)
  if (to) bankQ = bankQ.lte('transaction_date', to)
  const { data: bankTxs } = await bankQ

  // Accounting entries
  let acctQ = supabase.from('accounting_entries').select('*')
  if (from) acctQ = acctQ.gte('transaction_date', from)
  if (to) acctQ = acctQ.lte('transaction_date', to)
  const { data: acctTxs } = await acctQ

  const bank = bankTxs || []
  const accounting = acctTxs || []

  // Find which bank transactions have been synced to accounting
  const syncedBankIds = new Set(accounting.filter((a: any) => a.bank_transaction_id).map((a: any) => a.bank_transaction_id))

  const reconciled = bank.filter((b: any) => syncedBankIds.has(b.id))
  const unreconciled = bank.filter((b: any) => !syncedBankIds.has(b.id))

  // Uncategorized = bank transactions without a category or account_id
  const uncategorized = bank.filter((b: any) => !b.category && !b.account_id)

  const bankTotal = bank.reduce((s: number, t: any) => s + Number(t.amount), 0)
  const accountingTotal = accounting.reduce((s: number, t: any) => s + Number(t.amount), 0)
  const difference = bankTotal - accountingTotal

  return {
    bankTransactionCount: bank.length,
    accountingEntryCount: accounting.length,
    reconciledCount: reconciled.length,
    unreconciledCount: unreconciled.length,
    uncategorizedCount: uncategorized.length,
    bankTotal,
    accountingTotal,
    difference,
    unreconciled: unreconciled.slice(0, 50), // limit for UI
    uncategorized: uncategorized.slice(0, 50),
  }
}
