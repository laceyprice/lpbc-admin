// Spot repeating charges (subscriptions, insurance, utilities…) in bank
// transactions so they can be offered as recurring-expense entries.

export type RecurringSuggestion = {
  payee_key: string
  payee_display: string
  avg_amount: number
  occurrences: number
  frequency: 'weekly' | 'biweekly' | 'monthly' | 'quarterly' | 'semiannual' | 'annual'
  last_date: string
}

export function normalizePayee(s: string | null | undefined): string {
  if (!s) return ''
  return s.toLowerCase()
    .replace(/[^a-z0-9 ]+/g, ' ')
    .replace(/\b(payment|pmt|recurring|autopay|aut|web|inc|llc|co|the)\b/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

function cadenceFromGap(avgGap: number): RecurringSuggestion['frequency'] | null {
  if (avgGap >= 6 && avgGap <= 9) return 'weekly'
  if (avgGap >= 12 && avgGap <= 16) return 'biweekly'
  if (avgGap >= 25 && avgGap <= 35) return 'monthly'
  if (avgGap >= 80 && avgGap <= 100) return 'quarterly'
  if (avgGap >= 170 && avgGap <= 195) return 'semiannual'
  if (avgGap >= 350 && avgGap <= 380) return 'annual'
  return null
}

// Looks back ~400 days (so yearly charges can show up twice), debits only.
// `alreadyTracked` = normalized payees that already have an expense row.
export async function suggestRecurring(supabase: any, alreadyTracked: Set<string>): Promise<RecurringSuggestion[]> {
  const since = new Date(Date.now() - 400 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
  const { data: txs, error } = await supabase
    .from('bank_transactions')
    .select('payee, description, amount, transaction_date')
    .lt('amount', 0)
    .gte('transaction_date', since)
    .limit(5000)
  if (error) throw new Error(error.message)

  const groups = new Map<string, { rawNames: Set<string>; amounts: number[]; dates: string[] }>()
  for (const t of txs ?? []) {
    const raw = t.payee || t.description || ''
    const key = normalizePayee(raw)
    if (!key || alreadyTracked.has(key)) continue
    if (!groups.has(key)) groups.set(key, { rawNames: new Set(), amounts: [], dates: [] })
    const g = groups.get(key)!
    g.rawNames.add(raw)
    g.amounts.push(Math.abs(Number(t.amount)))
    g.dates.push(t.transaction_date)
  }

  const out: RecurringSuggestion[] = []
  groups.forEach((g, key) => {
    if (g.amounts.length < 2) return
    const avg = g.amounts.reduce((s, n) => s + n, 0) / g.amounts.length
    const sorted = g.dates.slice().sort()
    const gaps: number[] = []
    for (let i = 1; i < sorted.length; i++) {
      gaps.push(Math.round((new Date(sorted[i]).getTime() - new Date(sorted[i - 1]).getTime()) / 86400000))
    }
    const avgGap = gaps.length ? gaps.reduce((s, n) => s + n, 0) / gaps.length : 0
    const frequency = cadenceFromGap(avgGap)
    if (!frequency) return
    const amountVariance = g.amounts.reduce((s, n) => s + Math.abs(n - avg), 0) / g.amounts.length / (avg || 1)
    if (amountVariance > 0.25) return   // wildly varying amounts aren't subscriptions
    out.push({
      payee_key: key,
      payee_display: Array.from(g.rawNames)[0],
      avg_amount: Number(avg.toFixed(2)),
      occurrences: g.amounts.length,
      frequency,
      last_date: sorted[sorted.length - 1],
    })
  })
  out.sort((a, b) => b.avg_amount - a.avg_amount)
  return out
}
