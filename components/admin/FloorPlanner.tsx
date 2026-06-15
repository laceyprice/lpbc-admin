'use client'
// ── Floor Planner (Phase 1 prototype) ───────────────────────────────────────
// A real object-model drafting canvas — NOT freehand strokes. Everything is a
// building object measured in FEET (walls, openings, rooms), drawn on a 1-ft grid
// with ¼-ft snapping and live foot-inch dimensions. This is the foundation the
// PDF and DXF/CAD export will render from in later phases.
import { useEffect, useRef, useState, useCallback } from 'react'
import {
  MousePointer2, Minus, Square, DoorOpen, RectangleHorizontal, Hand,
  ZoomIn, ZoomOut, Trash2, RotateCcw, Copy, Check, ScanLine, Loader2, AlertCircle, X,
} from 'lucide-react'

// ── Model ────────────────────────────────────────────────────────────────────
type Pt = { x: number; y: number }            // world units = feet
type Wall = { id: string; a: Pt; b: Pt }
type Opening = { id: string; wallId: string; t: number; width: number; kind: 'door' | 'window'; flip: boolean }
type Room = { id: string; at: Pt; w: number; h: number; name: string }
type Label = { id: string; at: Pt; text: string }
type Tool = 'select' | 'wall' | 'room' | 'door' | 'window' | 'pan'
type Sel = { kind: 'wall' | 'opening' | 'room' | 'vertex' | 'label'; id: string; vx?: Pt } | null

export type PlanDoc = { walls?: Wall[]; openings?: Opening[]; rooms?: Room[]; labels?: Label[] }
type FloorPlannerProps = { value?: PlanDoc; onChange?: (doc: PlanDoc) => void }

const uid = () => Math.random().toString(36).slice(2, 9)
const SNAP_FT = 0.25                            // snap to 3 inches
const GRID_FT = 1                               // grid line every foot
const WALL_PX = 5                               // wall render thickness (screen px)

// vector helpers (feet)
const sub = (a: Pt, b: Pt): Pt => ({ x: a.x - b.x, y: a.y - b.y })
const add = (a: Pt, b: Pt): Pt => ({ x: a.x + b.x, y: a.y + b.y })
const mul = (a: Pt, s: number): Pt => ({ x: a.x * s, y: a.y * s })
const len = (a: Pt) => Math.hypot(a.x, a.y)
const norm = (a: Pt): Pt => { const l = len(a) || 1; return { x: a.x / l, y: a.y / l } }
const perp = (a: Pt): Pt => ({ x: -a.y, y: a.x })
const dist = (a: Pt, b: Pt) => len(sub(a, b))

// foot-decimal → 14'-3"
function fmtFt(ft: number): string {
  if (!isFinite(ft)) return ''
  let whole = Math.floor(ft + 1e-6)
  let inches = Math.round((ft - whole) * 12)
  if (inches === 12) { whole += 1; inches = 0 }
  return inches ? `${whole}'-${inches}"` : `${whole}'`
}

// nearest point on segment a→b to p; returns param t (0..1) and distance
function nearestOnSeg(p: Pt, a: Pt, b: Pt) {
  const ab = sub(b, a)
  const l2 = ab.x * ab.x + ab.y * ab.y || 1e-9
  let t = ((p.x - a.x) * ab.x + (p.y - a.y) * ab.y) / l2
  t = Math.max(0, Math.min(1, t))
  const point = add(a, mul(ab, t))
  return { t, point, dist: dist(p, point) }
}

export default function FloorPlanner({ value, onChange }: FloorPlannerProps = {}) {
  const [walls, setWalls] = useState<Wall[]>(value?.walls || [])
  const [openings, setOpenings] = useState<Opening[]>(value?.openings || [])
  const [rooms, setRooms] = useState<Room[]>(value?.rooms || [])
  const [labels, setLabels] = useState<Label[]>(value?.labels || [])
  const [tool, setTool] = useState<Tool>('wall')
  const [sel, setSel] = useState<Sel>(null)
  const [copied, setCopied] = useState(false)

  // AI sketch import
  const [importing, setImporting] = useState(false)
  const [importErr, setImportErr] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)

  // Persist changes upward (Design Studio saves this with the job plan). We seed
  // from `value` once on mount, then emit on every edit — skip the very first run.
  const firstEmit = useRef(true)
  useEffect(() => {
    if (firstEmit.current) { firstEmit.current = false; return }
    onChange?.({ walls, openings, rooms, labels })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [walls, openings, rooms, labels])

  // view
  const [ppf, setPpf] = useState(16)            // pixels per foot at zoom 1
  const [zoom, setZoom] = useState(1)
  const [pan, setPan] = useState<Pt>({ x: 60, y: 60 })
  const [size, setSize] = useState({ w: 900, h: 620 })

  // transient interaction
  const [cursor, setCursor] = useState<Pt | null>(null)   // snapped world pt under pointer
  const wallChain = useRef<Pt | null>(null)               // current wall-chain anchor
  const [, force] = useState(0)
  const roomDrag = useRef<{ a: Pt } | null>(null)
  const [roomPreview, setRoomPreview] = useState<{ a: Pt; b: Pt } | null>(null)
  const dragging = useRef<{ kind: 'vertex' | 'pan'; from: Pt; orig?: Pt; panFrom?: Pt } | null>(null)

  const wrapRef = useRef<HTMLDivElement>(null)
  const svgRef = useRef<SVGSVGElement>(null)

  // responsive width
  useEffect(() => {
    const el = wrapRef.current
    if (!el) return
    const ro = new ResizeObserver(() => setSize({ w: el.clientWidth, h: 620 }))
    ro.observe(el)
    setSize({ w: el.clientWidth, h: 620 })
    return () => ro.disconnect()
  }, [])

  const scale = ppf * zoom
  const toPx = useCallback((p: Pt): Pt => ({ x: p.x * scale + pan.x, y: p.y * scale + pan.y }), [scale, pan])
  const toWorld = useCallback((sx: number, sy: number): Pt => ({ x: (sx - pan.x) / scale, y: (sy - pan.y) / scale }), [scale, pan])
  const snap = (p: Pt): Pt => ({ x: Math.round(p.x / SNAP_FT) * SNAP_FT, y: Math.round(p.y / SNAP_FT) * SNAP_FT })

  // also snap to existing wall endpoints within tolerance (so corners join)
  function snapSmart(world: Pt): Pt {
    const tolPx = 12
    let best: Pt | null = null
    let bestD = Infinity
    for (const w of walls) for (const v of [w.a, w.b]) {
      const d = dist(toPx(world), toPx(v))
      if (d < tolPx && d < bestD) { best = v; bestD = d }
    }
    return best || snap(world)
  }

  function evtWorld(e: React.MouseEvent): Pt {
    const rect = svgRef.current!.getBoundingClientRect()
    return toWorld(e.clientX - rect.left, e.clientY - rect.top)
  }

  // ── pointer handlers ───────────────────────────────────────────────────────
  function onDown(e: React.MouseEvent) {
    const w = evtWorld(e)
    const sp = snapSmart(w)

    if (tool === 'pan') { dragging.current = { kind: 'pan', from: w, panFrom: { ...pan } }; return }

    if (tool === 'wall') {
      if (!wallChain.current) { wallChain.current = sp }
      else {
        if (dist(wallChain.current, sp) > 0.01) {
          setWalls(prev => [...prev, { id: uid(), a: wallChain.current!, b: sp }])
        }
        wallChain.current = sp
      }
      force(n => n + 1)
      return
    }

    if (tool === 'room') { roomDrag.current = { a: sp }; setRoomPreview({ a: sp, b: sp }); return }

    if (tool === 'door' || tool === 'window') {
      const hit = nearestWall(w)
      if (hit && hit.dist < 0.8) {
        setOpenings(prev => [...prev, {
          id: uid(), wallId: hit.wall.id, t: hit.t, width: tool === 'door' ? 3 : 3, kind: tool, flip: false,
        }])
      }
      return
    }

    if (tool === 'select') {
      const h = hitTest(w)
      setSel(h)
      if (h?.kind === 'vertex' && h.vx) dragging.current = { kind: 'vertex', from: w, orig: h.vx }
    }
  }

  function onMove(e: React.MouseEvent) {
    const w = evtWorld(e)
    setCursor(snapSmart(w))

    const d = dragging.current
    if (d?.kind === 'pan') {
      const rect = svgRef.current!.getBoundingClientRect()
      // pan in screen space
      setPan(p => ({ x: (d.panFrom!.x) + (e.clientX - rect.left - toPx(d.from).x), y: (d.panFrom!.y) + (e.clientY - rect.top - toPx(d.from).y) }))
      return
    }
    if (d?.kind === 'vertex' && d.orig) {
      const np = snap(w)
      moveVertex(d.orig, np)
      d.orig = np
      return
    }
    if (roomDrag.current) setRoomPreview({ a: roomDrag.current.a, b: snap(w) })
  }

  function onUp() {
    if (roomDrag.current && roomPreview) {
      const { a, b } = roomPreview
      const x0 = Math.min(a.x, b.x), y0 = Math.min(a.y, b.y)
      const x1 = Math.max(a.x, b.x), y1 = Math.max(a.y, b.y)
      const w = x1 - x0, h = y1 - y0
      if (w >= 0.5 && h >= 0.5) {
        const tl = { x: x0, y: y0 }, tr = { x: x1, y: y0 }, br = { x: x1, y: y1 }, bl = { x: x0, y: y1 }
        setWalls(prev => [...prev,
          { id: uid(), a: tl, b: tr }, { id: uid(), a: tr, b: br },
          { id: uid(), a: br, b: bl }, { id: uid(), a: bl, b: tl }])
        setRooms(prev => [...prev, { id: uid(), at: { x: (x0 + x1) / 2, y: (y0 + y1) / 2 }, w, h, name: 'Room' }])
      }
      roomDrag.current = null
      setRoomPreview(null)
    }
    dragging.current = null
  }

  function onDouble() { if (tool === 'wall') { wallChain.current = null; force(n => n + 1) } }

  function nearestWall(p: Pt) {
    let best: { wall: Wall; t: number; dist: number } | null = null
    for (const wl of walls) {
      const r = nearestOnSeg(p, wl.a, wl.b)
      if (!best || r.dist < best.dist) best = { wall: wl, t: r.t, dist: r.dist }
    }
    return best
  }

  function hitTest(p: Pt): Sel {
    const tolPx = 10
    // vertices first
    for (const wl of walls) for (const v of [wl.a, wl.b]) {
      if (dist(toPx(p), toPx(v)) < tolPx) return { kind: 'vertex', id: wl.id, vx: v }
    }
    // room labels
    for (const r of rooms) if (dist(toPx(p), toPx(r.at)) < 26) return { kind: 'room', id: r.id }
    // openings
    for (const o of openings) {
      const wl = walls.find(w => w.id === o.wallId); if (!wl) continue
      const c = add(wl.a, mul(sub(wl.b, wl.a), o.t))
      if (dist(toPx(p), toPx(c)) < tolPx + 4) return { kind: 'opening', id: o.id }
    }
    // walls
    const nw = nearestWall(p)
    if (nw && nw.dist * scale < tolPx) return { kind: 'wall', id: nw.wall.id }
    return null
  }

  function moveVertex(from: Pt, to: Pt) {
    const eq = (a: Pt, b: Pt) => Math.abs(a.x - b.x) < 1e-6 && Math.abs(a.y - b.y) < 1e-6
    setWalls(prev => prev.map(w => ({
      ...w,
      a: eq(w.a, from) ? { ...to } : w.a,
      b: eq(w.b, from) ? { ...to } : w.b,
    })))
  }

  function deleteSel() {
    if (!sel) return
    if (sel.kind === 'wall') {
      setWalls(prev => prev.filter(w => w.id !== sel.id))
      setOpenings(prev => prev.filter(o => o.wallId !== sel.id))
    } else if (sel.kind === 'opening') setOpenings(prev => prev.filter(o => o.id !== sel.id))
    else if (sel.kind === 'room') setRooms(prev => prev.filter(r => r.id !== sel.id))
    else if (sel.kind === 'label') setLabels(prev => prev.filter(l => l.id !== sel.id))
    setSel(null)
  }

  // ── AI sketch import → editable geometry ─────────────────────────────────────
  async function importSketch(file: File) {
    setImporting(true); setImportErr('')
    try {
      const fd = new FormData()
      fd.append('image', file)
      const res = await fetch('/api/sketch-trace', { method: 'POST', body: fd })
      const text = await res.text()   // endpoint streams keep-alive whitespace then JSON
      let d: any
      try { d = JSON.parse(text.trim()) } catch { setImportErr('The server was busy finishing the trace — please try again.'); return }
      if (d.error || (d._status && d._status !== 200)) { setImportErr(d.error || 'Import failed — try again.'); return }
      const plan = d.plan
      if (!plan || !Array.isArray(plan.walls) || plan.walls.length === 0) { setImportErr('No walls were found in that image. Try a clearer, straight-on photo.'); return }
      loadPlan(plan)
    } catch (e: any) {
      setImportErr(e?.message || 'Import failed')
    } finally {
      setImporting(false)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  // Convert the trace's grid-feet plan into editable walls/openings/labels.
  function loadPlan(plan: any) {
    const newWalls: Wall[] = (plan.walls || [])
      .filter((w: any) => w?.a && w?.b)
      .map((w: any) => ({ id: uid(), a: { x: +w.a.x, y: +w.a.y }, b: { x: +w.b.x, y: +w.b.y } }))
    const newOpenings: Opening[] = []
    for (const o of (plan.openings || [])) {
      if (!o?.center) continue
      const c = { x: +o.center.x, y: +o.center.y }
      let best: { w: Wall; t: number; d: number } | null = null
      for (const w of newWalls) { const r = nearestOnSeg(c, w.a, w.b); if (!best || r.dist < best.d) best = { w, t: r.t, d: r.dist } }
      if (best && best.d < 1.5) {
        const base = perp(norm(sub(best.w.b, best.w.a)))
        let flip = false
        if (o.into) { const into = { x: +o.into.x, y: +o.into.y }; if (((into.x - c.x) * base.x + (into.y - c.y) * base.y) < 0) flip = true }
        const wlen = dist(best.w.a, best.w.b) || 1
        const width = Math.min(+o.width || 3, wlen * 0.9)
        newOpenings.push({ id: uid(), wallId: best.w.id, t: best.t, width, kind: o.kind === 'window' ? 'window' : 'door', flip })
      }
    }
    const newLabels: Label[] = (plan.labels || [])
      .filter((l: any) => l?.at && l?.text)
      .map((l: any) => ({ id: uid(), at: { x: +l.at.x, y: +l.at.y }, text: String(l.text) }))

    setWalls(newWalls); setOpenings(newOpenings); setRooms([]); setLabels(newLabels)
    setSel(null); wallChain.current = null
    setTool('select'); setZoom(1); setPan({ x: 48, y: 48 })
  }

  // keyboard: delete + escape
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Delete' || e.key === 'Backspace') { if (sel) { e.preventDefault(); deleteSel() } }
      if (e.key === 'Escape') { wallChain.current = null; setSel(null); roomDrag.current = null; setRoomPreview(null); force(n => n + 1) }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sel, walls, rooms, openings])

  function zoomBy(factor: number, center?: Pt) {
    const c = center || { x: size.w / 2, y: size.h / 2 }
    const before = toWorld(c.x, c.y)
    const nz = Math.max(0.3, Math.min(4, zoom * factor))
    const ns = ppf * nz
    // keep world point under cursor fixed
    setPan({ x: c.x - before.x * ns, y: c.y - before.y * ns })
    setZoom(nz)
  }
  function onWheel(e: React.WheelEvent) {
    const rect = svgRef.current!.getBoundingClientRect()
    zoomBy(e.deltaY < 0 ? 1.1 : 1 / 1.1, { x: e.clientX - rect.left, y: e.clientY - rect.top })
  }

  function clearAll() { if (confirm('Clear the whole plan?')) { setWalls([]); setOpenings([]); setRooms([]); setSel(null); wallChain.current = null } }

  function copyJSON() {
    const doc = { units: 'feet', walls, openings, rooms, labels }
    navigator.clipboard?.writeText(JSON.stringify(doc, null, 2)).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1500) })
  }

  // ── grid lines ─────────────────────────────────────────────────────────────
  const gridLines: JSX.Element[] = []
  {
    const w0 = toWorld(0, 0), w1 = toWorld(size.w, size.h)
    const startX = Math.floor(w0.x), endX = Math.ceil(w1.x)
    const startY = Math.floor(w0.y), endY = Math.ceil(w1.y)
    if ((endX - startX) < 400 && (endY - startY) < 400) {
      for (let gx = startX; gx <= endX; gx += GRID_FT) {
        const p = toPx({ x: gx, y: 0 })
        const major = gx % 5 === 0
        gridLines.push(<line key={`vx${gx}`} x1={p.x} y1={0} x2={p.x} y2={size.h} stroke={major ? '#e2e8f0' : '#f1f5f9'} strokeWidth={major ? 1.2 : 1} />)
      }
      for (let gy = startY; gy <= endY; gy += GRID_FT) {
        const p = toPx({ x: 0, y: gy })
        const major = gy % 5 === 0
        gridLines.push(<line key={`hz${gy}`} x1={0} y1={p.y} x2={size.w} y2={p.y} stroke={major ? '#e2e8f0' : '#f1f5f9'} strokeWidth={major ? 1.2 : 1} />)
      }
    }
  }

  // door/window symbol geometry → svg elements
  function renderOpening(o: Opening) {
    const wl = walls.find(w => w.id === o.wallId); if (!wl) return null
    const u = norm(sub(wl.b, wl.a))
    const c = add(wl.a, mul(sub(wl.b, wl.a), o.t))
    const half = o.width / 2
    const j1 = sub(c, mul(u, half))            // hinge jamb
    const j2 = add(c, mul(u, half))            // latch jamb
    const n = mul(perp(u), o.flip ? -1 : 1)
    const pj1 = toPx(j1), pj2 = toPx(j2), pc = toPx(c)
    const selected = sel?.kind === 'opening' && sel.id === o.id
    const stroke = o.kind === 'door' ? '#b8895a' : '#2563eb'

    // mask the wall under the opening (white gap)
    const maskW = WALL_PX + 3
    const els: JSX.Element[] = [
      <line key="mask" x1={pj1.x} y1={pj1.y} x2={pj2.x} y2={pj2.y} stroke="#ffffff" strokeWidth={maskW} strokeLinecap="butt" />,
    ]
    if (o.kind === 'door') {
      const tip = add(j1, mul(n, o.width))     // open leaf tip
      const ptip = toPx(tip)
      // arc latch(j2) -> tip, center hinge(j1), radius = width
      const a0 = Math.atan2(j2.y - j1.y, j2.x - j1.x)
      const a1 = Math.atan2(tip.y - j1.y, tip.x - j1.x)
      let dlt = a1 - a0; while (dlt > Math.PI) dlt -= 2 * Math.PI; while (dlt < -Math.PI) dlt += 2 * Math.PI
      const pts: string[] = []
      for (let i = 0; i <= 16; i++) { const a = a0 + dlt * (i / 16); const pp = toPx({ x: j1.x + o.width * Math.cos(a), y: j1.y + o.width * Math.sin(a) }); pts.push(`${pp.x},${pp.y}`) }
      els.push(<line key="leaf" x1={pj1.x} y1={pj1.y} x2={ptip.x} y2={ptip.y} stroke={stroke} strokeWidth={1.6} />)
      els.push(<polyline key="arc" points={pts.join(' ')} fill="none" stroke={stroke} strokeWidth={1.4} />)
    } else {
      // window: glass line across + jamb ticks
      els.push(<line key="glass" x1={pj1.x} y1={pj1.y} x2={pj2.x} y2={pj2.y} stroke={stroke} strokeWidth={2} />)
      const t1a = toPx(add(j1, mul(n, 0.3))), t1b = toPx(add(j1, mul(n, -0.3)))
      const t2a = toPx(add(j2, mul(n, 0.3))), t2b = toPx(add(j2, mul(n, -0.3)))
      els.push(<line key="t1" x1={t1a.x} y1={t1a.y} x2={t1b.x} y2={t1b.y} stroke={stroke} strokeWidth={1.4} />)
      els.push(<line key="t2" x1={t2a.x} y1={t2a.y} x2={t2b.x} y2={t2b.y} stroke={stroke} strokeWidth={1.4} />)
    }
    return <g key={o.id} onClick={() => tool === 'select' && setSel({ kind: 'opening', id: o.id })} style={{ cursor: tool === 'select' ? 'pointer' : undefined }}>
      {selected && <circle cx={pc.x} cy={pc.y} r={maskW} fill="none" stroke="#f59e0b" strokeWidth={1.5} />}
      {els}
    </g>
  }

  const ToolBtn = ({ t, icon: Icon, label }: { t: Tool; icon: any; label: string }) => (
    <button title={label} onClick={() => { setTool(t); wallChain.current = null; setSel(null) }}
      className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-xs font-semibold transition-colors ${tool === t ? 'border-amber-300 bg-amber-50 text-amber-700' : 'border-gray-200 text-gray-500 hover:bg-gray-50'}`}>
      <Icon size={14} /> <span className="hidden sm:inline">{label}</span>
    </button>
  )

  return (
    <div className="space-y-3">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2 bg-gray-50 border border-gray-200 rounded-xl px-3 py-2">
        <ToolBtn t="select" icon={MousePointer2} label="Select" />
        <ToolBtn t="wall" icon={Minus} label="Wall" />
        <ToolBtn t="room" icon={Square} label="Room" />
        <ToolBtn t="door" icon={DoorOpen} label="Door" />
        <ToolBtn t="window" icon={RectangleHorizontal} label="Window" />
        <ToolBtn t="pan" icon={Hand} label="Pan" />
        <div className="w-px h-6 bg-gray-200 mx-1" />
        {/* AI sketch import */}
        <input ref={fileRef} type="file" accept="image/*" className="hidden"
          onChange={e => { const f = e.target.files?.[0]; if (f) importSketch(f) }} />
        <button onClick={() => fileRef.current?.click()} disabled={importing}
          title="Import a photo of a hand sketch — AI drafts editable walls, doors and labels you can correct"
          className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-teal-300 bg-teal-50 text-teal-700 text-xs font-semibold hover:bg-teal-100 disabled:opacity-50 transition-colors">
          {importing ? <Loader2 size={13} className="animate-spin" /> : <ScanLine size={13} />}
          <span className="hidden sm:inline">{importing ? 'Tracing…' : 'Import sketch (AI)'}</span>
        </button>
        <div className="w-px h-6 bg-gray-200 mx-1" />
        <button onClick={() => zoomBy(1 / 1.2)} title="Zoom out" className="p-1.5 rounded-lg border border-gray-200 text-gray-500 hover:bg-gray-50"><ZoomOut size={14} /></button>
        <button onClick={() => { setZoom(1); setPan({ x: 60, y: 60 }) }} className="px-2 py-1 rounded-lg border border-gray-200 text-gray-700 text-xs font-semibold tabular-nums min-w-[46px]">{Math.round(zoom * 100)}%</button>
        <button onClick={() => zoomBy(1.2)} title="Zoom in" className="p-1.5 rounded-lg border border-gray-200 text-gray-500 hover:bg-gray-50"><ZoomIn size={14} /></button>
        <div className="flex-1" />
        <button onClick={deleteSel} disabled={!sel} title="Delete selection" className="p-1.5 rounded-lg border border-gray-200 text-gray-500 hover:bg-gray-50 disabled:opacity-30"><Trash2 size={14} /></button>
        <button onClick={clearAll} title="Clear all" className="p-1.5 rounded-lg border border-gray-200 text-gray-500 hover:bg-gray-50"><RotateCcw size={14} /></button>
        <button onClick={copyJSON} title="Copy plan data (JSON)" className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-gray-200 text-xs font-semibold text-gray-600 hover:bg-gray-50">
          {copied ? <Check size={13} className="text-green-600" /> : <Copy size={13} />} {copied ? 'Copied' : 'Plan JSON'}
        </button>
      </div>

      <p className="text-xs text-gray-500">
        Grid = 1 ft, snapping to 3&quot;. <strong>Import sketch (AI)</strong> drafts an editable plan from a photo, then refine it:{' '}
        <strong>Wall</strong> click-chains corners (double-click to finish), <strong>Room</strong> drags a rectangle,{' '}
        <strong>Door/Window</strong> clicks a wall, <strong>Select</strong> drags corners / Delete removes.
      </p>

      {importErr && (
        <div className="flex items-start gap-2 bg-red-50 border border-red-200 rounded-xl px-3 py-2.5">
          <AlertCircle size={14} className="text-red-500 flex-shrink-0 mt-0.5" />
          <p className="text-xs text-red-700 flex-1">{importErr}</p>
          <button onClick={() => setImportErr('')} className="text-red-400 hover:text-red-600"><X size={13} /></button>
        </div>
      )}

      {/* Canvas */}
      <div ref={wrapRef} className="relative border border-gray-200 rounded-xl overflow-hidden bg-white">
        <svg ref={svgRef} width={size.w} height={size.h}
          style={{ display: 'block', cursor: tool === 'pan' ? 'grab' : tool === 'select' ? 'default' : 'crosshair', touchAction: 'none' }}
          onMouseDown={onDown} onMouseMove={onMove} onMouseUp={onUp} onMouseLeave={onUp} onDoubleClick={onDouble} onWheel={onWheel}>
          <rect x={0} y={0} width={size.w} height={size.h} fill="#ffffff" />
          {gridLines}

          {/* rooms (fill + label) */}
          {rooms.map(r => {
            const p = toPx(r.at)
            const seld = sel?.kind === 'room' && sel.id === r.id
            return (
              <g key={r.id}>
                {seld && <circle cx={p.x} cy={p.y} r={24} fill="none" stroke="#f59e0b" strokeWidth={1.5} />}
                <text x={p.x} y={p.y - 4} textAnchor="middle" fontSize={12} fontWeight={700} fill="#374151">{r.name}</text>
                <text x={p.x} y={p.y + 11} textAnchor="middle" fontSize={10} fill="#6b7280">{fmtFt(r.w)} × {fmtFt(r.h)}</text>
                <text x={p.x} y={p.y + 24} textAnchor="middle" fontSize={9} fill="#9ca3af">{Math.round(r.w * r.h)} sq ft</text>
              </g>
            )
          })}

          {/* walls */}
          {walls.map(wl => {
            const a = toPx(wl.a), b = toPx(wl.b)
            const seld = sel?.kind === 'wall' && sel.id === wl.id
            return <line key={wl.id} x1={a.x} y1={a.y} x2={b.x} y2={b.y}
              stroke={seld ? '#f59e0b' : '#1f2937'} strokeWidth={WALL_PX} strokeLinecap="round"
              onClick={() => tool === 'select' && setSel({ kind: 'wall', id: wl.id })}
              style={{ cursor: tool === 'select' ? 'pointer' : undefined }} />
          })}

          {/* openings */}
          {openings.map(renderOpening)}

          {/* labels (room names / dimensions imported from a sketch) */}
          {labels.map(l => {
            const p = toPx(l.at)
            const seld = sel?.kind === 'label' && sel.id === l.id
            return <text key={l.id} x={p.x} y={p.y} textAnchor="middle" fontSize={11} fontWeight={600}
              fill={seld ? '#f59e0b' : '#374151'} style={{ cursor: tool === 'select' ? 'pointer' : undefined }}
              onClick={() => tool === 'select' && setSel({ kind: 'label', id: l.id })}>{l.text}</text>
          })}

          {/* wall dimensions */}
          {walls.map(wl => {
            const l = dist(wl.a, wl.b)
            if (l < 0.5) return null
            const mid = mul(add(wl.a, wl.b), 0.5)
            const n = mul(perp(norm(sub(wl.b, wl.a))), 1)
            const off = toPx(add(mid, mul(n, 0.6)))
            const ang = Math.atan2(wl.b.y - wl.a.y, wl.b.x - wl.a.x) * 180 / Math.PI
            const a2 = ang > 90 || ang < -90 ? ang + 180 : ang
            return <text key={`d${wl.id}`} x={off.x} y={off.y} textAnchor="middle" fontSize={10} fill="#2563eb"
              transform={`rotate(${a2} ${off.x} ${off.y})`} style={{ pointerEvents: 'none' }}>{fmtFt(l)}</text>
          })}

          {/* vertices (select mode) */}
          {tool === 'select' && walls.flatMap(wl => [wl.a, wl.b]).map((v, i) => {
            const p = toPx(v)
            return <circle key={i} cx={p.x} cy={p.y} r={4} fill="#fff" stroke="#1f2937" strokeWidth={1.5} style={{ cursor: 'move' }} />
          })}

          {/* wall-chain preview */}
          {tool === 'wall' && wallChain.current && cursor && (() => {
            const a = toPx(wallChain.current), b = toPx(cursor)
            return <>
              <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke="#b8895a" strokeWidth={WALL_PX} strokeLinecap="round" opacity={0.5} />
              <text x={(a.x + b.x) / 2} y={(a.y + b.y) / 2 - 6} textAnchor="middle" fontSize={10} fill="#b8895a">{fmtFt(dist(wallChain.current, cursor))}</text>
            </>
          })()}

          {/* room preview */}
          {roomPreview && (() => {
            const a = toPx(roomPreview.a), b = toPx(roomPreview.b)
            return <rect x={Math.min(a.x, b.x)} y={Math.min(a.y, b.y)} width={Math.abs(b.x - a.x)} height={Math.abs(b.y - a.y)}
              fill="rgba(184,137,90,0.08)" stroke="#b8895a" strokeWidth={1.5} strokeDasharray="4 3" />
          })()}

          {/* snap cursor */}
          {cursor && tool !== 'pan' && tool !== 'select' && (() => { const p = toPx(cursor); return <circle cx={p.x} cy={p.y} r={3.5} fill="#b8895a" /> })()}
        </svg>

        {/* AI tracing overlay */}
        {importing && (
          <div className="absolute inset-0 flex items-center justify-center bg-white/80 backdrop-blur-sm">
            <div className="flex items-center gap-3 bg-white rounded-2xl border border-teal-200 shadow-lg px-6 py-4">
              <Loader2 size={22} className="animate-spin text-teal-600" />
              <div>
                <p className="text-sm font-bold text-gray-900">Drafting from your sketch…</p>
                <p className="text-xs text-gray-500 mt-0.5">AI is tracing walls, doors and labels — this can take a moment</p>
              </div>
            </div>
          </div>
        )}
      </div>

      <div className="flex items-center gap-4 text-[11px] text-gray-400">
        <span>{walls.length} walls</span>
        <span>{openings.length} openings</span>
        <span>{rooms.length} rooms</span>
        {cursor && <span className="ml-auto tabular-nums">x {cursor.x.toFixed(2)}′ · y {cursor.y.toFixed(2)}′</span>}
      </div>
    </div>
  )
}
