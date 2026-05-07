import { NextRequest, NextResponse } from 'next/server'
export const dynamic = 'force-dynamic'
import { getPlaidClient } from '@/lib/plaid'
import { createServerClient } from '@/lib/supabase'
import { CountryCode, Products } from 'plaid'

// ── POST /api/plaid?action=create-link-token ──
// ── POST /api/plaid?action=exchange-token ──
// ── POST /api/plaid?action=sync ──
export async function POST(req: NextRequest) {
  const action = req.nextUrl.searchParams.get('action')
  const plaid = getPlaidClient()
  const supabase = createServerClient()

  // ── Step 1: Create a link token for the Plaid Link widget ──
  if (action === 'create-link-token') {
    try {
      const response = await plaid.linkTokenCreate({
        user: { client_user_id: 'lpbc-admin' },
        client_name: 'L. Price Building Company',
        products: [Products.Transactions],
        country_codes: [CountryCode.Us],
        language: 'en',
      })
      return NextResponse.json({ link_token: response.data.link_token })
    } catch (err: any) {
      console.error('Plaid link token error:', err?.response?.data || err.message)
      return NextResponse.json({ error: err?.response?.data?.error_message || 'Failed to create link token' }, { status: 500 })
    }
  }

  // ── Step 2: Exchange public token for access token ──
  if (action === 'exchange-token') {
    try {
      const { public_token, institution } = await req.json()
      if (!public_token) return NextResponse.json({ error: 'public_token required' }, { status: 400 })

      const exchangeRes = await plaid.itemPublicTokenExchange({ public_token })
      const { access_token, item_id } = exchangeRes.data

      // Store the connection
      const { data: conn, error: dbErr } = await supabase.from('plaid_connections').insert({
        institution_name: institution?.name || 'Unknown Bank',
        institution_id: institution?.institution_id || null,
        access_token,
        item_id,
      }).select('id').single()
      if (dbErr || !conn) {
        console.error('DB insert error:', dbErr)
        return NextResponse.json({ error: dbErr?.message || 'Insert failed' }, { status: 500 })
      }

      // Fetch and store the list of accounts at this institution so the user
      // can map each one to their own financial_accounts (LPBC, Causey, etc.).
      try {
        const acctRes = await plaid.accountsGet({ access_token })
        for (const acct of acctRes.data.accounts || []) {
          await supabase.from('plaid_accounts').upsert({
            plaid_connection_id: conn.id,
            plaid_account_id: acct.account_id,
            name: acct.name || null,
            official_name: acct.official_name || null,
            mask: acct.mask || null,
            type: acct.type || null,
            subtype: acct.subtype || null,
          }, { onConflict: 'plaid_account_id' })
        }
      } catch (e: any) {
        console.error('Plaid accounts fetch failed:', e?.message)
      }

      return NextResponse.json({ success: true, item_id, connection_id: conn.id })
    } catch (err: any) {
      console.error('Plaid exchange error:', err?.response?.data || err.message)
      return NextResponse.json({ error: err?.response?.data?.error_message || 'Failed to exchange token' }, { status: 500 })
    }
  }

  // ── List Plaid accounts (with current mapping) ──
  if (action === 'accounts') {
    const { data, error } = await supabase
      .from('plaid_accounts')
      .select('*, plaid_connection:plaid_connections(id, institution_name), financial_account:financial_accounts(id, name)')
      .order('created_at', { ascending: true })
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json(data || [])
  }

  // ── Map a Plaid account to one of the user's financial accounts ──
  if (action === 'map-account') {
    const { plaid_account_id, financial_account_id } = await req.json()
    if (!plaid_account_id) return NextResponse.json({ error: 'plaid_account_id required' }, { status: 400 })
    const { error } = await supabase
      .from('plaid_accounts')
      .update({ financial_account_id: financial_account_id || null })
      .eq('plaid_account_id', plaid_account_id)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    // Also backfill the financial_account_id on existing bank_transactions
    // that came from this Plaid account, so historical rows show under the
    // right account in the bookkeeping UI immediately.
    if (financial_account_id) {
      await supabase
        .from('bank_transactions')
        .update({ financial_account_id })
        .eq('plaid_account_id', plaid_account_id)
    }
    return NextResponse.json({ success: true })
  }

  // ── Step 3: Sync transactions from all connected banks ──
  if (action === 'sync') {
    try {
      const { data: connections } = await supabase
        .from('plaid_connections')
        .select('*')
        .eq('status', 'active')

      if (!connections || connections.length === 0) {
        return NextResponse.json({ error: 'No bank connections found. Connect a bank first.' }, { status: 400 })
      }

      let totalImported = 0
      let totalSkipped = 0

      // Pre-load the Plaid account → financial_account mapping so we can
      // auto-tag each transaction with the right financial_account_id.
      const { data: plaidAccts } = await supabase
        .from('plaid_accounts')
        .select('plaid_account_id, financial_account_id')
      const acctMap = new Map<string, string | null>()
      for (const a of plaidAccts || []) {
        acctMap.set(a.plaid_account_id, a.financial_account_id || null)
      }

      for (const conn of connections) {
        let cursor = conn.cursor || undefined
        let hasMore = true
        const allAdded: any[] = []

        // Paginate through all new transactions
        while (hasMore) {
          const syncRes = await plaid.transactionsSync({
            access_token: conn.access_token,
            cursor,
          })

          const { added, modified, removed, has_more, next_cursor } = syncRes.data
          allAdded.push(...added)
          cursor = next_cursor
          hasMore = has_more
        }

        // If a new account showed up since last connect, save it now so the
        // user can map it (otherwise they'd never see it in the UI).
        const seenAccountIds = new Set(allAdded.map((t: any) => t.account_id).filter(Boolean))
        for (const accId of seenAccountIds) {
          if (!acctMap.has(accId as string)) {
            await supabase.from('plaid_accounts').upsert({
              plaid_connection_id: conn.id,
              plaid_account_id: accId,
            }, { onConflict: 'plaid_account_id' })
            acctMap.set(accId as string, null)
          }
        }

        // Insert new transactions, tagged with the source Plaid account and
        // auto-routed to the mapped financial_account if one is set.
        for (const tx of allAdded) {
          const financialAccountId = tx.account_id ? acctMap.get(tx.account_id) : null
          const { error: insErr } = await supabase
            .from('bank_transactions')
            .upsert({
              plaid_transaction_id: tx.transaction_id,
              plaid_account_id: tx.account_id || null,
              financial_account_id: financialAccountId || null,
              transaction_date: tx.date,
              description: tx.name || tx.merchant_name || 'Unknown',
              amount: -tx.amount, // Plaid uses negative for credits, positive for debits — we flip
              payee: tx.merchant_name || tx.name || '',
              category: tx.personal_finance_category?.primary || tx.category?.[0] || '',
              source: `plaid_${conn.institution_name}`,
              notes: tx.personal_finance_category?.detailed || '',
            }, { onConflict: 'plaid_transaction_id' })

          if (insErr) {
            console.error('Insert error:', insErr.message)
            totalSkipped++
          } else {
            totalImported++
          }
        }

        // Update cursor for next sync
        await supabase
          .from('plaid_connections')
          .update({ cursor, last_synced_at: new Date().toISOString() })
          .eq('id', conn.id)
      }

      return NextResponse.json({ imported: totalImported, skipped: totalSkipped })
    } catch (err: any) {
      console.error('Plaid sync error:', err?.response?.data || err.message)
      return NextResponse.json({ error: err?.response?.data?.error_message || 'Sync failed' }, { status: 500 })
    }
  }

  return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 })
}

// ── GET /api/plaid — list connected banks ──
export async function GET() {
  const supabase = createServerClient()
  const { data, error } = await supabase
    .from('plaid_connections')
    .select('id, institution_name, institution_id, status, last_synced_at, created_at')
    .order('created_at', { ascending: false })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

// ── DELETE /api/plaid?id=... — disconnect a bank ──
export async function DELETE(req: NextRequest) {
  const supabase = createServerClient()
  const id = req.nextUrl.searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })

  // Get connection to remove from Plaid
  const { data: conn } = await supabase.from('plaid_connections').select('*').eq('id', id).single()
  if (conn) {
    try {
      const plaid = getPlaidClient()
      await plaid.itemRemove({ access_token: conn.access_token })
    } catch {}
  }

  const { error } = await supabase.from('plaid_connections').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
