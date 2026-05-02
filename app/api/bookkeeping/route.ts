import { NextRequest, NextResponse } from 'next/server'
export const dynamic = 'force-dynamic'
import { createServerClient } from '@/lib/supabase'

export async function GET(req: NextRequest) {
  const supabase = createServerClient()
  const table = req.nextUrl.searchParams.get('table') === 'accounting_entries'
    ? 'accounting_entries'
    : 'bank_transactions'

  // For bank_transactions, join the image rows so the UI can show attached
  // receipts/checks without a second round-trip.
  const selectExpr = table === 'bank_transactions'
    ? '*, receipt_image:transaction_images!bank_transactions_receipt_image_id_fkey(id, file_url, file_name, image_type), check_image:transaction_images!bank_transactions_check_image_id_fkey(id, file_url, file_name, image_type)'
    : '*'

  const accountId = req.nextUrl.searchParams.get('account_id')
  let query = supabase.from(table).select(selectExpr).order('transaction_date', { ascending: false })
  if (accountId) query = query.eq('financial_account_id', accountId)

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function POST(req: NextRequest) {
  const supabase = createServerClient()
  const action = req.nextUrl.searchParams.get('action')

  if (action === 'csv-import') {
    const body = await req.json()
    const { transactions, importBatchId, financial_account_id } = body

    if (!Array.isArray(transactions)) return NextResponse.json({ error: 'Invalid transactions' }, { status: 400 })

    const rows = transactions
      .filter((t: any) => t.Date || t.date || t['Post Date'] || t['Transaction Date'] || t['Posting Date'] || t['Posted Date'])
      .map((t: any) => {
        const rawDate = t.Date || t.date || t['Post Date'] || t['Transaction Date'] || t['Posting Date'] || t['Posted Date']
        const debitRaw = String(t.Debit || t.debit || '').replace(/[$,()]/g, '')
        const creditRaw = String(t.Credit || t.credit || '').replace(/[$,()]/g, '')
        const amountRaw = String(t.Amount || t.amount || '').replace(/[$,()]/g, '')
        let amount: number
        if (debitRaw && parseFloat(debitRaw)) {
          amount = -Math.abs(parseFloat(debitRaw))
        } else if (creditRaw && parseFloat(creditRaw)) {
          amount = Math.abs(parseFloat(creditRaw))
        } else {
          amount = parseFloat(amountRaw) || 0
        }
        return {
          transaction_date: rawDate,
          description: t.Description || t.description || t.Memo || t.memo || '',
          amount,
          payee: t.Payee || t.payee || t.Name || '',
          category: t.Category || t.category || t.Classification || t.classification || null,
          check_number: t.Check || t.check || t['Check Number'] || t['Check #'] || null,
          notes: t.Notes || t.notes || null,
          source: importBatchId || 'csv_import',
          financial_account_id: financial_account_id || null,
        }
      })
      .filter((r: any) => r.description)

    // Upsert with deduplication
    const { data, error } = await supabase
      .from('bank_transactions')
      .upsert(rows, { onConflict: 'transaction_date,description,amount', ignoreDuplicates: true })
      .select()

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ imported: data?.length || 0, total: rows.length })
  }

  // Manual transaction entry
  const body = await req.json()
  const table = body.table === 'accounting_entries' ? 'accounting_entries' : 'bank_transactions'
  const { table: _, ...insertData } = body
  const { data, error } = await supabase.from(table).insert(insertData).select().single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data, { status: 201 })
}

export async function PATCH(req: NextRequest) {
  const supabase = createServerClient()
  const body = await req.json()
  const { id, table, ...updates } = body
  if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 })

  const tableName = table === 'accounting_entries' ? 'accounting_entries' : 'bank_transactions'
  const { data, error } = await supabase.from(tableName).update(updates).eq('id', id).select().single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // If a bank transaction gets categorized (legacy `category` text or new
  // `account_id`), sync the change into the accounting ledger.
  if (tableName === 'bank_transactions' && (updates.category || updates.account_id)) {
    const tx = data
    const existingEntry = await supabase
      .from('accounting_entries')
      .select('id')
      .eq('bank_transaction_id', id)
      .single()

    if (!existingEntry.data) {
      await supabase.from('accounting_entries').insert({
        transaction_date: tx.transaction_date,
        description: tx.description,
        amount: tx.amount,
        payee: tx.payee || null,
        category: tx.category || null,
        account_id: tx.account_id || null,
        check_number: tx.check_number || null,
        notes: tx.notes || null,
        source: 'bank_sync',
        bank_transaction_id: id,
      })
    } else {
      const sync: Record<string, unknown> = {}
      if (updates.category) sync.category = updates.category
      if (updates.account_id) sync.account_id = updates.account_id
      if (updates.check_number !== undefined) sync.check_number = updates.check_number
      await supabase.from('accounting_entries')
        .update(sync)
        .eq('bank_transaction_id', id)
    }
  }

  return NextResponse.json(data)
}
