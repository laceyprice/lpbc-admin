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
