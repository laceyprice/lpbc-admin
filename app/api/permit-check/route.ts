import { NextRequest, NextResponse } from 'next/server'
export const dynamic = 'force-dynamic'
import { createServerClient } from '@/lib/supabase'

export interface PermitResult {
  type: string
  required: 'yes' | 'no' | 'maybe'
  reason: string
  triggeredBy: string[]   // section names that triggered this permit
}

export interface PermitCheckResponse {
  permits: PermitResult[]
  jurisdiction: {
    name: string
    website_url?: string | null
    permit_office_phone?: string | null
    permit_office_email?: string | null
    typical_fee_range?: string | null
    typical_processing_days?: number | null
    instructions?: string | null
    notes?: string | null
    ai_populated?: boolean
  } | null
  jurisdictionSource: 'database' | 'general'
  hasDetailedRules: boolean
  summary: string
  disclaimer: string
  city: string
  state: string
}

// POST /api/permit-check
// body: {
//   city: string
//   state?: string
//   sections: Array<{ name: string; items: Array<{ category: string; notes?: string; estimated_cost?: number }> }>
// }
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({})) as any
  const { city, state = 'FL', sections } = body

  if (!sections || !Array.isArray(sections) || sections.length === 0) {
    return NextResponse.json({ error: 'sections array is required' }, { status: 400 })
  }

  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey || apiKey === 'build-placeholder') {
    return NextResponse.json({ error: 'Anthropic API key not configured' }, { status: 503 })
  }

  // ── Try to find existing jurisdiction record ─────────────────
  let jurisdiction: any = null
  if (city) {
    const supabase = createServerClient()
    const { data } = await supabase
      .from('permit_jurisdictions')
      .select('name, website_url, permit_office_phone, permit_office_email, typical_fee_range, typical_processing_days, instructions, notes, gas_permit_required, lp_permit_required, inspection_required, ai_populated')
      .or(`name.ilike.%${city}%,county.ilike.%${city}%`)
      .order('name')
      .limit(1)
    if (data && data.length > 0) jurisdiction = data[0]
  }

  // ── Build scope summary for the AI ───────────────────────────
  const scopeLines: string[] = []
  for (const sec of sections) {
    scopeLines.push(`\nSECTION: ${sec.name}`)
    for (const item of (sec.items || [])) {
      const costNote = item.estimated_cost ? ` (~$${Number(item.estimated_cost).toFixed(0)})` : ''
      scopeLines.push(`  - ${item.category}${costNote}${item.notes ? ': ' + item.notes : ''}`)
    }
  }
  const scopeText = scopeLines.join('\n')

  const jurisdictionContext = jurisdiction
    ? `\nMUNICIPALITY-SPECIFIC DATA for ${jurisdiction.name} (from database):
- Gas permit required: ${jurisdiction.gas_permit_required}
- LP permit required: ${jurisdiction.lp_permit_required}
- Inspection required: ${jurisdiction.inspection_required}
- Typical fees: ${jurisdiction.typical_fee_range || 'unknown'}
- Processing: ${jurisdiction.typical_processing_days ? jurisdiction.typical_processing_days + ' days' : 'unknown'}
${jurisdiction.notes ? `- Per-trade permit rules on file:\n${jurisdiction.notes}` : ''}
${jurisdiction.instructions ? `- Permit office instructions:\n${jurisdiction.instructions}` : ''}`
    : ''

  const hasDetailedRules = !!(jurisdiction?.notes || jurisdiction?.instructions)

  const prompt = `You are a Florida licensed contractor's permit compliance expert.

A contractor is planning a renovation project in ${city || 'an unknown city'}, ${state}.
${jurisdictionContext}
${jurisdiction
  ? `IMPORTANT: Use the municipality-specific data above to determine permit requirements for ${jurisdiction.name}. If the per-trade rules mention specific thresholds (e.g., "only required when disconnecting power" or "required for adding any circuit"), apply those exact rules — do NOT substitute generic Florida Building Code rules when municipality-specific rules are available.`
  : `NOTE: No municipality-specific data found for "${city}" — using general Florida Building Code as a baseline. Results may not reflect local rules.`
}

Here is the full scope of work from their budget breakdown:
${scopeText}

Analyze this scope and determine which permits are required.

Return ONLY a valid JSON object (no markdown, no explanation):
{
  "permits": [
    {
      "type": "Building Permit",
      "required": "yes",
      "reason": "Structural framing work requires a building permit under Florida Building Code 105.1",
      "triggeredBy": ["Framing & Structural", "Demo"]
    }
  ],
  "summary": "2-3 sentence plain-English summary of overall permit situation",
  "disclaimer": "Short disclaimer that requirements should be verified with the local building department"
}

Permit types to consider (include ONLY those relevant to this scope):
- Building Permit: ONLY for work that affects the structural integrity of the building — removing or relocating load-bearing walls, additions to the building footprint or envelope, foundation work, structural staircase changes, or major roof structure modifications. Do NOT flag a Building Permit for finish framing such as shower curbs, shower niches, knee walls, soffits/bulkheads, non-load-bearing partition walls, drywall, furring strips, or decorative ceiling modifications. "Framing" in the context of finish carpentry or tile work is NOT structural framing.
- Demo Permit: Only for structural or major demolition. Cosmetic demo (tile removal, cabinet demo, ceiling demo, non-load-bearing wall removal, bulkhead removal) typically does NOT require a demo permit unless structural elements are involved or the municipality specifically requires one for condo/multi-unit interior work.
- Electrical Permit (new circuits, wiring, panel work — check municipality rules for exact threshold)
- Plumbing Permit (new pipe runs, drain relocations, fixture additions — not simple fixture replacements at same location)
- Mechanical Permit (HVAC new installs or ductwork changes, not simple equipment replacements in same location)
- Gas Permit (gas line work, gas appliances)
- Roofing Permit (roof work)

For "required" field use:
- "yes" = definitely required based on work described
- "no" = not required for this type of work
- "maybe" = depends on scope details, municipality discretion, or valuation threshold

Only include permit types where required is "yes" or "maybe" — omit "no" permits entirely.
If no permits are required at all, return an empty permits array and say so in summary.`

  try {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 30000)

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

    const result: PermitCheckResponse = {
      permits: parsed.permits || [],
      jurisdiction,
      jurisdictionSource: jurisdiction ? 'database' : 'general',
      hasDetailedRules,
      summary: parsed.summary || '',
      disclaimer: parsed.disclaimer || 'Always verify permit requirements with your local building department before starting work.',
      city: city || '',
      state,
    }

    return NextResponse.json(result)
  } catch (err: any) {
    if (err.name === 'AbortError') {
      return NextResponse.json({ error: 'Request timed out' }, { status: 504 })
    }
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
