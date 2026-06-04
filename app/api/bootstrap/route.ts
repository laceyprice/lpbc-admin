import { NextResponse } from 'next/server'
export const dynamic = 'force-dynamic'
import { createServerClient } from '@/lib/supabase'

// Single endpoint that returns everything the Bookkeeping page needs on mount:
// chart of accounts, financial accounts, plaid bank connections. Previously
// these were 3 separate fetches in parallel from the client, which burst
// Supabase's connection pool (429 "too many connections"). Server-side, they
// share one supabase client and run in parallel via Promise.all without
// opening additional HTTP fan-out from the browser.
export async function GET() {
  const supabase = createServerClient()
  const [chart, financial, plaid] = await Promise.all([
    supabase.from('chart_of_accounts').select('*').eq('is_active', true).order('sort_order', { ascending: true }).order('name', { ascending: true }),
    supabase.from('financial_accounts').select('*').order('name'),
    supabase.from('plaid_connections').select('id, institution_name, institution_id, status, last_synced_at, created_at').order('created_at', { ascending: false }),
  ])
  return NextResponse.json({
    chartOfAccounts: chart.data ?? [],
    financialAccounts: financial.data ?? [],
    bankConnections: plaid.data ?? [],
    errors: {
      chart: chart.error?.message,
      financial: financial.error?.message,
      plaid: plaid.error?.message,
    },
  })
}
