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
      const { error: dbErr } = await supabase.from('plaid_connections').insert({
        institution_name: institution?.name || 'Unknown Bank',
        institution_id: institution?.institution_id || null,
        access_token,
        item_id,
      })
      if (dbErr) {
        console.error('DB insert error:', dbErr)
        return NextResponse.json({ error: dbErr.message }, { status: 500 })
      }

      return NextResponse.json({ success: true, item_id })
    } catch (err: any) {
      console.error('Plaid exchange error:', err?.response?.data || err.message)
      return NextResponse.json({ error: err?.response?.data?.error_message || 'Failed to exchange token' }, { status: 500 })
    }
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

        // Insert new transactions
        for (const tx of allAdded) {
          const { error: insErr } = await supabase
            .from('bank_transactions')
            .upsert({
              plaid_transaction_id: tx.transaction_id,
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
