'use client'
// ── Floor Planner (Phase 1 prototype) ───────────────────────────────────────
// A real object-model drafting canvas — NOT freehand strokes. Everything is a
// building object measured in FEET (walls, openings, rooms), drawn on a 1-ft grid
// with ¼-ft snapping and live foot-inch dimensions. This is the foundation the
// PDF and DXF/CAD export will render from in later phases.
import { useEffect, useRef, useState, useCallback } from 'react'
import dynamic from 'next/dynamic'
import {
  MousePointer2, Minus, Square, DoorOpen, RectangleHorizontal, Hand,
  ZoomIn, ZoomOut, Trash2, RotateCcw, Copy, Check, ScanLine, Loader2, AlertCircle, X,
  Image as ImageIcon, Eye, EyeOff, Move, FileDown, Ruler, Bath, RotateCw, Undo2, Box,
} from 'lucide-react'

// 3D view is heavy (Three.js) — load it only when opened, client-side only.
const FloorPlan3D = dynamic(() => import('./FloorPlan3D'), { ssr: false })

type Underlay = { src: string; x: number; y: number; w: number; h: number; opacity: number; visible: boolean }

// ── Model ────────────────────────────────────────────────────────────────────
type Pt = { x: number; y: number }            // world units = feet
type Wall = { id: string; a: Pt; b: Pt; h?: number }   // h = wall height in ft (omitted = full)
const FULL_WALL_H = 8
type Opening = { id: string; wallId: string; t: number; width: number; kind: 'door' | 'window' | 'pocket'; flip: boolean; hinge?: boolean }
type Room = { id: string; at: Pt; w: number; h: number; name: string }
type Label = { id: string; at: Pt; text: string }
type FixtureKind = 'toilet' | 'sink' | 'tub' | 'shower' | 'range' | 'fridge' | 'base' | 'upper' | 'island' | 'counter' | 'stairs' | 'railing'
type Fixture = { id: string; kind: FixtureKind; at: Pt; w: number; h: number; rot: number }  // rot = degrees
type Dim = { id: string; a: Pt; b: Pt; off: number }   // off = perpendicular offset of the dim line (ft)
type Tool = 'select' | 'wall' | 'room' | 'door' | 'window' | 'dim' | 'fixture' | 'pan'
type Sel = { kind: 'wall' | 'opening' | 'room' | 'vertex' | 'label' | 'fixture' | 'dim'; id: string; vx?: Pt } | null

export type FinishPick = { floor: number; walls: number; cabinet: number; counter: number }
export type FinishSample = { id: string; name: string; url: string; scale?: number }   // url = data URL; scale = ft per image tile
export type Finishes = { pick: FinishPick; schemes?: { name: string; pick: FinishPick }[]; samples?: Record<string, FinishSample[]> }
export type PlanDoc = { walls?: Wall[]; openings?: Opening[]; rooms?: Room[]; labels?: Label[]; fixtures?: Fixture[]; dims?: Dim[]; finishes?: Finishes }
const DEFAULT_FINISHES: Finishes = { pick: { floor: 0, walls: 0, cabinet: 0, counter: 0 }, schemes: [] }

// Default footprint (ft) per fixture kind.
const FIXTURES: Record<FixtureKind, { w: number; h: number; label: string }> = {
  toilet: { w: 1.5, h: 2.3, label: 'Toilet' },
  sink: { w: 2, h: 1.8, label: 'Sink' },
  tub: { w: 2.5, h: 5, label: 'Tub' },
  shower: { w: 3, h: 3, label: 'Shower' },
  range: { w: 2.5, h: 2.5, label: 'Range' },
  fridge: { w: 3, h: 2.7, label: 'Fridge' },
  base: { w: 3, h: 2, label: 'Base Cab' },
  upper: { w: 3, h: 1, label: 'Upper Cab' },
  island: { w: 5, h: 3, label: 'Island' },
  counter: { w: 4, h: 2, label: 'Counter' },
  stairs: { w: 3, h: 10, label: 'Stairs' },
  railing: { w: 6, h: 0.5, label: 'Railing' },
}
// Primitive shapes in LOCAL feet (centered at origin, canonical orientation).
type Prim =
  | { t: 'rect'; x: number; y: number; w: number; h: number }
  | { t: 'ellipse'; cx: number; cy: number; rx: number; ry: number }
  | { t: 'circle'; cx: number; cy: number; r: number }
  | { t: 'line'; x1: number; y1: number; x2: number; y2: number }
function fixturePrims(kind: FixtureKind, w: number, h: number): Prim[] {
  const x = -w / 2, y = -h / 2
  switch (kind) {
    case 'toilet': return [
      { t: 'rect', x, y, w, h: h * 0.28 },                                  // tank
      { t: 'ellipse', cx: 0, cy: y + h * 0.62, rx: w * 0.42, ry: h * 0.34 }, // bowl
    ]
    case 'sink': return [
      { t: 'rect', x, y, w, h },
      { t: 'ellipse', cx: 0, cy: 0, rx: w * 0.36, ry: h * 0.34 },
      { t: 'circle', cx: 0, cy: y + h * 0.16, r: Math.min(w, h) * 0.06 },   // faucet
    ]
    case 'tub': return [
      { t: 'rect', x, y, w, h },
      { t: 'ellipse', cx: 0, cy: 0, rx: w * 0.38, ry: h * 0.42 },
      { t: 'circle', cx: 0, cy: y + h * 0.86, r: Math.min(w, h) * 0.05 },   // drain
    ]
    case 'shower': return [
      { t: 'rect', x, y, w, h },
      { t: 'line', x1: x, y1: y, x2: x + w, y2: y + h },
      { t: 'line', x1: x + w, y1: y, x2: x, y2: y + h },
      { t: 'circle', cx: 0, cy: 0, r: Math.min(w, h) * 0.07 },
    ]
    case 'range': return [
      { t: 'rect', x, y, w, h },
      { t: 'circle', cx: -w * 0.22, cy: -h * 0.22, r: Math.min(w, h) * 0.13 },
      { t: 'circle', cx: w * 0.22, cy: -h * 0.22, r: Math.min(w, h) * 0.13 },
      { t: 'circle', cx: -w * 0.22, cy: h * 0.22, r: Math.min(w, h) * 0.13 },
      { t: 'circle', cx: w * 0.22, cy: h * 0.22, r: Math.min(w, h) * 0.13 },
    ]
    case 'fridge': return [
      { t: 'rect', x, y, w, h },
      { t: 'line', x1: x, y1: y + h * 0.78, x2: x + w, y2: y + h * 0.78 },  // door line
    ]
    case 'base': return [   // base cabinet — box + counter front line
      { t: 'rect', x, y, w, h },
      { t: 'line', x1: x, y1: y + h * 0.82, x2: x + w, y2: y + h * 0.82 },
    ]
    case 'upper': return [  // upper cabinet — box + X (shown lighter/over)
      { t: 'rect', x, y, w, h },
      { t: 'line', x1: x, y1: y, x2: x + w, y2: y + h },
      { t: 'line', x1: x + w, y1: y, x2: x, y2: y + h },
    ]
    case 'island': return [ // island — box + inset counter overhang
      { t: 'rect', x, y, w, h },
      { t: 'rect', x: x + 0.3, y: y + 0.3, w: w - 0.6, h: h - 0.6 },
    ]
    case 'counter': return [{ t: 'rect', x, y, w, h }]
    case 'stairs': {   // outline + tread lines across the run (h)
      const prims: Prim[] = [{ t: 'rect', x, y, w, h }]
      const n = Math.max(2, Math.round(h))
      for (let i = 1; i < n; i++) prims.push({ t: 'line', x1: x, y1: y + (i * h) / n, x2: x + w, y2: y + (i * h) / n })
      return prims
    }
    case 'railing': {  // centerline + post ticks along the length (w)
      const prims: Prim[] = [{ t: 'line', x1: x, y1: 0, x2: x + w, y2: 0 }]
      const n = Math.max(2, Math.round(w / 3))
      for (let i = 0; i <= n; i++) { const px = x + (i * w) / n; prims.push({ t: 'line', x1: px, y1: -0.2, x2: px, y2: 0.2 }) }
      return prims
    }
  }
}
// Sample fixture prims into world-feet polylines (for PDF / DXF), applying rot+pos.
function fixtureWorldPolys(f: Fixture): Pt[][] {
  const rad = f.rot * Math.PI / 180, cos = Math.cos(rad), sin = Math.sin(rad)
  const tf = (lx: number, ly: number): Pt => ({ x: f.at.x + lx * cos - ly * sin, y: f.at.y + lx * sin + ly * cos })
  const ell = (cx: number, cy: number, rx: number, ry: number, n = 28) => {
    const out: Pt[] = []
    for (let i = 0; i <= n; i++) { const a = (i / n) * 2 * Math.PI; out.push(tf(cx + rx * Math.cos(a), cy + ry * Math.sin(a))) }
    return out
  }
  const polys: Pt[][] = []
  for (const p of fixturePrims(f.kind, f.w, f.h)) {
    if (p.t === 'rect') polys.push([tf(p.x, p.y), tf(p.x + p.w, p.y), tf(p.x + p.w, p.y + p.h), tf(p.x, p.y + p.h), tf(p.x, p.y)])
    else if (p.t === 'line') polys.push([tf(p.x1, p.y1), tf(p.x2, p.y2)])
    else if (p.t === 'ellipse') polys.push(ell(p.cx, p.cy, p.rx, p.ry))
    else polys.push(ell(p.cx, p.cy, p.r, p.r, 18))
  }
  return polys
}
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

// constrain p to be horizontal or vertical relative to an anchor (Shift-draw)
function ortho(anchor: Pt, p: Pt): Pt {
  return Math.abs(p.x - anchor.x) >= Math.abs(p.y - anchor.y) ? { x: p.x, y: anchor.y } : { x: anchor.x, y: p.y }
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
  const [fixtures, setFixtures] = useState<Fixture[]>(value?.fixtures || [])
  const [dims, setDims] = useState<Dim[]>(value?.dims || [])
  const [fixKind, setFixKind] = useState<FixtureKind>('toilet')
  const updFixture = (id: string, p: Partial<Fixture>) => { checkpoint('fx' + id); setFixtures(prev => prev.map(f => f.id === id ? { ...f, ...p } : f)) }
  const dimStart = useRef<Pt | null>(null)
  const [tool, setTool] = useState<Tool>('wall')
  const [sel, setSel] = useState<Sel>(null)
  const [copied, setCopied] = useState(false)
  // default sizes for newly-placed openings (feet)
  const [defDoorW, setDefDoorW] = useState(3)
  const [defWinW, setDefWinW] = useState(3)
  const [wallThick, setWallThick] = useState(0.5)   // wall thickness in feet (6")
  const [wallStyle, setWallStyle] = useState<'outline' | 'solid'>('outline')  // double-line vs poché
  const [showWallDims, setShowWallDims] = useState(true)   // auto per-wall length labels
  const [show3D, setShow3D] = useState(false)
  const [finishes, setFinishes] = useState<Finishes>(value?.finishes || DEFAULT_FINISHES)

  // element editors
  const updOpening = (id: string, p: Partial<Opening>) => { checkpoint('op' + id); setOpenings(prev => prev.map(o => o.id === id ? { ...o, ...p } : o)) }
  const updRoom = (id: string, p: Partial<Room>) => { checkpoint('rm' + id); setRooms(prev => prev.map(r => r.id === id ? { ...r, ...p } : r)) }
  const updLabel = (id: string, p: Partial<Label>) => { checkpoint('lb' + id); setLabels(prev => prev.map(l => l.id === id ? { ...l, ...p } : l)) }
  const updWall = (id: string, p: Partial<Wall>) => { checkpoint('wl' + id); setWalls(prev => prev.map(w => w.id === id ? { ...w, ...p } : w)) }
  const wallLenOf = (wallId: string) => { const w = walls.find(x => x.id === wallId); return w ? dist(w.a, w.b) : 0 }

  // AI sketch import
  const [importing, setImporting] = useState(false)
  const [importErr, setImportErr] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)

  // Sketch underlay — the original photo faded behind the grid, aligned to the
  // walls, so you can trace the lines the AI missed. (Local only; not persisted.)
  const [underlay, setUnderlay] = useState<Underlay | null>(null)
  const underlayRef = useRef<HTMLInputElement>(null)
  function loadUnderlayImage(file: File) {
    const url = URL.createObjectURL(file)
    const img = new Image()
    img.onload = () => {
      const aspect = img.height / Math.max(1, img.width)
      setUnderlay({ src: url, x: 0, y: 0, w: 30, h: 30 * aspect, opacity: 0.4, visible: true })
    }
    img.src = url
  }

  // Persist changes upward (Design Studio saves this with the job plan). We seed
  // from `value` once on mount, then emit on every edit — skip the very first run.
  const firstEmit = useRef(true)
  useEffect(() => {
    if (firstEmit.current) { firstEmit.current = false; return }
    onChange?.({ walls, openings, rooms, labels, fixtures, dims, finishes })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [walls, openings, rooms, labels, fixtures, dims, finishes])

  // view
  const [ppf, setPpf] = useState(16)            // pixels per foot at zoom 1
  const [zoom, setZoom] = useState(1)
  const [pan, setPan] = useState<Pt>({ x: 60, y: 60 })
  const [size, setSize] = useState({ w: 900, h: 620 })

  // transient interaction
  const [cursor, setCursor] = useState<Pt | null>(null)   // snapped world pt under pointer
  const wallChain = useRef<Pt | null>(null)               // current wall-chain anchor
  const wallDown = useRef<Pt | null>(null)                // mousedown point (for drag-to-draw a wall)
  const [, force] = useState(0)
  const roomDrag = useRef<{ a: Pt } | null>(null)
  const [roomPreview, setRoomPreview] = useState<{ a: Pt; b: Pt } | null>(null)
  const dragging = useRef<{ kind: 'vertex' | 'pan' | 'fixture' | 'label' | 'room'; from: Pt; orig?: Pt; panFrom?: Pt; id?: string; fixFrom?: Pt } | null>(null)

  // ── Undo history ─────────────────────────────────────────────────────────────
  const past = useRef<PlanDoc[]>([])
  const cpTime = useRef(0), cpTag = useRef('')
  const [undoDepth, setUndoDepth] = useState(0)
  // Snapshot the current doc BEFORE a mutation. Skipped mid-drag (the drag start
  // already checkpointed); rapid same-tag edits (slider/stepper) collapse into one.
  function checkpoint(tag = '') {
    if (dragging.current) return
    const now = Date.now()
    if (tag && tag === cpTag.current && now - cpTime.current < 700) return
    cpTime.current = now; cpTag.current = tag
    past.current.push({ walls, openings, rooms, labels, fixtures, dims })
    if (past.current.length > 60) past.current.shift()
    setUndoDepth(past.current.length)
  }
  function undo() {
    const prev = past.current.pop()
    if (!prev) return
    setWalls(prev.walls || []); setOpenings(prev.openings || []); setRooms(prev.rooms || [])
    setLabels(prev.labels || []); setFixtures(prev.fixtures || []); setDims(prev.dims || [])
    setSel(null); cpTag.current = ''; setUndoDepth(past.current.length)
  }

  const wrapRef = useRef<HTMLDivElement>(null)
  const svgRef = useRef<SVGSVGElement>(null)

  // responsive width
  useEffect(() => {
    const el = wrapRef.current
    if (!el) return
    const measure = () => setSize({ w: el.clientWidth, h: Math.max(460, Math.min(920, window.innerHeight - 290)) })
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    window.addEventListener('resize', measure)
    measure()
    return () => { ro.disconnect(); window.removeEventListener('resize', measure) }
  }, [])

  const scale = ppf * zoom
  const wallPx = Math.max(3, wallThick * scale)   // wall draw thickness in screen px
  // Double-line ("outline") walls: a dark stroke (full thickness) under a white
  // stroke (interior) leaves two dark faces; overlap at shared corners mitres
  // cleanly with no geometry solving. faceW = thickness of each drawn face.
  const faceW = Math.min(2.5, Math.max(1, wallPx * 0.16))
  const wallInnerPx = Math.max(0.5, wallPx - 2 * faceW)
  const toPx = useCallback((p: Pt): Pt => ({ x: p.x * scale + pan.x, y: p.y * scale + pan.y }), [scale, pan])
  const toWorld = useCallback((sx: number, sy: number): Pt => ({ x: (sx - pan.x) / scale, y: (sy - pan.y) / scale }), [scale, pan])
  const snap = (p: Pt): Pt => ({ x: Math.round(p.x / SNAP_FT) * SNAP_FT, y: Math.round(p.y / SNAP_FT) * SNAP_FT })

  // also snap to existing wall endpoints within tolerance (so corners join)
  function snapSmart(world: Pt): Pt {
    const tolPx = 12
    let best: Pt | null = null
    let bestD = Infinity
    for (const w of walls) {
      if (!w) continue
      for (const v of [w.a, w.b]) {
        if (!v || typeof v.x !== 'number' || typeof v.y !== 'number') continue
        const d = dist(toPx(world), toPx(v))
        if (d < tolPx && d < bestD) { best = v; bestD = d }
      }
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
      // Record the press point. On release we decide: a DRAG draws one wall;
      // a CLICK (no movement) chains corners. Either way, walls finalize in onUp.
      wallDown.current = sp
      force(n => n + 1)
      return
    }

    if (tool === 'room') { roomDrag.current = { a: sp }; setRoomPreview({ a: sp, b: sp }); return }

    if (tool === 'door' || tool === 'window') {
      const hit = nearestWall(w)
      if (hit && hit.dist < 0.8) {
        const wl = dist(hit.wall.a, hit.wall.b) || 1
        const width = Math.min(tool === 'door' ? defDoorW : defWinW, wl * 0.95)
        const half = (width / 2) / wl
        const t = Math.max(half, Math.min(1 - half, hit.t))
        const id = uid()
        checkpoint('place')
        setOpenings(prev => [...prev, { id, wallId: hit.wall.id, t, width, kind: tool, flip: false }])
        setSel({ kind: 'opening', id })   // select it so you can tweak immediately
      }
      return
    }

    if (tool === 'fixture') {
      const def = FIXTURES[fixKind]
      const id = uid()
      checkpoint('place')
      setFixtures(prev => [...prev, { id, kind: fixKind, at: sp, w: def.w, h: def.h, rot: 0 }])
      setSel({ kind: 'fixture', id })
      return
    }

    if (tool === 'dim') {
      if (!dimStart.current) { dimStart.current = sp }
      else {
        if (dist(dimStart.current, sp) > 0.1) {
          const id = uid()
          checkpoint('place')
          setDims(prev => [...prev, { id, a: dimStart.current!, b: sp, off: 1.5 }])
          setSel({ kind: 'dim', id })
        }
        dimStart.current = null
      }
      force(n => n + 1)
      return
    }

    if (tool === 'select') {
      const h = hitTest(w)
      setSel(h)
      // checkpoint at drag start so the whole drag is one undo step
      if (h && (h.kind === 'vertex' || h.kind === 'fixture' || h.kind === 'label' || h.kind === 'room')) checkpoint('drag' + h.id)
      if (h?.kind === 'vertex' && h.vx) dragging.current = { kind: 'vertex', from: w, orig: h.vx }
      if (h?.kind === 'fixture') dragging.current = { kind: 'fixture', from: w, id: h.id, fixFrom: fixtures.find(f => f.id === h.id)?.at }
      if (h?.kind === 'label') dragging.current = { kind: 'label', from: w, id: h.id }
      if (h?.kind === 'room') dragging.current = { kind: 'room', from: w, id: h.id }
    }
  }

  function onMove(e: React.MouseEvent) {
    const w = evtWorld(e)
    let c = snapSmart(w)
    const wallAnchor = wallDown.current || wallChain.current
    if (tool === 'wall' && wallAnchor && e.shiftKey) c = snap(ortho(wallAnchor, c))
    setCursor(c)

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
    if (d?.kind === 'fixture' && d.id) { updFixture(d.id, { at: snap(w) }); return }
    if (d?.kind === 'label' && d.id) { updLabel(d.id, { at: w }); return }   // free placement for text
    if (d?.kind === 'room' && d.id) { updRoom(d.id, { at: w }); return }
    if (roomDrag.current) setRoomPreview({ a: roomDrag.current.a, b: snap(w) })
  }

  function onUp(e: React.MouseEvent) {
    const leaving = e.type === 'mouseleave'
    // Wall: finalize a drag (one wall) or a click (chain a corner). Snapping to
    // existing endpoints connects walls automatically.
    if (tool === 'wall' && wallDown.current) {
      if (!leaving) {
        let up = snapSmart(evtWorld(e))
        if (e.shiftKey) up = snap(ortho(wallDown.current, up))
        const dragged = dist(wallDown.current, up) > 0.4
        if (dragged) {
          checkpoint('wall')
          setWalls(prev => [...prev, { id: uid(), a: wallDown.current!, b: up }])
          wallChain.current = up
        } else {
          // a click: start a chain anchor, or close a segment to the chain anchor
          if (wallChain.current && dist(wallChain.current, up) > 0.1) {
            checkpoint('wall')
            setWalls(prev => [...prev, { id: uid(), a: wallChain.current!, b: up }])
          }
          wallChain.current = up
        }
        force(n => n + 1)
      }
      wallDown.current = null
    }
    if (roomDrag.current && roomPreview) {
      const { a, b } = roomPreview
      const x0 = Math.min(a.x, b.x), y0 = Math.min(a.y, b.y)
      const x1 = Math.max(a.x, b.x), y1 = Math.max(a.y, b.y)
      const w = x1 - x0, h = y1 - y0
      if (w >= 0.5 && h >= 0.5) {
        checkpoint('room')
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

  function onDouble() { if (tool === 'wall') { wallChain.current = null; wallDown.current = null; force(n => n + 1) } }

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
    // openings
    for (const o of openings) {
      const wl = walls.find(w => w.id === o.wallId); if (!wl) continue
      const c = add(wl.a, mul(sub(wl.b, wl.a), o.t))
      if (dist(toPx(p), toPx(c)) < tolPx + 4) return { kind: 'opening', id: o.id }
    }
    // fixtures (inside footprint, in fixture-local space)
    for (const f of fixtures) {
      const rad = -f.rot * Math.PI / 180, dx = p.x - f.at.x, dy = p.y - f.at.y
      const lx = dx * Math.cos(rad) - dy * Math.sin(rad), ly = dx * Math.sin(rad) + dy * Math.cos(rad)
      if (Math.abs(lx) <= f.w / 2 && Math.abs(ly) <= f.h / 2) return { kind: 'fixture', id: f.id }
    }
    // dimensions (near the dim line)
    for (const d of dims) {
      const u = norm(sub(d.b, d.a)), n = perp(u)
      const a2 = add(d.a, mul(n, d.off)), b2 = add(d.b, mul(n, d.off))
      if (nearestOnSeg(p, a2, b2).dist * scale < tolPx) return { kind: 'dim', id: d.id }
    }
    // text labels (room names / dimensions) — grab a wide box so they're easy to hit
    for (const l of labels) { const c = toPx(l.at); if (Math.abs(toPx(p).x - c.x) < 6 + l.text.length * 3.5 && Math.abs(toPx(p).y - c.y) < 9) return { kind: 'label', id: l.id } }
    // room labels
    for (const r of rooms) if (dist(toPx(p), toPx(r.at)) < 26) return { kind: 'room', id: r.id }
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
    checkpoint('del')
    if (sel.kind === 'wall') {
      setWalls(prev => prev.filter(w => w.id !== sel.id))
      setOpenings(prev => prev.filter(o => o.wallId !== sel.id))
    } else if (sel.kind === 'opening') setOpenings(prev => prev.filter(o => o.id !== sel.id))
    else if (sel.kind === 'room') setRooms(prev => prev.filter(r => r.id !== sel.id))
    else if (sel.kind === 'label') setLabels(prev => prev.filter(l => l.id !== sel.id))
    else if (sel.kind === 'fixture') setFixtures(prev => prev.filter(f => f.id !== sel.id))
    else if (sel.kind === 'dim') setDims(prev => prev.filter(d => d.id !== sel.id))
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
    // Drop the original photo in as an aligned underlay so you can trace the rest.
    if (plan.underlay?.image) {
      setUnderlay({
        src: plan.underlay.image,
        x: +plan.underlay.x || 0, y: +plan.underlay.y || 0,
        w: +plan.underlay.w || 30, h: +plan.underlay.h || 30,
        opacity: 0.4, visible: true,
      })
    }
    setSel(null); wallChain.current = null
    setTool('select'); setZoom(1); setPan({ x: 48, y: 48 })
  }

  // keyboard: delete + escape
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Delete' || e.key === 'Backspace') { if (sel) { e.preventDefault(); deleteSel() } }
      if (e.key === 'Escape') { wallChain.current = null; wallDown.current = null; dimStart.current = null; setSel(null); roomDrag.current = null; setRoomPreview(null); force(n => n + 1) }
      if ((e.ctrlKey || e.metaKey) && (e.key === 'z' || e.key === 'Z')) { e.preventDefault(); undo() }
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

  function clearAll() { if (confirm('Clear the whole plan?')) { checkpoint('clear'); setWalls([]); setOpenings([]); setRooms([]); setLabels([]); setFixtures([]); setDims([]); setSel(null); wallChain.current = null } }

  function copyJSON() {
    const doc = { units: 'feet', walls, openings, rooms, labels }
    navigator.clipboard?.writeText(JSON.stringify(doc, null, 2)).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1500) })
  }

  // ── PDF export — a print-ready sheet at a real architectural scale + title block.
  // Drawn in CSS px at 96 px/in so the browser prints at true scale (Save as PDF).
  function exportPDF() {
    if (!walls.length) { alert('Draw or import a plan first.'); return }
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity
    const see = (p: Pt) => { if (p.x < x0) x0 = p.x; if (p.y < y0) y0 = p.y; if (p.x > x1) x1 = p.x; if (p.y > y1) y1 = p.y }
    walls.forEach(w => { see(w.a); see(w.b) }); labels.forEach(l => see(l.at)); rooms.forEach(r => see(r.at))
    fixtures.forEach(f => see(f.at)); dims.forEach(d => { see(d.a); see(d.b) })
    const bw = Math.max(1, x1 - x0), bh = Math.max(1, y1 - y0)
    const SCALES = [
      { v: 0.25, l: '1/4" = 1\'-0"' }, { v: 0.1875, l: '3/16" = 1\'-0"' }, { v: 0.125, l: '1/8" = 1\'-0"' },
      { v: 0.09375, l: '3/32" = 1\'-0"' }, { v: 0.0625, l: '1/16" = 1\'-0"' }, { v: 0.03125, l: '1/32" = 1\'-0"' },
    ]
    const DPI = 96, maxW = 9.4 * DPI, maxH = 6.5 * DPI
    let chosen = SCALES[SCALES.length - 1]
    for (const s of SCALES) { if (bw * s.v * DPI <= maxW && bh * s.v * DPI <= maxH) { chosen = s; break } }
    const ppf = chosen.v * DPI, pad = 0.4 * DPI
    const W = bw * ppf + pad * 2, H = bh * ppf + pad * 2
    const X = (p: Pt) => +((p.x - x0) * ppf + pad).toFixed(1)
    const Y = (p: Pt) => +((p.y - y0) * ppf + pad).toFixed(1)
    const wpx = Math.max(2, wallThick * ppf)
    const pFace = Math.min(2.5, Math.max(0.7, wpx * 0.16)), pInner = Math.max(0.4, wpx - 2 * pFace)
    const esc = (s: string) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    const P: string[] = []
    for (const w of walls) P.push(`<line x1="${X(w.a)}" y1="${Y(w.a)}" x2="${X(w.b)}" y2="${Y(w.b)}" stroke="#111827" stroke-width="${wpx.toFixed(1)}" stroke-linecap="round"/>`)
    if (wallStyle === 'outline') for (const w of walls) P.push(`<line x1="${X(w.a)}" y1="${Y(w.a)}" x2="${X(w.b)}" y2="${Y(w.b)}" stroke="#fff" stroke-width="${pInner.toFixed(1)}" stroke-linecap="round"/>`)
    for (const o of openings) {
      const wl = walls.find(w => w.id === o.wallId); if (!wl) continue
      const u = norm(sub(wl.b, wl.a)), c = add(wl.a, mul(sub(wl.b, wl.a), o.t)), half = o.width / 2
      const j1 = sub(c, mul(u, half)), j2 = add(c, mul(u, half)), n = mul(perp(u), o.flip ? -1 : 1)
      P.push(`<line x1="${X(j1)}" y1="${Y(j1)}" x2="${X(j2)}" y2="${Y(j2)}" stroke="#fff" stroke-width="${(wpx + 1).toFixed(1)}"/>`)
      if (wallStyle === 'outline') { const jd = perp(u), ht = wallThick / 2; for (const j of [j1, j2]) { const q1 = add(j, mul(jd, ht)), q2 = sub(j, mul(jd, ht)); P.push(`<line x1="${X(q1)}" y1="${Y(q1)}" x2="${X(q2)}" y2="${Y(q2)}" stroke="#111827" stroke-width="${pFace.toFixed(1)}" stroke-linecap="round"/>`) } }
      const hp = o.hinge ? j2 : j1, lp = o.hinge ? j1 : j2
      if (o.kind === 'door') {
        const tip = add(hp, mul(n, o.width))
        const a0 = Math.atan2(lp.y - hp.y, lp.x - hp.x), a1 = Math.atan2(tip.y - hp.y, tip.x - hp.x)
        let dl = a1 - a0; while (dl > Math.PI) dl -= 2 * Math.PI; while (dl < -Math.PI) dl += 2 * Math.PI
        const pts: string[] = []
        for (let i = 0; i <= 16; i++) { const a = a0 + dl * (i / 16); const pp = { x: hp.x + o.width * Math.cos(a), y: hp.y + o.width * Math.sin(a) }; pts.push(`${X(pp)},${Y(pp)}`) }
        P.push(`<line x1="${X(hp)}" y1="${Y(hp)}" x2="${X(tip)}" y2="${Y(tip)}" stroke="#111827" stroke-width="1"/>`)
        P.push(`<polyline points="${pts.join(' ')}" fill="none" stroke="#111827" stroke-width="1"/>`)
      } else if (o.kind === 'pocket') {
        const off = mul(perp(u), (o.flip ? -1 : 1) * Math.min(0.2, wallThick * 0.35))
        const s1 = add(j1, off), s2 = add(j2, off), pk = add(lp, mul(sub(lp, hp), 0.9 / (o.width || 1)))
        P.push(`<line x1="${X(s1)}" y1="${Y(s1)}" x2="${X(s2)}" y2="${Y(s2)}" stroke="#111827" stroke-width="2"/>`)
        P.push(`<line x1="${X(add(lp, off))}" y1="${Y(add(lp, off))}" x2="${X(add(pk, off))}" y2="${Y(add(pk, off))}" stroke="#111827" stroke-width="1" stroke-dasharray="4 2"/>`)
      } else {
        P.push(`<line x1="${X(j1)}" y1="${Y(j1)}" x2="${X(j2)}" y2="${Y(j2)}" stroke="#111827" stroke-width="1.5"/>`)
      }
    }
    for (const f of fixtures) for (const pl of fixtureWorldPolys(f)) {
      P.push(`<polyline points="${pl.map(p => `${X(p)},${Y(p)}`).join(' ')}" fill="none" stroke="#111827" stroke-width="1"/>`)
    }
    for (const dm of dims) {
      const u = norm(sub(dm.b, dm.a)), n = perp(u)
      const a2 = add(dm.a, mul(n, dm.off)), b2 = add(dm.b, mul(n, dm.off)), m = mul(add(a2, b2), 0.5)
      P.push(`<line x1="${X(a2)}" y1="${Y(a2)}" x2="${X(b2)}" y2="${Y(b2)}" stroke="#111827" stroke-width="0.8"/>`)
      P.push(`<line x1="${X(dm.a)}" y1="${Y(dm.a)}" x2="${X(a2)}" y2="${Y(a2)}" stroke="#111827" stroke-width="0.4"/>`)
      P.push(`<line x1="${X(dm.b)}" y1="${Y(dm.b)}" x2="${X(b2)}" y2="${Y(b2)}" stroke="#111827" stroke-width="0.4"/>`)
      const ang = Math.atan2(b2.y - a2.y, b2.x - a2.x) * 180 / Math.PI, aa = (ang > 90 || ang < -90) ? ang + 180 : ang
      P.push(`<text x="${X(m)}" y="${(Y(m) - 2).toFixed(1)}" font-size="8" fill="#111827" text-anchor="middle" transform="rotate(${aa.toFixed(1)} ${X(m)} ${Y(m)})">${esc(fmtFt(dist(dm.a, dm.b)))}</text>`)
    }
    for (const w of walls) {
      const L = dist(w.a, w.b); if (L < 1) continue
      const m = add(mul(add(w.a, w.b), 0.5), mul(perp(norm(sub(w.b, w.a))), 0.6))
      const ang = Math.atan2(w.b.y - w.a.y, w.b.x - w.a.x) * 180 / Math.PI, a2 = (ang > 90 || ang < -90) ? ang + 180 : ang
      P.push(`<text x="${X(m)}" y="${Y(m)}" font-size="8" fill="#374151" text-anchor="middle" transform="rotate(${a2.toFixed(1)} ${X(m)} ${Y(m)})">${esc(fmtFt(L))}</text>`)
    }
    for (const r of rooms) {
      P.push(`<text x="${X(r.at)}" y="${Y(r.at)}" font-size="9" font-weight="bold" fill="#111827" text-anchor="middle">${esc(r.name)}</text>`)
      P.push(`<text x="${X(r.at)}" y="${(Y(r.at) + 11).toFixed(1)}" font-size="8" fill="#374151" text-anchor="middle">${esc(fmtFt(r.w) + ' x ' + fmtFt(r.h))}</text>`)
    }
    for (const l of labels) P.push(`<text x="${X(l.at)}" y="${Y(l.at)}" font-size="9" font-weight="bold" fill="#111827" text-anchor="middle">${esc(l.text)}</text>`)
    const svg = `<svg width="${W.toFixed(0)}" height="${H.toFixed(0)}" viewBox="0 0 ${W.toFixed(0)} ${H.toFixed(0)}" xmlns="http://www.w3.org/2000/svg">${P.join('')}</svg>`
    const today = new Date().toLocaleDateString()
    const html = `<!doctype html><html><head><meta charset="utf-8"><title>Floor Plan</title><style>
@page{size:letter landscape;margin:0.4in}*{box-sizing:border-box}body{margin:0;font-family:Arial,Helvetica,sans-serif;color:#111}
.plan{display:flex;justify-content:center}.tb{margin-top:8px;border:1.5px solid #111;display:flex;font-size:11px}
.tb div{padding:6px 10px;border-right:1px solid #111}.tb .grow{flex:1;font-weight:bold;font-size:13px}.tb .last{border-right:none}
.noprint{position:fixed;top:8px;right:8px}@media print{.noprint{display:none}}</style></head><body>
<div class="noprint"><button onclick="window.print()" style="padding:8px 14px;font-weight:bold;border:1px solid #111;border-radius:6px;background:#b8895a;color:#fff;cursor:pointer">Print / Save PDF</button></div>
<div class="plan">${svg}</div>
<div class="tb"><div class="grow">FLOOR PLAN</div><div>Scale: ${chosen.l}</div><div>Date: ${esc(today)}</div><div class="last">L. Price Building Co.</div></div>
<script>window.onload=function(){setTimeout(function(){window.print()},350)}</script></body></html>`
    const win = window.open('', '_blank')
    if (!win) { alert('Please allow pop-ups to export the PDF.'); return }
    win.document.open(); win.document.write(html); win.document.close()
  }

  // ── DXF export (R12 ASCII) — opens in AutoCAD/CAD. Coordinates in feet, Y flipped
  // (DXF is Y-up). Entities split onto named layers; downloads as floorplan.dxf.
  function exportDXF() {
    if (!walls.length) { alert('Draw or import a plan first.'); return }
    const L: string[] = []
    const g = (...xs: (string | number)[]) => { for (const x of xs) L.push(String(x)) }
    const FY = (y: number) => +(-y).toFixed(4)
    const FX = (x: number) => +x.toFixed(4)
    const line = (a: Pt, b: Pt, layer: string) => g(0, 'LINE', 8, layer, 10, FX(a.x), 20, FY(a.y), 30, 0, 11, FX(b.x), 21, FY(b.y), 31, 0)
    const text = (p: Pt, s: string, h: number, layer: string) => g(0, 'TEXT', 8, layer, 10, FX(p.x), 20, FY(p.y), 30, 0, 40, h, 1, s)
    const poly = (pts: Pt[], layer: string) => { for (let i = 0; i < pts.length - 1; i++) line(pts[i], pts[i + 1], layer) }
    // TABLES → layers (color: ACI)
    const layers: [string, number][] = [['WALLS', 7], ['DOORS', 30], ['WINDOWS', 5], ['FIXTURES', 8], ['DIMS', 1], ['TEXT', 3]]
    g(0, 'SECTION', 2, 'TABLES', 0, 'TABLE', 2, 'LAYER', 70, layers.length)
    for (const [nm, col] of layers) g(0, 'LAYER', 2, nm, 70, 0, 62, col, 6, 'CONTINUOUS')
    g(0, 'ENDTAB', 0, 'ENDSEC')
    // ENTITIES
    g(0, 'SECTION', 2, 'ENTITIES')
    for (const w of walls) line(w.a, w.b, 'WALLS')
    for (const o of openings) {
      const wl = walls.find(w => w.id === o.wallId); if (!wl) continue
      const u = norm(sub(wl.b, wl.a)), c = add(wl.a, mul(sub(wl.b, wl.a), o.t)), half = o.width / 2
      const j1 = sub(c, mul(u, half)), j2 = add(c, mul(u, half)), n = mul(perp(u), o.flip ? -1 : 1)
      const hp = o.hinge ? j2 : j1, lp = o.hinge ? j1 : j2
      if (o.kind === 'door') {
        const tip = add(hp, mul(n, o.width))
        line(hp, tip, 'DOORS')
        const a0 = Math.atan2(lp.y - hp.y, lp.x - hp.x), a1 = Math.atan2(tip.y - hp.y, tip.x - hp.x)
        let dl = a1 - a0; while (dl > Math.PI) dl -= 2 * Math.PI; while (dl < -Math.PI) dl += 2 * Math.PI
        const pts: Pt[] = []; for (let i = 0; i <= 16; i++) { const a = a0 + dl * (i / 16); pts.push({ x: hp.x + o.width * Math.cos(a), y: hp.y + o.width * Math.sin(a) }) }
        poly(pts, 'DOORS')
      } else if (o.kind === 'pocket') {
        const off = mul(perp(u), (o.flip ? -1 : 1) * Math.min(0.2, wallThick * 0.35))
        line(add(j1, off), add(j2, off), 'DOORS')
        const pk = add(lp, mul(sub(lp, hp), 0.9 / (o.width || 1)))
        line(add(lp, off), add(pk, off), 'DOORS')
      } else line(j1, j2, 'WINDOWS')
    }
    for (const f of fixtures) for (const pl of fixtureWorldPolys(f)) poly(pl, 'FIXTURES')
    for (const d of dims) {
      const u = norm(sub(d.b, d.a)), n = perp(u)
      const a2 = add(d.a, mul(n, d.off)), b2 = add(d.b, mul(n, d.off))
      line(a2, b2, 'DIMS'); line(d.a, a2, 'DIMS'); line(d.b, b2, 'DIMS')
      text(mul(add(a2, b2), 0.5), fmtFt(dist(d.a, d.b)), 0.4, 'DIMS')
    }
    for (const r of rooms) { text(r.at, r.name, 0.5, 'TEXT'); text({ x: r.at.x, y: r.at.y + 0.8 }, `${fmtFt(r.w)} x ${fmtFt(r.h)}`, 0.35, 'TEXT') }
    for (const l of labels) text(l.at, l.text, 0.5, 'TEXT')
    g(0, 'ENDSEC', 0, 'EOF')
    const blob = new Blob([L.join('\r\n')], { type: 'application/dxf' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a'); a.href = url; a.download = 'floorplan.dxf'; a.click()
    setTimeout(() => URL.revokeObjectURL(url), 1500)
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
    const stroke = o.kind === 'window' ? '#2563eb' : '#b8895a'

    // mask the wall under the opening (white gap)
    const maskW = wallPx + 2
    const els: JSX.Element[] = [
      <line key="mask" x1={pj1.x} y1={pj1.y} x2={pj2.x} y2={pj2.y} stroke="#ffffff" strokeWidth={maskW} strokeLinecap="butt" />,
    ]
    // outline walls: close the wall at each jamb with a short cross line
    if (wallStyle === 'outline') {
      const jd = perp(u), ht = wallThick / 2
      ;[j1, j2].forEach((j, i) => {
        const q1 = toPx(add(j, mul(jd, ht))), q2 = toPx(sub(j, mul(jd, ht)))
        els.push(<line key={`jamb${i}`} x1={q1.x} y1={q1.y} x2={q2.x} y2={q2.y} stroke="#1f2937" strokeWidth={faceW} strokeLinecap="round" />)
      })
    }
    // hinge side controlled by o.hinge (which jamb pivots); swing side by o.flip
    const hp = o.hinge ? j2 : j1   // hinge point
    const lp = o.hinge ? j1 : j2   // latch point
    if (o.kind === 'door') {
      const tip = add(hp, mul(n, o.width))     // open leaf tip
      const ptip = toPx(hp), pt2 = toPx(tip)
      const a0 = Math.atan2(lp.y - hp.y, lp.x - hp.x)
      const a1 = Math.atan2(tip.y - hp.y, tip.x - hp.x)
      let dlt = a1 - a0; while (dlt > Math.PI) dlt -= 2 * Math.PI; while (dlt < -Math.PI) dlt += 2 * Math.PI
      const pts: string[] = []
      for (let i = 0; i <= 16; i++) { const a = a0 + dlt * (i / 16); const pp = toPx({ x: hp.x + o.width * Math.cos(a), y: hp.y + o.width * Math.sin(a) }); pts.push(`${pp.x},${pp.y}`) }
      els.push(<line key="leaf" x1={ptip.x} y1={ptip.y} x2={pt2.x} y2={pt2.y} stroke={stroke} strokeWidth={1.6} />)
      els.push(<polyline key="arc" points={pts.join(' ')} fill="none" stroke={stroke} strokeWidth={1.4} />)
    } else if (o.kind === 'pocket') {
      // pocket door: slab in the opening + dashed cavity sliding into the wall
      const off = mul(perp(u), (o.flip ? -1 : 1) * Math.min(0.2, wallThick * 0.35))
      const s1 = toPx(add(j1, off)), s2 = toPx(add(j2, off))
      els.push(<line key="slab" x1={s1.x} y1={s1.y} x2={s2.x} y2={s2.y} stroke={stroke} strokeWidth={2.5} />)
      const pk = add(lp, mul(sub(lp, hp), 0.9 / (o.width || 1)))  // extend past latch into wall
      const c1 = toPx(add(lp, off)), c2 = toPx(add(pk, off))
      els.push(<line key="pocket" x1={c1.x} y1={c1.y} x2={c2.x} y2={c2.y} stroke={stroke} strokeWidth={1.2} strokeDasharray="4 2" />)
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
    <button title={label} onClick={() => { setTool(t); wallChain.current = null; wallDown.current = null; setSel(null) }}
      className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-xs font-semibold transition-colors ${tool === t ? 'border-amber-300 bg-amber-50 text-amber-700' : 'border-gray-200 text-gray-500 hover:bg-gray-50'}`}>
      <Icon size={14} /> <span className="hidden sm:inline">{label}</span>
    </button>
  )

  // width stepper in feet (¼-ft increments) with a live foot-inch readout
  const SizeStepper = ({ value, onChange, min = 0.5, max = 40 }: { value: number; onChange: (v: number) => void; min?: number; max?: number }) => {
    const clamp = (v: number) => Math.max(min, Math.min(max, Math.round(v * 4) / 4))
    return (
      <div className="flex items-center gap-1">
        <button onClick={() => onChange(clamp(value - 0.25))} className="w-6 h-6 rounded border border-gray-200 bg-white text-gray-600 hover:bg-gray-50">−</button>
        <input type="number" step={0.25} min={min} max={max} value={value}
          onChange={e => onChange(clamp(Number(e.target.value) || min))}
          className="w-14 border border-gray-200 rounded px-1.5 py-0.5 text-center text-xs bg-white focus:outline-none focus:ring-1 focus:ring-blue-400" />
        <span className="text-gray-500 tabular-nums w-12 text-center">{fmtFt(value)}</span>
        <button onClick={() => onChange(clamp(value + 0.25))} className="w-6 h-6 rounded border border-gray-200 bg-white text-gray-600 hover:bg-gray-50">+</button>
      </div>
    )
  }

  // resize an opening, keeping it inside its wall
  function setOpeningWidth(id: string, newW: number) {
    checkpoint('ow' + id)
    setOpenings(prev => prev.map(o => {
      if (o.id !== id) return o
      const wl = wallLenOf(o.wallId) || 1
      const width = Math.max(0.5, Math.min(newW, wl * 0.95))
      const half = (width / 2) / wl
      return { ...o, width, t: Math.max(half, Math.min(1 - half, o.t)) }
    }))
  }

  return (
    <div className="space-y-3">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2 bg-gray-50 border border-gray-200 rounded-xl px-3 py-2">
        <ToolBtn t="select" icon={MousePointer2} label="Select" />
        <ToolBtn t="wall" icon={Minus} label="Wall" />
        <ToolBtn t="room" icon={Square} label="Room" />
        <ToolBtn t="door" icon={DoorOpen} label="Door" />
        <ToolBtn t="window" icon={RectangleHorizontal} label="Window" />
        <ToolBtn t="dim" icon={Ruler} label="Dimension" />
        <ToolBtn t="fixture" icon={Bath} label="Fixture" />
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
        {/* Manual photo underlay (trace over any image) */}
        <input ref={underlayRef} type="file" accept="image/*" className="hidden"
          onChange={e => { const f = e.target.files?.[0]; if (f) loadUnderlayImage(f); if (underlayRef.current) underlayRef.current.value = '' }} />
        <button onClick={() => underlayRef.current?.click()} title="Load a photo to trace over (underlay)"
          className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-gray-200 text-gray-500 text-xs font-semibold hover:bg-gray-50">
          <ImageIcon size={13} /> <span className="hidden sm:inline">Underlay</span>
        </button>
        <div className="w-px h-6 bg-gray-200 mx-1" />
        <button onClick={() => zoomBy(1 / 1.2)} title="Zoom out" className="p-1.5 rounded-lg border border-gray-200 text-gray-500 hover:bg-gray-50"><ZoomOut size={14} /></button>
        <button onClick={() => { setZoom(1); setPan({ x: 60, y: 60 }) }} className="px-2 py-1 rounded-lg border border-gray-200 text-gray-700 text-xs font-semibold tabular-nums min-w-[46px]">{Math.round(zoom * 100)}%</button>
        <button onClick={() => zoomBy(1.2)} title="Zoom in" className="p-1.5 rounded-lg border border-gray-200 text-gray-500 hover:bg-gray-50"><ZoomIn size={14} /></button>
        <div className="flex-1" />
        <button onClick={undo} disabled={undoDepth === 0} title="Undo (Ctrl+Z)" className="p-1.5 rounded-lg border border-gray-200 text-gray-500 hover:bg-gray-50 disabled:opacity-30"><Undo2 size={14} /></button>
        <button onClick={deleteSel} disabled={!sel} title="Delete selection" className="p-1.5 rounded-lg border border-gray-200 text-gray-500 hover:bg-gray-50 disabled:opacity-30"><Trash2 size={14} /></button>
        <button onClick={clearAll} title="Clear all" className="p-1.5 rounded-lg border border-gray-200 text-gray-500 hover:bg-gray-50"><RotateCcw size={14} /></button>
        {/* Wall thickness */}
        <div className="flex items-center gap-1 text-xs text-gray-500">
          <span className="hidden sm:inline">Wall</span>
          <select value={wallThick} onChange={e => setWallThick(Number(e.target.value))}
            title="Wall thickness" className="border border-gray-200 rounded-lg px-1.5 py-1 bg-white text-xs focus:outline-none">
            <option value={0.333}>4&quot;</option>
            <option value={0.5}>6&quot;</option>
            <option value={0.667}>8&quot;</option>
            <option value={0.0625}>thin</option>
          </select>
          <button onClick={() => setWallStyle(s => s === 'outline' ? 'solid' : 'outline')}
            title="Toggle double-line / solid walls"
            className="px-2 py-1 rounded-lg border border-gray-200 bg-white text-gray-600 hover:bg-gray-50 text-xs">
            {wallStyle === 'outline' ? 'double-line' : 'solid'}
          </button>
          <button onClick={() => setShowWallDims(v => !v)}
            title="Show/hide automatic wall length labels"
            className={`px-2 py-1 rounded-lg border text-xs ${showWallDims ? 'border-blue-200 bg-blue-50 text-blue-700' : 'border-gray-200 bg-white text-gray-400'}`}>
            dims
          </button>
        </div>
        <button onClick={exportPDF} title="Export a print-ready PDF at scale" className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-gray-200 text-xs font-semibold text-gray-600 hover:bg-gray-50">
          <FileDown size={13} /> <span className="hidden sm:inline">PDF</span>
        </button>
        <button onClick={exportDXF} title="Export DXF for AutoCAD/CAD" className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-gray-200 text-xs font-semibold text-gray-600 hover:bg-gray-50">
          <FileDown size={13} /> <span className="hidden sm:inline">DXF</span>
        </button>
        <button onClick={() => setShow3D(true)} disabled={!walls.length} title="View in 3D & pick finishes" className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-teal-300 bg-teal-50 text-teal-700 text-xs font-semibold hover:bg-teal-100 disabled:opacity-50">
          <Box size={13} /> <span className="hidden sm:inline">3D</span>
        </button>
        <button onClick={copyJSON} title="Copy plan data (JSON)" className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-gray-200 text-xs font-semibold text-gray-600 hover:bg-gray-50">
          {copied ? <Check size={13} className="text-green-600" /> : <Copy size={13} />} {copied ? 'Copied' : 'Plan JSON'}
        </button>
      </div>

      <p className="text-xs text-gray-500">
        Grid = 1 ft, snapping to 3&quot;. <strong>Import sketch (AI)</strong> drafts an editable plan from a photo, then refine it:{' '}
        <strong>Wall</strong>: drag to draw one wall, or click corner-to-corner (double-click to finish). <strong>Room</strong> drags a rectangle,{' '}
        <strong>Door/Window</strong> clicks a wall, <strong>Select</strong> drags corners, labels & fixtures (Delete removes).
      </p>

      {importErr && (
        <div className="flex items-start gap-2 bg-red-50 border border-red-200 rounded-xl px-3 py-2.5">
          <AlertCircle size={14} className="text-red-500 flex-shrink-0 mt-0.5" />
          <p className="text-xs text-red-700 flex-1">{importErr}</p>
          <button onClick={() => setImportErr('')} className="text-red-400 hover:text-red-600"><X size={13} /></button>
        </div>
      )}

      {/* Default size when placing a door/window */}
      {(tool === 'door' || tool === 'window') && (
        <div className="flex flex-wrap items-center gap-2 bg-teal-50 border border-teal-100 rounded-xl px-3 py-2 text-xs">
          <span className="font-semibold text-teal-800">New {tool} width:</span>
          <SizeStepper value={tool === 'door' ? defDoorW : defWinW} onChange={v => tool === 'door' ? setDefDoorW(v) : setDefWinW(v)} max={tool === 'door' ? 12 : 12} />
          <span className="text-gray-400">— then click a wall to place it.</span>
        </div>
      )}

      {/* Fixture picker */}
      {tool === 'fixture' && (
        <div className="flex flex-wrap items-center gap-2 bg-teal-50 border border-teal-100 rounded-xl px-3 py-2 text-xs">
          <span className="font-semibold text-teal-800">Fixture:</span>
          {(Object.keys(FIXTURES) as FixtureKind[]).map(k => (
            <button key={k} onClick={() => setFixKind(k)}
              className={`px-2 py-0.5 rounded-lg border capitalize ${fixKind === k ? 'bg-teal-600 text-white border-teal-600' : 'bg-white text-gray-600 border-teal-200 hover:bg-teal-100'}`}>{FIXTURES[k].label}</button>
          ))}
          <span className="text-gray-400">— click to place; select to rotate/resize.</span>
        </div>
      )}

      {tool === 'dim' && (
        <div className="flex items-center gap-2 bg-blue-50 border border-blue-100 rounded-xl px-3 py-2 text-xs text-blue-800">
          <Ruler size={13} /> <span className="font-semibold">Dimension:</span>
          <span className="text-gray-500">click the start point, then the end point. It measures the distance.</span>
        </div>
      )}

      {/* Inspector — edit the selected element */}
      {sel && (() => {
        if (sel.kind === 'opening') {
          const o = openings.find(x => x.id === sel.id); if (!o) return null
          const wl = wallLenOf(o.wallId) || 1
          const half = (o.width / 2) / wl
          return (
            <div className="flex flex-wrap items-center gap-2 bg-blue-50 border border-blue-100 rounded-xl px-3 py-2 text-xs">
              <span className="font-bold text-blue-800 capitalize">{o.kind}</span>
              <div className="flex rounded-lg overflow-hidden border border-blue-200">
                {(['door', 'window', 'pocket'] as const).map(k => (
                  <button key={k} onClick={() => updOpening(o.id, { kind: k })}
                    className={`px-2 py-0.5 capitalize ${o.kind === k ? 'bg-blue-600 text-white' : 'bg-white text-gray-600 hover:bg-blue-100'}`}>{k}</button>
                ))}
              </div>
              <div className="w-px h-5 bg-blue-200" />
              <span className="text-gray-500">Width</span>
              <SizeStepper value={o.width} onChange={v => setOpeningWidth(o.id, v)} max={Math.max(1, wl * 0.95)} />
              <div className="w-px h-5 bg-blue-200" />
              <span className="text-gray-500">Position</span>
              <input type="range" min={half} max={1 - half} step={0.01} value={o.t} onChange={e => updOpening(o.id, { t: Number(e.target.value) })} className="w-28" />
              {o.kind !== 'window' && (
                <button onClick={() => updOpening(o.id, { flip: !o.flip })} className="px-2 py-0.5 rounded border border-blue-200 bg-white text-gray-600 hover:bg-blue-100 font-semibold">
                  {o.kind === 'pocket' ? 'Flip side' : 'Swing in/out'}
                </button>
              )}
              {o.kind === 'door' && (
                <button onClick={() => updOpening(o.id, { hinge: !o.hinge })} className="px-2 py-0.5 rounded border border-blue-200 bg-white text-gray-600 hover:bg-blue-100 font-semibold">Hinge L/R</button>
              )}
              <button onClick={deleteSel} className="ml-auto flex items-center gap-1 text-red-500 hover:text-red-700 font-semibold"><Trash2 size={12} /> Delete</button>
            </div>
          )
        }
        if (sel.kind === 'room') {
          const r = rooms.find(x => x.id === sel.id); if (!r) return null
          return (
            <div className="flex flex-wrap items-center gap-2 bg-blue-50 border border-blue-100 rounded-xl px-3 py-2 text-xs">
              <span className="font-bold text-blue-800">Room</span>
              <input value={r.name} onChange={e => updRoom(r.id, { name: e.target.value })} className="border border-blue-200 rounded px-2 py-0.5 text-xs bg-white focus:outline-none focus:ring-1 focus:ring-blue-400" />
              <span className="text-gray-500">{fmtFt(r.w)} × {fmtFt(r.h)} · {Math.round(r.w * r.h)} sq ft</span>
              <button onClick={deleteSel} className="ml-auto flex items-center gap-1 text-red-500 hover:text-red-700 font-semibold"><Trash2 size={12} /> Delete</button>
            </div>
          )
        }
        if (sel.kind === 'label') {
          const l = labels.find(x => x.id === sel.id); if (!l) return null
          return (
            <div className="flex flex-wrap items-center gap-2 bg-blue-50 border border-blue-100 rounded-xl px-3 py-2 text-xs">
              <span className="font-bold text-blue-800">Label</span>
              <input value={l.text} onChange={e => updLabel(l.id, { text: e.target.value })} className="flex-1 min-w-[160px] border border-blue-200 rounded px-2 py-0.5 text-xs bg-white focus:outline-none focus:ring-1 focus:ring-blue-400" />
              <button onClick={deleteSel} className="flex items-center gap-1 text-red-500 hover:text-red-700 font-semibold"><Trash2 size={12} /> Delete</button>
            </div>
          )
        }
        if (sel.kind === 'wall') {
          const wll = walls.find(x => x.id === sel.id); if (!wll) return null
          return (
            <div className="flex flex-wrap items-center gap-2 bg-blue-50 border border-blue-100 rounded-xl px-3 py-2 text-xs">
              <span className="font-bold text-blue-800">Wall</span>
              <span className="text-gray-500">Length {fmtFt(dist(wll.a, wll.b))}</span>
              <div className="w-px h-5 bg-blue-200" />
              <span className="text-gray-500">Height</span>
              <SizeStepper value={wll.h ?? FULL_WALL_H} onChange={v => updWall(wll.id, { h: v >= FULL_WALL_H ? undefined : v })} min={1} max={FULL_WALL_H} />
              <button onClick={() => updWall(wll.id, { h: (wll.h ?? FULL_WALL_H) < FULL_WALL_H ? undefined : 3.5 })}
                className="px-2 py-0.5 rounded border border-blue-200 bg-white text-gray-600 hover:bg-blue-100 font-semibold">
                {(wll.h ?? FULL_WALL_H) < FULL_WALL_H ? 'Full height' : 'Half wall'}
              </button>
              <button onClick={deleteSel} className="ml-auto flex items-center gap-1 text-red-500 hover:text-red-700 font-semibold"><Trash2 size={12} /> Delete</button>
            </div>
          )
        }
        if (sel.kind === 'fixture') {
          const f = fixtures.find(x => x.id === sel.id); if (!f) return null
          return (
            <div className="flex flex-wrap items-center gap-2 bg-blue-50 border border-blue-100 rounded-xl px-3 py-2 text-xs">
              <span className="font-bold text-blue-800">{FIXTURES[f.kind].label}</span>
              <span className="text-gray-500">W</span><SizeStepper value={f.w} onChange={v => updFixture(f.id, { w: v })} min={0.5} max={12} />
              <span className="text-gray-500">H</span><SizeStepper value={f.h} onChange={v => updFixture(f.id, { h: v })} min={0.5} max={12} />
              <button onClick={() => updFixture(f.id, { rot: (f.rot + 90) % 360 })} className="flex items-center gap-1 px-2 py-0.5 rounded border border-blue-200 bg-white text-gray-600 hover:bg-blue-100 font-semibold"><RotateCw size={12} /> Rotate</button>
              <button onClick={deleteSel} className="ml-auto flex items-center gap-1 text-red-500 hover:text-red-700 font-semibold"><Trash2 size={12} /> Delete</button>
            </div>
          )
        }
        if (sel.kind === 'dim') {
          const d = dims.find(x => x.id === sel.id); if (!d) return null
          return (
            <div className="flex flex-wrap items-center gap-2 bg-blue-50 border border-blue-100 rounded-xl px-3 py-2 text-xs">
              <span className="font-bold text-blue-800">Dimension</span>
              <span className="text-gray-500">{fmtFt(dist(d.a, d.b))}</span>
              <button onClick={() => setDims(prev => prev.map(x => x.id === d.id ? { ...x, off: -x.off } : x))} className="px-2 py-0.5 rounded border border-blue-200 bg-white text-gray-600 hover:bg-blue-100 font-semibold">Flip side</button>
              <button onClick={deleteSel} className="ml-auto flex items-center gap-1 text-red-500 hover:text-red-700 font-semibold"><Trash2 size={12} /> Delete</button>
            </div>
          )
        }
        return null
      })()}

      {/* Underlay controls */}
      {underlay && (
        <div className="flex flex-wrap items-center gap-2 bg-amber-50 border border-amber-100 rounded-xl px-3 py-2 text-xs">
          <ImageIcon size={13} className="text-amber-700" />
          <span className="font-semibold text-amber-800">Sketch underlay</span>
          <button onClick={() => setUnderlay(u => u && { ...u, visible: !u.visible })} className="p-1 rounded border border-amber-200 bg-white text-gray-600 hover:bg-amber-100" title={underlay.visible ? 'Hide' : 'Show'}>
            {underlay.visible ? <Eye size={13} /> : <EyeOff size={13} />}
          </button>
          <span className="text-gray-500 ml-1">Fade</span>
          <input type="range" min={0} max={1} step={0.05} value={underlay.opacity} onChange={e => setUnderlay(u => u && { ...u, opacity: Number(e.target.value) })} className="w-24" />
          <div className="w-px h-5 bg-amber-200" />
          <Move size={12} className="text-gray-400" />
          <div className="flex items-center gap-0.5">
            {([['◀', -0.5, 0], ['▶', 0.5, 0], ['▲', 0, -0.5], ['▼', 0, 0.5]] as const).map(([s, dx, dy]) => (
              <button key={s} onClick={() => setUnderlay(u => u && { ...u, x: u.x + dx, y: u.y + dy })} className="w-6 h-6 rounded border border-amber-200 bg-white text-gray-600 hover:bg-amber-100">{s}</button>
            ))}
          </div>
          <span className="text-gray-500 ml-1">Size</span>
          <button onClick={() => setUnderlay(u => u && { ...u, w: u.w / 1.03, h: u.h / 1.03 })} className="w-6 h-6 rounded border border-amber-200 bg-white text-gray-600 hover:bg-amber-100">−</button>
          <button onClick={() => setUnderlay(u => u && { ...u, w: u.w * 1.03, h: u.h * 1.03 })} className="w-6 h-6 rounded border border-amber-200 bg-white text-gray-600 hover:bg-amber-100">+</button>
          <button onClick={() => setUnderlay(null)} className="ml-auto flex items-center gap-1 text-red-500 hover:text-red-700 font-semibold"><X size={12} /> Remove</button>
        </div>
      )}

      {/* Canvas */}
      <div ref={wrapRef} className="relative border border-gray-200 rounded-xl overflow-hidden bg-white">
        <svg ref={svgRef} width={size.w} height={size.h}
          style={{ display: 'block', cursor: tool === 'pan' ? 'grab' : tool === 'select' ? 'default' : 'crosshair', touchAction: 'none' }}
          onMouseDown={onDown} onMouseMove={onMove} onMouseUp={onUp} onMouseLeave={onUp} onDoubleClick={onDouble} onWheel={onWheel}>
          <rect x={0} y={0} width={size.w} height={size.h} fill="#ffffff" />
          {gridLines}

          {/* sketch underlay (faded photo, traced on top of) */}
          {underlay?.visible && (() => {
            const p = toPx({ x: underlay.x, y: underlay.y })
            return <image href={underlay.src} x={p.x} y={p.y} width={underlay.w * scale} height={underlay.h * scale}
              opacity={underlay.opacity} preserveAspectRatio="none" style={{ pointerEvents: 'none' }} />
          })()}

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

          {/* walls — dark faces (full thickness) */}
          {walls.map(wl => {
            const a = toPx(wl.a), b = toPx(wl.b)
            const seld = sel?.kind === 'wall' && sel.id === wl.id
            return <line key={wl.id} x1={a.x} y1={a.y} x2={b.x} y2={b.y}
              stroke={seld ? '#f59e0b' : '#1f2937'} strokeWidth={wallPx} strokeLinecap="round"
              onClick={() => tool === 'select' && setSel({ kind: 'wall', id: wl.id })}
              style={{ cursor: tool === 'select' ? 'pointer' : undefined }} />
          })}
          {/* walls — white interior (double-line look); corners mitre via overlap */}
          {wallStyle === 'outline' && walls.map(wl => {
            const a = toPx(wl.a), b = toPx(wl.b)
            return <line key={wl.id + '_in'} x1={a.x} y1={a.y} x2={b.x} y2={b.y}
              stroke="#ffffff" strokeWidth={wallInnerPx} strokeLinecap="round" style={{ pointerEvents: 'none' }} />
          })}
          {/* half walls — dashed teal centerline so they're distinguishable in plan */}
          {walls.map(wl => (wl.h ?? FULL_WALL_H) < FULL_WALL_H ? (() => {
            const a = toPx(wl.a), b = toPx(wl.b)
            return <line key={wl.id + '_half'} x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke="#0d9488" strokeWidth={1.5} strokeDasharray="5 3" style={{ pointerEvents: 'none' }} />
          })() : null)}

          {/* openings */}
          {openings.map(renderOpening)}

          {/* fixtures */}
          {fixtures.map(f => {
            const p = toPx(f.at)
            const seld = sel?.kind === 'fixture' && sel.id === f.id
            const col = seld ? '#f59e0b' : '#475569'
            return (
              <g key={f.id} transform={`translate(${p.x} ${p.y}) rotate(${f.rot}) scale(${scale} ${scale})`}
                onClick={() => tool === 'select' && setSel({ kind: 'fixture', id: f.id })}
                style={{ cursor: tool === 'select' ? 'move' : undefined }}>
                {fixturePrims(f.kind, f.w, f.h).map((pr, i) => {
                  if (pr.t === 'rect') return <rect key={i} x={pr.x} y={pr.y} width={pr.w} height={pr.h} fill="none" stroke={col} strokeWidth={1} vectorEffect="non-scaling-stroke" />
                  if (pr.t === 'ellipse') return <ellipse key={i} cx={pr.cx} cy={pr.cy} rx={pr.rx} ry={pr.ry} fill="none" stroke={col} strokeWidth={1} vectorEffect="non-scaling-stroke" />
                  if (pr.t === 'circle') return <circle key={i} cx={pr.cx} cy={pr.cy} r={pr.r} fill="none" stroke={col} strokeWidth={1} vectorEffect="non-scaling-stroke" />
                  return <line key={i} x1={pr.x1} y1={pr.y1} x2={pr.x2} y2={pr.y2} stroke={col} strokeWidth={1} vectorEffect="non-scaling-stroke" />
                })}
              </g>
            )
          })}

          {/* dimensions */}
          {dims.map(d => {
            const u = norm(sub(d.b, d.a)), n = perp(u)
            const a2 = toPx(add(d.a, mul(n, d.off))), b2 = toPx(add(d.b, mul(n, d.off)))
            const pa = toPx(d.a), pb = toPx(d.b), m = { x: (a2.x + b2.x) / 2, y: (a2.y + b2.y) / 2 }
            const seld = sel?.kind === 'dim' && sel.id === d.id
            const col = seld ? '#f59e0b' : '#2563eb'
            const ang = Math.atan2(b2.y - a2.y, b2.x - a2.x) * 180 / Math.PI, aa = (ang > 90 || ang < -90) ? ang + 180 : ang
            return (
              <g key={d.id} onClick={() => tool === 'select' && setSel({ kind: 'dim', id: d.id })} style={{ cursor: tool === 'select' ? 'pointer' : undefined }}>
                <line x1={a2.x} y1={a2.y} x2={b2.x} y2={b2.y} stroke={col} strokeWidth={1} />
                <line x1={pa.x} y1={pa.y} x2={a2.x} y2={a2.y} stroke={col} strokeWidth={0.7} opacity={0.6} />
                <line x1={pb.x} y1={pb.y} x2={b2.x} y2={b2.y} stroke={col} strokeWidth={0.7} opacity={0.6} />
                <text x={m.x} y={m.y - 3} textAnchor="middle" fontSize={10} fontWeight={600} fill={col} transform={`rotate(${aa} ${m.x} ${m.y})`} style={{ pointerEvents: 'none' }}>{fmtFt(dist(d.a, d.b))}</text>
              </g>
            )
          })}

          {/* dim placement preview */}
          {tool === 'dim' && dimStart.current && cursor && (() => {
            const a = toPx(dimStart.current), b = toPx(cursor)
            return <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke="#2563eb" strokeWidth={1} strokeDasharray="4 3" opacity={0.7} />
          })()}

          {/* labels (room names / dimensions imported from a sketch) */}
          {labels.map(l => {
            const p = toPx(l.at)
            const seld = sel?.kind === 'label' && sel.id === l.id
            return <text key={l.id} x={p.x} y={p.y} textAnchor="middle" fontSize={11} fontWeight={600}
              fill={seld ? '#f59e0b' : '#374151'} style={{ cursor: tool === 'select' ? 'move' : undefined }}
              onClick={() => tool === 'select' && setSel({ kind: 'label', id: l.id })}>{l.text}</text>
          })}

          {/* wall dimensions — offset clear of the wall + white halo so they read */}
          {showWallDims && walls.map(wl => {
            const l = dist(wl.a, wl.b)
            if (l < 0.5) return null
            const mid = mul(add(wl.a, wl.b), 0.5)
            const n = mul(perp(norm(sub(wl.b, wl.a))), 1)
            const off = toPx(add(mid, mul(n, wallThick / 2 + 0.55)))
            const ang = Math.atan2(wl.b.y - wl.a.y, wl.b.x - wl.a.x) * 180 / Math.PI
            const a2 = ang > 90 || ang < -90 ? ang + 180 : ang
            return <text key={`d${wl.id}`} x={off.x} y={off.y} textAnchor="middle" fontSize={11} fontWeight={600} fill="#2563eb"
              stroke="#ffffff" strokeWidth={3} paintOrder="stroke" strokeLinejoin="round"
              transform={`rotate(${a2} ${off.x} ${off.y})`} style={{ pointerEvents: 'none' }}>{fmtFt(l)}</text>
          })}

          {/* vertices (select mode) */}
          {tool === 'select' && walls.flatMap(wl => [wl.a, wl.b]).map((v, i) => {
            const p = toPx(v)
            return <circle key={i} cx={p.x} cy={p.y} r={4} fill="#fff" stroke="#1f2937" strokeWidth={1.5} style={{ cursor: 'move' }} />
          })}

          {/* wall preview — follows the press point (drag) or the chain anchor (click) */}
          {tool === 'wall' && (wallDown.current || wallChain.current) && cursor && (() => {
            const anchor = (wallDown.current || wallChain.current)!
            const a = toPx(anchor), b = toPx(cursor)
            return <>
              <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke="#b8895a" strokeWidth={wallPx} strokeLinecap="round" opacity={0.5} />
              <text x={(a.x + b.x) / 2} y={(a.y + b.y) / 2 - 6} textAnchor="middle" fontSize={10} fill="#b8895a">{fmtFt(dist(anchor, cursor))}</text>
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

      {show3D && <FloorPlan3D plan={{ walls, openings, rooms, labels, fixtures, dims }} wallThick={wallThick}
        finishes={finishes} onFinishesChange={setFinishes} onClose={() => setShow3D(false)} />}
    </div>
  )
}
