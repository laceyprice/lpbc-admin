// Shared date range storage for syncing date filters between
// Bookkeeping and Reports pages. When the user enables "lock", changes
// in either page write to localStorage and the other page picks them up.

const STORAGE_KEY = 'lpbc.sharedDateRange'
const LOCK_KEY = 'lpbc.sharedDateRange.locked'

export interface SharedDateRange {
  mode: 'month' | 'ytd' | 'lastyear' | 'custom'
  from: string
  to: string
}

export function getLocked(): boolean {
  if (typeof window === 'undefined') return false
  return localStorage.getItem(LOCK_KEY) === '1'
}

export function setLocked(v: boolean) {
  if (typeof window === 'undefined') return
  if (v) localStorage.setItem(LOCK_KEY, '1')
  else localStorage.removeItem(LOCK_KEY)
  // Manually dispatch storage event so same-tab listeners fire too
  window.dispatchEvent(new StorageEvent('storage', { key: LOCK_KEY }))
}

export function getSharedRange(): SharedDateRange | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    return JSON.parse(raw) as SharedDateRange
  } catch { return null }
}

export function setSharedRange(range: SharedDateRange) {
  if (typeof window === 'undefined') return
  localStorage.setItem(STORAGE_KEY, JSON.stringify(range))
  window.dispatchEvent(new StorageEvent('storage', { key: STORAGE_KEY, newValue: JSON.stringify(range) }))
}

// Hook helper — subscribes to storage events and calls callback when shared range changes
export function subscribeSharedRange(cb: (range: SharedDateRange | null) => void) {
  if (typeof window === 'undefined') return () => {}
  const handler = (e: StorageEvent) => {
    if (e.key === STORAGE_KEY || e.key === LOCK_KEY) cb(getSharedRange())
  }
  window.addEventListener('storage', handler)
  return () => window.removeEventListener('storage', handler)
}
