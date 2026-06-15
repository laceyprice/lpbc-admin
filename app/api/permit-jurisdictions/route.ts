import { NextRequest, NextResponse } from 'next/server'
export const dynamic = 'force-dynamic'
import { createServerClient } from '@/lib/supabase'

// GET  /api/permit-jurisdictions               → list all jurisdictions
// GET  /api/permit-jurisdictions?id=uuid       → get single
// GET  /api/permit-jurisdictions?action=research&name=X&state=Y  → AI research
// POST /api/permit-jurisdictions               → create
// PATCH /api/permit-jurisdictions              → update
// DELETE /api/permit-jurisdictions?id=uuid    → delete

export async function GET(req: NextRequest) {
  const supabase = createServerClient()
  const action = req.nextUrl.searchParams.get('action')
  const id = req.nextUrl.searchParams.get('id')
  const search = req.nextUrl.searchParams.get('search')
  const state = req.nextUrl.searchParams.get('state')

  // ── AI Research (gas/LP focus) ───────────────────────────────
  if (action === 'research') {
    const name = req.nextUrl.searchParams.get('name')
    const stateParam = req.nextUrl.searchParams.get('state')
    if (!name) return NextResponse.json({ error: 'name required' }, { status: 400 })
    return researchJurisdiction(name, stateParam || '')
  }

  // ── AI Research (all-trades building permit rules) ───────────
  if (action === 'research-building') {
    const name = req.nextUrl.searchParams.get('name')
    const stateParam = req.nextUrl.searchParams.get('state')
    if (!name) return NextResponse.json({ error: 'name required' }, { status: 400 })
    return researchBuildingPermits(name, stateParam || 'FL')
  }

  // ── Single record ────────────────────────────────────────────
  if (id) {
    const { data, error } = await supabase.from('permit_jurisdictions').select('*').eq('id', id).single()
    if (error) return NextResponse.json({ error: error.message }, { status: 404 })
    return NextResponse.json(data)
  }

  // ── List ─────────────────────────────────────────────────────
  let query = supabase.from('permit_jurisdictions').select('*').order('name')
  if (state) query = query.eq('state', state)
  if (search) query = query.or(`name.ilike.%${search}%,county.ilike.%${search}%`)

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data || [])
}

export async function POST(req: NextRequest) {
  const supabase = createServerClient()
  const body = await req.json()

  const { data, error } = await supabase.from('permit_jurisdictions').insert({
    name: body.name,
    state: body.state || null,
    county: body.county || null,
    permit_office_name: body.permit_office_name || null,
    permit_office_phone: body.permit_office_phone || null,
    permit_office_email: body.permit_office_email || null,
    permit_office_address: body.permit_office_address || null,
    website_url: body.website_url || null,
    application_url: body.application_url || null,
    online_portal_url: body.online_portal_url || null,
    instructions: body.instructions || null,
    required_documents: body.required_documents || null,
    typical_fee_range: body.typical_fee_range || null,
    typical_processing_days: body.typical_processing_days || null,
    inspection_required: body.inspection_required ?? true,
    gas_permit_required: body.gas_permit_required ?? true,
    lp_permit_required: body.lp_permit_required ?? true,
    notes: body.notes || null,
    ai_populated: body.ai_populated || false,
    last_verified: body.last_verified || null,
  }).select().single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data, { status: 201 })
}

export async function PATCH(req: NextRequest) {
  const supabase = createServerClient()
  const body = await req.json()
  const { id, ...updates } = body
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })
  const { data, error } = await supabase.from('permit_jurisdictions').update(updates).eq('id', id).select().single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function DELETE(req: NextRequest) {
  const supabase = createServerClient()
  const id = req.nextUrl.searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })
  await supabase.from('permit_jurisdictions').delete().eq('id', id)
  return NextResponse.json({ success: true })
}

// ══════════════════════════════════════════════════════════════
// AI building permit research — per-trade thresholds
// ══════════════════════════════════════════════════════════════

async function researchBuildingPermits(name: string, state: string) {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey || apiKey === 'build-placeholder') {
    return NextResponse.json({ error: 'Anthropic API key not configured' }, { status: 503 })
  }

  const prompt = `You are a Florida building permit expert helping a licensed general contractor.

Research the SPECIFIC per-trade building permit requirements for: "${name}"${state ? `, ${state}` : ''}.

For each trade below, state EXACTLY when a permit is required in this municipality — be specific about thresholds, conditions, and local exemptions. If this jurisdiction has rules that differ from standard Florida Building Code, call them out clearly.

Return ONLY a valid JSON object (no markdown, no explanation):
{
  "notes": "Per-trade building permit rules for ${name}:\\n\\nELECTRICAL: [describe exactly when required — e.g. adding circuits, panel work, new wiring vs. fixture replacement]\\nPLUMBING: [when required — new pipes, fixture replacements, water heater, etc.]\\nSTRUCTURAL/BUILDING: [when required — framing, load-bearing work, additions, etc.]\\nDEMO: [when required — full demo vs. partial, structural vs. cosmetic]\\nHVAC/MECHANICAL: [when required — new units, duct work, replacement vs. new install]\\nGAS: [when required — new lines, appliance connections, LP vs. natural gas]\\nROOFING: [when required — full replacement vs. repair, sq ft thresholds]\\n\\nNOTABLE LOCAL RULES: [any rules that differ from standard Florida Building Code, or 'Follows standard Florida Building Code' if no differences found]",
  "summary": "2-3 sentence overview of this municipality's permit requirements, specifically calling out any local rules or thresholds that differ from typical Florida requirements (e.g., Walton County only requires an electrical permit when disconnecting power, whereas City of Destin requires one for adding any circuit).",
  "ai_confidence": "high/medium/low — your confidence level in the accuracy of these municipality-specific details"
}

Important notes:
- If this is a county (e.g. Walton County), note whether incorporated cities within it have their own rules
- Note if rules differ between county unincorporated areas and cities within the county
- Include dollar-value thresholds if applicable (some jurisdictions require permits only above a certain project value)
- Be honest — if you don't have reliable jurisdiction-specific data, say so in the notes and set ai_confidence to "low"`

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 30000)

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
        model: 'claude-opus-4-5',
        max_tokens: 2000,
        messages: [{ role: 'user', content: prompt }],
      }),
    })
    clearTimeout(timeout)

    if (!response.ok) {
      const err = await response.text()
      return NextResponse.json({ error: `AI API error (${response.status}): ${err}` }, { status: 500 })
    }

    const aiData = await response.json()
    const text = aiData.content?.[0]?.text || ''
    const jsonMatch = text.match(/\{[\s\S]*\}/)
    if (!jsonMatch) return NextResponse.json({ error: 'Could not parse AI response', raw: text }, { status: 500 })

    const parsed = JSON.parse(jsonMatch[0])
    return NextResponse.json({
      notes: parsed.notes || '',
      summary: parsed.summary || '',
      ai_confidence: parsed.ai_confidence || 'medium',
      ai_populated: true,
    })
  } catch (err: any) {
    clearTimeout(timeout)
    if (err.name === 'AbortError') {
      return NextResponse.json({ error: 'AI request timed out after 30 seconds' }, { status: 504 })
    }
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}

// ══════════════════════════════════════════════════════════════
// AI jurisdiction research using Claude
// ══════════════════════════════════════════════════════════════

async function researchJurisdiction(name: string, state: string) {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey || apiKey === 'build-placeholder') {
    return NextResponse.json({ error: 'Anthropic API key not configured — set ANTHROPIC_API_KEY in your environment' }, { status: 503 })
  }

  const prompt = `You are a permitting expert helping a gas appliance and LP gas contractor.

Research the permit jurisdiction: "${name}"${state ? `, ${state}` : ''}.

Return ONLY a valid JSON object (no markdown, no explanation) with these exact fields:
{
  "name": "Official jurisdiction name",
  "state": "2-letter state code",
  "county": "county name if applicable",
  "permit_office_name": "name of the permit/building department",
  "permit_office_phone": "phone number",
  "permit_office_email": "email if available",
  "permit_office_address": "physical address of permit office",
  "website_url": "main city/county website",
  "application_url": "direct URL to permit application page if known",
  "online_portal_url": "URL to online permit portal if available",
  "instructions": "Step-by-step instructions for pulling a gas/LP permit in this jurisdiction. Include what to bring, where to go, online vs in-person options, inspection process, etc.",
  "required_documents": ["list", "of", "required", "documents"],
  "typical_fee_range": "e.g. $50–$150 depending on project value",
  "typical_processing_days": 5,
  "inspection_required": true,
  "gas_permit_required": true,
  "lp_permit_required": true,
  "notes": "Any special notes, exemptions, or important info for gas contractors"
}

If you don't know a specific value, use null. Be as accurate and helpful as possible for a gas/LP contractor.`

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 30000) // 30s timeout

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
        model: 'claude-opus-4-5',
        max_tokens: 2000,
        messages: [{ role: 'user', content: prompt }],
      }),
    })
    clearTimeout(timeout)

    if (!response.ok) {
      const err = await response.text()
      return NextResponse.json({ error: `AI API error (${response.status}): ${err}` }, { status: 500 })
    }

    const aiData = await response.json()
    const text = aiData.content?.[0]?.text || ''

    // Parse the JSON from the response
    const jsonMatch = text.match(/\{[\s\S]*\}/)
    if (!jsonMatch) return NextResponse.json({ error: 'Could not parse AI response', raw: text }, { status: 500 })

    const parsed = JSON.parse(jsonMatch[0])
    return NextResponse.json({ ...parsed, ai_populated: true })
  } catch (err: any) {
    clearTimeout(timeout)
    if (err.name === 'AbortError') {
      return NextResponse.json({ error: 'AI request timed out after 30 seconds' }, { status: 504 })
    }
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
