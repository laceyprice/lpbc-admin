import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'
export const dynamic = 'force-dynamic'

// Business-wide finish price overrides, stored in app_settings(key='finish_prices').
// Degrades gracefully: if the table doesn't exist yet, GET returns {} and the
// client keeps using its localStorage copy until the migration is applied.
const KEY = 'finish_prices'

export async function GET() {
  try {
    const sb = createServerClient()
    const { data, error } = await sb.from('app_settings').select('value').eq('key', KEY).maybeSingle()
    if (error) return NextResponse.json({})
    return NextResponse.json(data?.value || {})
  } catch {
    return NextResponse.json({})
  }
}

export async function PUT(req: NextRequest) {
  try {
    const value = await req.json()
    if (!value || typeof value !== 'object') return NextResponse.json({ error: 'Invalid prices' }, { status: 400 })
    const sb = createServerClient()
    const { error } = await sb.from('app_settings').upsert(
      { key: KEY, value, updated_at: new Date().toISOString() },
      { onConflict: 'key' },
    )
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Save failed' }, { status: 500 })
  }
}
