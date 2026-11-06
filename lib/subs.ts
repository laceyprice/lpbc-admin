// Pure 1099 helpers — no I/O, unit-tested.
/** Payments to a contractor at/over this amount in a calendar year generally need a 1099-NEC.
 *  $600 through 2025; raised to $2,000 for payments made in 2026 and later. Confirm with your accountant. */
export function threshold1099(year: number): number { return year >= 2026 ? 2000 : 600 }

export type SubFlag = 'needs_1099' | 'near_threshold' | 'missing_w9' | 'coi_expired' | 'coi_expiring'
export function subFlags(sub: { w9_on_file?: boolean | null; coi_expiry?: string | null }, paidYtd: number, year: number, today: string): SubFlag[] {
  const flags: SubFlag[] = []
  const t = threshold1099(year)
  if (paidYtd >= t) flags.push('needs_1099')
  else if (paidYtd >= t * 0.8) flags.push('near_threshold')
  if (!sub.w9_on_file && paidYtd > 0) flags.push('missing_w9')
  if (sub.coi_expiry) {
    const days = Math.round((new Date(sub.coi_expiry.slice(0, 10) + 'T12:00:00').getTime() - new Date(today + 'T12:00:00').getTime()) / 86400000)
    if (days < 0) flags.push('coi_expired'); else if (days <= 30) flags.push('coi_expiring')
  }
  return flags
}
