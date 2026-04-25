import { NextRequest, NextResponse } from 'next/server'
export const dynamic = 'force-dynamic'
import { createServerClient } from '@/lib/supabase'

// GET  /api/property-materials                         → list all
// GET  /api/property-materials?contact_id=uuid         → by contact
// GET  /api/property-materials?worksite_id=uuid        → by worksite
// GET  /api/property-materials?action=sync-invoices    → scan all invoices
// POST /api/property-materials                         → create record
// POST /api/property-materials?action=sync-invoice&invoice_id=uuid → sync one invoice
// DELETE /api/property-materials?id=uuid               → delete

export async function GET(req: NextRequest) {
  const supabase = createServerClient()
  const action = req.nextUrl.searchParams.get('action')
  const contactId = req.nextUrl.searchParams.get('contact_id')
  const worksiteId = req.nextUrl.searchParams.get('worksite_id')
  const search = req.nextUrl.searchParams.get('search')

  // ── Sync all invoices ──────────────────────────────────────
  if (action === 'sync-invoices') {
    return syncAllInvoices(supabase)
  }

  let query = supabase
    .from('property_materials')
    .select(`
      *,
      contact:contacts(id, first_name, last_name, email),
      worksite:worksites(id, name, address),
      inventory_item:inventory_items(id, name, category, unit_cost),
      invoice:invoices(id, invoice_number, service_type, service_date)
    `)
    .order('date_used', { ascending: false })
    .order('created_at', { ascending: false })

  if (contactId) query = query.eq('contact_id', contactId)
  if (worksiteId) query = query.eq('worksite_id', worksiteId)
  if (search) query = query.ilike('item_name', `%${search}%`)

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data || [])
}

export async function POST(req: NextRequest) {
  const supabase = createServerClient()
  const action = req.nextUrl.searchParams.get('action')
  const body = await req.json()

  // ── Sync a single invoice ──────────────────────────────────
  if (action === 'sync-invoice') {
    const invoiceId = req.nextUrl.searchParams.get('invoice_id') || body.invoice_id
    if (!invoiceId) return NextResponse.json({ error: 'invoice_id required' }, { status: 400 })
    return syncOneInvoice(supabase, invoiceId)
  }

  // ── Create a single property material record ───────────────
  if (!body.item_name) return NextResponse.json({ error: 'item_name required' }, { status: 400 })

  const { data, error } = await supabase
    .from('property_materials')
    .insert({
      worksite_id: body.worksite_id || null,
      contact_id: body.contact_id || null,
      property_address: body.property_address || null,
      inventory_item_id: body.inventory_item_id || null,
      item_name: body.item_name,
      category: body.category || 'other',
      quantity: body.quantity ?? 1,
      unit: body.unit || 'each',
      unit_cost: body.unit_cost || null,
      source: body.source || 'manual',
      invoice_id: body.invoice_id || null,
      calendar_event_id: body.calendar_event_id || null,
      date_used: body.date_used || new Date().toISOString().split('T')[0],
      notes: body.notes || null,
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data, { status: 201 })
}

export async function DELETE(req: NextRequest) {
  const supabase = createServerClient()
  const id = req.nextUrl.searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })
  await supabase.from('property_materials').delete().eq('id', id)
  return NextResponse.json({ success: true })
}

// ══════════════════════════════════════════════════════════════
// Sync helpers — extract materials from invoice line items
// ══════════════════════════════════════════════════════════════

async function syncOneInvoice(supabase: any, invoiceId: string) {
  const { data: inv, error } = await supabase
    .from('invoices')
    .select('id, invoice_number, line_items, service_date, service_description, job_address, contact_id')
    .eq('id', invoiceId)
    .single()

  if (error || !inv) return NextResponse.json({ error: 'Invoice not found' }, { status: 404 })

  const imported = await extractAndSaveLineItems(supabase, inv)
  return NextResponse.json({ imported, invoice_id: invoiceId })
}

async function syncAllInvoices(supabase: any) {
  // Get all invoices that have line items
  const { data: invoices } = await supabase
    .from('invoices')
    .select('id, invoice_number, line_items, service_date, service_description, job_address, contact_id')
    .not('line_items', 'is', null)
    .order('service_date', { ascending: false })
    .limit(500)

  if (!invoices || invoices.length === 0) {
    return NextResponse.json({ imported: 0, scanned: 0 })
  }

  let totalImported = 0
  let totalScanned = 0

  for (const inv of invoices) {
    totalScanned++
    const count = await extractAndSaveLineItems(supabase, inv)
    totalImported += count
  }

  return NextResponse.json({ imported: totalImported, scanned: totalScanned })
}

async function extractAndSaveLineItems(supabase: any, inv: any): Promise<number> {
  if (!inv.line_items || !Array.isArray(inv.line_items)) return 0

  // Find which items already exist for this invoice so we don't duplicate
  const { data: existing } = await supabase
    .from('property_materials')
    .select('item_name, quantity')
    .eq('invoice_id', inv.id)
  const existingSet = new Set((existing || []).map((r: any) => r.item_name.toLowerCase()))

  // Fetch inventory items for fuzzy matching
  const { data: inventoryItems } = await supabase
    .from('inventory_items')
    .select('id, name, category, unit, unit_cost')
    .eq('is_active', true)

  let imported = 0

  for (const lineItem of inv.line_items) {
    const desc: string = (lineItem.description || lineItem.name || lineItem.item || '').trim()
    if (!desc) continue

    // Skip pure labor / service items
    if (isLaborItem(desc)) continue

    const key = desc.toLowerCase()
    if (existingSet.has(key)) continue

    // Try to match to an inventory item
    const matched = findInventoryMatch(desc, inventoryItems || [])

    const { error } = await supabase.from('property_materials').insert({
      contact_id: inv.contact_id || null,
      property_address: inv.job_address || null,
      inventory_item_id: matched?.id || null,
      item_name: desc,
      category: matched?.category || categorizeByKeyword(desc),
      quantity: Number(lineItem.quantity) || 1,
      unit: matched?.unit || lineItem.unit || 'each',
      unit_cost: lineItem.unit_price || lineItem.price || matched?.unit_cost || null,
      source: 'invoice',
      invoice_id: inv.id,
      date_used: inv.service_date || new Date().toISOString().split('T')[0],
    })

    if (!error) {
      imported++
      existingSet.add(key)
    }
  }

  return imported
}

/** Reject line items that are clearly labor, travel, or service fees */
function isLaborItem(desc: string): boolean {
  const lower = desc.toLowerCase()
  const laborKeywords = [
    'labor', 'labour', 'service call', 'service fee', 'trip charge',
    'diagnostic', 'travel', 'installation fee', 'hourly', 'technician',
    'service charge', 'minimum charge', 'emergency fee',
  ]
  return laborKeywords.some(kw => lower.includes(kw))
}

/** Simple fuzzy match — find inventory item whose name includes the description words */
function findInventoryMatch(desc: string, items: any[]): any | null {
  const words = desc.toLowerCase().split(/\s+/).filter(w => w.length > 3)
  if (!words.length) return null

  let bestScore = 0
  let bestItem: any = null

  for (const item of items) {
    const itemLower = item.name.toLowerCase()
    const score = words.filter(w => itemLower.includes(w)).length
    if (score > bestScore && score >= Math.ceil(words.length * 0.5)) {
      bestScore = score
      bestItem = item
    }
  }

  return bestItem
}

/** Fallback category detection from description keywords */
function categorizeByKeyword(desc: string): string {
  const d = desc.toLowerCase()
  if (d.includes('regulator')) return 'regulators'
  if (d.includes('valve') || d.includes('cock') || d.includes('shutoff')) return 'valves'
  if (d.includes('pipe') || d.includes('fitting') || d.includes('elbow') ||
      d.includes('tee') || d.includes('nipple') || d.includes('union') ||
      d.includes('csst') || d.includes('flex') || d.includes('flare')) return 'pipe_fittings'
  if (d.includes('connector') || d.includes('hose')) return 'connectors'
  if (d.includes('thermocouple') || d.includes('ignitor') || d.includes('pilot') ||
      d.includes('burner') || d.includes('orifice') || d.includes('manifold')) return 'appliance_parts'
  if (d.includes('tank') || d.includes('cylinder') || d.includes('lp') ||
      d.includes('propane') || d.includes('pol') || d.includes('acme')) return 'lp_tank'
  if (d.includes('detector') || d.includes('co ') || d.includes('gauge') ||
      d.includes('manometer') || d.includes('test')) return 'safety'
  if (d.includes('tape') || d.includes('dope') || d.includes('sealant') ||
      d.includes('teflon') || d.includes('compound')) return 'consumables'
  return 'other'
}
