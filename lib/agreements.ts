// Pure date helpers for recurring service agreements — no I/O, unit-tested.
export const FREQUENCIES = [
  { value: 'monthly', label: 'Monthly', months: 1 },
  { value: 'quarterly', label: 'Every 3 months', months: 3 },
  { value: 'semiannual', label: 'Every 6 months', months: 6 },
  { value: 'annual', label: 'Yearly', months: 12 },
] as const

export const monthsFor = (freq: string) => FREQUENCIES.find(f => f.value === freq)?.months ?? 12

const ymd = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

/** Add whole months to a YYYY-MM-DD date, clamping to month end (Jan 31 + 1 month = Feb 28/29). */
export function addMonths(date: string, months: number): string {
  const [y, m, d] = date.slice(0, 10).split('-').map(Number)
  const first = new Date(y, m - 1 + months, 1)
  const last = new Date(first.getFullYear(), first.getMonth() + 1, 0).getDate()
  return ymd(new Date(first.getFullYear(), first.getMonth(), Math.min(d, last)))
}

/** The next service date after a visit: step forward from the scheduled date until it is in the future. */
export function nextServiceDate(scheduled: string | null | undefined, freq: string, today: string): string {
  const step = monthsFor(freq)
  let next = addMonths(scheduled || today, step)
  let guard = 0
  while (next <= today && guard++ < 500) next = addMonths(next, step)
  return next
}

/** Days from `today` (YYYY-MM-DD) until `date`; negative when past. */
export function daysUntil(date: string, today: string): number {
  const a = new Date(date.slice(0, 10) + 'T12:00:00').getTime(), b = new Date(today + 'T12:00:00').getTime()
  return Math.round((a - b) / 86400000)
}
