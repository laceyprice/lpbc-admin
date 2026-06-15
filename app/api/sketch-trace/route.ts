import { NextRequest, NextResponse } from 'next/server'
export const dynamic = 'force-dynamic'
import sharp from 'sharp'
import { getAnthropicClient } from '@/lib/anthropic'

// POST /api/sketch-trace
// Body: FormData with 'image' file
// Returns: { strokes, count, grid } ready to load into the sketch canvas.
//
// Accuracy strategy ("line up on the graph paper the same way"):
//   1. Normalize the photo server-side with sharp (bake EXIF orientation, downscale).
//   2. Detect the graph-paper square pitch (px/square) from projection autocorrelation.
//   3. Ask Claude to TRACE IN GRID-SQUARE UNITS (count squares) rather than guess pixels —
//      it counts squares far more reliably than it estimates pixel positions.
//   4. Map grid units → canvas at a uniform block size B and return B so the canvas can
//      draw its own grid at the same pitch. One sketch square === one canvas square.

const CANVAS_W = 900
const CANVAS_H = 700
const MARGIN = 40
const DRAW_W = CANVAS_W - MARGIN * 2   // 820
const DRAW_H = CANVAS_H - MARGIN * 2   // 620

// ── Grid detection ───────────────────────────────────────────────────────────
// Average the (normalised, grayscale) image along each axis to get a 1-D
// projection. Periodic graph-paper lines show up as a periodic ripple; the
// dominant period of that ripple is the square pitch. Autocorrelation finds it.
function projectionCurve(data: Uint8Array | Buffer, w: number, h: number, axis: 'x' | 'y') {
  const len = axis === 'x' ? w : h
  const other = axis === 'x' ? h : w
  const proj = new Float64Array(len)
  for (let a = 0; a < len; a++) {
    let sum = 0
    for (let b = 0; b < other; b++) sum += data[axis === 'x' ? b * w + a : a * w + b]
    proj[a] = sum / other
  }
  let m = 0
  for (let i = 0; i < len; i++) m += proj[i]
  m /= len
  for (let i = 0; i < len; i++) proj[i] -= m

  const MIN = 14, MAX = 90
  let e0 = 0
  for (let i = 0; i < len; i++) e0 += proj[i] * proj[i]
  const curve: { lag: number; score: number }[] = []
  for (let lag = MIN; lag <= MAX; lag++) {
    let s = 0
    for (let i = 0; i + lag < len; i++) s += proj[i] * proj[i + lag]
    curve.push({ lag, score: e0 > 0 ? s / e0 : 0 })
  }
  return curve
}

function localPeaks(curve: { lag: number; score: number }[]) {
  const peaks = curve.filter((c, i) =>
    i > 0 && i < curve.length - 1 &&
    c.score > curve[i - 1].score && c.score >= curve[i + 1].score && c.score > 0.15)
  return peaks.sort((a, b) => b.score - a.score)
}

// Square graph paper => the X and Y pitch must agree. Reconciling the two axes
// rejects false sub-harmonic peaks from paper texture / handwriting.
function detectPitch(data: Uint8Array | Buffer, w: number, h: number): { pitch: number; confident: boolean } {
  const px = localPeaks(projectionCurve(data, w, h, 'x'))
  const py = localPeaks(projectionCurve(data, w, h, 'y'))
  let best: { lag: number; combined: number } | null = null
  for (const a of px.slice(0, 6)) for (const b of py.slice(0, 6)) {
    if (Math.abs(a.lag - b.lag) <= 2) {
      const combined = a.score + b.score
      if (!best || combined > best.combined) best = { lag: Math.round((a.lag + b.lag) / 2), combined }
    }
  }
  if (best) return { pitch: best.lag, confident: best.combined > 0.9 }
  const fallback = px[0] || py[0]
  return { pitch: fallback ? fallback.lag : 0, confident: false }
}

export async function POST(req: NextRequest) {
  try {
    const fd = await req.formData()
    const file = fd.get('image') as File | null
    if (!file || file.size === 0) {
      return NextResponse.json({ error: 'No image provided' }, { status: 400 })
    }

    const inputBuf = Buffer.from(await file.arrayBuffer())

    // ── Normalize: bake EXIF orientation, downscale to a sane width. This is the
    // SAME image we both detect the grid on and send to Claude, so the grid pitch
    // we report and what Claude "sees" are guaranteed to match.
    const DETECT_W = 1000
    let normBuf: Buffer
    let normW = 0, normH = 0
    let pitch = 0, confident = false
    try {
      const oriented = sharp(inputBuf).rotate()
      // Image for Claude (kept reasonably sized for token/latency budget)
      normBuf = await oriented.clone().resize({ width: 1500, withoutEnlargement: true }).jpeg({ quality: 88 }).toBuffer()
      const nm = await sharp(normBuf).metadata()
      normW = nm.width || 0
      normH = nm.height || 0
      // Grayscale raw buffer for grid detection
      const { data, info } = await sharp(inputBuf)
        .rotate()
        .resize({ width: DETECT_W })
        .grayscale()
        .normalise()
        .raw()
        .toBuffer({ resolveWithObject: true })
      const det = detectPitch(data, info.width, info.height)
      // express pitch in normBuf pixels
      pitch = det.pitch * (normW / info.width)
      confident = det.confident
    } catch (e) {
      // sharp failed (unsupported format etc.) — fall back to the raw upload, no detection
      normBuf = inputBuf
      const nm = await sharp(inputBuf).metadata().catch(() => ({ width: 0, height: 0 }))
      normW = nm.width || 0
      normH = nm.height || 0
    }

    const base64 = normBuf.toString('base64')

    // pitch hint for the prompt (only if we actually found graph paper)
    const sheetCols = pitch > 0 && normW > 0 ? Math.round(normW / pitch) : 0
    const sheetRows = pitch > 0 && normH > 0 ? Math.round(normH / pitch) : 0
    const gridHint = pitch > 0
      ? `GRID DETECTED: the graph-paper squares are about ${pitch.toFixed(0)}px each, so this ${normW}×${normH}px image is roughly ${sheetCols} squares wide × ${sheetRows} squares tall. USE THESE SQUARES as your ruler.`
      : `This appears to be on graph paper — use the printed squares as your ruler.`

    const anthropic = getAnthropicClient()

    const message = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 4096,
      messages: [{
        role: 'user',
        content: [
          {
            type: 'image',
            source: { type: 'base64', media_type: 'image/jpeg', data: base64 },
          },
          {
            type: 'text',
            text: `You are a precision floor-plan digitizer. Reproduce this hand-drawn floor plan EXACTLY, measuring everything in graph-paper squares so it lines up on the grid the same way the original does.

${gridHint}

═══ COORDINATE SYSTEM — GRID SQUARES, NOT PIXELS ═══
Output ALL coordinates in GRID-SQUARE UNITS, where 1 unit = one printed graph square.
• Put the origin (0,0) at the TOP-LEFT corner square of the drawing's bounding box (the outermost extent of any drawn wall — ignore the blank paper around it).
• x increases to the right (in squares), y increases downward (in squares).
• COUNT SQUARES to place every point. A wall that spans five squares is exactly 5.0 units long. A room that is 8 squares wide by 6 tall goes from (x, y) to (x+8, y+6).
• Walls run ALONG the printed grid lines — so almost every endpoint is an INTEGER (whole number). Only use a fraction like .5 when a line genuinely runs through the middle of a square.
• Corners that meet MUST share identical coordinates. A wall ending at (12,7) and another starting there must both read (12,7).

Also report the drawing's overall size: "gridCols" (total squares wide) and "gridRows" (total squares tall).

═══ TRACE EVERYTHING, IN THIS ORDER (for correct layering) ═══
1. OUTER PERIMETER — exterior walls as connected "line" strokes (color "#1f2937", width 3).
2. INTERIOR WALLS — each wall segment as a "line" (color "#374151", width 2). Shared corners share coordinates.
3. DOORS — opening gap + swing arc as "line" strokes (color "#b8895a", width 1.5).
4. WINDOWS — short double-line mark in the wall (color "#2563eb", width 1.5).
5. LABELS — room names AND their written dimensions as "text" (color "#6b7280", width 2), placed near the room center. Preserve the exact text, e.g. "M. BED 10' x 14'3\"".

═══ STROKE FORMAT (coordinates in grid squares) ═══
• line: { "tool":"line", "color":"...", "width":N, "start":{"x":gx,"y":gy}, "end":{"x":gx,"y":gy} }
• rect: { "tool":"rect", "color":"...", "width":N, "start":{"x":gx,"y":gy}, "end":{"x":gx,"y":gy} }  (only for a clean rectangular room box)
• text: { "tool":"text", "color":"#6b7280", "width":2, "start":{"x":gx,"y":gy}, "text":"..." }

Return ONLY valid JSON — no markdown, no commentary:
{"gridCols":N,"gridRows":N,"strokes":[...]}`,
          },
        ],
      }],
    })

    const raw = message.content.find(c => c.type === 'text')?.text?.trim() ?? ''
    const cleaned = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/, '').trim()

    let parsed: { strokes: any[]; gridCols?: number; gridRows?: number }
    try {
      parsed = JSON.parse(cleaned)
    } catch {
      const match = cleaned.match(/\{[\s\S]*\}/)
      if (!match) {
        console.error('sketch-trace: bad JSON from Claude:', raw.slice(0, 400))
        return NextResponse.json({ error: 'AI could not parse the floor plan. Try a clearer, well-lit photo.' }, { status: 422 })
      }
      parsed = JSON.parse(match[0])
    }

    if (!Array.isArray(parsed.strokes)) {
      return NextResponse.json({ error: 'Unexpected AI response format' }, { status: 422 })
    }

    // ── Collect all grid-unit points so we can derive the true bounding box.
    // We trust the geometry over Claude's self-reported gridCols/gridRows.
    const TOOLS = ['pen', 'line', 'rect', 'text', 'eraser']
    const num = (v: any) => (typeof v === 'number' && isFinite(v) ? v : null)
    type GPt = { x: number; y: number }
    type GStroke = { tool: string; color: string; width: number; points?: GPt[]; start?: GPt; end?: GPt; text?: string }

    const gStrokes: GStroke[] = []
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
    const see = (p: GPt | null | undefined) => {
      if (!p) return
      if (p.x < minX) minX = p.x
      if (p.y < minY) minY = p.y
      if (p.x > maxX) maxX = p.x
      if (p.y > maxY) maxY = p.y
    }
    const pt = (p: any): GPt | null => {
      const x = num(p?.x), y = num(p?.y)
      return x !== null && y !== null ? { x, y } : null
    }

    for (const s of parsed.strokes) {
      if (!s || !TOOLS.includes(s.tool)) continue
      const color = typeof s.color === 'string' && /^#[0-9a-fA-F]{3,6}$/.test(s.color) ? s.color : '#1f2937'
      const width = typeof s.width === 'number' && s.width > 0 ? Math.min(s.width, 20) : 2
      if (s.tool === 'pen' || s.tool === 'eraser') {
        const pts = Array.isArray(s.points) ? s.points.map(pt).filter(Boolean) as GPt[] : []
        if (pts.length > 1) { pts.forEach(see); gStrokes.push({ tool: s.tool, color, width, points: pts }) }
      } else if (s.tool === 'text') {
        const start = pt(s.start)
        if (start && s.text) { see(start); gStrokes.push({ tool: 'text', color, width, start, text: String(s.text) }) }
      } else {
        const start = pt(s.start), end = pt(s.end)
        if (start && end) { see(start); see(end); gStrokes.push({ tool: s.tool, color, width, start, end }) }
      }
    }

    if (gStrokes.length === 0 || !isFinite(minX)) {
      return NextResponse.json({ error: 'No recognizable floor plan elements found. Try a clearer image with more contrast.' }, { status: 422 })
    }

    // ── Fit the grid-unit drawing into the canvas at a UNIFORM block size.
    // Uniform B preserves every square count and right angle exactly; returning B
    // lets the canvas draw its own grid at the same pitch => square-for-square match.
    const cols = Math.max(1, maxX - minX)
    const rows = Math.max(1, maxY - minY)
    const B = Math.max(10, Math.min(48, DRAW_W / cols, DRAW_H / rows))
    const originX = MARGIN + (DRAW_W - cols * B) / 2
    const originY = MARGIN + (DRAW_H - rows * B) / 2

    const clampN = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v))
    const mapPt = (p: GPt) => ({
      x: Math.round(clampN(originX + (p.x - minX) * B, 0, CANVAS_W)),
      y: Math.round(clampN(originY + (p.y - minY) * B, 0, CANVAS_H)),
    })

    const strokes = gStrokes.map(s => {
      const base = { tool: s.tool, color: s.color, width: s.width }
      if (s.points) return { ...base, points: s.points.map(mapPt) }
      if (s.tool === 'text') return { ...base, start: mapPt(s.start!), text: s.text }
      return { ...base, start: mapPt(s.start!), end: mapPt(s.end!) }
    })

    return NextResponse.json({
      strokes,
      count: strokes.length,
      grid: {
        blockPx: Math.round(B * 100) / 100,
        originX: Math.round(originX),
        originY: Math.round(originY),
        cols, rows,
        detected: pitch > 0,
        confident,
      },
    })
  } catch (err: any) {
    console.error('sketch-trace error:', err)
    return NextResponse.json({ error: err.message || 'Tracing failed' }, { status: 500 })
  }
}
