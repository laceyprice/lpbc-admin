import { NextRequest } from 'next/server'
export const dynamic = 'force-dynamic'
export const maxDuration = 300
import { getAnthropicClient } from '@/lib/anthropic'

// sharp is loaded defensively at call time: if the native binary ever fails to
// load in a given runtime, grid detection is skipped rather than 500-ing the
// whole route — the trace still works, just without EXIF-normalize / pitch hint.
async function loadSharp(): Promise<typeof import('sharp') | null> {
  try { return (await import('sharp')).default as any } catch (e) { console.error('sharp load failed:', e); return null }
}

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

// ── Door symbol ──────────────────────────────────────────────────────────────
// Claude returns each door as hinge/latch (the opening, along the wall) + a point
// inside the room it opens into. We stamp the standard architectural symbol: the
// open leaf (a line) plus a quarter-circle swing arc (a smooth polyline). Drawing
// it server-side keeps every door clean and consistent instead of hand-wobbled.
type GPtM = { x: number; y: number }
type GStrokeM = { tool: string; color: string; width: number; points?: GPtM[]; start?: GPtM; end?: GPtM; text?: string }
function expandDoor(d: any): GStrokeM[] {
  const n = (v: any) => (typeof v === 'number' && isFinite(v) ? v : null)
  const hx = n(d?.hinge?.x), hy = n(d?.hinge?.y), lx = n(d?.latch?.x), ly = n(d?.latch?.y)
  if (hx === null || hy === null || lx === null || ly === null) return []
  const wx = lx - hx, wy = ly - hy
  const len = Math.hypot(wx, wy)
  if (len < 0.4 || len > 20) return []
  // Perpendicular to the wall (same magnitude as the wall vector).
  let px = -wy, py = wx
  const ix = n(d?.into?.x), iy = n(d?.into?.y)
  if (ix !== null && iy !== null && ((ix - hx) * px + (iy - hy) * py) < 0) { px = -px; py = -py }
  const P = { x: hx + px, y: hy + py } // open leaf tip (|perp| === len)
  const color = '#b8895a', width = 1.5
  const a0 = Math.atan2(ly - hy, lx - hx)
  const a1 = Math.atan2(P.y - hy, P.x - hx)
  let delta = a1 - a0
  while (delta > Math.PI) delta -= 2 * Math.PI
  while (delta < -Math.PI) delta += 2 * Math.PI
  const steps = 14
  const arc: GPtM[] = []
  for (let i = 0; i <= steps; i++) {
    const a = a0 + delta * (i / steps)
    arc.push({ x: hx + len * Math.cos(a), y: hy + len * Math.sin(a) })
  }
  return [
    { tool: 'line', color, width, start: { x: hx, y: hy }, end: { x: P.x, y: P.y } },
    { tool: 'pen', color, width, points: arc },
  ]
}

type TraceResult = { status: number; payload: any }

async function runTrace(file: File): Promise<TraceResult> {
  try {
    const inputBuf = Buffer.from(await file.arrayBuffer())

    // ── Normalize: bake EXIF orientation, downscale to a sane width. This is the
    // SAME image we both detect the grid on and send to Claude, so the grid pitch
    // we report and what Claude "sees" are guaranteed to match.
    const DETECT_W = 1000
    const sharp = await loadSharp()
    let normBuf: Buffer = inputBuf
    let normW = 0, normH = 0
    let pitch = 0, confident = false
    if (sharp) {
      try {
        const oriented = sharp(inputBuf).rotate()
        // Image for Claude (kept modest for token/latency budget — Claude downsamples
        // to ~1568px internally anyway, so 1200 loses nothing and is a touch faster).
        normBuf = await oriented.clone().resize({ width: 1200, withoutEnlargement: true }).jpeg({ quality: 86 }).toBuffer()
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
    }

    const base64 = normBuf.toString('base64')

    // pitch hint for the prompt (only if we actually found graph paper)
    const sheetCols = pitch > 0 && normW > 0 ? Math.round(normW / pitch) : 0
    const sheetRows = pitch > 0 && normH > 0 ? Math.round(normH / pitch) : 0
    const gridHint = pitch > 0
      ? `GRID DETECTED: the graph-paper squares are about ${pitch.toFixed(0)}px each, so this ${normW}×${normH}px image is roughly ${sheetCols} squares wide × ${sheetRows} squares tall. USE THESE SQUARES as your ruler.`
      : `This appears to be on graph paper — use the printed squares as your ruler.`

    const anthropic = getAnthropicClient()

    const userContent: any[] = [
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

═══ WORK IT OUT BEFORE YOU DRAW (this is the most important step) ═══
This sketch is on graph paper drawn to scale, so the printed squares and the written
dimensions should AGREE — use each to check the other and resolve to exact square counts.
Reason it through step by step before emitting any coordinates:
1. Read the scale note (e.g. "SCALE: 1 sq = 1 ft"). One square = that real distance.
2. Build a room schedule: for EACH room, read its written dimension and convert to squares
   (at 1 sq = 1 ft, "10' x 14'3\"" = 10 × 14.25 squares; 3 in = 0.25 ft). Where a room has no
   number, count its squares directly off the grid.
3. Cross-check against the drawing: count the squares each room actually spans and reconcile
   with the label. If they conflict, the written number wins, but adjust neighbors so walls
   still meet — never leave gaps or overlaps.
4. Assign real (x,y) grid coordinates to every room corner so that adjacent rooms SHARE the
   exact wall coordinate and the overall outline stays clean. Lay rooms out edge-to-edge.
Only after this layout is consistent, emit the wall strokes from your coordinate table.

Also report the drawing's overall size: "gridCols" (total squares wide) and "gridRows" (total squares tall).

═══ TRACE EVERYTHING, IN THIS ORDER (for correct layering) ═══
1. OUTER PERIMETER — exterior walls as connected "line" strokes (color "#1f2937", width 3).
2. INTERIOR WALLS — each wall segment as a "line" (color "#374151", width 2). Shared corners share coordinates.
3. LABELS — room names AND their written dimensions as "text" (color "#6b7280", width 2), placed near the room center. Preserve the exact text, e.g. "M. BED 10' x 14'3\"".

Do NOT draw door swing arcs yourself as lines. Instead return every door/opening in the separate "doors" array described below — the system draws clean swing arcs from it.

═══ DOORS (return in the "doors" array, NOT as strokes) ═══
For each door or doorway opening, give three grid points:
• "hinge": the point the door pivots on (one side of the opening).
• "latch": the other side of the opening, along the SAME wall (hinge→latch spans the door width and tells us the wall direction).
• "into": any point clearly inside the room the door swings INTO (used only to pick which way it opens).
A door 3 squares wide in the wall from (5,10) to (8,10), opening downward into the room below: { "hinge":{"x":5,"y":10}, "latch":{"x":8,"y":10}, "into":{"x":6,"y":12} }.
Include exterior entries the same way.

═══ STROKE FORMAT (coordinates in grid squares) ═══
• line: { "tool":"line", "color":"...", "width":N, "start":{"x":gx,"y":gy}, "end":{"x":gx,"y":gy} }
• rect: { "tool":"rect", "color":"...", "width":N, "start":{"x":gx,"y":gy}, "end":{"x":gx,"y":gy} }  (only for a clean rectangular room box)
• text: { "tool":"text", "color":"#6b7280", "width":2, "start":{"x":gx,"y":gy}, "text":"..." }

Return ONLY valid JSON — no markdown, no commentary:
{"gridCols":N,"gridRows":N,"strokes":[...],"doors":[...]}`,
          },
    ]

    // Opus + extended thinking for the spatial reasoning; fall back to Sonnet if
    // Opus is unavailable so the feature degrades instead of breaking entirely.
    let message: any
    try {
      message = await anthropic.messages.stream({
        model: 'claude-opus-4-8',
        max_tokens: 8000,
        thinking: { type: 'enabled', budget_tokens: 4000 },
        messages: [{ role: 'user', content: userContent }],
      }).finalMessage()
    } catch (e: any) {
      console.error('sketch-trace: opus call failed, falling back to sonnet:', e?.message)
      message = await anthropic.messages.create({
        model: 'claude-sonnet-4-6',
        max_tokens: 4096,
        messages: [{ role: 'user', content: userContent }],
      })
    }

    const raw = message.content.find((c: any) => c.type === 'text')?.text?.trim() ?? ''
    const cleaned = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/, '').trim()

    let parsed: { strokes: any[]; gridCols?: number; gridRows?: number; doors?: any[] }
    try {
      parsed = JSON.parse(cleaned)
    } catch {
      const match = cleaned.match(/\{[\s\S]*\}/)
      if (!match) {
        console.error('sketch-trace: bad JSON from Claude:', raw.slice(0, 400))
        return { status: 422, payload: { error: 'The AI could not read a floor plan from this image. Try a photo taken straight-on with the lines clearly visible.' } }
      }
      parsed = JSON.parse(match[0])
    }

    if (!Array.isArray(parsed.strokes)) {
      return { status: 422, payload: { error: 'Unexpected AI response format' } }
    }

    // ── Collect all grid-unit points so we can derive the true bounding box.
    // We trust the geometry over Claude's self-reported gridCols/gridRows.
    const TOOLS = ['pen', 'line', 'rect', 'text', 'eraser']
    const num = (v: any) => (typeof v === 'number' && isFinite(v) ? v : null)
    type GPt = { x: number; y: number }
    type GStroke = { tool: string; color: string; width: number; points?: GPt[]; start?: GPt; end?: GPt; text?: string }

    const gStrokes: GStroke[] = []
    // Parallel "plan" model (grid-feet): walls + labels here, openings from doors below.
    // This is what the editable Floor Planner imports; strokes stay for the legacy canvas.
    const planWallsRaw: { a: GPt; b: GPt }[] = []
    const planLabelsRaw: { at: GPt; text: string }[] = []
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
        if (start && s.text) { see(start); gStrokes.push({ tool: 'text', color, width, start, text: String(s.text) }); planLabelsRaw.push({ at: start, text: String(s.text) }) }
      } else {
        const start = pt(s.start), end = pt(s.end)
        if (start && end) {
          see(start); see(end); gStrokes.push({ tool: s.tool, color, width, start, end })
          if (s.tool === 'line') planWallsRaw.push({ a: start, b: end })
        }
      }
    }

    // Stamp clean door swing symbols from the semantic doors array.
    if (Array.isArray(parsed.doors)) {
      for (const d of parsed.doors) {
        for (const s of expandDoor(d)) {
          if (s.points) { s.points.forEach(see); gStrokes.push(s as GStroke) }
          else if (s.start && s.end) { see(s.start); see(s.end); gStrokes.push(s as GStroke) }
        }
      }
    }

    if (gStrokes.length === 0 || !isFinite(minX)) {
      return { status: 422, payload: { error: 'No recognizable floor plan elements found in this image.' } }
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

    // ── Build the editable Floor Planner model in grid-feet (1 square = 1 ft),
    // origin-shifted so the drawing starts at (0,0). Openings carry their "into"
    // point so the client can pick the swing side after snapping to a wall.
    const r2 = (n: number) => Math.round(n * 100) / 100
    const shift = (p: GPt): GPt => ({ x: r2(p.x - minX), y: r2(p.y - minY) })
    const planWalls = planWallsRaw
      .map(w => ({ a: shift(w.a), b: shift(w.b) }))
      .filter(w => Math.hypot(w.b.x - w.a.x, w.b.y - w.a.y) > 0.25)
    const planLabels = planLabelsRaw.map(l => ({ at: shift(l.at), text: l.text }))
    const planOpenings: any[] = []
    if (Array.isArray(parsed.doors)) {
      for (const d of parsed.doors) {
        const h = pt(d?.hinge), l = pt(d?.latch)
        if (!h || !l) continue
        const width = Math.hypot(l.x - h.x, l.y - h.y)
        if (width < 0.4 || width > 20) continue
        const center = shift({ x: (h.x + l.x) / 2, y: (h.y + l.y) / 2 })
        const into = pt(d?.into) ? shift(pt(d.into)!) : null
        planOpenings.push({ center, width: r2(width), kind: 'door', into })
      }
    }

    return {
      status: 200,
      payload: {
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
        plan: { units: 'feet', walls: planWalls, openings: planOpenings, labels: planLabels },
      },
    }
  } catch (err: any) {
    console.error('sketch-trace error:', err)
    return { status: 500, payload: { error: err.message || 'Tracing failed' } }
  }
}

// ── Streaming handler ────────────────────────────────────────────────────────
// Tracing a detailed plan can take longer than the 100s edge/proxy timeout
// (Cloudflare 524 etc.). We return a streamed response immediately and emit a
// tiny keep-alive byte every few seconds while Claude works, so the connection
// is never idle and no proxy can kill it. The real JSON result is written last.
// Leading whitespace is ignored by JSON.parse, so the client just res.json()s it.
export async function POST(req: NextRequest) {
  let file: File | null = null
  try {
    const fd = await req.formData()
    file = fd.get('image') as File | null
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid upload' }), { status: 400, headers: { 'Content-Type': 'application/json' } })
  }
  if (!file || file.size === 0) {
    return new Response(JSON.stringify({ error: 'No image provided' }), { status: 400, headers: { 'Content-Type': 'application/json' } })
  }
  const theFile = file

  const enc = new TextEncoder()
  const stream = new ReadableStream({
    async start(controller) {
      const safeEnqueue = (s: string) => { try { controller.enqueue(enc.encode(s)) } catch {} }
      safeEnqueue(' ') // flush headers immediately so the proxy sees the response start
      const heartbeat = setInterval(() => safeEnqueue(' '), 4000)
      let result: TraceResult
      try {
        result = await runTrace(theFile)
      } catch (e: any) {
        result = { status: 500, payload: { error: e?.message || 'Tracing failed' } }
      }
      clearInterval(heartbeat)
      // Always 200 at the HTTP level (status already streamed); carry real status in body.
      safeEnqueue('\n' + JSON.stringify({ ...result.payload, _status: result.status }))
      try { controller.close() } catch {}
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      'X-Accel-Buffering': 'no', // disable nginx proxy buffering
    },
  })
}
