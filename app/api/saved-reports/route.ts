import { NextRequest, NextResponse } from 'next/server'
export const dynamic = 'force-dynamic'
import { createServerClient } from '@/lib/supabase'

// GET /api/saved-reports — list all saved reports
export async function GET() {
  const supabase = createServerClient()
  const { data, error } = await supabase
    .from('saved_reports')
    .select('*')
    .order('created_at', { ascending: false })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

// POST /api/saved-reports — generate and save a report
// Body: { report_type, month, year }
export async function POST(req: NextRequest) {
  const supabase = createServerClient()
  const { report_type, month, year } = await req.json()
  if (!report_type || !month || !year) {
    return NextResponse.json({ error: 'report_type, month, year required' }, { status: 400 })
  }

  // Build date range for the selected month
  const monthIndex = new Date(`${month} 1, ${year}`).getMonth()
  const from = new Date(year, monthIndex, 1).toISOString().split('T')[0]
  const to = new Date(year, monthIndex + 1, 0).toISOString().split('T')[0]

  // Fetch the report data from the existing reports API
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'
  const params = new URLSearchParams({ type: report_type, from, to, year: String(year) })
  const res = await fetch(`${appUrl}/api/reports?${params}`)
  if (!res.ok) return NextResponse.json({ error: 'Failed to generate report' }, { status: 500 })
  const report_data = await res.json()
  if (report_data.error) return NextResponse.json({ error: report_data.error }, { status: 500 })

  const label_map: Record<string, string> = {
    'pnl': 'Profit & Loss',
    'balance-sheet': 'Balance Sheet',
    'cash-flow': 'Cash Flow',
    'reconciliation': 'Reconciliation',
  }

  const { data, error } = await supabase
    .from('saved_reports')
    .insert({
      report_type,
      report_label: label_map[report_type] || report_type,
      month,
      year,
      period_from: from,
      period_to: to,
      report_data,
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data, { status: 201 })
}

// DELETE /api/saved-reports?id=...
export async function DELETE(req: NextRequest) {
  const supabase = createServerClient()
  const id = req.nextUrl.searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })
  const { error } = await supabase.from('saved_reports').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
