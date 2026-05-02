import { NextRequest, NextResponse } from 'next/server'
export const dynamic = 'force-dynamic'
import { createServerClient } from '@/lib/supabase'

// GET    /api/materials-lists                     → list all (most recent first)
// GET    /api/materials-lists?id=uuid             → single list with items
// GET    /api/materials-lists?worksite_id=uuid   → lists for a worksite
// POST   /api/materials-lists                     → create new list
// POST   /api/materials-lists?action=add-item     → add item to list
// PATCH  /api/materials-lists                     → update list metadata
// PATCH  /api/materials-lists?action=item         → update an item
// DELETE /api/materials-lists?id=uuid             → delete list (cascades items)
// DELETE /api/materials-lists?item_id=uuid        → delete one item

export async function GET(req: NextRequest) {
  const supabase = createServerClient()
  const id = req.nextUrl.searchParams.get('id')
  const worksiteId = req.nextUrl.searchParams.get('worksite_id')
  const status = req.nextUrl.searchParams.get('status')

  if (id) {
    const { data: list, error } = await supabase
      .from('materials_lists')
      .select('*')
      .eq('id', id)
      .single()
    if (error) return NextResponse.json({ error: error.message }, { status: 404 })

    const { data: items } = await supabase
      .from('materials_list_items')
      .select('*, inventory_item:inventory_items(id, name, category, unit, unit_cost, quantity_on_hand)')
      .eq('list_id', id)
      .order('created_at', { ascending: true })

    return NextResponse.json({ ...list, items: items || [] })
  }

  let query = supabase
    .from('materials_lists')
    .select('*, items:materials_list_items(count)')
    .order('scheduled_date', { ascending: false, nullsFirst: false })
    .order('created_at', { ascending: false })

  if (worksiteId) query = query.eq('worksite_id', worksiteId)
  if (status) query = query.eq('status', status)

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data || [])
}

export async function POST(req: NextRequest) {
  const supabase = createServerClient()
  const action = req.nextUrl.searchParams.get('action')

  // ── Sync from calendar ─────────────────────────────────────
  // Scans appointments with notes (last 12 months), creates one materials_list
  // per appointment (named with the address), and parses materials out of the
  // notes. Skips appointments that already have a list synced.
  if (action === 'sync-calendar') {
    const cutoff = new Date()
    cutoff.setMonth(cutoff.getMonth() - 12)

    const { data: appointments } = await supabase
      .from('appointments')
      .select('id, customer_name, service_address, service_type, notes, start_time, contact_id')
      .not('notes', 'is', null)
      .gte('start_time', cutoff.toISOString())
      .order('start_time', { ascending: false })
      .limit(500)

    if (!appointments?.length) {
      return NextResponse.json({ lists_created: 0, items_added: 0, appointments_scanned: 0 })
    }

    // Inventory catalog for matching item names
    const { data: inventoryItems } = await supabase
      .from('inventory_items')
      .select('id, name, category, unit, unit_cost')
      .eq('is_active', true)

    // Already-synced appointment IDs (so we don't double-create)
    const { data: existingLists } = await supabase
      .from('materials_lists')
      .select('id, appointment_id')
      .not('appointment_id', 'is', null)
    const existingApptIds = new Set((existingLists || []).map((l: any) => l.appointment_id))

    let listsCreated = 0
    let itemsAdded = 0

    for (const appt of appointments) {
      if (existingApptIds.has(appt.id)) continue
      if (!appt.notes || appt.notes.length < 5) continue

      const dateUsed = appt.start_time?.split('T')[0] || null
      const address = appt.service_address || 'Unknown address'

      // Create the list named with the address
      const { data: newList, error: listErr } = await supabase
        .from('materials_lists')
        .insert({
          name: address,
          property_address: appt.service_address || null,
          customer_name: appt.customer_name || null,
          contact_id: appt.contact_id || null,
          service_type: appt.service_type || null,
          scheduled_date: dateUsed,
          appointment_id: appt.id,
          status: 'draft',
          notes: 'Auto-synced from calendar appointment',
        })
        .select('id')
        .single()

      if (listErr || !newList) continue
      listsCreated++

      // Extract items from notes — same logic as property-materials sync
      const notesLower = (appt.notes as string).toLowerCase()
      const seenItemIds = new Set<string>()

      // Strategy 1: any inventory item name found in the notes
      for (const item of inventoryItems || []) {
        const nameLower = (item.name || '').toLowerCase()
        if (nameLower.length < 4) continue
        if (!notesLower.includes(nameLower)) continue
        if (seenItemIds.has(item.id)) continue

        const quantity = extractQuantityNear(notesLower, nameLower)
        await supabase.from('materials_list_items').insert({
          list_id: newList.id,
          inventory_item_id: item.id,
          item_name: item.name,
          category: item.category,
          unit: item.unit,
          quantity_needed: quantity,
          unit_cost: item.unit_cost || null,
        })
        seenItemIds.add(item.id)
        itemsAdded++
      }

      // Strategy 2: structured "Used: x, y, z" lines
      const matLineRe = /(?:used|installed|materials?|parts?|supplies?)\s*[:=-]\s*([^\n]+)/gi
      let m: RegExpExecArray | null
      while ((m = matLineRe.exec(appt.notes)) !== null) {
        const line = m[1].trim()
        const tokens = line.split(/[,;]/).map(s => s.trim()).filter(Boolean)
        for (const tok of tokens) {
          const lower = tok.toLowerCase()
          if (lower.length < 3) continue
          if (/(labor|service call|trip|travel|hourly|emergency fee)/i.test(lower)) continue

          const qm = lower.match(/^(\d+(?:\.\d+)?)\s+(.+)/)
          const qty = qm ? Number(qm[1]) : 1
          const desc = qm ? qm[2] : lower

          // Match to an inventory item if possible
          const words = desc.split(/\s+/).filter(w => w.length > 3)
          let matched: any = null
          let bestScore = 0
          for (const inv of inventoryItems || []) {
            const invLower = (inv.name || '').toLowerCase()
            const score = words.filter(w => invLower.includes(w)).length
            if (score > bestScore && score >= Math.ceil(words.length * 0.5)) {
              bestScore = score
              matched = inv
            }
          }
          if (matched && seenItemIds.has(matched.id)) continue

          await supabase.from('materials_list_items').insert({
            list_id: newList.id,
            inventory_item_id: matched?.id || null,
            item_name: matched?.name || desc,
            category: matched?.category || null,
            unit: matched?.unit || 'each',
            quantity_needed: qty,
            unit_cost: matched?.unit_cost || null,
          })
          if (matched) seenItemIds.add(matched.id)
          itemsAdded++
        }
      }
    }

    return NextResponse.json({
      lists_created: listsCreated,
      items_added: itemsAdded,
      appointments_scanned: appointments.length,
    })
  }

  const body = await req.json()

  if (action === 'add-item') {
    const { list_id, inventory_item_id, item_name, category, unit, quantity_needed, unit_cost, supplier, notes } = body
    if (!list_id) return NextResponse.json({ error: 'list_id required' }, { status: 400 })
    if (!item_name) return NextResponse.json({ error: 'item_name required' }, { status: 400 })

    const { data, error } = await supabase
      .from('materials_list_items')
      .insert({
        list_id,
        inventory_item_id: inventory_item_id || null,
        item_name,
        category: category || null,
        unit: unit || 'each',
        quantity_needed: quantity_needed ?? 1,
        unit_cost: unit_cost || null,
        supplier: supplier || null,
        notes: notes || null,
      })
      .select()
      .single()

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json(data, { status: 201 })
  }

  // Create a new list
  if (!body.name) return NextResponse.json({ error: 'name required' }, { status: 400 })

  const { data, error } = await supabase
    .from('materials_lists')
    .insert({
      name: body.name,
      worksite_id: body.worksite_id || null,
      property_address: body.property_address || null,
      customer_name: body.customer_name || null,
      contact_id: body.contact_id || null,
      service_type: body.service_type || null,
      scheduled_date: body.scheduled_date || null,
      appointment_id: body.appointment_id || null,
      status: body.status || 'draft',
      notes: body.notes || null,
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data, { status: 201 })
}

export async function PATCH(req: NextRequest) {
  const supabase = createServerClient()
  const action = req.nextUrl.searchParams.get('action')
  const body = await req.json()

  if (action === 'item') {
    const { id, items, inventory_item, ...updates } = body
    if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })
    const { data, error } = await supabase
      .from('materials_list_items')
      .update(updates)
      .eq('id', id)
      .select()
      .single()
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json(data)
  }

  // Update list metadata
  const { id, items, ...updates } = body
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })
  const { data, error } = await supabase
    .from('materials_lists')
    .update(updates)
    .eq('id', id)
    .select()
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

/** Look 0-20 chars before/after the item name for a quantity number */
function extractQuantityNear(notesLower: string, nameLower: string): number {
  const idx = notesLower.indexOf(nameLower)
  if (idx < 0) return 1
  const window = notesLower.slice(Math.max(0, idx - 20), Math.min(notesLower.length, idx + nameLower.length + 20))
  const m = window.match(/(\d+(?:\.\d+)?)\s*(?:x\s*)?/)
  if (!m) return 1
  const q = Number(m[1])
  if (q > 100 || q < 1) return 1
  return q
}

export async function DELETE(req: NextRequest) {
  const supabase = createServerClient()
  const id = req.nextUrl.searchParams.get('id')
  const itemId = req.nextUrl.searchParams.get('item_id')

  if (itemId) {
    const { error } = await supabase.from('materials_list_items').delete().eq('id', itemId)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ success: true })
  }

  if (!id) return NextResponse.json({ error: 'id or item_id required' }, { status: 400 })
  const { error } = await supabase.from('materials_lists').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
