import { NextRequest, NextResponse } from 'next/server'
export const dynamic = 'force-dynamic'
import { requireAdmin } from '@/lib/admin-auth'
import { getSettings, setSettings, SETTING_KEYS } from '@/lib/settings'

// Business settings (review link, rates, missed-call text). ADMIN ONLY.
// GET /api/settings → all settings    POST /api/settings { key: value, … } → save
export async function GET(req: NextRequest) {
  const denied = await requireAdmin(req); if (denied) return denied
  return NextResponse.json(await getSettings())
}

export async function POST(req: NextRequest) {
  const denied = await requireAdmin(req); if (denied) return denied
  const body = await req.json().catch(() => ({}))
  const values: Record<string, string> = {}
  for (const k of SETTING_KEYS) if (k in body) values[k] = String(body[k] ?? '').trim()
  if ('review_url' in values && values.review_url && !/^https?:\/\//i.test(values.review_url)) return NextResponse.json({ error: 'The review link must start with https://' }, { status: 400 })
  for (const k of ['default_hourly_rate', 'mileage_rate']) if (k in values && values[k] && !(Number(values[k]) >= 0)) return NextResponse.json({ error: `${k.replace(/_/g, ' ')} must be a number` }, { status: 400 })
  try { await setSettings(values as any) } catch (e: any) { return NextResponse.json({ error: e.message }, { status: 500 }) }
  return NextResponse.json(await getSettings())
}
