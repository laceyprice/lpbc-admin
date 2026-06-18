'use client'
// ── Floor Plan 3D (Phase 2) ──────────────────────────────────────────────────
// Extrudes the 2D plan into a 3D model with procedural material textures (wood /
// tile / stone), a ceiling toggle, door/window openings, and 3D stairs + railings.
// Loaded client-only (no SSR) from the Floor Planner.
import { useMemo, useState } from 'react'
import { Canvas } from '@react-three/fiber'
import { OrbitControls } from '@react-three/drei'
import * as THREE from 'three'
import { X } from 'lucide-react'
import type { PlanDoc } from './FloorPlanner'

const WALL_H = 8

type Tex = 'wood' | 'tile' | 'stone' | 'solid'
// finish presets per surface category (color + texture pattern)
const FINISHES = {
  floor: [
    { name: 'Oak', color: '#c8a16a', tex: 'wood' }, { name: 'Walnut', color: '#6b4a2b', tex: 'wood' },
    { name: 'Gray Tile', color: '#9aa0a6', tex: 'tile' }, { name: 'White Tile', color: '#e6e6e3', tex: 'tile' },
    { name: 'Slate', color: '#4a4f55', tex: 'stone' },
  ],
  walls: [
    { name: 'White', color: '#f4f1ec', tex: 'solid' }, { name: 'Greige', color: '#cfc7b8', tex: 'solid' },
    { name: 'Soft Blue', color: '#b9c7d6', tex: 'solid' }, { name: 'Sage', color: '#b5c2a8', tex: 'solid' },
    { name: 'Charcoal', color: '#3c3f44', tex: 'solid' },
  ],
  cabinet: [
    { name: 'White', color: '#eceae4', tex: 'solid' }, { name: 'Light Gray', color: '#b9bbbd', tex: 'solid' },
    { name: 'Navy', color: '#33415c', tex: 'solid' }, { name: 'Walnut', color: '#6b4a2b', tex: 'wood' },
    { name: 'Forest', color: '#33523f', tex: 'solid' },
  ],
  counter: [
    { name: 'White Quartz', color: '#ecebe6', tex: 'stone' }, { name: 'Black Granite', color: '#2b2b2e', tex: 'stone' },
    { name: 'Butcher Block', color: '#b98b53', tex: 'wood' }, { name: 'Carrara', color: '#dcdad3', tex: 'stone' },
  ],
} as const
type Cat = keyof typeof FINISHES

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

export default function FloorPlan3D({ plan, wallThick = 0.5, onClose }: { plan: PlanDoc; wallThick?: number; onClose: () => void }) {
  const [pick, setPick] = useState<Record<Cat, number>>({ floor: 0, walls: 0, cabinet: 0, counter: 0 })
  const [ceiling, setCeiling] = useState(false)
  const color = (c: Cat) => FINISHES[c][pick[c]].color

  const { walls, openings, fixtures, center, span } = useMemo(() => {
    const ws = plan.walls || []
    let x0 = Infinity, z0 = Infinity, x1 = -Infinity, z1 = -Infinity
    const see = (x: number, z: number) => { if (x < x0) x0 = x; if (z < z0) z0 = z; if (x > x1) x1 = x; if (z > z1) z1 = z }
    ws.forEach(w => { see(w.a.x, w.a.y); see(w.b.x, w.b.y) })
    if (!isFinite(x0)) { x0 = 0; z0 = 0; x1 = 20; z1 = 20 }
    const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2
    return { walls: ws, openings: plan.openings || [], fixtures: plan.fixtures || [], center: { x: cx, z: cz }, span: Math.max(x1 - x0, z1 - z0, 10) }
  }, [plan])

  // textures for the active finishes
  const tex = useMemo(() => {
    const f = FINISHES.floor[pick.floor], c = FINISHES.cabinet[pick.cabinet], ct = FINISHES.counter[pick.counter], w = FINISHES.walls[pick.walls]
    const floorTex = makeTexture(f.tex, f.color); if (floorTex) floorTex.repeat.set(Math.max(2, (span + 6) / 6), Math.max(2, (span + 6) / 6))
    const cabTex = makeTexture(c.tex, c.color); if (cabTex) cabTex.repeat.set(2, 1)
    const counterTex = makeTexture(ct.tex, ct.color); if (counterTex) counterTex.repeat.set(2, 2)
    const wallTex = makeTexture(w.tex, w.color)
    return { floorTex, cabTex, counterTex, wallTex }
  }, [pick, span])

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
            <ambientLight intensity={0.6} />
            <hemisphereLight intensity={0.4} groundColor="#444" />
            <directionalLight position={[span, span * 1.5, span * 0.6]} intensity={1.1} castShadow shadow-mapSize={[1024, 1024]} />
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
          </Canvas>
        </div>

        <aside className="w-64 flex-shrink-0 bg-gray-800 border-l border-gray-700 overflow-y-auto p-4 space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-xs text-gray-400">Drag to orbit · scroll to zoom</p>
            <label className="flex items-center gap-1.5 text-[11px] text-gray-300 cursor-pointer">
              <input type="checkbox" checked={ceiling} onChange={e => setCeiling(e.target.checked)} /> Ceiling
            </label>
          </div>
          {(Object.keys(FINISHES) as Cat[]).map(cat => (
            <div key={cat}>
              <h3 className="text-[11px] font-bold uppercase tracking-wider text-gray-300 mb-1.5 capitalize">{cat === 'counter' ? 'Countertops' : cat}</h3>
              <div className="grid grid-cols-2 gap-1.5">
                {FINISHES[cat].map((f, i) => (
                  <button key={f.name} onClick={() => setPick(p => ({ ...p, [cat]: i }))}
                    className={`flex items-center gap-2 px-2 py-1.5 rounded-lg border text-[11px] text-left transition-colors ${pick[cat] === i ? 'border-amber-400 bg-gray-700 text-white' : 'border-gray-600 text-gray-300 hover:bg-gray-700'}`}>
                    <span className="w-4 h-4 rounded border border-black/20 flex-shrink-0" style={{ background: f.color }} />
                    <span className="truncate">{f.name}</span>
                  </button>
                ))}
              </div>
            </div>
          ))}
          <p className="text-[10px] text-gray-500 leading-snug border-t border-gray-700 pt-3">
            Add stairs &amp; railings with the Fixture tool in the 2D plan; they render here. Textures are procedural previews.
          </p>
        </aside>
      </div>
    </div>
  )
}
