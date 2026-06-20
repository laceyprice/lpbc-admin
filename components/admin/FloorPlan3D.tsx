'use client'
// ── Floor Plan 3D (Phase 2) ──────────────────────────────────────────────────
// Extrudes the 2D plan into a 3D model with procedural material textures (wood /
// tile / stone), a ceiling toggle, door/window openings, and 3D stairs + railings.
// Loaded client-only (no SSR) from the Floor Planner.
import { useEffect, useMemo, useRef, useState } from 'react'
import { Canvas } from '@react-three/fiber'
import { OrbitControls } from '@react-three/drei'
import * as THREE from 'three'
import { X, Save, Trash2, DollarSign, Upload } from 'lucide-react'
import type { PlanDoc, Finishes, FinishPick } from './FloorPlanner'
import { FINISHES, priceOf, priceUnit, computeFinishCost, loadPriceOverrides, fetchPrices, persistPrices, type FinishCat, type Tex, type FinishPrices } from '@/lib/finishes'

const WALL_H = 8
type Cat = FinishCat
// default real-world feet that one uploaded sample image represents, per surface
const SAMPLE_SCALE: Record<string, number> = { floor: 3, walls: 4, cabinet: 2, counter: 6 }

const FIX3D: Record<string, { h: number; y: number; cat: Cat | 'appliance' | 'porcelain' }> = {
  base: { h: 3, y: 0, cat: 'cabinet' }, island: { h: 3, y: 0, cat: 'cabinet' },
  upper: { h: 2.5, y: 4.5, cat: 'cabinet' }, counter: { h: 3, y: 0, cat: 'counter' },
  range: { h: 3, y: 0, cat: 'appliance' }, fridge: { h: 6, y: 0, cat: 'appliance' },
  toilet: { h: 1.3, y: 0, cat: 'porcelain' }, sink: { h: 0.9, y: 2.2, cat: 'porcelain' },
  tub: { h: 1.6, y: 0, cat: 'porcelain' }, shower: { h: 0.4, y: 0, cat: 'porcelain' },
}

// Build a tiny procedural texture (wood grain / tile grout / stone speckle).
function makeTexture(tex: Tex, color: string): THREE.Texture | null {
  if (tex === 'solid' || typeof document === 'undefined') return null
  const S = 256
  const cv = document.createElement('canvas'); cv.width = cv.height = S
  const ctx = cv.getContext('2d'); if (!ctx) return null
  ctx.fillStyle = color; ctx.fillRect(0, 0, S, S)
  if (tex === 'wood') {
    for (let i = 0; i < 80; i++) {
      const y = Math.random() * S
      ctx.strokeStyle = `rgba(0,0,0,${Math.random() * 0.08})`; ctx.lineWidth = Math.random() * 2 + 0.4
      ctx.beginPath(); ctx.moveTo(0, y)
      ctx.bezierCurveTo(S * 0.3, y + (Math.random() * 6 - 3), S * 0.6, y + (Math.random() * 6 - 3), S, y); ctx.stroke()
    }
    ctx.strokeStyle = 'rgba(0,0,0,0.16)'; ctx.lineWidth = 2
    for (let y = 0; y <= S; y += S / 4) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(S, y); ctx.stroke() }
  } else if (tex === 'tile') {
    ctx.strokeStyle = 'rgba(0,0,0,0.22)'; ctx.lineWidth = 4; const n = 4
    for (let i = 0; i <= n; i++) { const p = (i * S) / n; ctx.beginPath(); ctx.moveTo(p, 0); ctx.lineTo(p, S); ctx.moveTo(0, p); ctx.lineTo(S, p); ctx.stroke() }
  } else if (tex === 'stone') {
    for (let i = 0; i < 2600; i++) {
      const x = Math.random() * S, y = Math.random() * S
      const v = Math.random() < 0.5 ? 0 : 255
      ctx.fillStyle = `rgba(${v},${v},${v},${Math.random() * 0.05})`
      ctx.beginPath(); ctx.arc(x, y, Math.random() * 1.6, 0, 7); ctx.fill()
    }
  }
  const t = new THREE.CanvasTexture(cv)
  t.wrapS = t.wrapT = THREE.RepeatWrapping
  t.colorSpace = THREE.SRGBColorSpace
  return t
}

function Row({ label, val }: { label: string; val: number }) {
  return <div className="flex justify-between"><span className="text-gray-400 truncate mr-2">{label}</span><span className="tabular-nums whitespace-nowrap">${Math.round(val).toLocaleString()}</span></div>
}

export default function FloorPlan3D({ plan, wallThick = 0.5, finishes, onFinishesChange, onClose }: {
  plan: PlanDoc; wallThick?: number; finishes?: Finishes; onFinishesChange?: (f: Finishes) => void; onClose: () => void
}) {
  const f0: Finishes = finishes && finishes.pick ? finishes : { pick: { floor: 0, walls: 0, cabinet: 0, counter: 0 }, schemes: [] }
  const pick = f0.pick
  const schemes = f0.schemes || []
  const setPickCat = (c: Cat, i: number) => onFinishesChange?.({ ...f0, pick: { ...pick, [c]: i } })
  const saveScheme = () => {
    const name = window.prompt('Name this finish scheme:')?.trim()
    if (name) onFinishesChange?.({ ...f0, schemes: [...schemes, { name, pick: { ...pick } }] })
  }
  const loadScheme = (s: { pick: FinishPick }) => onFinishesChange?.({ ...f0, pick: { ...s.pick } })
  const deleteScheme = (idx: number) => onFinishesChange?.({ ...f0, schemes: schemes.filter((_, i) => i !== idx) })

  const [ceiling, setCeiling] = useState(false)
  const [prices, setPrices] = useState<FinishPrices>(() => loadPriceOverrides())
  const [editPrices, setEditPrices] = useState(false)
  useEffect(() => { fetchPrices().then(setPrices).catch(() => {}) }, [])   // pull business-wide prices
  const setPrice = (cat: Cat, idx: number, v: number) => setPrices(p => { const n = { ...p, [`${cat}:${idx}`]: v }; persistPrices(n); return n })

  // Combined options per surface = preset finishes + uploaded sample photos.
  const samples = f0.samples || {}
  const optionsFor = (c: Cat): any[] => [...FINISHES[c], ...((samples[c] || []).map(s => ({ name: s.name, color: '#ffffff', tex: 'image', url: s.url })))]
  const optOf = (c: Cat) => optionsFor(c)[pick[c] ?? 0] || FINISHES[c][0]
  const color = (c: Cat) => optOf(c).color || '#cccccc'

  // Upload a sample photo: downscale to a 512px data URL, store on the plan, select it.
  const fileRef = useRef<HTMLInputElement>(null)
  const uploadCat = useRef<Cat>('floor')
  function uploadSample(cat: Cat, file: File) {
    const img = new Image()
    img.onload = () => {
      const MAX = 512, k = Math.min(1, MAX / Math.max(img.width, img.height))
      const w = Math.round(img.width * k), h = Math.round(img.height * k)
      const cv = document.createElement('canvas'); cv.width = w; cv.height = h
      cv.getContext('2d')?.drawImage(img, 0, 0, w, h)
      const url = cv.toDataURL('image/jpeg', 0.85)
      const id = Math.random().toString(36).slice(2, 9)
      const name = file.name.replace(/\.[^.]+$/, '').slice(0, 18) || 'Sample'
      const cur = f0.samples || {}
      const next = { ...cur, [cat]: [...(cur[cat] || []), { id, name, url, scale: SAMPLE_SCALE[cat] || 3 }] }
      const newIdx = FINISHES[cat].length + next[cat].length - 1
      onFinishesChange?.({ ...f0, samples: next, pick: { ...pick, [cat]: newIdx } })
      URL.revokeObjectURL(img.src)
    }
    img.src = URL.createObjectURL(file)
  }
  function removeSample(cat: Cat, sid: string) {
    const cur = f0.samples || {}
    const next = { ...cur, [cat]: (cur[cat] || []).filter(s => s.id !== sid) }
    onFinishesChange?.({ ...f0, samples: next, pick: { ...pick, [cat]: 0 } })
  }
  const setSampleScale = (cat: Cat, sid: string, scale: number) => {
    const cur = f0.samples || {}
    const next = { ...cur, [cat]: (cur[cat] || []).map(s => s.id === sid ? { ...s, scale } : s) }
    onFinishesChange?.({ ...f0, samples: next })
  }
  // the uploaded sample object that is currently selected for a surface (or null)
  const activeSample = (cat: Cat) => { const idx = pick[cat] ?? 0; return idx >= FINISHES[cat].length ? (samples[cat] || [])[idx - FINISHES[cat].length] : null }

  const { walls, openings, fixtures, center, span, bw, bh } = useMemo(() => {
    const ws = plan.walls || []
    let x0 = Infinity, z0 = Infinity, x1 = -Infinity, z1 = -Infinity
    const see = (x: number, z: number) => { if (x < x0) x0 = x; if (z < z0) z0 = z; if (x > x1) x1 = x; if (z > z1) z1 = z }
    ws.forEach(w => { see(w.a.x, w.a.y); see(w.b.x, w.b.y) })
    if (!isFinite(x0)) { x0 = 0; z0 = 0; x1 = 20; z1 = 20 }
    const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2
    return { walls: ws, openings: plan.openings || [], fixtures: plan.fixtures || [], center: { x: cx, z: cz }, span: Math.max(x1 - x0, z1 - z0, 10), bw: x1 - x0, bh: z1 - z0 }
  }, [plan])

  // Quantities → live finish cost (shared with the estimate page).
  const cost = useMemo(() => computeFinishCost(plan, pick, prices), [plan, pick, prices])

  // textures for the active finishes (uploaded sample image at its tile size, or procedural)
  const tex = useMemo(() => {
    // reference dimension (ft) the repeat is computed against, per surface
    const REF: Record<string, number> = { floor: span + 6, walls: span, counter: 8, cabinet: 6 }
    const PROC: Record<string, [number, number]> = {
      floor: [Math.max(2, (span + 6) / 6), Math.max(2, (span + 6) / 6)], cabinet: [2, 1], counter: [2, 2], walls: [Math.max(2, span / 8), 1],
    }
    const mk = (cat: Cat): THREE.Texture | null => {
      const opt = optOf(cat)
      if (opt?.url) {
        const t = new THREE.TextureLoader().load(opt.url)
        t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace
        const s = activeSample(cat); const scale = (s?.scale && s.scale > 0) ? s.scale : (SAMPLE_SCALE[cat] || 3)
        const r = Math.max(0.25, (REF[cat] || 6) / scale)
        t.repeat.set(r, cat === 'walls' ? Math.max(0.25, WALL_H / scale) : r)
        return t
      }
      const t = makeTexture(opt?.tex || 'solid', opt?.color || '#cccccc')
      if (t) t.repeat.set(PROC[cat][0], PROC[cat][1])
      return t
    }
    return { floorTex: mk('floor'), cabTex: mk('cabinet'), counterTex: mk('counter'), wallTex: mk('walls') }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pick, samples, span])

  type WBox = { key: string; pos: [number, number, number]; rot: number; size: [number, number, number] }
  const wallBoxes = useMemo(() => {
    const out: WBox[] = []
    const DOOR_TOP = 6.75, WIN_SILL = 2.5, WIN_TOP = 6
    walls.forEach((w, wi) => {
      const ax = w.a.x - center.x, az = w.a.y - center.z, bx = w.b.x - center.x, bz = w.b.y - center.z
      const len = Math.hypot(bx - ax, bz - az); if (len < 0.1) return
      const ux = (bx - ax) / len, uz = (bz - az) / len, rot = -Math.atan2(bz - az, bx - ax)
      const top = w.h ?? WALL_H
      const push = (g0: number, g1: number, y: number, h: number) => {
        if (g1 - g0 <= 0.02 || h <= 0.02) return
        const s = (g0 + g1) / 2
        out.push({ key: `${wi}-${out.length}`, pos: [ax + ux * s, y, az + uz * s], rot, size: [g1 - g0, h, wallThick] })
      }
      if (top < 6.9) { push(-wallThick / 2, len + wallThick / 2, top / 2, top); return }
      const ops = openings.filter(o => o.wallId === w.id).map(o => {
        const wd = Math.min(o.width, len - 0.1), cc = o.t * len
        return { s0: Math.max(0, cc - wd / 2), s1: Math.min(len, cc + wd / 2), kind: o.kind }
      }).sort((a, b) => a.s0 - b.s0)
      let cur = 0
      for (const op of ops) {
        push(cur <= 0.01 ? -wallThick / 2 : cur, op.s0, top / 2, top)
        if (op.kind === 'window') { push(op.s0, op.s1, WIN_SILL / 2, WIN_SILL); push(op.s0, op.s1, (WIN_TOP + top) / 2, top - WIN_TOP) }
        else push(op.s0, op.s1, (DOOR_TOP + top) / 2, top - DOOR_TOP)
        cur = Math.max(cur, op.s1)
      }
      push(cur <= 0.01 ? -wallThick / 2 : cur, len + wallThick / 2, top / 2, top)
    })
    return out
  }, [walls, openings, center, wallThick])

  const cam = span * 1.1

  return (
    <div className="fixed inset-0 z-[60] bg-gray-900 flex flex-col">
      <div className="flex items-center justify-between px-4 py-2.5 bg-gray-900 border-b border-gray-700 flex-shrink-0">
        <h2 className="text-sm font-bold text-white flex items-center gap-2">3D View <span className="text-[10px] font-semibold uppercase tracking-wider bg-amber-500/20 text-amber-300 px-2 py-0.5 rounded-full">Preview</span></h2>
        <button onClick={onClose} className="text-gray-300 hover:text-white p-1"><X size={18} /></button>
      </div>

      <div className="flex-1 flex min-h-0">
        <div className="flex-1 min-w-0">
          <Canvas shadows camera={{ position: [cam, cam * 0.9, cam], fov: 45 }}>
            <color attach="background" args={['#1f2937']} />
            <ambientLight intensity={0.55} />
            <hemisphereLight intensity={0.45} groundColor="#3a3a3a" />
            <directionalLight position={[span, span * 1.6, span * 0.7]} intensity={1.2} castShadow
              shadow-mapSize={[2048, 2048]} shadow-bias={-0.0004}
              shadow-camera-left={-span} shadow-camera-right={span} shadow-camera-top={span} shadow-camera-bottom={-span}
              shadow-camera-near={0.5} shadow-camera-far={span * 4} />
            <OrbitControls target={[0, 1.5, 0]} maxPolarAngle={Math.PI / 2.05} />

            {/* floor */}
            <mesh position={[0, -0.05, 0]} receiveShadow>
              <boxGeometry args={[span + 6, 0.1, span + 6]} />
              <meshStandardMaterial map={tex.floorTex || undefined} color={tex.floorTex ? '#ffffff' : color('floor')} roughness={0.85} />
            </mesh>

            {/* ceiling (optional) */}
            {ceiling && (
              <mesh position={[0, WALL_H, 0]}>
                <boxGeometry args={[span + 6, 0.1, span + 6]} />
                <meshStandardMaterial color="#f0eee9" roughness={1} side={THREE.DoubleSide} />
              </mesh>
            )}

            {/* walls */}
            {wallBoxes.map(b => (
              <mesh key={b.key} position={b.pos} rotation={[0, b.rot, 0]} castShadow receiveShadow>
                <boxGeometry args={b.size} />
                <meshStandardMaterial map={tex.wallTex || undefined} color={tex.wallTex ? '#ffffff' : color('walls')} roughness={0.9} />
              </mesh>
            ))}

            {/* fixtures, cabinets, stairs, railings */}
            {fixtures.map(f => {
              const cx = f.at.x - center.x, cz = f.at.y - center.z
              const rot = -(f.rot || 0) * Math.PI / 180

              if (f.kind === 'stairs') {
                const run = f.h, n = Math.max(3, Math.round(run)), depth = run / n, rise = WALL_H / n
                return (
                  <group key={f.id} position={[cx, 0, cz]} rotation={[0, rot, 0]}>
                    {Array.from({ length: n }).map((_, i) => (
                      <mesh key={i} position={[0, ((i + 1) * rise) / 2, -run / 2 + (i + 0.5) * depth]} castShadow receiveShadow>
                        <boxGeometry args={[f.w, (i + 1) * rise, depth]} />
                        <meshStandardMaterial map={tex.floorTex || undefined} color={tex.floorTex ? '#ffffff' : color('floor')} roughness={0.7} />
                      </mesh>
                    ))}
                  </group>
                )
              }
              if (f.kind === 'railing') {
                const railH = 3, n = Math.max(2, Math.round(f.w / 4))
                return (
                  <group key={f.id} position={[cx, 0, cz]} rotation={[0, rot, 0]}>
                    {Array.from({ length: n + 1 }).map((_, i) => (
                      <mesh key={i} position={[-f.w / 2 + (i * f.w) / n, railH / 2, 0]} castShadow>
                        <boxGeometry args={[0.12, railH, 0.12]} />
                        <meshStandardMaterial color="#5b4636" roughness={0.5} />
                      </mesh>
                    ))}
                    <mesh position={[0, railH, 0]} castShadow>
                      <boxGeometry args={[f.w, 0.14, 0.14]} />
                      <meshStandardMaterial color="#5b4636" roughness={0.5} />
                    </mesh>
                  </group>
                )
              }

              const spec = FIX3D[f.kind] || { h: 2.5, y: 0, cat: 'cabinet' as const }
              const mTex = spec.cat === 'cabinet' ? tex.cabTex : spec.cat === 'counter' ? tex.counterTex : null
              const col = spec.cat === 'appliance' ? '#b8c0c4' : spec.cat === 'porcelain' ? '#f2f2f0' : color(spec.cat as Cat)
              const rough = spec.cat === 'appliance' ? 0.35 : spec.cat === 'porcelain' ? 0.25 : 0.6
              return (
                <mesh key={f.id} position={[cx, spec.y + spec.h / 2, cz]} rotation={[0, rot, 0]} castShadow receiveShadow>
                  <boxGeometry args={[f.w, spec.h, f.h]} />
                  <meshStandardMaterial map={mTex || undefined} color={mTex ? '#ffffff' : col} roughness={rough} metalness={spec.cat === 'appliance' ? 0.6 : 0} />
                </mesh>
              )
            })}

            {/* door slabs (swung open) + window glass */}
            {openings.map(o => {
              const w = walls.find(ww => ww.id === o.wallId); if (!w) return null
              const ax = w.a.x - center.x, az = w.a.y - center.z, bx = w.b.x - center.x, bz = w.b.y - center.z
              const len = Math.hypot(bx - ax, bz - az); if (len < 0.1) return null
              const ux = (bx - ax) / len, uz = (bz - az) / len
              const width = Math.min(o.width, len - 0.1)
              const cx = ax + ux * (o.t * len), cz = az + uz * (o.t * len)
              if (o.kind === 'window') {
                const SILL = 2.5, TOP = 6
                return (
                  <mesh key={o.id} position={[cx, (SILL + TOP) / 2, cz]} rotation={[0, -Math.atan2(uz, ux), 0]}>
                    <boxGeometry args={[width, TOP - SILL, 0.06]} />
                    <meshStandardMaterial color="#bcd6e6" transparent opacity={0.32} roughness={0.05} metalness={0.1} />
                  </mesh>
                )
              }
              // door / pocket slab swung open along the swing side, pivoting at the hinge jamb
              const DOOR_TOP = 6.75, half = width / 2
              const hSign = o.hinge ? 1 : -1
              const hx = cx + ux * half * hSign, hz = cz + uz * half * hSign
              const sign = o.flip ? -1 : 1
              const nx = -uz * sign, nz = ux * sign
              return (
                <group key={o.id} position={[hx, 0, hz]} rotation={[0, -Math.atan2(nz, nx), 0]}>
                  <mesh position={[half, DOOR_TOP / 2, 0]} castShadow>
                    <boxGeometry args={[width, DOOR_TOP, 0.15]} />
                    <meshStandardMaterial color="#b0875a" roughness={0.6} />
                  </mesh>
                </group>
              )
            })}
          </Canvas>
        </div>

        <aside className="w-64 flex-shrink-0 bg-gray-800 border-l border-gray-700 overflow-y-auto p-4 space-y-4">
          <div className="flex items-center justify-between gap-2">
            <label className="flex items-center gap-1.5 text-[11px] text-gray-300 cursor-pointer">
              <input type="checkbox" checked={ceiling} onChange={e => setCeiling(e.target.checked)} /> Ceiling
            </label>
            <button onClick={() => setEditPrices(v => !v)} className={`flex items-center gap-1 text-[11px] font-semibold px-2 py-1 rounded-lg border ${editPrices ? 'border-amber-400 text-amber-300' : 'border-gray-600 text-gray-300 hover:bg-gray-700'}`}>
              <DollarSign size={11} /> {editPrices ? 'Done' : 'Edit prices'}
            </button>
          </div>
          {editPrices && <p className="text-[10px] text-amber-300/80">Set your real supplier prices ({'floor/walls/counter'} $/sf, cabinets $/lf). Saved business-wide.</p>}
          <input ref={fileRef} type="file" accept="image/*" className="hidden"
            onChange={e => { const f = e.target.files?.[0]; if (f) uploadSample(uploadCat.current, f); if (fileRef.current) fileRef.current.value = '' }} />
          {(Object.keys(FINISHES) as Cat[]).map(cat => {
            const opts = optionsFor(cat)
            const sampleCount = (samples[cat] || []).length
            return (
              <div key={cat}>
                <div className="flex items-center justify-between mb-1.5">
                  <h3 className="text-[11px] font-bold uppercase tracking-wider text-gray-300 capitalize">{cat === 'counter' ? 'Countertops' : cat}</h3>
                  {!editPrices && (
                    <button onClick={() => { uploadCat.current = cat; fileRef.current?.click() }}
                      className="flex items-center gap-0.5 text-[10px] text-teal-300 hover:text-teal-200 font-semibold"><Upload size={10} /> Sample</button>
                  )}
                </div>
                {editPrices ? (
                  <div className="space-y-1">
                    {FINISHES[cat].map((f, i) => (
                      <div key={f.name} className="flex items-center gap-2 text-[11px] text-gray-300">
                        <span className="w-3.5 h-3.5 rounded border border-black/20 flex-shrink-0" style={{ background: f.color }} />
                        <span className="flex-1 truncate">{f.name}</span>
                        <span className="text-gray-500">$</span>
                        <input type="number" min={0} step={0.5} value={priceOf(cat, i, prices)} onChange={e => setPrice(cat, i, Number(e.target.value) || 0)}
                          className="w-16 bg-gray-900 border border-gray-600 rounded px-1.5 py-0.5 text-right text-gray-100 focus:outline-none focus:border-amber-400" />
                        <span className="text-gray-500 w-6">{priceUnit[cat]}</span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="grid grid-cols-2 gap-1.5">
                    {opts.map((f, i) => {
                      const isSample = i >= FINISHES[cat].length
                      const sid = isSample ? (samples[cat] || [])[i - FINISHES[cat].length]?.id : null
                      return (
                        <div key={i} className="relative group">
                          <button onClick={() => setPickCat(cat, i)}
                            className={`w-full flex items-center gap-2 px-2 py-1.5 rounded-lg border text-[11px] text-left transition-colors ${pick[cat] === i ? 'border-amber-400 bg-gray-700 text-white' : 'border-gray-600 text-gray-300 hover:bg-gray-700'}`}>
                            {f.url
                              ? <img src={f.url} alt="" className="w-4 h-4 rounded object-cover flex-shrink-0 border border-black/20" />
                              : <span className="w-4 h-4 rounded border border-black/20 flex-shrink-0" style={{ background: f.color }} />}
                            <span className="truncate">{f.name}</span>
                          </button>
                          {isSample && sid && (
                            <button onClick={() => removeSample(cat, sid)} title="Remove sample"
                              className="absolute -top-1 -right-1 bg-gray-900 border border-gray-600 rounded-full p-0.5 text-gray-400 hover:text-red-400 opacity-0 group-hover:opacity-100">
                              <X size={9} />
                            </button>
                          )}
                        </div>
                      )
                    })}
                  </div>
                )}
                {/* tiling-scale slider for the selected uploaded sample */}
                {!editPrices && (() => {
                  const s = activeSample(cat); if (!s) return null
                  const sc = (s.scale && s.scale > 0) ? s.scale : (SAMPLE_SCALE[cat] || 3)
                  return (
                    <div className="mt-1.5 flex items-center gap-2 text-[10px] text-gray-400">
                      <span className="whitespace-nowrap">Tile size</span>
                      <input type="range" min={0.25} max={12} step={0.25} value={sc} onChange={e => setSampleScale(cat, s.id, Number(e.target.value))} className="flex-1" />
                      <span className="w-10 text-right tabular-nums text-gray-300">{sc < 2 ? `${Math.round(sc * 12)}"` : `${sc % 1 === 0 ? sc : sc.toFixed(1)} ft`}</span>
                    </div>
                  )
                })()}
                {sampleCount === 0 && !editPrices && <p className="text-[9px] text-gray-500 mt-1">Upload a photo of the actual {cat === 'counter' ? 'countertop' : cat} to preview it.</p>}
              </div>
            )
          })}

          {/* Live finish cost estimate */}
          <div className="border-t border-gray-700 pt-3">
            <h3 className="text-[11px] font-bold uppercase tracking-wider text-gray-300 mb-1.5">Finish cost (est.)</h3>
            <div className="text-[11px] text-gray-300 space-y-0.5">
              <Row label={`Flooring · ${Math.round(cost.floorArea)} sf`} val={cost.fl} />
              <Row label={`Wall paint · ${Math.round(cost.wallArea)} sf`} val={cost.wl} />
              <Row label={`Counters · ${Math.round(cost.counterArea)} sf`} val={cost.ct} />
              <Row label={`Cabinets · ${Math.round(cost.cabLinFt)} lf`} val={cost.cb} />
              <div className="flex justify-between font-bold text-white border-t border-gray-700 mt-1 pt-1"><span>Total</span><span>${Math.round(cost.total).toLocaleString()}</span></div>
            </div>
            <p className="text-[9px] text-gray-500 mt-1">Rough installed pricing from plan areas — adjust quantities in the 2D plan.</p>
          </div>

          {/* Saved finish schemes */}
          <div className="border-t border-gray-700 pt-3">
            <div className="flex items-center justify-between mb-1.5">
              <h3 className="text-[11px] font-bold uppercase tracking-wider text-gray-300">Schemes</h3>
              <button onClick={saveScheme} className="flex items-center gap-1 text-[11px] text-amber-300 hover:text-amber-200 font-semibold"><Save size={11} /> Save current</button>
            </div>
            {schemes.length === 0 ? (
              <p className="text-[10px] text-gray-500">Save the current finishes as a named scheme to compare options.</p>
            ) : (
              <div className="space-y-1">
                {schemes.map((s, i) => (
                  <div key={i} className="flex items-center gap-1">
                    <button onClick={() => loadScheme(s)} className="flex-1 text-left text-[11px] text-gray-300 hover:text-white px-2 py-1 rounded-lg border border-gray-600 hover:bg-gray-700 truncate">{s.name}</button>
                    <button onClick={() => deleteScheme(i)} className="text-gray-500 hover:text-red-400 p-1"><Trash2 size={11} /></button>
                  </div>
                ))}
              </div>
            )}
          </div>

          <p className="text-[10px] text-gray-500 leading-snug border-t border-gray-700 pt-3">
            Finishes &amp; schemes save with the plan. Add stairs/railings/cabinets with the Fixture tool in 2D.
          </p>
        </aside>
      </div>
    </div>
  )
}
