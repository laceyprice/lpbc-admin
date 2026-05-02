import { NextRequest, NextResponse } from 'next/server'
export const dynamic = 'force-dynamic'
import { createServerClient } from '@/lib/supabase'

// Daily automation endpoint — call once per day from any cron service.
//
//   Header: Authorization: Bearer <CRON_SECRET>
//
// Tasks:
//   1. Flip sent invoices to "overdue" once due_date passes
//   2. Flip permits to "expired" once expiry_date passes
//   3. Flip vendor_documents (COIs, etc.) to "expired" once expiry_date passes
//   4. Sweep bank_transactions that are categorized but missing accounting_entries
//
// Returns a summary of what changed so you can see it worked.

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('authorization')
  const cronSecret = process.env.CRON_SECRET
  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = createServerClient()
  const today = new Date().toISOString().slice(0, 10) // YYYY-MM-DD
  const summary: Record<string, number | string> = { ran_at: new Date().toISOString() }

  // 1️⃣ Overdue invoices — sent invoices past their due_date with unpaid balance
  try {
    const { data, error } = await supabase
      .from('invoices')
      .update({ invoice_status: 'overdue' })
      .eq('invoice_status', 'sent')
      .lt('due_date', today)
      .select('id')
    if (error) throw error
    summary.invoices_marked_overdue = data?.length || 0
  } catch (e: any) {
    summary.invoices_error = e.message
  }

  // 2️⃣ Expired permits — anything with an expiry_date in the past that isn't already closed/expired
  try {
    const { data, error } = await supabase
      .from('permits')
      .update({ status: 'expired' })
      .lt('expiry_date', today)
      .not('expiry_date', 'is', null)
      .not('status', 'in', '(expired,closed,cancelled,not_required)')
      .select('id')
    if (error) throw error
    summary.permits_marked_expired = data?.length || 0
  } catch (e: any) {
    summary.permits_error = e.message
  }

  // 3️⃣ Expired vendor documents (COIs, W-9s with expiry, etc.)
  try {
    const { data, error } = await supabase
      .from('vendor_documents')
      .update({ status: 'expired' })
      .lt('expiry_date', today)
      .not('expiry_date', 'is', null)
      .neq('status', 'expired')
      .select('id')
    if (error) throw error
    summary.vendor_docs_marked_expired = data?.length || 0
  } catch (e: any) {
    summary.vendor_docs_error = e.message
  }

  // 4️⃣ Sync any categorized bank transactions that don't have an accounting entry yet
  try {
    const { data: postedIds } = await supabase
      .from('accounting_entries')
      .select('bank_transaction_id')
      .not('bank_transaction_id', 'is', null)
    const postedSet = new Set((postedIds || []).map((r: any) => r.bank_transaction_id))

    const { data: categorized } = await supabase
      .from('bank_transactions')
      .select('*')
      .not('account_id', 'is', null)

    let synced = 0
    for (const tx of categorized || []) {
      if (postedSet.has(tx.id)) continue
      await supabase.from('accounting_entries').insert({
        transaction_date: tx.transaction_date,
        description: tx.description,
        amount: tx.amount,
        payee: tx.payee || null,
        account_id: tx.account_id,
        check_number: tx.check_number || null,
        notes: tx.notes || null,
        source: 'auto_sync',
        bank_transaction_id: tx.id,
      })
      synced++
    }
    summary.bank_transactions_synced = synced
  } catch (e: any) {
    summary.sync_error = e.message
  }

  return NextResponse.json({ ok: true, ...summary })
}
