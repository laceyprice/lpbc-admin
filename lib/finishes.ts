// Shared finish catalog + cost math, used by the 3D view and the estimate page.

export type Tex = 'wood' | 'tile' | 'stone' | 'solid'

// floor/walls/counter price = $/sq ft installed; cabinet price = $/linear ft.
export const FINISHES = {
  floor: [
    { name: 'Oak', color: '#c8a16a', tex: 'wood', price: 9 }, { name: 'Walnut', color: '#6b4a2b', tex: 'wood', price: 13 },
    { name: 'Gray Tile', color: '#9aa0a6', tex: 'tile', price: 7 }, { name: 'White Tile', color: '#e6e6e3', tex: 'tile', price: 7 },
    { name: 'Slate', color: '#4a4f55', tex: 'stone', price: 11 },
  ],
  walls: [
    { name: 'White', color: '#f4f1ec', tex: 'solid', price: 2 }, { name: 'Greige', color: '#cfc7b8', tex: 'solid', price: 2 },
    { name: 'Soft Blue', color: '#b9c7d6', tex: 'solid', price: 2.5 }, { name: 'Sage', color: '#b5c2a8', tex: 'solid', price: 2.5 },
    { name: 'Charcoal', color: '#3c3f44', tex: 'solid', price: 3 },
  ],
  cabinet: [
    { name: 'White', color: '#eceae4', tex: 'solid', price: 220 }, { name: 'Light Gray', color: '#b9bbbd', tex: 'solid', price: 240 },
    { name: 'Navy', color: '#33415c', tex: 'solid', price: 300 }, { name: 'Walnut', color: '#6b4a2b', tex: 'wood', price: 420 },
    { name: 'Forest', color: '#33523f', tex: 'solid', price: 320 },
  ],
  counter: [
    { name: 'White Quartz', color: '#ecebe6', tex: 'stone', price: 65 }, { name: 'Black Granite', color: '#2b2b2e', tex: 'stone', price: 60 },
    { name: 'Butcher Block', color: '#b98b53', tex: 'wood', price: 45 }, { name: 'Carrara', color: '#dcdad3', tex: 'stone', price: 80 },
  ],
} as const

export type FinishCat = keyof typeof FINISHES
export type FinishPrices = Record<string, number>           // key `${cat}:${idx}` → $ override
export type FinishPick = { floor: number; walls: number; cabinet: number; counter: number }

export const priceUnit: Record<FinishCat, string> = { floor: '/sf', walls: '/sf', counter: '/sf', cabinet: '/lf' }

export function priceOf(cat: FinishCat, idx: number, overrides?: FinishPrices): number {
  const o = overrides?.[`${cat}:${idx}`]
  if (typeof o === 'number' && o >= 0) return o
  return (FINISHES[cat][idx] as { price: number }).price
}

export type FinishCost = {
  fl: number; wl: number; ct: number; cb: number; total: number
  floorArea: number; wallArea: number; counterArea: number; cabLinFt: number
}
// fp = a PlanDoc-shaped object (walls/rooms/fixtures, all in feet).
export function computeFinishCost(fp: any, pick: FinishPick, overrides?: FinishPrices): FinishCost {
  const walls = fp?.walls || [], rooms = fp?.rooms || [], fixtures = fp?.fixtures || []
  let x0 = Infinity, z0 = Infinity, x1 = -Infinity, z1 = -Infinity
  for (const w of walls) for (const p of [w.a, w.b]) { if (p.x < x0) x0 = p.x; if (p.y < z0) z0 = p.y; if (p.x > x1) x1 = p.x; if (p.y > z1) z1 = p.y }
  const bw = isFinite(x0) ? x1 - x0 : 0, bh = isFinite(z0) ? z1 - z0 : 0
  let floorArea = rooms.reduce((s: number, r: any) => s + (r.w || 0) * (r.h || 0), 0)
  if (floorArea < 1) floorArea = Math.max(0, bw * bh)
  const wallArea = walls.reduce((s: number, w: any) => s + Math.hypot(w.b.x - w.a.x, w.b.y - w.a.y) * (w.h ?? 8), 0)
  const counterArea = fixtures.filter((f: any) => f.kind === 'counter' || f.kind === 'island').reduce((s: number, f: any) => s + f.w * f.h, 0)
  const cabLinFt = fixtures.filter((f: any) => f.kind === 'base' || f.kind === 'upper' || f.kind === 'island').reduce((s: number, f: any) => s + Math.max(f.w, f.h), 0)
  const fl = floorArea * priceOf('floor', pick.floor ?? 0, overrides)
  const wl = wallArea * priceOf('walls', pick.walls ?? 0, overrides)
  const ct = counterArea * priceOf('counter', pick.counter ?? 0, overrides)
  const cb = cabLinFt * priceOf('cabinet', pick.cabinet ?? 0, overrides)
  return { fl, wl, ct, cb, total: fl + wl + ct + cb, floorArea, wallArea, counterArea, cabLinFt }
}

const PRICE_KEY = 'lpbc_finish_prices'
export function loadPriceOverrides(): FinishPrices {
  if (typeof window === 'undefined') return {}
  try { return JSON.parse(window.localStorage.getItem(PRICE_KEY) || '{}') } catch { return {} }
}
export function savePriceOverrides(o: FinishPrices) {
  if (typeof window !== 'undefined') try { window.localStorage.setItem(PRICE_KEY, JSON.stringify(o)) } catch {}
}

// One-line summary of the picked finishes (for an estimate line item note).
export function finishSummary(pick: FinishPick): string {
  return [
    `Floor ${FINISHES.floor[pick.floor ?? 0].name}`,
    `Cabinets ${FINISHES.cabinet[pick.cabinet ?? 0].name}`,
    `Counters ${FINISHES.counter[pick.counter ?? 0].name}`,
    `Walls ${FINISHES.walls[pick.walls ?? 0].name}`,
  ].join(' · ')
}
