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

  // For accounting_entries: enrich each row with the receipt_image from its linked bank_transaction
  if (table === 'accounting_entries' && Array.isArray(data) && data.length > 0) {
    const bankTxIds = data.map((e: any) => e.bank_transaction_id).filter(Boolean)
    if (bankTxIds.length > 0) {
      const { data: bankTxs } = await supabase
        .from('bank_transactions')
        .select('id, receipt_image_id, check_image_id')
        .in('id', bankTxIds)
      const imageIds = (bankTxs || [])
        .flatMap((b: any) => [b.receipt_image_id, b.check_image_id])
        .filter(Boolean)
      let imagesMap: Record<string, any> = {}
      if (imageIds.length > 0) {
        const { data: imgs } = await supabase
          .from('transaction_images')
          .select('id, file_url, file_name, image_type')
          .in('id', imageIds)
        for (const i of (imgs || [])) imagesMap[i.id] = i
      }
      const byTxId: Record<string, any> = {}
      for (const b of (bankTxs || [])) byTxId[b.id] = b
      for (const entry of data) {
        const bt = entry.bank_transaction_id ? byTxId[entry.bank_transaction_id] : null
        entry.receipt_image = bt?.receipt_image_id ? imagesMap[bt.receipt_image_id] || null : null
        entry.check_image = bt?.check_image_id ? imagesMap[bt.check_image_id] || null : null
      }
    }
  }

  // For bank_transactions, also tag which ones are already posted to accounting
  if (table === 'bank_transactions') {
    const { data: posted } = await supabase
      .from('accounting_entries')
      .select('bank_transaction_id')
      .not('bank_transaction_id', 'is', null)
    const postedSet = new Set((posted || []).map((e: any) => e.bank_transaction_id))
    const enriched = (data || []).map((tx: any) => ({ ...tx, _posted: postedSet.has(tx.id) }))
    return NextResponse.json(enriched)
  }

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

  // ── Undo a bulk-update — restore previous account_id / payee values ────────
  if (action === 'undo-bulk-update') {
    const body = await req.json()
    const { rows } = body as {
      rows: Array<{ id: string; account_id: string | null; payee: string | null; had_entry: boolean }>
    }
    if (!Array.isArray(rows) || rows.length === 0) {
      return NextResponse.json({ error: 'rows required' }, { status: 400 })
    }

    // Restore each bank_transaction to its prior account_id / payee
    // Process in parallel chunks of 50 to avoid overwhelming the DB
    for (let i = 0; i < rows.length; i += 50) {
      await Promise.all(rows.slice(i, i + 50).map(row =>
        supabase.from('bank_transactions')
          .update({ account_id: row.account_id ?? null, payee: row.payee ?? null })
          .eq('id', row.id)
      ))
    }

    // Accounting entry cleanup:
    //  - Entries that were NEWLY CREATED by the bulk-update → delete them
    //  - Entries that ALREADY EXISTED → restore their account_id
    const newEntries = rows.filter(r => !r.had_entry)
    const oldEntries = rows.filter(r => r.had_entry)

    if (newEntries.length > 0) {
      await supabase.from('accounting_entries')
        .delete()
        .in('bank_transaction_id', newEntries.map(r => r.id))
    }
    for (let i = 0; i < oldEntries.length; i += 50) {
      await Promise.all(oldEntries.slice(i, i + 50).map(row =>
        supabase.from('accounting_entries')
          .update({ account_id: row.account_id ?? null })
          .eq('bank_transaction_id', row.id)
      ))
    }

    return NextResponse.json({ restored: rows.length })
  }

  // ── Bulk update action — apply payee/account to many transactions at once ──
  if (action === 'bulk-update') {
    const body = await req.json()
    const { ids, payee, account_id } = body
    if (!Array.isArray(ids) || ids.length === 0) {
      return NextResponse.json({ error: 'ids required' }, { status: 400 })
    }
    const updates: any = {}
    if (payee !== undefined) updates.payee = payee
    if (account_id !== undefined) updates.account_id = account_id

    const { error } = await supabase
      .from('bank_transactions')
      .update(updates)
      .in('id', ids)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    // Sync to accounting_entries if account_id is being set
    if (account_id) {
      const { data: txRows } = await supabase
        .from('bank_transactions')
        .select('*')
        .in('id', ids)
      for (const tx of txRows || []) {
        const { data: existing } = await supabase
          .from('accounting_entries')
          .select('id')
          .eq('bank_transaction_id', tx.id)
          .maybeSingle()
        if (!existing) {
          await supabase.from('accounting_entries').insert({
            transaction_date: tx.transaction_date,
            description: tx.description,
            amount: tx.amount,
            payee: tx.payee || null,
            account_id,
            financial_account_id: tx.financial_account_id || null,
            check_number: tx.check_number || null,
            source: 'bank_sync',
            bank_transaction_id: tx.id,
          })
        } else {
          await supabase.from('accounting_entries')
            .update({ account_id, ...(payee !== undefined ? { payee } : {}) })
            .eq('bank_transaction_id', tx.id)
        }
      }
    } else if (payee !== undefined) {
      await supabase
        .from('accounting_entries')
        .update({ payee })
        .in('bank_transaction_id', ids)
    }
    return NextResponse.json({ updated: ids.length })
  }

  // ── Bulk delete — remove transactions and their linked accounting entries ──
  if (action === 'bulk-delete') {
    const body = await req.json()
    const { ids } = body
    if (!Array.isArray(ids) || ids.length === 0) {
      return NextResponse.json({ error: 'ids required' }, { status: 400 })
    }
    // Cascade: delete linked accounting_entries first
    await supabase
      .from('accounting_entries')
      .delete()
      .in('bank_transaction_id', ids)
    const { error } = await supabase
      .from('bank_transactions')
      .delete()
      .in('id', ids)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ deleted: ids.length })
  }

  // ── Accept action — post a categorized bank transaction to the accounting ledger ──
  if (action === 'accept') {
    const body = await req.json()
    const { id } = body
    if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })

    const { data: tx } = await supabase
      .from('bank_transactions')
      .select('*')
      .eq('id', id)
      .single()
    if (!tx) return NextResponse.json({ error: 'Transaction not found' }, { status: 404 })
    if (!tx.account_id) return NextResponse.json({ error: 'Transaction has no account — categorize first' }, { status: 400 })

    const { data: existing } = await supabase
      .from('accounting_entries')
      .select('id')
      .eq('bank_transaction_id', id)
      .maybeSingle()

    if (!existing) {
      const { data: entry, error } = await supabase.from('accounting_entries').insert({
        transaction_date: tx.transaction_date,
        description: tx.description,
        amount: tx.amount,
        payee: tx.payee || null,
        category: tx.category || null,
        account_id: tx.account_id,
        financial_account_id: tx.financial_account_id || null,
        check_number: tx.check_number || null,
        notes: tx.notes || null,
        source: 'bank_sync',
        bank_transaction_id: id,
      }).select().single()
      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
      return NextResponse.json({ created: true, entry })
    }
    return NextResponse.json({ created: false, existing })
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

  // Auto-categorize: if updating payee on a bank_transaction (and no account_id is being set),
  // look up the most-common account assigned to that payee historically and apply it.
  if (tableName === 'bank_transactions' && updates.payee && !updates.account_id) {
    const { data: history } = await supabase
      .from('bank_transactions')
      .select('account_id')
      .eq('payee', updates.payee)
      .not('account_id', 'is', null)
      .limit(50)
    if (history && history.length > 0) {
      // Find most common account_id
      const counts: Record<string, number> = {}
      for (const row of history) {
        const k = row.account_id as string
        counts[k] = (counts[k] || 0) + 1
      }
      const sorted = Object.entries(counts).sort(([, a], [, b]) => b - a)
      if (sorted.length > 0) {
        updates.account_id = sorted[0][0]
      }
    }
  }

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
        financial_account_id: tx.financial_account_id || null,
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
