import { NextRequest, NextResponse } from 'next/server'
export const dynamic = 'force-dynamic'
export const maxDuration = 120
import { createServerClient } from '@/lib/supabase'
import { getAnthropicClient } from '@/lib/anthropic'

const BUCKET = 'job-planning'

// POST /api/design-suggestions
// Given a job description + optional photos, asks Claude for a handful of
// concrete design-direction options (style, palette, materials, rough cost
// impact) the owner can browse, tweak, and drop into the Design Studio board.
//
// Returns: { suggestions: [{ id, style_name, description, key_materials, estimated_cost_impact, why_it_fits }] }
export async function POST(req: NextRequest) {
  const { description, measurements, attachments, notes } = await req.json()
  if (!description || description.trim().length < 10) {
    return NextResponse.json({ error: 'Provide a job description (at least 10 characters)' }, { status: 400 })
  }

  const supabase = createServerClient()

  // Reuse uploaded photos as visual context, same as the estimator does
  const imageAttachments: Array<{ name: string; mediaType: string; base64: string }> = []
  if (Array.isArray(attachments)) {
    for (const att of attachments) {
      if (!att?.path) continue
      const isImage = typeof att.type === 'string' && att.type.startsWith('image/')
      if (!isImage) continue
      try {
        const { data: blob, error } = await supabase.storage.from(BUCKET).download(att.path)
        if (error || !blob) continue
        const arrayBuf = await (blob as Blob).arrayBuffer()
        const base64 = Buffer.from(arrayBuf).toString('base64')
        if (imageAttachments.length < 8) {
          imageAttachments.push({ name: att.name, mediaType: att.type || 'image/jpeg', base64 })
        }
      } catch { /* skip unreadable file */ }
    }
  }

  const systemPrompt = `You are a residential interior/exterior design consultant working for L. Price Building Co. (LPBC), a Florida residential building contractor. The owner wants a few distinct DESIGN DIRECTION options to consider for a project before finalizing materials and the estimate.

You MUST respond with a single valid JSON object, no markdown, no prose outside the JSON, matching this exact schema:
{
  "suggestions": [
    {
      "style_name": "string — short, evocative name e.g. 'Warm Coastal Modern'",
      "description": "string — 2-4 sentences painting the overall look and feel",
      "key_materials": ["string — specific finishes/materials/fixtures, generic descriptions only"],
      "color_palette": ["string — e.g. 'warm white', 'driftwood gray', 'brushed brass accents'"],
      "estimated_cost_impact": "lower" | "typical" | "higher",
      "why_it_fits": "string — 1-2 sentences on why this direction suits THIS space/description"
    }
  ]
}

Generate exactly 3 distinct directions ranging from a cost-conscious option to a more elevated option, so the owner can compare trade-offs.

Rules:
- DO NOT name any retail chain, store, or brand (e.g. Lowe's, Home Depot, Menards, Ferguson, Kohler, Moen, etc.) anywhere in your output. Describe materials and fixtures generically (e.g. "matte black hardware," "wide-plank engineered wood," "quartz countertops with a soft veining pattern").
- Ground suggestions in what's actually described/shown — reference real characteristics of the space when photos are provided.
- Be concrete and specific, not generic design-blog fluff.`

  const userContent: any[] = []
  userContent.push({
    type: 'text',
    text: `PROJECT DESCRIPTION:
${description}

${measurements?.trim() ? `MEASUREMENTS / SCOPE NOTES:\n${measurements.trim()}\n` : ''}${notes?.trim() ? `OWNER'S DESIGN NOTES / PREFERENCES:\n${notes.trim()}\n` : ''}
${imageAttachments.length ? `${imageAttachments.length} photo(s) of the existing space follow.\n` : ''}
Produce the JSON design directions now.`
  })
  for (const img of imageAttachments) {
    userContent.push({ type: 'image', source: { type: 'base64', media_type: img.mediaType, data: img.base64 } })
  }

  try {
    const client = getAnthropicClient()
    const resp = await client.messages.create({
      model: 'claude-sonnet-4-5',
      max_tokens: 3000,
      system: systemPrompt,
      messages: [{ role: 'user', content: userContent }],
    })
    const fullText = resp.content.filter((b: any) => b.type === 'text').map((b: any) => b.text).join('')

    let parsed: any
    const strategies = [
      () => fullText.trim(),
      () => { const m = fullText.match(/```json\s*([\s\S]*?)\s*```/); return m?.[1] ?? null },
      () => { const m = fullText.match(/```\s*([\s\S]*?)\s*```/); return m?.[1] ?? null },
      () => { const m = fullText.match(/(\{[\s\S]*\})/); return m?.[1] ?? null },
    ]
    for (const s of strategies) {
      try { const c = s(); if (!c) continue; parsed = JSON.parse(c); break } catch {}
    }
    if (!parsed?.suggestions) {
      console.error('design-suggestions: could not parse JSON', { raw: fullText.slice(0, 1000), stop_reason: resp.stop_reason })
      return NextResponse.json({ error: 'AI returned malformed suggestions — try again', detail: `stop_reason:${resp.stop_reason || '?'}` }, { status: 502 })
    }

    const withIds = (parsed.suggestions as any[]).map((s, i) => ({
      id: `sugg_${Date.now()}_${i}`,
      selected: false,
      ...s,
    }))
    return NextResponse.json({ suggestions: withIds, images_analyzed: imageAttachments.length })
  } catch (e: any) {
    console.error('design-suggestions failed', { message: e?.message, status: e?.status, type: e?.error?.type })
    return NextResponse.json({ error: e?.message || 'Design suggestions failed' }, { status: 500 })
  }
}
