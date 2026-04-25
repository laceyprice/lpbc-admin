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
// Pre-built catalog for natural gas & liquid propane service companies
// ══════════════════════════════════════════════════════════════
export const GAS_LP_CATALOG = [
  // ── Regulators ──────────────────────────────────────────────
  { category: 'regulators', name: 'First Stage Regulator (High Pressure)', unit: 'each', gas_type: 'propane', reorder_point: 2 },
  { category: 'regulators', name: 'Second Stage Regulator (Low Pressure)', unit: 'each', gas_type: 'propane', reorder_point: 2 },
  { category: 'regulators', name: 'Integral Two-Stage Regulator', unit: 'each', gas_type: 'propane', reorder_point: 2 },
  { category: 'regulators', name: 'Auto-Changeover Regulator', unit: 'each', gas_type: 'propane', reorder_point: 1 },
  { category: 'regulators', name: 'Line Pressure Regulator 1/2"', unit: 'each', gas_type: 'both', reorder_point: 2 },
  { category: 'regulators', name: 'Appliance Regulator', unit: 'each', gas_type: 'both', reorder_point: 2 },
  { category: 'regulators', name: 'High Pressure Hose & Regulator Combo', unit: 'each', gas_type: 'propane', reorder_point: 1 },
  // ── Valves ──────────────────────────────────────────────────
  { category: 'valves', name: 'Ball Valve 1/4"', unit: 'each', gas_type: 'both', reorder_point: 5 },
  { category: 'valves', name: 'Ball Valve 1/2"', unit: 'each', gas_type: 'both', reorder_point: 5 },
  { category: 'valves', name: 'Ball Valve 3/4"', unit: 'each', gas_type: 'both', reorder_point: 5 },
  { category: 'valves', name: 'Ball Valve 1"', unit: 'each', gas_type: 'both', reorder_point: 3 },
  { category: 'valves', name: 'Ball Valve 1-1/4"', unit: 'each', gas_type: 'both', reorder_point: 2 },
  { category: 'valves', name: 'Gas Cock / Plug Valve 1/2"', unit: 'each', gas_type: 'both', reorder_point: 3 },
  { category: 'valves', name: 'Gas Cock / Plug Valve 3/4"', unit: 'each', gas_type: 'both', reorder_point: 3 },
  { category: 'valves', name: 'Excess Flow Valve 1/2"', unit: 'each', gas_type: 'both', reorder_point: 3 },
  { category: 'valves', name: 'Excess Flow Valve 3/4"', unit: 'each', gas_type: 'both', reorder_point: 3 },
  { category: 'valves', name: 'Emergency Shut-Off Valve', unit: 'each', gas_type: 'both', reorder_point: 2 },
  { category: 'valves', name: 'Solenoid Gas Valve 24V', unit: 'each', gas_type: 'both', reorder_point: 2 },
  { category: 'valves', name: 'POL Valve (Tank Service Valve)', unit: 'each', gas_type: 'propane', reorder_point: 2 },
  { category: 'valves', name: 'Vapor Service Valve', unit: 'each', gas_type: 'propane', reorder_point: 2 },
  // ── Pipe & Fittings ─────────────────────────────────────────
  { category: 'pipe_fittings', name: 'CSST 1/2" (TracPipe / OmegaFlex)', unit: 'ft', gas_type: 'both', reorder_point: 25 },
  { category: 'pipe_fittings', name: 'CSST 3/4"', unit: 'ft', gas_type: 'both', reorder_point: 25 },
  { category: 'pipe_fittings', name: 'CSST 1"', unit: 'ft', gas_type: 'both', reorder_point: 10 },
  { category: 'pipe_fittings', name: 'Black Iron Pipe 1/2" (per ft)', unit: 'ft', gas_type: 'both', reorder_point: 20 },
  { category: 'pipe_fittings', name: 'Black Iron Pipe 3/4" (per ft)', unit: 'ft', gas_type: 'both', reorder_point: 20 },
  { category: 'pipe_fittings', name: 'Black Iron Pipe 1" (per ft)', unit: 'ft', gas_type: 'both', reorder_point: 10 },
  { category: 'pipe_fittings', name: 'Black Iron 90° Elbow 1/2"', unit: 'each', gas_type: 'both', reorder_point: 10 },
  { category: 'pipe_fittings', name: 'Black Iron 90° Elbow 3/4"', unit: 'each', gas_type: 'both', reorder_point: 10 },
  { category: 'pipe_fittings', name: 'Black Iron Tee 1/2"', unit: 'each', gas_type: 'both', reorder_point: 10 },
  { category: 'pipe_fittings', name: 'Black Iron Tee 3/4"', unit: 'each', gas_type: 'both', reorder_point: 10 },
  { category: 'pipe_fittings', name: 'Black Iron Union 1/2"', unit: 'each', gas_type: 'both', reorder_point: 5 },
  { category: 'pipe_fittings', name: 'Black Iron Union 3/4"', unit: 'each', gas_type: 'both', reorder_point: 5 },
  { category: 'pipe_fittings', name: 'Black Iron Nipple 1/2" x 2"', unit: 'each', gas_type: 'both', reorder_point: 10 },
  { category: 'pipe_fittings', name: 'Black Iron Nipple 1/2" x 6"', unit: 'each', gas_type: 'both', reorder_point: 10 },
  { category: 'pipe_fittings', name: 'Black Iron Nipple 3/4" x 6"', unit: 'each', gas_type: 'both', reorder_point: 5 },
  { category: 'pipe_fittings', name: 'Flared Fitting 1/2" Nut & Sleeve', unit: 'each', gas_type: 'both', reorder_point: 10 },
  { category: 'pipe_fittings', name: 'Flared Fitting 3/4" Nut & Sleeve', unit: 'each', gas_type: 'both', reorder_point: 5 },
  { category: 'pipe_fittings', name: 'CSST Fitting Kit 1/2"', unit: 'each', gas_type: 'both', reorder_point: 5 },
  { category: 'pipe_fittings', name: 'CSST Fitting Kit 3/4"', unit: 'each', gas_type: 'both', reorder_point: 5 },
  { category: 'pipe_fittings', name: 'Sediment Trap / Drip Leg 1/2"', unit: 'each', gas_type: 'both', reorder_point: 5 },
  { category: 'pipe_fittings', name: 'Sediment Trap / Drip Leg 3/4"', unit: 'each', gas_type: 'both', reorder_point: 5 },
  // ── Connectors & Hose ───────────────────────────────────────
  { category: 'connectors', name: 'Gas Appliance Connector 1/2" x 24"', unit: 'each', gas_type: 'both', reorder_point: 5 },
  { category: 'connectors', name: 'Gas Appliance Connector 1/2" x 48"', unit: 'each', gas_type: 'both', reorder_point: 5 },
  { category: 'connectors', name: 'Gas Range Connector 3/4" x 48"', unit: 'each', gas_type: 'both', reorder_point: 3 },
  { category: 'connectors', name: 'Gas Dryer Connector 1/2" x 60"', unit: 'each', gas_type: 'both', reorder_point: 3 },
  { category: 'connectors', name: 'Flexible Gas Connector 3/4" x 24" (Water Heater)', unit: 'each', gas_type: 'both', reorder_point: 3 },
  { category: 'connectors', name: 'LP High Pressure Hose 1/4" x 12"', unit: 'each', gas_type: 'propane', reorder_point: 3 },
  { category: 'connectors', name: 'LP High Pressure Hose 1/4" x 24"', unit: 'each', gas_type: 'propane', reorder_point: 3 },
  { category: 'connectors', name: 'ACME Adapter (ACME to POL)', unit: 'each', gas_type: 'propane', reorder_point: 3 },
  { category: 'connectors', name: 'Quick Connect Fitting 1/2"', unit: 'each', gas_type: 'both', reorder_point: 3 },
  // ── LP / Tank Components ────────────────────────────────────
  { category: 'lp_tank', name: 'LP Tank Gauge (Dial)', unit: 'each', gas_type: 'propane', reorder_point: 2 },
  { category: 'lp_tank', name: 'LP Tank Gauge (Float)', unit: 'each', gas_type: 'propane', reorder_point: 2 },
  { category: 'lp_tank', name: 'Multivalve (Forklift Cylinder)', unit: 'each', gas_type: 'propane', reorder_point: 2 },
  { category: 'lp_tank', name: 'LP Relief Valve', unit: 'each', gas_type: 'propane', reorder_point: 2 },
  { category: 'lp_tank', name: 'Liquid Withdrawal Valve', unit: 'each', gas_type: 'propane', reorder_point: 2 },
  { category: 'lp_tank', name: 'Fixed Liquid Level Gauge (Bleeder Valve)', unit: 'each', gas_type: 'propane', reorder_point: 3 },
  { category: 'lp_tank', name: 'LP Fill Valve (Female Acme)', unit: 'each', gas_type: 'propane', reorder_point: 2 },
  { category: 'lp_tank', name: 'Tank Foot Ring / Anode', unit: 'each', gas_type: 'propane', reorder_point: 2 },
  // ── Appliance Parts ─────────────────────────────────────────
  { category: 'appliance_parts', name: 'Thermocouple Universal 24"', unit: 'each', gas_type: 'both', reorder_point: 5 },
  { category: 'appliance_parts', name: 'Thermocouple Universal 30"', unit: 'each', gas_type: 'both', reorder_point: 5 },
  { category: 'appliance_parts', name: 'Thermopile 750mV', unit: 'each', gas_type: 'both', reorder_point: 3 },
  { category: 'appliance_parts', name: 'Piezo Ignitor Assembly', unit: 'each', gas_type: 'both', reorder_point: 3 },
  { category: 'appliance_parts', name: 'Hot Surface Ignitor (Universal)', unit: 'each', gas_type: 'both', reorder_point: 3 },
  { category: 'appliance_parts', name: 'Spark Electrode & Wire Kit', unit: 'each', gas_type: 'both', reorder_point: 3 },
  { category: 'appliance_parts', name: 'Gas Control Valve (Water Heater)', unit: 'each', gas_type: 'both', reorder_point: 2 },
  { category: 'appliance_parts', name: 'Pilot Assembly (Universal)', unit: 'each', gas_type: 'both', reorder_point: 3 },
  { category: 'appliance_parts', name: 'Pressure Switch', unit: 'each', gas_type: 'both', reorder_point: 3 },
  { category: 'appliance_parts', name: 'Manifold (Furnace/Boiler)', unit: 'each', gas_type: 'both', reorder_point: 2 },
  { category: 'appliance_parts', name: 'Burner Orifice NG #45', unit: 'each', gas_type: 'natural_gas', reorder_point: 5 },
  { category: 'appliance_parts', name: 'Burner Orifice LP #54', unit: 'each', gas_type: 'propane', reorder_point: 5 },
  { category: 'appliance_parts', name: 'Venturi Burner Assembly', unit: 'each', gas_type: 'both', reorder_point: 2 },
  { category: 'appliance_parts', name: 'Conversion Kit NG to LP', unit: 'kit', gas_type: 'propane', reorder_point: 2 },
  { category: 'appliance_parts', name: 'Conversion Kit LP to NG', unit: 'kit', gas_type: 'natural_gas', reorder_point: 2 },
  { category: 'appliance_parts', name: 'Draft Hood / Diverter', unit: 'each', gas_type: 'both', reorder_point: 2 },
  // ── Safety & Testing ────────────────────────────────────────
  { category: 'safety', name: 'Carbon Monoxide Detector (Battery)', unit: 'each', gas_type: 'both', reorder_point: 3 },
  { category: 'safety', name: 'Carbon Monoxide Detector (Plug-In)', unit: 'each', gas_type: 'both', reorder_point: 3 },
  { category: 'safety', name: 'Combustible Gas Leak Detector (Electronic)', unit: 'each', gas_type: 'both', reorder_point: 1 },
  { category: 'safety', name: 'Pressure Test Gauge 0-15 PSI', unit: 'each', gas_type: 'both', reorder_point: 1 },
  { category: 'safety', name: 'Manometer (Magnehelic / Digital)', unit: 'each', gas_type: 'both', reorder_point: 1 },
  { category: 'safety', name: 'Test Nipple 1/8" NPT', unit: 'each', gas_type: 'both', reorder_point: 10 },
  // ── Consumables ─────────────────────────────────────────────
  { category: 'consumables', name: 'Pipe Thread Sealant / Pipe Dope (Gas Rated)', unit: 'each', gas_type: 'both', reorder_point: 2 },
  { category: 'consumables', name: 'PTFE Teflon Tape - Yellow (Gas Rated)', unit: 'roll', gas_type: 'both', reorder_point: 5 },
  { category: 'consumables', name: 'Leak Detection Spray / Bubble Solution', unit: 'each', gas_type: 'both', reorder_point: 3 },
  { category: 'consumables', name: 'Wire Nuts (Assorted)', unit: 'box', gas_type: 'both', reorder_point: 1 },
  { category: 'consumables', name: 'Electrical Tape', unit: 'roll', gas_type: 'both', reorder_point: 2 },
  { category: 'consumables', name: 'Stainless Steel Hose Clamps (Assorted)', unit: 'box', gas_type: 'both', reorder_point: 1 },
  { category: 'consumables', name: 'Pipe Thread Compound Brush-Top', unit: 'each', gas_type: 'both', reorder_point: 2 },
  { category: 'consumables', name: 'Sandpaper / Emery Cloth', unit: 'each', gas_type: 'both', reorder_point: 2 },
  { category: 'consumables', name: 'Silicone High-Temp RTV Sealant', unit: 'each', gas_type: 'both', reorder_point: 2 },
  // ── Tools ────────────────────────────────────────────────────
  { category: 'tools', name: 'Pipe Reamer / Deburring Tool', unit: 'each', gas_type: 'both', reorder_point: 1 },
  { category: 'tools', name: 'Pipe Cutter 1/4" - 1-1/4"', unit: 'each', gas_type: 'both', reorder_point: 1 },
  { category: 'tools', name: 'CSST Cutter', unit: 'each', gas_type: 'both', reorder_point: 1 },
  { category: 'tools', name: 'Flaring Tool Kit', unit: 'each', gas_type: 'both', reorder_point: 1 },
  { category: 'tools', name: 'Pipe Threader Set', unit: 'each', gas_type: 'both', reorder_point: 1 },
  { category: 'tools', name: 'Adjustable Pipe Wrench 10"', unit: 'each', gas_type: 'both', reorder_point: 1 },
  { category: 'tools', name: 'Adjustable Pipe Wrench 14"', unit: 'each', gas_type: 'both', reorder_point: 1 },
]
