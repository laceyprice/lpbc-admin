// Leads Generator: sort a permit into "builder grade" or "custom" for cabinet sales.
// Pure functions, used by the New Permits tab in the browser. It's a best guess from what
// the county portals give us (builder, location, size, price), and the reasons are shown
// next to every permit so you can judge it yourself.

export type Grade = 'builder' | 'custom'
export type GradedPermit = { grade: Grade; score: number; reasons: string[]; area: string; ppsf: number | null; price: number | null; sqft: number | null }

// Production / tract builders working in the area: always builder grade.
const PRODUCTION = /\b(d\.?\s?r\.?\s?horton|lennar|adams homes|holiday builders|dsld|meritage|pulte|centex|del webb|taylor morrison|ryan homes|nvr\b|lgi homes|dream finders|highland homes|truland|breland|express homes|smith family homes|paran homes|starlight homes|kb home|richmond american|cjl construction|cjl homes)\b/i

// Coastal / high-end areas lean custom; inland production areas lean builder grade.
const PREMIUM_AREA = /\b(santa rosa beach|inlet beach|rosemary|alys|seaside|watercolor|watersound|seagrove|grayton|blue mountain|dune allen|miramar beach|destin|kelly plantation|sandestin|30a|okaloosa island|shalimar|bluewater)\b/i
const PREMIUM_ZIP = /\b(32459|32461|32541|32550|32413)\b/
const VALUE_AREA = /\b(crestview|baker|laurel hill|holt|defuniak|mossy head|freeport|milton|pace|navarre|ponce de leon|paxton|argyle)\b/i
const VALUE_ZIP = /\b(32536|32539|32531|32567|32564|32435|32433|32439|32570|32571|32583)\b/

const isNewHome = (p: any) => /single family|dwelling|new construction|townhouse|duplex/i.test(`${p.permit_type} ${p.work_class}`) && !/remodel|repair|addition/i.test(`${p.permit_type} ${p.work_class}`)
const isCommercial = (p: any) => /commercial/i.test(`${p.permit_type} ${p.work_class}`)

const title = (s: string) => s.toLowerCase().replace(/\b\w/g, c => c.toUpperCase())

// "Santa Rosa Beach", from the city field or the city at the end of the address.
export function areaOf(p: any): string {
  if (p.city) return title(String(p.city).trim())
  const m = String(p.address || '').match(/([A-Za-z .]+?)\s+(?:FL\s+)?\d{5}\s*$/)
  if (m) {
    // the street and the city run together in the address; keep the known town name if there is one
    const tail = m[1].trim()
    const known = tail.match(/(santa rosa beach|inlet beach|miramar beach|defuniak springs|fort walton beach|mary esther|laurel hill|niceville|crestview|destin|shalimar|freeport|baker|holt|valparaiso|navarre|milton|pace|gulf breeze)$/i)
    return title(known ? known[1] : tail.split(' ').slice(-1)[0])
  }
  return `${p.county || 'Unknown'} (no city)`
}

// Okaloosa fills in valuation as a flat ~$112.60/sq ft, so it says nothing about finish level there.
const formulaValuation = (p: any) => /okaloosa/i.test(p.county || '')

export function gradePermit(p: any, builderCounts: Map<string, number>): GradedPermit {
  const reasons: string[] = []
  let score = 0
  const sqft = p.square_feet && p.square_feet >= 200 && p.square_feet < 50000 ? Number(p.square_feet) : null
  const price = p.valuation && p.valuation >= 1000 && p.valuation < 50_000_000 ? Number(p.valuation) : null
  const ppsf = sqft && price && !formulaValuation(p) ? Math.round(price / sqft) : null
  const builder = String(p.contractor_company || p.contractor_name || '')
  const area = areaOf(p)
  const where = `${p.address || ''} ${p.city || ''}`
  const newHome = isNewHome(p)

  if (PRODUCTION.test(builder)) { score -= 4; reasons.push('production builder') }
  else if (newHome && builder && (builderCounts.get(builder.toLowerCase()) || 0) >= 3) { score -= 2; reasons.push(`${builderCounts.get(builder.toLowerCase())} homes by this builder`) }

  if (PREMIUM_AREA.test(where) || PREMIUM_ZIP.test(where)) { score += 1; reasons.push('coastal/high-end area') }
  else if (VALUE_AREA.test(where) || VALUE_ZIP.test(where)) { score -= 1; reasons.push('inland production area') }

  if (newHome && sqft) {
    if (sqft >= 4000) { score += 2; reasons.push(`${sqft.toLocaleString()} sq ft`) }
    else if (sqft >= 3000) { score += 1; reasons.push(`${sqft.toLocaleString()} sq ft`) }
    else if (sqft <= 2000) { score -= 1; reasons.push(`small home (${sqft.toLocaleString()} sq ft)`) }
  }
  if (ppsf && newHome) {
    if (ppsf >= 300) { score += 2; reasons.push(`$${ppsf}/sq ft`) }
    else if (ppsf >= 200) { score += 1; reasons.push(`$${ppsf}/sq ft`) }
    else if (ppsf < 150) { score -= 1; reasons.push(`$${ppsf}/sq ft`) }
  }
  if (price && newHome) {
    if (price >= 1_000_000) { score += 2; reasons.push('$1M+ build') }
    else if (price >= 600_000) { score += 1; reasons.push('$600k+ build') }
  }
  if (!newHome) {
    score += 1
    reasons.push(isCommercial(p) ? 'commercial job (one-off)' : 'remodel/addition (one-off for an owner)')
  }

  return { grade: score >= 1 ? 'custom' : 'builder', score, reasons, area, ppsf, price, sqft }
}

// How many new-home permits each builder has in the list (repeat builders = tract/spec homes).
export function builderCounts(permits: any[]) {
  const m = new Map<string, number>()
  for (const p of permits) {
    if (!isNewHome(p)) continue
    const b = String(p.contractor_company || p.contractor_name || '').toLowerCase()
    if (b) m.set(b, (m.get(b) || 0) + 1)
  }
  return m
}
