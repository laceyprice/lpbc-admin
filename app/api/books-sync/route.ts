import { NextRequest, NextResponse } from 'next/server'
export const dynamic = 'force-dynamic'
import { createServerClient } from '@/lib/supabase'

// Keeps the two ledgers the books page edits in step:
//   bank_transactions  (the Bank tab)      → feeds Cash Flow / Reconciliation
//   accounting_entries (the Posted tab)    → feeds Profit & Loss / Balance Sheet
// If a category was changed in one place and never carried to the other, reports disagree with the books.
//
// GET  /api/books-sync                  → how many rows are out of step (+ a few examples)
// POST /api/books-sync { prefer: 'bank' | 'posted' }
//        bank   → copy the Bank tab's categories onto the Posted entries (and create missing entries)
//        posted → copy the Posted tab's categories back onto the bank transactions

async function fetchAll(make: () => any): Promise<any[]> {
  const out: any[] = []
  for (let i = 0; ; i += 1000) {
    const { data, error } = await make().range(i, i + 999)
    if (error) throw new Error(error.message)
    out.push(...(data || []))
    if (!data || data.length < 1000) break
  }
  return out
}

async function analyze(supabase: any) {
  const [txs, entries, accts] = await Promise.all([
    fetchAll(() => supabase.from('bank_transactions').select('id, transaction_date, description, payee, amount, account_id, category, financial_account_id, check_number, notes').order('id')),
    fetchAll(() => supabase.from('accounting_entries').select('id, bank_transaction_id, account_id, category, financial_account_id').not('bank_transaction_id', 'is', null).order('id')),
    fetchAll(() => supabase.from('chart_of_accounts').select('id, name').order('id')),
  ])
  const name: Record<string, string> = {}
  for (const a of accts) name[a.id] = a.name
  const byTx: Record<string, any[]> = {}
  for (const e of entries) (byTx[e.bank_transaction_id] ||= []).push(e)

  const categoryDiff: { tx: any; entry: any }[] = []
  const accountDiff: { tx: any; entry: any }[] = []
  const missing: any[] = []
  let duplicates = 0
  for (const tx of txs) {
    const list = byTx[tx.id] || []
    if (list.length > 1) duplicates++
    if (list.length === 0) { if (tx.account_id) missing.push(tx); continue }
    for (const e of list) {
      if ((e.account_id || null) !== (tx.account_id || null)) categoryDiff.push({ tx, entry: e })
      if (tx.financial_account_id && e.financial_account_id !== tx.financial_account_id) accountDiff.push({ tx, entry: e })
    }
  }
  const samples = categoryDiff.slice(0, 12).map(({ tx, entry }) => ({
    date: tx.transaction_date, description: tx.description, amount: tx.amount,
    bank: tx.account_id ? name[tx.account_id] || 'Unknown' : 'Uncategorized',
    posted: entry.account_id ? name[entry.account_id] || 'Unknown' : 'Uncategorized',
  }))
  return { categoryDiff, accountDiff, missing, duplicates, samples }
}

export async function GET() {
  try {
    const supabase = createServerClient()
    const a = await analyze(supabase)
    return NextResponse.json({
      categoryMismatch: a.categoryDiff.length,
      accountMismatch: a.accountDiff.length,
      missingEntries: a.missing.length,
      duplicateEntries: a.duplicates,
      total: a.categoryDiff.length + a.accountDiff.length + a.missing.length,
      samples: a.samples,
    })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const supabase = createServerClient()
    const { prefer } = await req.json().catch(() => ({}))
    if (prefer !== 'bank' && prefer !== 'posted') return NextResponse.json({ error: "prefer must be 'bank' or 'posted'" }, { status: 400 })
    const a = await analyze(supabase)
    let fixed = 0

    // Group rows by the value they should get, so each group is one update.
    const group = (rows: { id: string; v: string | null }[]) => {
      const m = new Map<string, string[]>()
      for (const r of rows) { const k = r.v ?? '__null__'; (m.get(k) || m.set(k, []).get(k)!).push(r.id) }
      return m
    }
    const apply = async (table: string, col: string, rows: { id: string; v: string | null }[]) => {
      for (const [k, ids] of Array.from(group(rows).entries())) {
        for (let i = 0; i < ids.length; i += 100) {
          const { error } = await supabase.from(table).update({ [col]: k === '__null__' ? null : k }).in('id', ids.slice(i, i + 100))
          if (error) throw new Error(error.message)
        }
      }
    }

    if (prefer === 'bank') {
      await apply('accounting_entries', 'account_id', a.categoryDiff.map(d => ({ id: d.entry.id, v: d.tx.account_id || null })))
      fixed += a.categoryDiff.length
      const rows = a.missing.map(tx => ({
        transaction_date: tx.transaction_date, description: tx.description, amount: tx.amount, payee: tx.payee || null,
        category: tx.category || null, account_id: tx.account_id, financial_account_id: tx.financial_account_id || null,
        check_number: tx.check_number || null, notes: tx.notes || null, source: 'bank_sync', bank_transaction_id: tx.id,
      }))
      for (let i = 0; i < rows.length; i += 200) {
        const { error } = await supabase.from('accounting_entries').insert(rows.slice(i, i + 200))
        if (error) throw new Error(error.message)
      }
      fixed += rows.length
    } else {
      await apply('bank_transactions', 'account_id', a.categoryDiff.map(d => ({ id: d.tx.id, v: d.entry.account_id || null })))
      fixed += a.categoryDiff.length
    }
    // Which bank account the money sits in always follows the bank transaction.
    await apply('accounting_entries', 'financial_account_id', a.accountDiff.map(d => ({ id: d.entry.id, v: d.tx.financial_account_id })))
    fixed += a.accountDiff.length

    return NextResponse.json({ fixed })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
