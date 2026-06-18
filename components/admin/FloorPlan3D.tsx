'use client'
// ── Floor Plan 3D (Phase 1) ──────────────────────────────────────────────────
// Extrudes the 2D plan (walls/floors/cabinets/fixtures, all in feet) into a 3D
// model you can orbit, with a finishes panel to swap floor / wall / cabinet /
// countertop materials. Loaded client-only (no SSR) from the Floor Planner.
import { useMemo, useState } from 'react'
import { Canvas } from '@react-three/fiber'
import { OrbitControls } from '@react-three/drei'
import { X } from 'lucide-react'
import type { PlanDoc } from './FloorPlanner'

const WALL_H = 8            // wall/ceiling height (ft)

// finish presets per surface category
const FINISHES = {
  floor: [
    { name: 'Oak', color: '#c8a16a' }, { name: 'Walnut', color: '#6b4a2b' },
    { name: 'Gray Tile', color: '#9aa0a6' }, { name: 'White Tile', color: '#e6e6e3' },
    { name: 'Slate', color: '#4a4f55' },
  ],
  walls: [
    { name: 'White', color: '#f4f1ec' }, { name: 'Greige', color: '#cfc7b8' },
    { name: 'Soft Blue', color: '#b9c7d6' }, { name: 'Sage', color: '#b5c2a8' },
    { name: 'Charcoal', color: '#3c3f44' },
  ],
  cabinet: [
    { name: 'White', color: '#eceae4' }, { name: 'Light Gray', color: '#b9bbbd' },
    { name: 'Navy', color: '#33415c' }, { name: 'Walnut', color: '#6b4a2b' },
    { name: 'Forest', color: '#33523f' },
  ],
  counter: [
    { name: 'White Quartz', color: '#ecebe6' }, { name: 'Black Granite', color: '#2b2b2e' },
    { name: 'Butcher Block', color: '#b98b53' }, { name: 'Carrara', color: '#dcdad3' },
  ],
} as const
type Cat = keyof typeof FINISHES

// 3D spec per fixture kind: height, base Y, and which finish category drives color
const FIX3D: Record<string, { h: number; y: number; cat: Cat | 'appliance' | 'porcelain' }> = {
  base: { h: 3, y: 0, cat: 'cabinet' }, island: { h: 3, y: 0, cat: 'cabinet' },
  upper: { h: 2.5, y: 4.5, cat: 'cabinet' }, counter: { h: 3, y: 0, cat: 'counter' },
  range: { h: 3, y: 0, cat: 'appliance' }, fridge: { h: 6, y: 0, cat: 'appliance' },
  toilet: { h: 1.3, y: 0, cat: 'porcelain' }, sink: { h: 0.9, y: 2.2, cat: 'porcelain' },
  tub: { h: 1.6, y: 0, cat: 'porcelain' }, shower: { h: 0.4, y: 0, cat: 'porcelain' },
}

export default function FloorPlan3D({ plan, wallThick = 0.5, onClose }: { plan: PlanDoc; wallThick?: number; onClose: () => void }) {
  const [pick, setPick] = useState<Record<Cat, number>>({ floor: 0, walls: 0, cabinet: 0, counter: 0 })
  const color = (c: Cat) => FINISHES[c][pick[c]].color

  // center the plan on the origin so the camera framing is stable
  const { walls, openings, fixtures, center, span } = useMemo(() => {
    const ws = plan.walls || []
    let x0 = Infinity, z0 = Infinity, x1 = -Infinity, z1 = -Infinity
    const see = (x: number, z: number) => { if (x < x0) x0 = x; if (z < z0) z0 = z; if (x > x1) x1 = x; if (z > z1) z1 = z }
    ws.forEach(w => { see(w.a.x, w.a.y); see(w.b.x, w.b.y) })
    if (!isFinite(x0)) { x0 = 0; z0 = 0; x1 = 20; z1 = 20 }
    const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2
    return { walls: ws, openings: plan.openings || [], fixtures: plan.fixtures || [], center: { x: cx, z: cz }, span: Math.max(x1 - x0, z1 - z0, 10) }
  }, [plan])

  // Break each wall into boxes: full segments between openings, headers above
  // doors, sill+header around windows. Half walls (h set) render solid at height.
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
      if (top < 6.9) { push(-wallThick / 2, len + wallThick / 2, top / 2, top); return }  // half wall, solid
      const ops = openings.filter(o => o.wallId === w.id).map(o => {
        const wd = Math.min(o.width, len - 0.1), cc = o.t * len
        return { s0: Math.max(0, cc - wd / 2), s1: Math.min(len, cc + wd / 2), kind: o.kind }
      }).sort((a, b) => a.s0 - b.s0)
      let cur = 0
      for (const op of ops) {
        push(cur <= 0.01 ? -wallThick / 2 : cur, op.s0, top / 2, top)   // full segment before opening
        if (op.kind === 'window') { push(op.s0, op.s1, WIN_SILL / 2, WIN_SILL); push(op.s0, op.s1, (WIN_TOP + top) / 2, top - WIN_TOP) }
        else push(op.s0, op.s1, (DOOR_TOP + top) / 2, top - DOOR_TOP)   // door/pocket header
        cur = Math.max(cur, op.s1)
      }
      push(cur <= 0.01 ? -wallThick / 2 : cur, len + wallThick / 2, top / 2, top)  // final segment
    })
    return out
  }, [walls, openings, center, wallThick])

  const cam = span * 1.1

  return (
    <div className="fixed inset-0 z-[60] bg-gray-900 flex flex-col">
      {/* header */}
      <div className="flex items-center justify-between px-4 py-2.5 bg-gray-900 border-b border-gray-700 flex-shrink-0">
        <h2 className="text-sm font-bold text-white flex items-center gap-2">3D View <span className="text-[10px] font-semibold uppercase tracking-wider bg-amber-500/20 text-amber-300 px-2 py-0.5 rounded-full">Preview</span></h2>
        <button onClick={onClose} className="text-gray-300 hover:text-white p-1"><X size={18} /></button>
      </div>

      <div className="flex-1 flex min-h-0">
        {/* 3D canvas */}
        <div className="flex-1 min-w-0">
          <Canvas shadows camera={{ position: [cam, cam * 0.9, cam], fov: 45 }}>
            <color attach="background" args={['#1f2937']} />
            <ambientLight intensity={0.65} />
            <hemisphereLight intensity={0.4} groundColor="#444" />
            <directionalLight position={[span, span * 1.5, span * 0.6]} intensity={1.1} castShadow shadow-mapSize={[1024, 1024]} />
            <OrbitControls target={[0, 1.5, 0]} maxPolarAngle={Math.PI / 2.05} />

            {/* floor */}
            <mesh position={[0, -0.05, 0]} receiveShadow>
              <boxGeometry args={[span + 6, 0.1, span + 6]} />
              <meshStandardMaterial color={color('floor')} roughness={0.85} />
            </mesh>

            {/* walls (segmented around door/window openings; half walls solid) */}
            {wallBoxes.map(b => (
              <mesh key={b.key} position={b.pos} rotation={[0, b.rot, 0]} castShadow receiveShadow>
                <boxGeometry args={b.size} />
                <meshStandardMaterial color={color('walls')} roughness={0.9} />
              </mesh>
            ))}

            {/* fixtures & cabinets */}
            {fixtures.map(f => {
              const spec = FIX3D[f.kind] || { h: 2.5, y: 0, cat: 'cabinet' as const }
              const cx = f.at.x - center.x, cz = f.at.y - center.z
              const rot = -(f.rot || 0) * Math.PI / 180
              const col = spec.cat === 'appliance' ? '#b8c0c4' : spec.cat === 'porcelain' ? '#f2f2f0' : color(spec.cat)
              const rough = spec.cat === 'appliance' ? 0.35 : spec.cat === 'porcelain' ? 0.25 : 0.6
              return (
                <mesh key={f.id} position={[cx, spec.y + spec.h / 2, cz]} rotation={[0, rot, 0]} castShadow receiveShadow>
                  <boxGeometry args={[f.w, spec.h, f.h]} />
                  <meshStandardMaterial color={col} roughness={rough} metalness={spec.cat === 'appliance' ? 0.6 : 0} />
                </mesh>
              )
            })}
          </Canvas>
        </div>

        {/* finishes panel */}
        <aside className="w-64 flex-shrink-0 bg-gray-800 border-l border-gray-700 overflow-y-auto p-4 space-y-4">
          <p className="text-xs text-gray-400">Pick finishes — drag in the 3D view to orbit, scroll to zoom.</p>
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
            Phase 1: solid walls (no cut openings yet), flat-color finishes. Textures, lighting and openings come next.
          </p>
        </aside>
      </div>
    </div>
  )
}
