// Offline-friendly saving for quick entries made on a job site with bad signal.
// postJson() tries the request; if the phone is offline (or the network drops) the entry is kept in
// this browser and replayed automatically when the connection comes back. Client-side only.
//
// Replays go through the normal window.fetch, so the signed-in user's token is attached at replay time.

const KEY = 'offline_queue_v1'
export type QueuedItem = { id: string; url: string; method: string; body: any; label: string; at: number }
const listeners = new Set<() => void>()
const notify = () => listeners.forEach(f => { try { f() } catch { /* ignore */ } })

function read(): QueuedItem[] {
  try { return JSON.parse(localStorage.getItem(KEY) || '[]') } catch { return [] }
}
function write(items: QueuedItem[]) {
  try { localStorage.setItem(KEY, JSON.stringify(items)) } catch { /* storage full/blocked */ }
  notify()
}

export const pendingCount = () => (typeof window === 'undefined' ? 0 : read().length)
export function onQueueChange(fn: () => void) { listeners.add(fn); return () => { listeners.delete(fn) } }

export function enqueue(url: string, body: any, label: string, method = 'POST') {
  const items = read()
  items.push({ id: `${Date.now()}_${Math.random().toString(36).slice(2, 7)}`, url, method, body, label, at: Date.now() })
  write(items)
}

/** POST JSON. Returns { ok, queued?, data?, error? }. queued=true means "saved on this device, will sync". */
export async function postJson(url: string, body: any, label: string): Promise<{ ok: boolean; queued?: boolean; data?: any; error?: string }> {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) { enqueue(url, body, label); return { ok: true, queued: true } }
  try {
    const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) return { ok: false, error: data?.error || `Request failed (${res.status})` }
    return { ok: true, data }
  } catch {
    enqueue(url, body, label)                       // network error → keep it
    return { ok: true, queued: true }
  }
}

let flushing = false
/** Replay queued items in order. Stops at the first network/server/auth problem and keeps the rest. */
export async function flushQueue(): Promise<number> {
  if (flushing || typeof window === 'undefined') return 0
  flushing = true
  let sent = 0
  try {
    for (const item of read()) {
      let res: Response
      try { res = await fetch(item.url, { method: item.method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(item.body) }) } catch { break }
      if (res.status === 401 || res.status === 403 || res.status >= 500) break           // try again later
      write(read().filter(x => x.id !== item.id))                                        // sent, or rejected for good (4xx): drop
      if (res.ok) sent++
    }
  } finally { flushing = false }
  return sent
}
