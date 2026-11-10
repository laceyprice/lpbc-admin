// Pure helpers for the Collections (overdue invoices) feature — no I/O, unit-tested.

export type Bucket = 'current' | 'd1_30' | 'd31_60' | 'd61_90' | 'd90_plus'
export const BUCKETS: { key: Bucket; label: string }[] = [
  { key: 'current', label: 'Not yet due' }, { key: 'd1_30', label: '1–30 days late' }, { key: 'd31_60', label: '31–60 days late' },
  { key: 'd61_90', label: '61–90 days late' }, { key: 'd90_plus', label: '90+ days late' },
]

const DAY = 86400000
const dayStart = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()

/** Days past due (negative = not due yet). Falls back to created_at + 30 days when there's no due date. */
export function daysPastDue(inv: { due_date?: string | null; created_at?: string | null }, now = new Date()): number {
  const base = inv.due_date ? new Date(String(inv.due_date).slice(0, 10) + 'T12:00:00')
    : inv.created_at ? new Date(new Date(inv.created_at).getTime() + 30 * DAY) : null
  if (!base) return 0
  return Math.round((dayStart(now) - dayStart(base)) / DAY)
}

export function bucketFor(days: number): Bucket {
  if (days <= 0) return 'current'
  if (days <= 30) return 'd1_30'
  if (days <= 60) return 'd31_60'
  if (days <= 90) return 'd61_90'
  return 'd90_plus'
}

/** Unpaid balance of an issued invoice; 0 for quotes, drafts, cancelled, paid and written-off (uncollectible). */
export function balance(inv: { invoice_type?: string | null; invoice_status?: string | null; amount_due?: any; amount_paid?: any }): number {
  if (inv.invoice_type === 'quote') return 0
  if (['paid', 'cancelled', 'draft', 'uncollectible', 'void'].includes(String(inv.invoice_status))) return 0
  return Math.max(0, (Number(inv.amount_due) || 0) - (Number(inv.amount_paid) || 0))
}

/** Reminder tone by lateness. */
export function tone(days: number): 'friendly' | 'firm' | 'final' {
  return days > 45 ? 'final' : days > 14 ? 'firm' : 'friendly'
}
