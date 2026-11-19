import crypto from 'crypto'
import { createServerClient } from '@/lib/supabase'
import { BUSINESS } from '@/lib/business'

// Leads Generator (cabinet sales). Server-side only.
//
//   1. importDbpr()      → Florida DBPR licensee file → CRM contacts tagged "cabinet contractor"
//   2. runLeadsDaily()   → new permits from the county portals → contractor linked to a CRM contact →
//                          marketing email QUEUED (and sent only if auto-send is on AND the template is approved)
//   3. sendLeadEmails()  → sends queued emails through Resend with an unsubscribe link, logs every attempt
//
// Data sources (see the Leads Generator page for the plain-English version):
//   DBPR   https://www2.myfloridalicense.com/sto/file_download/extracts//CONSTRUCTIONLICENSE_1.csv  (free, refreshed daily)
//   Okaloosa + Walton: Tyler EnerGov self-service portals — public JSON API, includes the contractor's email/phone
//   Santa Rosa: MGO Connect — search needs a signed-in account, so permits come in by CSV upload

export const TAG_LEAD = 'cabinet contractor'
export const TAG_CUSTOMER = 'cabinet customer'
export const TAG_CONTRACTOR = 'contractor'

export const DBPR_URL = 'https://www2.myfloridalicense.com/sto/file_download/extracts//CONSTRUCTIONLICENSE_1.csv'
export const DBPR_COUNTIES: Record<string, string> = { '56': 'Okaloosa', '67': 'Santa Rosa', '76': 'Walton' }
export const ALL_LICENSE_TYPES: Record<string, string> = {
  CGC: 'Certified General', CBC: 'Certified Building', RG: 'Registered General', RB: 'Registered Building',
  CRC: 'Certified Residential', RR: 'Registered Residential',
}

export type EnergovSource = { key: string; label: string; county: string; base: string }
export const ENERGOV_SOURCES: EnergovSource[] = [
  { key: 'okaloosa', label: 'Okaloosa County (unincorporated)', county: 'Okaloosa', base: 'https://energovweb.myokaloosa.com/energov_prod/selfservice' },
  { key: 'walton', label: 'Walton County (unincorporated)', county: 'Walton', base: 'https://waltoncountyfl-energovweb.tylerhost.net/apps/SelfService' },
]

// ── Settings (app_settings key 'leads_generator') ────────────────────────────
export type LeadSettings = {
  auto_send: boolean
  subject: string
  body: string                 // plain text; blank line = new paragraph; {first_name} {company} {address} {city} {permit_type}
  button_label: string
  button_url: string
  mailing_address: string      // required by CAN-SPAM in every marketing email
  min_days_between: number     // never email the same contractor more often than this
  daily_cap: number            // most emails the daily job will send in one run
  license_types: string[]
  sources: Record<string, boolean>
  approved_hash: string | null // hash of the template the admin approved; editing the template un-approves it
  approved_at: string | null
  last_seen: Record<string, string>
  last_run: { at: string; summary: Record<string, any> } | null
  last_import: { at: string; summary: Record<string, any> } | null
}

export const DEFAULT_SETTINGS: LeadSettings = {
  auto_send: false,
  subject: 'Cabinets for your project at {address}',
  body: [
    'Hi {first_name},',
    'I saw {company} pulled a permit for {address}{city_suffix}. Congratulations on the new job!',
    `${BUSINESS.name} supplies and installs kitchen, bath and built-in cabinets for contractors across Okaloosa, Walton and Santa Rosa counties. We offer contractor pricing, quick quotes from your plans, and dependable lead times so cabinets are never what holds up your schedule.`,
    `If you'd like a quote for this project, just reply to this email or call ${BUSINESS.phone}.`,
    `Thanks,\n${BUSINESS.owner}\n${BUSINESS.name}`,
  ].join('\n\n'),
  button_label: '',
  button_url: '',
  mailing_address: '',
  min_days_between: 30,
  daily_cap: 40,
  license_types: ['CGC', 'CBC', 'RG', 'RB'],
  sources: { okaloosa: true, walton: true },
  approved_hash: null,
  approved_at: null,
  last_seen: {},
  last_run: null,
  last_import: null,
}

const SETTINGS_KEY = 'leads_generator'

export async function getLeadSettings(): Promise<LeadSettings> {
  try {
    const { data } = await createServerClient().from('app_settings').select('value').eq('key', SETTINGS_KEY).maybeSingle()
    return { ...DEFAULT_SETTINGS, ...(data?.value || {}) }
  } catch { return { ...DEFAULT_SETTINGS } }
}

export async function saveLeadSettings(patch: Partial<LeadSettings>): Promise<LeadSettings> {
  const next = { ...(await getLeadSettings()), ...patch }
  const { error } = await createServerClient().from('app_settings')
    .upsert({ key: SETTINGS_KEY, value: next, updated_at: new Date().toISOString() }, { onConflict: 'key' })
  if (error) throw new Error(error.message)
  return next
}

export function templateHash(s: Pick<LeadSettings, 'subject' | 'body' | 'mailing_address' | 'button_label' | 'button_url'>) {
  return crypto.createHash('sha256').update(JSON.stringify([s.subject, s.body, s.mailing_address, s.button_label, s.button_url])).digest('hex').slice(0, 16)
}
export const isTemplateApproved = (s: LeadSettings) => !!s.approved_hash && s.approved_hash === templateHash(s) && !!s.mailing_address.trim()

// ── Small helpers ────────────────────────────────────────────────────────────
const titleCase = (s: string) => s.toLowerCase().replace(/\s+/g, ' ').trim()
  .replace(/(^|[\s\-'/&(])([a-z])/g, (_m, p, c) => p + c.toUpperCase())
  .replace(/\b(Llc|Inc|Pllc|Lp|Llp|Ii|Iii|Iv|Nw|Ne|Sw|Se|Usa|Dba)\b/g, w => w.toUpperCase())

export function normCompany(s: string | null | undefined) {
  return String(s || '').toUpperCase().replace(/&/g, ' AND ').replace(/[^A-Z0-9 ]/g, ' ')
    .replace(/\b(LLC|INC|INCORPORATED|CORP|CORPORATION|CO|COMPANY|LTD|PLLC|LP|LLP|THE|OF|DBA)\b/g, ' ')
    .replace(/\s+/g, ' ').trim()
}
const normName = (s: string | null | undefined) => String(s || '').toUpperCase().replace(/[^A-Z ]/g, ' ').replace(/\s+/g, ' ').trim()
const normEmail = (s: string | null | undefined) => String(s || '').trim().toLowerCase()
const isEmail = (s: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s)
const clean = (s: any) => (s == null ? '' : String(s)).replace(/\s+/g, ' ').trim()

function parseCsvLine(l: string): string[] {
  const o: string[] = []; let c = '', q = false
  for (let i = 0; i < l.length; i++) {
    const ch = l[i]
    if (q) { if (ch === '"') { if (l[i + 1] === '"') { c += '"'; i++ } else q = false } else c += ch }
    else if (ch === '"') q = true
    else if (ch === ',') { o.push(c); c = '' }
    else c += ch
  }
  o.push(c)
  return o
}

type ContactRow = { id: string; first_name: string; last_name: string; email: string | null; phone: string | null; company_name: string | null; city: string | null; license_number: string | null; tags: string[] | null; email_opt_out?: boolean; last_marketing_email_at?: string | null }

async function loadAllContacts(): Promise<ContactRow[]> {
  const sb = createServerClient()
  const out: ContactRow[] = []
  for (let from = 0; ; from += 1000) {
    const { data, error } = await sb.from('contacts')
      .select('id,first_name,last_name,email,phone,company_name,city,license_number,tags,email_opt_out,last_marketing_email_at')
      .order('created_at', { ascending: true }).range(from, from + 999)
    if (error) throw new Error(error.message.includes('tags') || error.message.includes('license_number')
      ? 'The Leads Generator database update has not been run yet (supabase/migrations/20261119_leads_generator.sql).' : error.message)
    out.push(...((data || []) as ContactRow[]))
    if (!data || data.length < 1000) break
  }
  return out
}

const withTag = (tags: string[] | null | undefined, add: string[], remove: string[] = []) =>
  Array.from(new Set([...(tags || []).filter(t => !remove.includes(t)), ...add]))

// ── 1. DBPR import ───────────────────────────────────────────────────────────
export async function importDbpr(opts: { licenseTypes?: string[]; includeInactive?: boolean } = {}) {
  const settings = await getLeadSettings()
  const types = (opts.licenseTypes?.length ? opts.licenseTypes : settings.license_types).filter(t => t in ALL_LICENSE_TYPES)
  const res = await fetch(DBPR_URL, { headers: { 'User-Agent': 'Mozilla/5.0 (LPBC admin)' }, cache: 'no-store' })
  if (!res.ok) throw new Error(`DBPR download failed (${res.status})`)
  const text = Buffer.from(await res.arrayBuffer()).toString('latin1')

  type Lic = { license: string; type: string; first: string; last: string; company: string; address: string; city: string; state: string; zip: string; county: string; active: boolean; expires: string }
  const found = new Map<string, Lic>()
  for (const line of text.split(/\r?\n/)) {
    if (!line) continue
    // quick pre-filter before the full CSV parse: county code + licence type must be present
    if (!/,"(56|67|76)",/.test(line)) continue
    const r = parseCsvLine(line)
    const county = DBPR_COUNTIES[r[11]]
    if (!county || !types.includes(r[1])) continue
    const active = r[13] === 'C' && r[14] === 'A'
    if (!active && !opts.includeInactive) continue
    const license = clean(r[20]) || `${r[1]}${r[12]}`
    const [lastRaw, ...firstParts] = clean(r[2]).split(',')
    const company = clean(r[3]).replace(/\s+-\s*\d+$/, '')       // "WHITWORTH BUILDERS INC - 50" → "WHITWORTH BUILDERS INC"
    found.set(license, {
      license, type: r[1], last: titleCase(lastRaw || ''), first: titleCase(firstParts.join(' ')) || '-',
      company: company ? titleCase(company) : '', address: titleCase([r[5], r[6], r[7]].map(clean).filter(Boolean).join(' ')),
      city: titleCase(clean(r[8])), state: clean(r[9]), zip: clean(r[10]), county, active, expires: clean(r[17]),
    })
  }

  const contacts = await loadAllContacts()
  const byLicense = new Map(contacts.filter(c => c.license_number).map(c => [c.license_number!.toUpperCase(), c]))
  const byNameCity = new Map<string, ContactRow>(), byNameCompany = new Map<string, ContactRow>()
  for (const c of contacts) {
    const n = normName(`${c.first_name} ${c.last_name}`)
    if (c.city) byNameCity.set(`${n}|${normName(c.city)}`, c)
    if (c.company_name) byNameCompany.set(`${n}|${normCompany(c.company_name)}`, c)
  }

  const sb = createServerClient()
  const inserts: any[] = []
  let matched = 0, alreadyTagged = 0
  for (const l of Array.from(found.values())) {
    const n = normName(`${l.first} ${l.last}`)
    const hit = byLicense.get(l.license) || byNameCity.get(`${n}|${normName(l.city)}`) || (l.company ? byNameCompany.get(`${n}|${normCompany(l.company)}`) : undefined)
    if (hit) {
      const isCustomer = (hit.tags || []).includes(TAG_CUSTOMER)
      const tags = isCustomer ? hit.tags || [] : withTag(hit.tags, [TAG_LEAD])
      const patch: Record<string, any> = {}
      if ((hit.tags || []).join('|') !== tags.join('|')) patch.tags = tags
      if (!hit.license_number) Object.assign(patch, { license_number: l.license, license_type: l.type, county: l.county })
      if (!hit.company_name && l.company) patch.company_name = l.company
      if (Object.keys(patch).length) { await sb.from('contacts').update(patch).eq('id', hit.id); matched++ } else alreadyTagged++
      continue
    }
    inserts.push({
      first_name: l.first, last_name: l.last || '-', company_name: l.company || null, address: l.address || null,
      city: l.city || null, state: l.state || null, zip: l.zip || null, county: l.county,
      license_number: l.license, license_type: l.type, tags: [TAG_LEAD], source: 'dbpr',
      notes: `${ALL_LICENSE_TYPES[l.type] || l.type} contractor ${l.license}${l.active ? '' : ' (inactive)'} — licence expires ${l.expires}. Imported from Florida DBPR.`,
    })
  }
  let created = 0
  for (let i = 0; i < inserts.length; i += 500) {
    const { error } = await sb.from('contacts').insert(inserts.slice(i, i + 500))
    if (error) throw new Error(`Saved ${created} before an error: ${error.message}`)
    created += Math.min(500, inserts.length - i)
  }
  const summary = { licensees_in_area: found.size, created, tagged_existing: matched, already_in_crm: alreadyTagged, license_types: types.join(', ') }
  await saveLeadSettings({ last_import: { at: new Date().toISOString(), summary } })
  return summary
}

// ── 2. Permits ───────────────────────────────────────────────────────────────
// Only new construction and remodels — not roofs, pools, trade sub-permits, signs, etc.
const INCLUDE = /single family|dwelling|townho|duplex|multi.?family|new (construction|building|commercial|residential)|remodel|renovat|addition|build.?out|general building|alteration|condo|apartment|commercial building|residential building/i
const EXCLUDE = /trade permit|sub permit|standalone|mechanical|electrical|plumbing|\bgas\b|hvac|roof|pool|\bspa\b|\bsigns?\b|demoli|fence|mobile|manufactured|temporary|lien|alarm|sprinkler|windows only|siding|solar|generator|\bdock|seawall|accessory|\bshed|\btent\b|special event|irrigation|remodel - exterior/i
export const isLeadPermit = (type: string, workClass = '') => {
  const s = `${type} | ${workClass}`
  return INCLUDE.test(s) && !EXCLUDE.test(s)
}

export type PermitIn = {
  source: string; county: string; permit_number: string; case_id?: string | null; permit_type?: string; work_class?: string; status?: string
  description?: string; address?: string; city?: string; apply_date?: string | null; issue_date?: string | null; valuation?: number | null; square_feet?: number | null
  contractor_company?: string; contractor_name?: string; contractor_email?: string; contractor_phone?: string; contractor_license?: string
}

const tenantCache = new Map<string, Record<string, string>>()
async function energovHeaders(base: string) {
  const hit = tenantCache.get(base); if (hit) return hit
  const r = await fetch(`${base}/api/tenants/gettenantslist`, { headers: { 'User-Agent': 'Mozilla/5.0' }, cache: 'no-store' })
  const t = (await r.json())?.Result?.[0]
  if (!t) throw new Error('portal did not return a tenant')
  const h = { 'Content-Type': 'application/json', tenantId: String(t.TenantID), tenantName: t.TenantName, 'Tyler-TenantUrl': t.TenantUrl || 'home', 'Tyler-Tenant-Culture': 'en-US', 'User-Agent': 'Mozilla/5.0' }
  tenantCache.set(base, h)
  return h
}

// Newest applications first. The portal ignores date filters, so page back until we pass `since`.
export async function fetchEnergovPermits(src: EnergovSource, since: Date, known: Set<string>, maxPages = 8): Promise<{ permits: PermitIn[]; scanned: number; newest: string | null }> {
  const h = await energovHeaders(src.base)
  const crit = (await (await fetch(`${src.base}/api/energov/search/criteria`, { headers: h, cache: 'no-store' })).json()).Result
  const permits: PermitIn[] = []
  let scanned = 0, newest: string | null = null
  for (let page = 1; page <= maxPages; page++) {
    const body = { ...crit, SearchModule: 1, FilterModule: 2, PageNumber: page, PageSize: 100, SortBy: 'ApplyDate', SortAscending: false,
      PermitCriteria: { ...crit.PermitCriteria, PageNumber: page, PageSize: 100, SortBy: 'ApplyDate', SortAscending: false } }
    const j = await (await fetch(`${src.base}/api/energov/search/search`, { method: 'POST', headers: h, body: JSON.stringify(body), cache: 'no-store' })).json()
    const rows: any[] = j?.Result?.EntityResults || []
    if (!rows.length) break
    let reachedOld = false
    for (const x of rows) {
      scanned++
      const applied = x.ApplyDate ? new Date(x.ApplyDate) : null
      if (applied && applied > new Date(Date.now() + 2 * 86400000)) continue        // bad future dates in the portal data
      if (applied && (!newest || x.ApplyDate > newest)) newest = x.ApplyDate
      if (applied && applied < since) { reachedOld = true; continue }
      if (!isLeadPermit(x.CaseType || '', x.CaseWorkclass || '')) continue
      if (known.has(`${src.key}|${x.CaseNumber}`)) continue
      // contractor details live on the permit itself
      let d: any = null
      try { d = (await (await fetch(`${src.base}/api/energov/permits/permit/${x.CaseId}`, { headers: h, cache: 'no-store' })).json())?.Result } catch { /* keep the permit without contacts */ }
      const contacts: any[] = d?.Contacts || []
      const con = contacts.find(c => /^contractor$/i.test(c.ContactTypeName)) || contacts.find(c => /contractor/i.test(`${c.ContactTypeName} ${c.Title}`))
      permits.push({
        source: src.key, county: src.county, permit_number: x.CaseNumber, case_id: x.CaseId, permit_type: x.CaseType, work_class: x.CaseWorkclass,
        status: x.CaseStatus, description: clean(x.Description).slice(0, 1000), address: clean(x.AddressDisplay || x.Address?.FullAddress),city: titleCase(clean(x.Address?.City)),
        apply_date: x.ApplyDate || null, issue_date: x.IssueDate || null, valuation: d?.ValuationValue || null, square_feet: d?.SquareFeet || null,
        contractor_company: titleCase(clean(con?.GlobalEntityName)), contractor_name: titleCase(clean(`${con?.FirstName || ''} ${con?.LastName || ''}`)),
        contractor_email: normEmail(con?.EmailTo || con?.OtherEmail), contractor_phone: clean(con?.Phone), contractor_license: clean(con?.ContactNumber),
      })
    }
    if (reachedOld) break
  }
  return { permits, scanned, newest }
}

// Link each permit's contractor to a CRM contact (creating one if needed), save the permit, queue an email.
export async function savePermitsAndQueue(permits: PermitIn[], settings: LeadSettings) {
  const sb = createServerClient()
  const contacts = await loadAllContacts()
  const byEmail = new Map<string, ContactRow>(), byCompany = new Map<string, ContactRow>(), byName = new Map<string, ContactRow>()
  for (const c of contacts) {
    if (c.email) byEmail.set(normEmail(c.email), c)
    if (c.company_name) byCompany.set(normCompany(c.company_name), c)
    if ((c.tags || []).some(t => t === TAG_LEAD || t === TAG_CUSTOMER || t === TAG_CONTRACTOR)) byName.set(normName(`${c.first_name} ${c.last_name}`), c)
  }
  const out = { permits_saved: 0, contacts_created: 0, contacts_linked: 0, emails_queued: 0, no_contractor: 0, no_email: 0 }
  const queuedFor = new Set<string>()
  const { data: pending } = await sb.from('lead_emails').select('contact_id,to_email').eq('status', 'queued')
  for (const p of pending || []) { if (p.contact_id) queuedFor.add(p.contact_id); queuedFor.add(normEmail(p.to_email)) }
  const cutoff = new Date(Date.now() - settings.min_days_between * 86400000).toISOString()

  for (const p of permits) {
    let contact: ContactRow | undefined
    const hasContractor = !!(p.contractor_company || p.contractor_name)
    if (!hasContractor) out.no_contractor++
    else {
      const email = normEmail(p.contractor_email)
      contact = (email && byEmail.get(email)) || (p.contractor_company && byCompany.get(normCompany(p.contractor_company))) || (p.contractor_name ? byName.get(normName(p.contractor_name)) : undefined)
      if (contact) {
        const patch: Record<string, any> = {}
        if (email && isEmail(email) && !contact.email) patch.email = email
        if (p.contractor_phone && !contact.phone) patch.phone = p.contractor_phone
        if (p.contractor_company && !contact.company_name) patch.company_name = p.contractor_company
        if (!(contact.tags || []).some(t => t === TAG_LEAD || t === TAG_CUSTOMER)) patch.tags = withTag(contact.tags, [TAG_LEAD])
        if (Object.keys(patch).length) { await sb.from('contacts').update(patch).eq('id', contact.id); Object.assign(contact, patch) }
        out.contacts_linked++
      } else {
        const parts = (p.contractor_name || '').split(' ').filter(Boolean)
        const { data: made, error } = await sb.from('contacts').insert({
          first_name: parts.length ? parts.slice(0, -1).join(' ') || parts[0] : (p.contractor_company || 'Contractor'),
          last_name: parts.length > 1 ? parts[parts.length - 1] : '-',
          email: email && isEmail(email) ? email : null, phone: p.contractor_phone || null, company_name: p.contractor_company || null,
          county: p.county, tags: [TAG_LEAD], source: `permit:${p.source}`,
          notes: `Found on ${p.county} permit ${p.permit_number}${p.contractor_license ? ` (county contractor no. ${p.contractor_license})` : ''}.`,
        }).select('id,first_name,last_name,email,phone,company_name,city,license_number,tags,email_opt_out,last_marketing_email_at').single()
        if (error) throw new Error(error.message)
        contact = made as ContactRow
        if (contact.email) byEmail.set(normEmail(contact.email), contact)
        if (contact.company_name) byCompany.set(normCompany(contact.company_name), contact)
        byName.set(normName(`${contact.first_name} ${contact.last_name}`), contact)
        out.contacts_created++
      }
    }
    const { data: saved, error: pe } = await sb.from('lead_permits').upsert({ ...p, contact_id: contact?.id || null }, { onConflict: 'source,permit_number' }).select('id').single()
    if (pe) throw new Error(pe.message)
    out.permits_saved++

    // Queue one email per contractor, never more often than min_days_between, never to opted-out or existing cabinet customers.
    if (!contact) continue
    const to = normEmail(contact.email)
    if (!to || !isEmail(to)) { out.no_email++; continue }
    if (contact.email_opt_out || (contact.tags || []).includes(TAG_CUSTOMER)) continue
    if (queuedFor.has(contact.id) || queuedFor.has(to)) continue
    if (contact.last_marketing_email_at && contact.last_marketing_email_at > cutoff) continue
    const { data: recent } = await sb.from('lead_emails').select('id').eq('to_email', to).eq('status', 'sent').gt('sent_at', cutoff).limit(1)
    if (recent?.length) continue
    await sb.from('lead_emails').insert({ contact_id: contact.id, permit_id: saved?.id || null, to_email: to, subject: null, status: 'queued' })
    queuedFor.add(contact.id); queuedFor.add(to)
    out.emails_queued++
  }
  return out
}

// The daily job. Called from /api/daily-cron and from the "Check now" button.
export async function runLeadsDaily(opts: { manual?: boolean } = {}) {
  const settings = await getLeadSettings()
  const sb = createServerClient()
  const summary: Record<string, any> = { ran_at: new Date().toISOString(), manual: !!opts.manual }
  const lastSeen = { ...settings.last_seen }
  const all: PermitIn[] = []
  for (const src of ENERGOV_SOURCES) {
    if (settings.sources[src.key] === false) continue
    try {
      // first run looks back 7 days; afterwards 2 days before the newest application we've seen (catches late edits)
      const since = lastSeen[src.key] ? new Date(new Date(lastSeen[src.key]).getTime() - 2 * 86400000) : new Date(Date.now() - 7 * 86400000)
      const { data: knownRows } = await sb.from('lead_permits').select('permit_number').eq('source', src.key).gte('created_at', new Date(Date.now() - 30 * 86400000).toISOString())
      const known = new Set((knownRows || []).map((r: any) => `${src.key}|${r.permit_number}`))
      const r = await fetchEnergovPermits(src, since, known)
      all.push(...r.permits)
      if (r.newest && (!lastSeen[src.key] || r.newest > lastSeen[src.key])) lastSeen[src.key] = r.newest
      summary[`${src.key}_scanned`] = r.scanned
      summary[`${src.key}_new_permits`] = r.permits.length
    } catch (e: any) { summary[`${src.key}_error`] = e?.message || 'failed' }
  }
  try { Object.assign(summary, await savePermitsAndQueue(all, settings)) } catch (e: any) { summary.save_error = e?.message }

  if (settings.auto_send && isTemplateApproved(settings)) {
    const { data: q } = await sb.from('lead_emails').select('id').eq('status', 'queued').order('created_at', { ascending: true }).limit(Math.max(0, settings.daily_cap))
    const r = await sendLeadEmails((q || []).map((x: any) => x.id), 'auto')
    summary.emails_sent = r.sent; summary.emails_failed = r.failed
  } else summary.auto_send = settings.auto_send ? 'on, but template not approved — nothing sent' : 'off — emails left in the queue for review'

  await saveLeadSettings({ last_seen: lastSeen, last_run: { at: summary.ran_at, summary } })
  return summary
}

// ── 3. Email ─────────────────────────────────────────────────────────────────
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
export const appUrl = () => (process.env.NEXT_PUBLIC_APP_URL || 'https://login.laceynprice.com').replace(/\/$/, '')

export function renderLeadEmail(settings: Pick<LeadSettings, 'subject' | 'body' | 'mailing_address' | 'button_label' | 'button_url'>, data: { first_name?: string; company?: string; address?: string; city?: string; permit_type?: string; unsubscribe_url: string }) {
  const vals: Record<string, string> = {
    first_name: clean(data.first_name).split(' ')[0] || 'there',
    company: clean(data.company) || 'your company',
    address: clean(data.address) || 'your new project',
    city: clean(data.city),
    city_suffix: data.city ? ` in ${clean(data.city)}` : '',
    permit_type: clean(data.permit_type).toLowerCase() || 'construction',
  }
  const fill = (s: string) => s.replace(/\{(\w+)\}/g, (m, k) => (k in vals ? vals[k] : m))
  const subject = fill(settings.subject)
  const paras = fill(settings.body).split(/\n\s*\n/).map(p => p.trim()).filter(Boolean)
  const p = paras.map(t => `<p style="margin:0 0 14px;color:#374151;font-size:15px;line-height:1.6">${esc(t).replace(/\n/g, '<br>')}</p>`).join('')
  const b = settings.button_label && settings.button_url ? `<p style="margin:22px 0"><a href="${esc(settings.button_url)}" style="background:${BUSINESS.brand};color:#fff;padding:13px 26px;border-radius:8px;text-decoration:none;font-weight:bold;display:inline-block">${esc(settings.button_label)}</a></p>` : ''
  const footer = `<p style="margin:28px 0 0;color:#9ca3af;font-size:12px;line-height:1.5">${esc(BUSINESS.name)} · ${esc(BUSINESS.phone)}<br>${esc(settings.mailing_address || '[mailing address required]')}<br>You're receiving this because your company is a licensed contractor with a recent building permit in our area. <a href="${esc(data.unsubscribe_url)}" style="color:#9ca3af">Unsubscribe</a> and we won't email you again.</p>`
  const html = `<div style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto;padding:24px">${p}${b}${footer}</div>`
  const text = `${paras.join('\n\n')}\n\n--\n${BUSINESS.name} · ${BUSINESS.phone}\n${settings.mailing_address}\nUnsubscribe: ${data.unsubscribe_url}`
  return { subject, html, text }
}

async function unsubscribeUrlFor(contactId: string) {
  const sb = createServerClient()
  const { data } = await sb.from('contacts').select('unsubscribe_token').eq('id', contactId).maybeSingle()
  let token = data?.unsubscribe_token
  if (!token) {
    token = crypto.randomBytes(18).toString('base64url')
    await sb.from('contacts').update({ unsubscribe_token: token }).eq('id', contactId)
  }
  return `${appUrl()}/api/leads-unsubscribe?t=${encodeURIComponent(token)}`
}

export async function buildEmailFor(emailId: string, settings?: LeadSettings) {
  const s = settings || await getLeadSettings()
  const sb = createServerClient()
  const { data: row } = await sb.from('lead_emails').select('*, contacts(first_name,last_name,company_name), lead_permits(address,city,permit_type)').eq('id', emailId).maybeSingle()
  if (!row) throw new Error('Email not found')
  const c: any = row.contacts || {}, p: any = row.lead_permits || {}
  const unsubscribe_url = row.contact_id ? await unsubscribeUrlFor(row.contact_id) : `${appUrl()}/api/leads-unsubscribe`
  return { row, unsubscribe_url, ...renderLeadEmail(s, { first_name: c.first_name, company: c.company_name, address: p.address, city: p.city, permit_type: p.permit_type, unsubscribe_url }) }
}

function fromAddress() {
  const raw = process.env.RESEND_FROM_EMAIL || BUSINESS.email
  const at = raw.lastIndexOf('@')
  return at < 0 ? raw : raw.slice(0, at) + '@' + raw.slice(at + 1).toLowerCase()
}

export async function sendLeadEmails(ids: string[], sentBy: string) {
  const settings = await getLeadSettings()
  if (!isTemplateApproved(settings)) throw new Error('Approve the email template (with your mailing address) before sending.')
  if (!process.env.RESEND_API_KEY) throw new Error('Email isn’t set up (Resend key missing)')
  const sb = createServerClient()
  const { Resend } = await import('resend')
  const resend = new Resend(process.env.RESEND_API_KEY)
  const cutoff = new Date(Date.now() - settings.min_days_between * 86400000).toISOString()
  let sent = 0, failed = 0, skipped = 0
  for (const id of ids) {
    let built: Awaited<ReturnType<typeof buildEmailFor>>
    try { built = await buildEmailFor(id, settings) } catch { failed++; continue }
    const { row } = built
    if (row.status !== 'queued') { skipped++; continue }
    // Re-check the rules at send time (someone may have unsubscribed or been emailed since it was queued)
    const { data: c } = await sb.from('contacts').select('email_opt_out,tags,last_marketing_email_at').eq('id', row.contact_id).maybeSingle()
    const { data: recent } = await sb.from('lead_emails').select('id').eq('to_email', row.to_email).eq('status', 'sent').gt('sent_at', cutoff).limit(1)
    const why = !c ? 'contact deleted' : c.email_opt_out ? 'unsubscribed' : (c.tags || []).includes(TAG_CUSTOMER) ? 'already a cabinet customer'
      : (c.last_marketing_email_at && c.last_marketing_email_at > cutoff) || recent?.length ? `emailed in the last ${settings.min_days_between} days` : ''
    if (why) { await sb.from('lead_emails').update({ status: 'skipped', error: why }).eq('id', id); skipped++; continue }
    try {
      const r: any = await resend.emails.send({
        from: `${BUSINESS.name} <${fromAddress()}>`, to: row.to_email, reply_to: BUSINESS.email,
        subject: built.subject, html: built.html, text: built.text,
        headers: { 'List-Unsubscribe': `<${built.unsubscribe_url}>`, 'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click' },
      } as any)
      if (r?.error) throw new Error(r.error.message || 'send failed')
      const now = new Date().toISOString()
      await sb.from('lead_emails').update({ status: 'sent', subject: built.subject, sent_at: now, sent_by: sentBy, error: null }).eq('id', id)
      await sb.from('contacts').update({ last_marketing_email_at: now }).eq('id', row.contact_id)
      try { await sb.from('message_log').insert({ kind: 'cabinet_lead', channel: 'email', to_contact: row.to_email, body: built.subject, status: 'sent' }) } catch { /* optional */ }
      sent++
    } catch (e: any) {
      await sb.from('lead_emails').update({ status: 'failed', subject: built.subject, error: e?.message || 'send failed' }).eq('id', id)
      failed++
    }
  }
  return { sent, failed, skipped }
}

// ── 4. Customer conversion ──────────────────────────────────────────────────
export async function convertToCustomer(contactId: string) {
  const sb = createServerClient()
  const { data: c, error } = await sb.from('contacts').select('id,tags').eq('id', contactId).maybeSingle()
  if (error || !c) throw new Error(error?.message || 'Contact not found')
  const tags = withTag(c.tags, [TAG_CUSTOMER, TAG_CONTRACTOR], [TAG_LEAD])
  const { data, error: ue } = await sb.from('contacts').update({ tags }).eq('id', contactId).select().single()
  if (ue) throw new Error(ue.message)
  await sb.from('lead_emails').update({ status: 'cancelled', error: 'became a cabinet customer' }).eq('contact_id', contactId).eq('status', 'queued')
  return data
}

// ── 5. Manual permit upload (Santa Rosa / MGO, or any spreadsheet) ──────────
const pick = (row: Record<string, any>, ...names: string[]) => {
  const keys = Object.keys(row)
  for (const n of names) {
    const k = keys.find(k => k.toLowerCase().replace(/[^a-z]/g, '') === n)
    if (k && clean(row[k])) return clean(row[k])
  }
  for (const n of names) {
    const k = keys.find(k => k.toLowerCase().replace(/[^a-z]/g, '').includes(n))
    if (k && clean(row[k])) return clean(row[k])
  }
  return ''
}
export function permitsFromRows(rows: Record<string, any>[], county: string): PermitIn[] {
  const source = county.toLowerCase().replace(/\s+/g, '_')
  const out: PermitIn[] = []
  for (const r of rows) {
    const permit_number = pick(r, 'permitnumber', 'permitno', 'projectnumber', 'casenumber', 'number', 'permit')
    if (!permit_number) continue
    const date = pick(r, 'applieddate', 'applydate', 'applicationdate', 'dateapplied', 'issueddate', 'issuedate', 'date')
    const d = date ? new Date(date) : null
    out.push({
      source, county, permit_number, permit_type: pick(r, 'permittype', 'projecttype', 'worktype', 'type'),
      work_class: pick(r, 'workclass', 'subtype', 'category'), status: pick(r, 'status'), description: pick(r, 'description', 'workdescription', 'scope'),
      address: pick(r, 'address', 'projectaddress', 'siteaddress', 'location'), city: pick(r, 'city'),
      apply_date: d && !isNaN(d.getTime()) ? d.toISOString() : null,
      valuation: Number(pick(r, 'valuation', 'value', 'jobvalue').replace(/[^0-9.]/g, '')) || null,
      contractor_company: pick(r, 'contractorcompany', 'companyname', 'contractorbusiness', 'business', 'contractor', 'company'),
      contractor_name: pick(r, 'contractorname', 'contactname', 'qualifier', 'name'),
      contractor_email: normEmail(pick(r, 'contractoremail', 'email')), contractor_phone: pick(r, 'contractorphone', 'phone'),
      contractor_license: pick(r, 'license', 'licensenumber', 'contractorlicense'),
    })
  }
  return out
}
