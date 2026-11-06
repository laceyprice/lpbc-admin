import { NextRequest, NextResponse } from 'next/server'
export const dynamic = 'force-dynamic'
import { createServerClient } from '@/lib/supabase'
import { getSettings } from '@/lib/settings'

// Mileage log for the business-mileage deduction.
// GET    /api/mileage?year=2026   → { entries, miles, deduction, rate }
// POST   /api/mileage             { trip_date?, miles, purpose?, from_location?, to_location?, vehicle? }   (rate = current setting)
// DELETE /api/mileage?id=uuid
const num = (v: any) => Number(v) || 0

export async function GET(req: NextRequest) {
  const year = Number(req.nextUrl.searchParams.get('year')) || new Date().getFullYear()
  const { data, error } = await createServerClient().from('mileage_entries').select('*').gte('trip_date', `${year}-01-01`).lte('trip_date', `${year}-12-31`).order('trip_date', { ascending: false }).order('created_at', { ascending: false })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  const entries = data || []
  return NextResponse.json({
    entries, year,
    miles: entries.reduce((s: number, e: any) => s + num(e.miles), 0),
    deduction: entries.reduce((s: number, e: any) => s + num(e.miles) * num(e.rate), 0),
    rate: num((await getSettings()).mileage_rate),
  })
}

export async function POST(req: NextRequest) {
  const b = await req.json().catch(() => ({}))
  const miles = num(b.miles)
  if (!(miles > 0)) return NextResponse.json({ error: 'Enter the miles driven' }, { status: 400 })
  const rate = num((await getSettings()).mileage_rate) || 0.7
  const { data, error } = await createServerClient().from('mileage_entries').insert({
    trip_date: b.trip_date || new Date().toISOString().slice(0, 10), miles, rate,
    purpose: String(b.purpose || '').trim() || null, from_location: String(b.from_location || '').trim() || null,
    to_location: String(b.to_location || '').trim() || null, vehicle: String(b.vehicle || '').trim() || null,
  }).select().single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data, { status: 201 })
}

export async function DELETE(req: NextRequest) {
  const id = req.nextUrl.searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })
  const { error } = await createServerClient().from('mileage_entries').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
