import { NextRequest, NextResponse } from 'next/server'
export const dynamic = 'force-dynamic'
import { createServerClient } from '@/lib/supabase'

// GET  /api/inventory                  → list all items
// GET  /api/inventory?id=uuid          → single item
// GET  /api/inventory?low_stock=true   → items below reorder point
// GET  /api/inventory?action=catalog   → pre-built industry catalog to import
// POST /api/inventory                  → create item
// POST /api/inventory?action=adjust    → adjust stock quantity
// POST /api/inventory?action=bulk      → bulk import from catalog
// PATCH /api/inventory                 → update item
// DELETE /api/inventory?id=uuid        → delete item

export async function GET(req: NextRequest) {
  const supabase = createServerClient()
  const action = req.nextUrl.searchParams.get('action')
  const id = req.nextUrl.searchParams.get('id')
  const lowStock = req.nextUrl.searchParams.get('low_stock')
  const category = req.nextUrl.searchParams.get('category')
  const search = req.nextUrl.searchParams.get('search')

  if (action === 'catalog') {
    return NextResponse.json(GAS_LP_CATALOG)
  }

  // ── AI price search — find cheapest sources for an item ─────
  if (action === 'price-search') {
    const itemId = req.nextUrl.searchParams.get('id')
    if (!itemId) return NextResponse.json({ error: 'id required' }, { status: 400 })
    const { data: item, error: e } = await supabase.from('inventory_items').select('*').eq('id', itemId).single()
    if (e || !item) return NextResponse.json({ error: 'Item not found' }, { status: 404 })
    return priceSearch(item)
  }

  if (id) {
    const { data, error } = await supabase.from('inventory_items').select('*').eq('id', id).single()
    if (error) return NextResponse.json({ error: error.message }, { status: 404 })
    return NextResponse.json(data)
  }

  let query = supabase
    .from('inventory_items')
    .select('*')
    .eq('is_active', true)
    .order('category')
    .order('name')

  if (category && category !== 'all') query = query.eq('category', category)
  if (lowStock === 'true') query = query.gt('reorder_point', 0)
  if (search) query = query.ilike('name', `%${search}%`)

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Flag low-stock items
  const enriched = (data || []).map(item => ({
    ...item,
    is_low_stock: item.reorder_point > 0 && item.quantity_on_hand <= item.reorder_point,
    is_out_of_stock: item.quantity_on_hand <= 0,
  }))

  if (lowStock === 'true') {
    return NextResponse.json(enriched.filter(i => i.is_low_stock || i.is_out_of_stock))
  }

  return NextResponse.json(enriched)
}

export async function POST(req: NextRequest) {
  const supabase = createServerClient()
  const action = req.nextUrl.searchParams.get('action')
  const body = await req.json()

  // ── Bulk import from catalog ───────────────────────────────
  if (action === 'bulk') {
    const items: any[] = body.items || []
    if (!items.length) return NextResponse.json({ error: 'No items provided' }, { status: 400 })
    const { data, error } = await supabase.from('inventory_items').insert(items).select()
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ imported: data?.length ?? 0, items: data })
  }

  // ── Adjust stock quantity ──────────────────────────────────
  if (action === 'adjust') {
    const { id, delta, transaction_type, notes, reference_type, reference_id } = body
    if (!id || delta === undefined) {
      return NextResponse.json({ error: 'id and delta required' }, { status: 400 })
    }

    // Get current qty
    const { data: current, error: fetchErr } = await supabase
      .from('inventory_items')
      .select('quantity_on_hand')
      .eq('id', id)
      .single()
    if (fetchErr || !current) return NextResponse.json({ error: 'Item not found' }, { status: 404 })

    const before = Number(current.quantity_on_hand)
    const after = Math.max(0, before + Number(delta))

    const { data: updated, error: updateErr } = await supabase
      .from('inventory_items')
      .update({ quantity_on_hand: after })
      .eq('id', id)
      .select()
      .single()
    if (updateErr) return NextResponse.json({ error: updateErr.message }, { status: 500 })

    // Log the transaction
    await supabase.from('inventory_transactions').insert({
      inventory_item_id: id,
      transaction_type: transaction_type || (delta > 0 ? 'received' : 'used'),
      quantity: Number(delta),
      quantity_before: before,
      quantity_after: after,
      reference_type: reference_type || 'manual',
      reference_id: reference_id || null,
      notes: notes || null,
    })

    return NextResponse.json(updated)
  }

  // ── Create new item ────────────────────────────────────────
  const { data, error } = await supabase
    .from('inventory_items')
    .insert({
      name: body.name,
      description: body.description || null,
      sku: body.sku || null,
      category: body.category || 'other',
      unit: body.unit || 'each',
      quantity_on_hand: body.quantity_on_hand ?? 0,
      reorder_point: body.reorder_point ?? 0,
      reorder_quantity: body.reorder_quantity ?? 0,
      unit_cost: body.unit_cost || null,
      supplier: body.supplier || null,
      supplier_part_number: body.supplier_part_number || null,
      gas_type: body.gas_type || 'both',
      notes: body.notes || null,
      tags: body.tags || [],
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Log initial stock if > 0
  if ((body.quantity_on_hand ?? 0) > 0) {
    await supabase.from('inventory_transactions').insert({
      inventory_item_id: data.id,
      transaction_type: 'received',
      quantity: body.quantity_on_hand,
      quantity_before: 0,
      quantity_after: body.quantity_on_hand,
      reference_type: 'manual',
      notes: 'Initial stock',
    })
  }

  return NextResponse.json(data, { status: 201 })
}

export async function PATCH(req: NextRequest) {
  const supabase = createServerClient()
  const body = await req.json()
  const { id, ...updates } = body
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })
  const { data, error } = await supabase
    .from('inventory_items')
    .update(updates)
    .eq('id', id)
    .select()
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function DELETE(req: NextRequest) {
  const supabase = createServerClient()
  const id = req.nextUrl.searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })
  // Soft-delete (preserve transaction history)
  await supabase.from('inventory_items').update({ is_active: false }).eq('id', id)
  return NextResponse.json({ success: true })
}

// ══════════════════════════════════════════════════════════════
// Pre-built catalog for residential construction / general contractors
// ══════════════════════════════════════════════════════════════
export const GAS_LP_CATALOG = [
  // ── Framing & Lumber ────────────────────────────────────────
  { category: 'framing', name: '2x4 x 8\' SPF Stud', unit: 'each', gas_type: 'both', reorder_point: 20 },
  { category: 'framing', name: '2x4 x 92-5/8" Pre-Cut Stud', unit: 'each', gas_type: 'both', reorder_point: 20 },
  { category: 'framing', name: '2x6 x 8\' SPF', unit: 'each', gas_type: 'both', reorder_point: 15 },
  { category: 'framing', name: '2x6 x 10\' SPF', unit: 'each', gas_type: 'both', reorder_point: 10 },
  { category: 'framing', name: '2x8 x 10\' SPF', unit: 'each', gas_type: 'both', reorder_point: 10 },
  { category: 'framing', name: '2x10 x 12\' SPF', unit: 'each', gas_type: 'both', reorder_point: 8 },
  { category: 'framing', name: '2x12 x 16\' SPF', unit: 'each', gas_type: 'both', reorder_point: 6 },
  { category: 'framing', name: '4x4 x 8\' Pressure Treated Post', unit: 'each', gas_type: 'both', reorder_point: 5 },
  { category: 'framing', name: 'LVL Beam 1-3/4" x 9-1/2" x 12\'', unit: 'each', gas_type: 'both', reorder_point: 2 },
  { category: 'framing', name: 'OSB Sheathing 7/16" 4x8', unit: 'sheet', gas_type: 'both', reorder_point: 10 },
  { category: 'framing', name: 'CDX Plywood 1/2" 4x8', unit: 'sheet', gas_type: 'both', reorder_point: 8 },
  { category: 'framing', name: 'CDX Plywood 3/4" 4x8', unit: 'sheet', gas_type: 'both', reorder_point: 5 },
  { category: 'framing', name: 'Subfloor T&G 3/4" 4x8', unit: 'sheet', gas_type: 'both', reorder_point: 6 },
  { category: 'framing', name: 'Joist Hanger 2x10', unit: 'each', gas_type: 'both', reorder_point: 20 },
  { category: 'framing', name: 'Joist Hanger 2x12', unit: 'each', gas_type: 'both', reorder_point: 20 },
  { category: 'framing', name: 'Hurricane Tie / Strap', unit: 'each', gas_type: 'both', reorder_point: 25 },
  // ── Fasteners ───────────────────────────────────────────────
  { category: 'fasteners', name: '16d Common Framing Nail (5lb)', unit: 'box', gas_type: 'both', reorder_point: 2 },
  { category: 'fasteners', name: '8d Common Sinker Nail (5lb)', unit: 'box', gas_type: 'both', reorder_point: 2 },
  { category: 'fasteners', name: 'Roofing Nail 1-1/4" (1lb)', unit: 'box', gas_type: 'both', reorder_point: 3 },
  { category: 'fasteners', name: 'Finish Nail 16ga 2-1/2" (Strip)', unit: 'box', gas_type: 'both', reorder_point: 2 },
  { category: 'fasteners', name: 'Brad Nail 18ga 2"', unit: 'box', gas_type: 'both', reorder_point: 2 },
  { category: 'fasteners', name: 'Deck Screw #8 x 2-1/2" (5lb)', unit: 'box', gas_type: 'both', reorder_point: 2 },
  { category: 'fasteners', name: 'Deck Screw #10 x 3" (5lb)', unit: 'box', gas_type: 'both', reorder_point: 2 },
  { category: 'fasteners', name: 'Drywall Screw #6 x 1-1/4" (5lb)', unit: 'box', gas_type: 'both', reorder_point: 2 },
  { category: 'fasteners', name: 'Drywall Screw #6 x 1-5/8" (5lb)', unit: 'box', gas_type: 'both', reorder_point: 2 },
  { category: 'fasteners', name: 'Wood Screw #8 x 1-1/4"', unit: 'box', gas_type: 'both', reorder_point: 2 },
  { category: 'fasteners', name: 'Lag Bolt 1/2" x 4"', unit: 'each', gas_type: 'both', reorder_point: 25 },
  { category: 'fasteners', name: 'Concrete Anchor 1/2" Wedge', unit: 'each', gas_type: 'both', reorder_point: 15 },
  { category: 'fasteners', name: 'Tapcon 3/16" x 2-3/4"', unit: 'box', gas_type: 'both', reorder_point: 2 },
  // ── Drywall & Insulation ────────────────────────────────────
  { category: 'drywall_insulation', name: 'Drywall 1/2" 4x8', unit: 'sheet', gas_type: 'both', reorder_point: 10 },
  { category: 'drywall_insulation', name: 'Drywall 1/2" 4x12', unit: 'sheet', gas_type: 'both', reorder_point: 8 },
  { category: 'drywall_insulation', name: 'Drywall 5/8" Type-X Fire Rated 4x8', unit: 'sheet', gas_type: 'both', reorder_point: 6 },
  { category: 'drywall_insulation', name: 'Moisture Resistant Drywall 1/2" 4x8 (Green Board)', unit: 'sheet', gas_type: 'both', reorder_point: 4 },
  { category: 'drywall_insulation', name: 'Joint Compound All-Purpose (5gal)', unit: 'each', gas_type: 'both', reorder_point: 2 },
  { category: 'drywall_insulation', name: 'Joint Compound Lightweight (4.5gal)', unit: 'each', gas_type: 'both', reorder_point: 2 },
  { category: 'drywall_insulation', name: 'Drywall Paper Tape 500ft Roll', unit: 'roll', gas_type: 'both', reorder_point: 3 },
  { category: 'drywall_insulation', name: 'Mesh Drywall Tape 300ft', unit: 'roll', gas_type: 'both', reorder_point: 3 },
  { category: 'drywall_insulation', name: 'Corner Bead Metal 1-1/4" x 8\'', unit: 'each', gas_type: 'both', reorder_point: 10 },
  { category: 'drywall_insulation', name: 'Fiberglass Batt R-13 (kraft faced)', unit: 'bag', gas_type: 'both', reorder_point: 5 },
  { category: 'drywall_insulation', name: 'Fiberglass Batt R-19 (kraft faced)', unit: 'bag', gas_type: 'both', reorder_point: 5 },
  { category: 'drywall_insulation', name: 'Fiberglass Batt R-30 (kraft faced)', unit: 'bag', gas_type: 'both', reorder_point: 4 },
  { category: 'drywall_insulation', name: 'Foam Board 1" x 4 x 8 (XPS)', unit: 'sheet', gas_type: 'both', reorder_point: 6 },
  { category: 'drywall_insulation', name: 'Foam Board 2" x 4 x 8 (XPS)', unit: 'sheet', gas_type: 'both', reorder_point: 4 },
  { category: 'drywall_insulation', name: 'Spray Foam Can (Great Stuff)', unit: 'each', gas_type: 'both', reorder_point: 6 },
  // ── Electrical ──────────────────────────────────────────────
  { category: 'electrical', name: '12-2 NM-B Romex Wire 250ft', unit: 'roll', gas_type: 'both', reorder_point: 2 },
  { category: 'electrical', name: '14-2 NM-B Romex Wire 250ft', unit: 'roll', gas_type: 'both', reorder_point: 2 },
  { category: 'electrical', name: '12-3 NM-B Romex Wire 250ft', unit: 'roll', gas_type: 'both', reorder_point: 1 },
  { category: 'electrical', name: 'Outlet Box Single Gang Plastic', unit: 'each', gas_type: 'both', reorder_point: 25 },
  { category: 'electrical', name: 'Outlet Box Double Gang Plastic', unit: 'each', gas_type: 'both', reorder_point: 15 },
  { category: 'electrical', name: 'Old Work Box Single Gang', unit: 'each', gas_type: 'both', reorder_point: 15 },
  { category: 'electrical', name: 'Ceiling Box 4" Round (1/2lb load)', unit: 'each', gas_type: 'both', reorder_point: 10 },
  { category: 'electrical', name: 'Tamper Resistant Receptacle 15A', unit: 'each', gas_type: 'both', reorder_point: 20 },
  { category: 'electrical', name: 'GFCI Receptacle 20A', unit: 'each', gas_type: 'both', reorder_point: 8 },
  { category: 'electrical', name: 'Decorator Switch Single Pole', unit: 'each', gas_type: 'both', reorder_point: 15 },
  { category: 'electrical', name: 'Decorator Switch 3-Way', unit: 'each', gas_type: 'both', reorder_point: 10 },
  { category: 'electrical', name: 'Dimmer Switch LED Compatible', unit: 'each', gas_type: 'both', reorder_point: 8 },
  { category: 'electrical', name: 'Wall Plate Single Gang (White)', unit: 'each', gas_type: 'both', reorder_point: 25 },
  { category: 'electrical', name: 'Wall Plate Double Gang (White)', unit: 'each', gas_type: 'both', reorder_point: 15 },
  { category: 'electrical', name: '15A Single Pole Breaker', unit: 'each', gas_type: 'both', reorder_point: 5 },
  { category: 'electrical', name: '20A Single Pole Breaker', unit: 'each', gas_type: 'both', reorder_point: 5 },
  { category: 'electrical', name: '30A Double Pole Breaker', unit: 'each', gas_type: 'both', reorder_point: 3 },
  { category: 'electrical', name: 'AFCI/GFCI Combo Breaker 20A', unit: 'each', gas_type: 'both', reorder_point: 3 },
  { category: 'electrical', name: 'Smoke Detector Hardwired w/ Battery Backup', unit: 'each', gas_type: 'both', reorder_point: 4 },
  { category: 'electrical', name: 'LED Recessed Light 6" Retrofit', unit: 'each', gas_type: 'both', reorder_point: 8 },
  // ── Plumbing ────────────────────────────────────────────────
  { category: 'plumbing', name: 'PEX-A 1/2" Red 100ft', unit: 'roll', gas_type: 'both', reorder_point: 1 },
  { category: 'plumbing', name: 'PEX-A 1/2" Blue 100ft', unit: 'roll', gas_type: 'both', reorder_point: 1 },
  { category: 'plumbing', name: 'PEX-A 3/4" Red 100ft', unit: 'roll', gas_type: 'both', reorder_point: 1 },
  { category: 'plumbing', name: 'PEX-A 3/4" Blue 100ft', unit: 'roll', gas_type: 'both', reorder_point: 1 },
  { category: 'plumbing', name: 'PEX Crimp Ring 1/2"', unit: 'each', gas_type: 'both', reorder_point: 50 },
  { category: 'plumbing', name: 'PEX Crimp Ring 3/4"', unit: 'each', gas_type: 'both', reorder_point: 50 },
  { category: 'plumbing', name: 'PEX Elbow 1/2" Brass', unit: 'each', gas_type: 'both', reorder_point: 20 },
  { category: 'plumbing', name: 'PEX Tee 1/2" Brass', unit: 'each', gas_type: 'both', reorder_point: 20 },
  { category: 'plumbing', name: 'SharkBite Push-Fit 1/2"', unit: 'each', gas_type: 'both', reorder_point: 10 },
  { category: 'plumbing', name: 'PVC Pipe 3" Schedule 40 (10ft)', unit: 'each', gas_type: 'both', reorder_point: 6 },
  { category: 'plumbing', name: 'PVC Pipe 4" Schedule 40 (10ft)', unit: 'each', gas_type: 'both', reorder_point: 5 },
  { category: 'plumbing', name: 'PVC Pipe 1-1/2" (10ft)', unit: 'each', gas_type: 'both', reorder_point: 6 },
  { category: 'plumbing', name: 'PVC 90° Elbow 3"', unit: 'each', gas_type: 'both', reorder_point: 10 },
  { category: 'plumbing', name: 'PVC Sanitary Tee 3"', unit: 'each', gas_type: 'both', reorder_point: 10 },
  { category: 'plumbing', name: 'PVC Cement Heavy Duty (16oz)', unit: 'each', gas_type: 'both', reorder_point: 3 },
  { category: 'plumbing', name: 'P-Trap 1-1/2" PVC', unit: 'each', gas_type: 'both', reorder_point: 6 },
  { category: 'plumbing', name: 'Toilet Supply Line 12" Braided', unit: 'each', gas_type: 'both', reorder_point: 6 },
  { category: 'plumbing', name: 'Angle Stop Valve 1/2" x 3/8"', unit: 'each', gas_type: 'both', reorder_point: 10 },
  { category: 'plumbing', name: 'Shut-Off Valve Full Port 3/4"', unit: 'each', gas_type: 'both', reorder_point: 5 },
  // ── Doors, Windows & Hardware ───────────────────────────────
  { category: 'doors_windows', name: 'Interior Pre-Hung Door 30" 6-Panel', unit: 'each', gas_type: 'both', reorder_point: 2 },
  { category: 'doors_windows', name: 'Interior Pre-Hung Door 32" 6-Panel', unit: 'each', gas_type: 'both', reorder_point: 2 },
  { category: 'doors_windows', name: 'Bifold Door 30" Louvered', unit: 'each', gas_type: 'both', reorder_point: 1 },
  { category: 'doors_windows', name: 'Door Knob Set Privacy (Bed/Bath)', unit: 'each', gas_type: 'both', reorder_point: 4 },
  { category: 'doors_windows', name: 'Door Knob Set Passage (Hall/Closet)', unit: 'each', gas_type: 'both', reorder_point: 4 },
  { category: 'doors_windows', name: 'Deadbolt Single Cylinder', unit: 'each', gas_type: 'both', reorder_point: 3 },
  { category: 'doors_windows', name: 'Door Hinge 3-1/2" (Pair)', unit: 'pair', gas_type: 'both', reorder_point: 6 },
  { category: 'doors_windows', name: 'Cabinet Hinge Soft-Close (Pair)', unit: 'pair', gas_type: 'both', reorder_point: 10 },
  { category: 'doors_windows', name: 'Window Single Hung 36x60 Vinyl', unit: 'each', gas_type: 'both', reorder_point: 1 },
  { category: 'doors_windows', name: 'Weatherstrip Door Foam Roll 17ft', unit: 'each', gas_type: 'both', reorder_point: 3 },
  // ── Roofing & Exterior ──────────────────────────────────────
  { category: 'roofing', name: 'Architectural Shingles (Bundle)', unit: 'bundle', gas_type: 'both', reorder_point: 10 },
  { category: 'roofing', name: 'Roof Underlayment 30# Felt (Roll)', unit: 'roll', gas_type: 'both', reorder_point: 3 },
  { category: 'roofing', name: 'Synthetic Roof Underlayment (Roll)', unit: 'roll', gas_type: 'both', reorder_point: 2 },
  { category: 'roofing', name: 'Ice & Water Shield 36" x 65ft', unit: 'roll', gas_type: 'both', reorder_point: 2 },
  { category: 'roofing', name: 'Drip Edge 10ft', unit: 'each', gas_type: 'both', reorder_point: 15 },
  { category: 'roofing', name: 'Step Flashing 8"x10" (Box)', unit: 'box', gas_type: 'both', reorder_point: 2 },
  { category: 'roofing', name: 'Ridge Vent 4ft', unit: 'each', gas_type: 'both', reorder_point: 6 },
  { category: 'roofing', name: 'Roof Cement (1gal)', unit: 'each', gas_type: 'both', reorder_point: 3 },
  // ── Siding & Trim ───────────────────────────────────────────
  { category: 'siding_trim', name: 'Hardie Plank 8-1/4" x 12\'', unit: 'each', gas_type: 'both', reorder_point: 20 },
  { category: 'siding_trim', name: 'Vinyl Siding D4 (Square)', unit: 'square', gas_type: 'both', reorder_point: 4 },
  { category: 'siding_trim', name: 'House Wrap (Tyvek/Equiv) 9ft x 100ft', unit: 'roll', gas_type: 'both', reorder_point: 2 },
  { category: 'siding_trim', name: 'Soffit Vented Vinyl 12ft', unit: 'each', gas_type: 'both', reorder_point: 10 },
  { category: 'siding_trim', name: 'Aluminum Fascia 6" x 10ft', unit: 'each', gas_type: 'both', reorder_point: 8 },
  { category: 'siding_trim', name: 'PVC Trim Board 1x4 x 12\'', unit: 'each', gas_type: 'both', reorder_point: 6 },
  { category: 'siding_trim', name: 'Baseboard MDF 3-1/4" x 16\'', unit: 'each', gas_type: 'both', reorder_point: 12 },
  { category: 'siding_trim', name: 'Door/Window Casing MDF 2-1/4" x 7\'', unit: 'each', gas_type: 'both', reorder_point: 15 },
  { category: 'siding_trim', name: 'Crown Molding 3-1/2" x 12\'', unit: 'each', gas_type: 'both', reorder_point: 6 },
  { category: 'siding_trim', name: 'Shoe Molding 1/2" x 8\'', unit: 'each', gas_type: 'both', reorder_point: 10 },
  // ── Paint & Finishes ────────────────────────────────────────
  { category: 'paint_finishes', name: 'Interior Latex Primer (5gal)', unit: 'each', gas_type: 'both', reorder_point: 2 },
  { category: 'paint_finishes', name: 'Interior Latex Paint Eggshell White (5gal)', unit: 'each', gas_type: 'both', reorder_point: 2 },
  { category: 'paint_finishes', name: 'Interior Latex Paint Semi-Gloss White (1gal)', unit: 'each', gas_type: 'both', reorder_point: 4 },
  { category: 'paint_finishes', name: 'Exterior Latex Paint (5gal)', unit: 'each', gas_type: 'both', reorder_point: 2 },
  { category: 'paint_finishes', name: 'Caulk Painter\'s Acrylic White (10oz)', unit: 'each', gas_type: 'both', reorder_point: 12 },
  { category: 'paint_finishes', name: 'Silicone Sealant Clear (10oz)', unit: 'each', gas_type: 'both', reorder_point: 8 },
  { category: 'paint_finishes', name: 'Wood Stain Oil-Based (1qt)', unit: 'each', gas_type: 'both', reorder_point: 3 },
  { category: 'paint_finishes', name: 'Polyurethane Semi-Gloss (1qt)', unit: 'each', gas_type: 'both', reorder_point: 3 },
  // ── Tile & Flooring ─────────────────────────────────────────
  { category: 'flooring', name: 'Thinset Mortar (50lb bag)', unit: 'bag', gas_type: 'both', reorder_point: 4 },
  { category: 'flooring', name: 'Grout Sanded (25lb)', unit: 'bag', gas_type: 'both', reorder_point: 3 },
  { category: 'flooring', name: 'Cement Board 1/2" 3x5', unit: 'sheet', gas_type: 'both', reorder_point: 8 },
  { category: 'flooring', name: 'Underlayment Foam 100sqft Roll', unit: 'roll', gas_type: 'both', reorder_point: 3 },
  { category: 'flooring', name: 'Transition Strip T-Mold 36"', unit: 'each', gas_type: 'both', reorder_point: 6 },
  { category: 'flooring', name: 'LVP Flooring (Box / ~24sqft)', unit: 'box', gas_type: 'both', reorder_point: 8 },
  // ── Concrete & Masonry ──────────────────────────────────────
  { category: 'concrete_masonry', name: 'Quikrete 80lb Bag', unit: 'bag', gas_type: 'both', reorder_point: 10 },
  { category: 'concrete_masonry', name: 'Sakrete High Strength 60lb', unit: 'bag', gas_type: 'both', reorder_point: 10 },
  { category: 'concrete_masonry', name: 'Rebar #4 (1/2") x 20ft', unit: 'each', gas_type: 'both', reorder_point: 10 },
  { category: 'concrete_masonry', name: '6x6 Wire Mesh 5x10', unit: 'sheet', gas_type: 'both', reorder_point: 4 },
  { category: 'concrete_masonry', name: 'Concrete Block 8x8x16', unit: 'each', gas_type: 'both', reorder_point: 50 },
  { category: 'concrete_masonry', name: 'Mortar Mix Type S 80lb', unit: 'bag', gas_type: 'both', reorder_point: 6 },
  // ── HVAC / Venting ──────────────────────────────────────────
  { category: 'hvac', name: 'Flex Duct R-6 6" x 25ft', unit: 'each', gas_type: 'both', reorder_point: 3 },
  { category: 'hvac', name: 'Flex Duct R-8 8" x 25ft', unit: 'each', gas_type: 'both', reorder_point: 3 },
  { category: 'hvac', name: 'Supply Register 4x10 (White)', unit: 'each', gas_type: 'both', reorder_point: 8 },
  { category: 'hvac', name: 'Return Air Grille 20x20', unit: 'each', gas_type: 'both', reorder_point: 4 },
  { category: 'hvac', name: 'Foil Tape UL181 (60yd)', unit: 'roll', gas_type: 'both', reorder_point: 3 },
  { category: 'hvac', name: 'Dryer Vent Hood 4" w/ Damper', unit: 'each', gas_type: 'both', reorder_point: 3 },
  { category: 'hvac', name: 'Bath Fan 80 CFM', unit: 'each', gas_type: 'both', reorder_point: 3 },
  // ── Safety & PPE ────────────────────────────────────────────
  { category: 'safety', name: 'Hard Hat ANSI Type 1', unit: 'each', gas_type: 'both', reorder_point: 2 },
  { category: 'safety', name: 'Safety Glasses Clear', unit: 'each', gas_type: 'both', reorder_point: 10 },
  { category: 'safety', name: 'N95 Respirator (Box of 10)', unit: 'box', gas_type: 'both', reorder_point: 3 },
  { category: 'safety', name: 'Nitrile Gloves L (Box of 100)', unit: 'box', gas_type: 'both', reorder_point: 4 },
  { category: 'safety', name: 'Work Gloves Leather L', unit: 'pair', gas_type: 'both', reorder_point: 6 },
  { category: 'safety', name: 'Knee Pads Heavy Duty', unit: 'pair', gas_type: 'both', reorder_point: 2 },
  { category: 'safety', name: 'First Aid Kit OSHA Compliant', unit: 'each', gas_type: 'both', reorder_point: 1 },
  { category: 'safety', name: 'Ear Plugs (Box of 200)', unit: 'box', gas_type: 'both', reorder_point: 2 },
  // ── Consumables ─────────────────────────────────────────────
  { category: 'consumables', name: 'Painter\'s Tape Blue 1.88" x 60yd', unit: 'roll', gas_type: 'both', reorder_point: 6 },
  { category: 'consumables', name: 'Masking Tape Cream 1" x 60yd', unit: 'roll', gas_type: 'both', reorder_point: 6 },
  { category: 'consumables', name: 'Plastic Sheeting 10x100 4mil', unit: 'roll', gas_type: 'both', reorder_point: 2 },
  { category: 'consumables', name: 'Drop Cloth 9x12 Canvas', unit: 'each', gas_type: 'both', reorder_point: 4 },
  { category: 'consumables', name: 'Construction Adhesive PL Premium (10oz)', unit: 'each', gas_type: 'both', reorder_point: 8 },
  { category: 'consumables', name: 'Wood Glue Titebond III (16oz)', unit: 'each', gas_type: 'both', reorder_point: 3 },
  { category: 'consumables', name: 'Shop Towels (Roll)', unit: 'roll', gas_type: 'both', reorder_point: 6 },
  { category: 'consumables', name: 'Contractor Trash Bags 42gal (20pk)', unit: 'box', gas_type: 'both', reorder_point: 3 },
  { category: 'consumables', name: 'Sanding Sheets 120-grit (Pack)', unit: 'pack', gas_type: 'both', reorder_point: 4 },
  { category: 'consumables', name: 'Utility Knife Blades (100pk)', unit: 'box', gas_type: 'both', reorder_point: 2 },
  { category: 'consumables', name: 'Pencils Carpenter (12pk)', unit: 'pack', gas_type: 'both', reorder_point: 3 },
  { category: 'consumables', name: 'Chalk Line Refill (8oz)', unit: 'each', gas_type: 'both', reorder_point: 2 },
  // ── Tools ───────────────────────────────────────────────────
  { category: 'tools', name: 'Tape Measure 25ft', unit: 'each', gas_type: 'both', reorder_point: 4 },
  { category: 'tools', name: 'Hammer 22oz Framing', unit: 'each', gas_type: 'both', reorder_point: 2 },
  { category: 'tools', name: 'Speed Square 7"', unit: 'each', gas_type: 'both', reorder_point: 2 },
  { category: 'tools', name: 'Utility Knife Retractable', unit: 'each', gas_type: 'both', reorder_point: 4 },
  { category: 'tools', name: 'Level 4ft', unit: 'each', gas_type: 'both', reorder_point: 1 },
  { category: 'tools', name: 'Level 2ft Torpedo', unit: 'each', gas_type: 'both', reorder_point: 2 },
  { category: 'tools', name: 'Circular Saw Blade 7-1/4" 24T Framing', unit: 'each', gas_type: 'both', reorder_point: 3 },
  { category: 'tools', name: 'Reciprocating Saw Blade Wood/Nail (5pk)', unit: 'pack', gas_type: 'both', reorder_point: 2 },
  { category: 'tools', name: 'Drill Bit Set Twist 1/16"-1/2"', unit: 'each', gas_type: 'both', reorder_point: 1 },
  { category: 'tools', name: 'Spade Bit Set 1/4"-1-1/2"', unit: 'each', gas_type: 'both', reorder_point: 1 },
  { category: 'tools', name: 'Hole Saw 2-1/8" (Door Knob)', unit: 'each', gas_type: 'both', reorder_point: 2 },
  { category: 'tools', name: 'Caulk Gun Heavy Duty', unit: 'each', gas_type: 'both', reorder_point: 2 },
  { category: 'tools', name: 'Drywall Knife 6"', unit: 'each', gas_type: 'both', reorder_point: 2 },
  { category: 'tools', name: 'Drywall Knife 12"', unit: 'each', gas_type: 'both', reorder_point: 2 },
  { category: 'tools', name: 'Putty Knife 1-1/2"', unit: 'each', gas_type: 'both', reorder_point: 3 },
]

// ══════════════════════════════════════════════════════════════
// AI price search — finds the cheapest sources for an inventory
// item using Claude with web search.
// ══════════════════════════════════════════════════════════════
async function priceSearch(item: any) {
  try {
    return await priceSearchInner(item)
  } catch (err: any) {
    // Last-resort catch — make absolutely sure we return JSON, not an HTML error page
    return NextResponse.json({ error: err?.message || 'Price search failed', stack: err?.stack?.slice(0, 500) }, { status: 500 })
  }
}

async function priceSearchInner(item: any) {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey || apiKey === 'build-placeholder') {
    return NextResponse.json({ error: 'Anthropic API key not configured — set ANTHROPIC_API_KEY in your environment' }, { status: 503 })
  }

  const itemDesc = [
    item.name,
    item.description ? `(${item.description})` : '',
    item.sku ? `SKU: ${item.sku}` : '',
    item.supplier_part_number ? `Part #: ${item.supplier_part_number}` : '',
  ].filter(Boolean).join(' ')

  const prompt = `You are a sourcing agent for a GAS appliance / LP gas contractor in Florida.
This is for NATURAL GAS and PROPANE installations — NOT water plumbing.

⚠️ CRITICAL: Only return products rated for GAS service. STRICTLY EXCLUDE:
  • PVC, CPVC, or plastic anything (illegal for gas in most jurisdictions)
  • Water shut-off valves, water hammer arrestors, water pressure regulators
  • Compression fittings not rated for gas
  • Anything labeled "water only", "for water lines", "potable water"
  • Sharkbite / push-to-connect fittings unless explicitly gas-rated

✅ ONLY INCLUDE products that are clearly gas-rated. Look for these markers:
  • "Gas ball valve", "gas-rated", "CSA-certified", "ANSI Z21.15", "UL listed for gas"
  • Brass with full-port for gas, forged steel, black iron, malleable iron
  • CSST (TracPipe, Gastite, HomeFlex), gas flex connectors
  • Yellow-handled ball valves (industry standard for gas service)
  • Pipe dope/sealant rated for gas (NOT teflon tape unless yellow gas-rated)
  • Brands known for gas: Apollo (gas line), Jomar, Matco-Norca gas, BrassCraft gas

Find the CHEAPEST current online prices for this GAS-rated item:
"${itemDesc}"
Category: ${item.category}
Unit: ${item.unit}
Gas type: ${item.gas_type}

Search 2-3 of these retailers (pick the most likely for gas products): SupplyHouse (best for gas), Ferguson, Grainger, Home Depot, Amazon. Use search terms like "gas ball valve", "CSA gas", "natural gas line" — NOT just "ball valve" which returns water products.

Return ONLY a valid JSON object (no markdown, no extra text) in this exact shape:
{
  "item_name": "${item.name}",
  "search_summary": "One sentence about what you found — confirm products are gas-rated",
  "results": [
    {
      "supplier": "Retailer name",
      "product_name": "Exact product title from the listing",
      "price": 12.99,
      "unit": "each | pack of 10 | etc.",
      "url": "Direct product URL",
      "in_stock": true,
      "gas_rated": true,
      "notes": "Mention CSA/UL gas certification, material (brass/steel), and any minimum order"
    }
  ],
  "cheapest_supplier": "Name of the lowest-priced GAS-rated supplier",
  "cheapest_price": 9.99,
  "cheapest_url": "URL of the cheapest gas-rated option"
}

Sort "results" from cheapest to most expensive. Include 3-6 results when possible. If you can only find water-rated products and no gas-rated equivalent, return results: [] and explain in search_summary why no gas-rated options were found. NEVER return a water product as a result.`

  // Aggressive 45s timeout — must finish well before any upstream LB/ingress
  // timeout (nginx default is 60s) so the user gets a useful JSON error rather
  // than an HTML 504 page.
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 45000)

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        // Sonnet is ~3x faster than Opus and plenty smart for this task.
        model: 'claude-sonnet-4-5',
        max_tokens: 2500,
        // 3 searches is enough to hit the major retailers and stay under the
        // ingress timeout. Bumping this back up requires increasing the LB
        // timeout or moving the search to a background job.
        tools: [{ type: 'web_search_20250305', name: 'web_search', max_uses: 3 }],
        messages: [{ role: 'user', content: prompt }],
      }),
    })
    clearTimeout(timeout)

    if (!response.ok) {
      const err = await response.text()
      return NextResponse.json({ error: `AI API error (${response.status}): ${err}` }, { status: 500 })
    }

    const aiData = await response.json()
    // The model returns a sequence of content blocks; find the final text block
    const textBlocks = (aiData.content || []).filter((b: any) => b.type === 'text')
    const text = textBlocks.map((b: any) => b.text).join('\n')

    const jsonMatch = text.match(/\{[\s\S]*\}/)
    if (!jsonMatch) return NextResponse.json({ error: 'Could not parse AI response', raw: text }, { status: 500 })

    const parsed = JSON.parse(jsonMatch[0])
    return NextResponse.json({ ...parsed, ai_searched: true })
  } catch (err: any) {
    clearTimeout(timeout)
    if (err.name === 'AbortError') {
      return NextResponse.json({ error: 'AI search timed out after 60 seconds' }, { status: 504 })
    }
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
