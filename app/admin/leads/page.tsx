'use client'
import { useEffect, useState, useCallback } from 'react'
import { Target, Download, RefreshCw, Loader2, Mail, FileCheck, Users, Settings, Send, X, Eye, CheckCircle2, AlertTriangle, Upload, Search, UserCheck, Ban, History, Power } from 'lucide-react'
import { formatPhone } from '@/lib/utils'

const BRAND = '#b8895a'
type Tab = 'overview' | 'permits' | 'queue' | 'contractors' | 'template' | 'log'

const fmtDate = (s?: string | null) => s ? new Date(s).toLocaleDateString() : ''
const fmtDateTime = (s?: string | null) => s ? new Date(s).toLocaleString() : ''
const money = (n?: number | null) => n ? '$' + Math.round(n).toLocaleString() : ''
const who = (c: any) => c ? (c.company_name || `${c.first_name || ''} ${c.last_name || ''}`.trim()) : ''

async function api(path: string, body?: any) {
  const res = await fetch(path, body === undefined ? undefined : { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
  const j = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(j.error || `Request failed (${res.status})`)
  return j
}

export default function LeadsPage() {
  const [tab, setTab] = useState<Tab>('overview')
  const [data, setData] = useState<any>(null)
  const [loadError, setLoadError] = useState('')
  const [busy, setBusy] = useState('')
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const [preview, setPreview] = useState<{ to: string; subject: string; html: string } | null>(null)

  const load = useCallback(async () => {
    try { setData(await api('/api/leads?view=summary')); setLoadError('') }
    catch (e: any) { setLoadError(e.message) }
  }, [])
  useEffect(() => { load() }, [load])

  async function run(label: string, fn: () => Promise<any>, done?: (r: any) => string) {
    setBusy(label); setMsg(null)
    try { const r = await fn(); setMsg({ ok: true, text: done ? done(r) : 'Done' }); await load() }
    catch (e: any) { setMsg({ ok: false, text: e.message }) }
    finally { setBusy('') }
  }

  // Import and permit check run in the background on the server (they outlast the gateway timeout).
  // Start the job, then poll the summary until its last_import / last_run timestamp changes.
  async function runJob(label: 'import' | 'run', action: string, key: 'last_import' | 'last_run', verb: string) {
    setBusy(label); setMsg({ ok: true, text: `${verb}… this can take a few minutes. You can stay on this page.` })
    try {
      const before = data?.settings?.[key]?.at || null
      const r = await api(`/api/leads?action=${action}`, {})
      if (r.already_running) setMsg({ ok: true, text: `Already running. Waiting for it to finish…` })
      const deadline = Date.now() + 15 * 60000
      while (Date.now() < deadline) {
        await new Promise(res => setTimeout(res, 5000))
        let d: any
        try { d = await api('/api/leads?view=summary') } catch { continue }
        const now = d?.settings?.[key]
        if (now?.at && now.at !== before) {
          setData(d)
          if (now.summary?.error) setMsg({ ok: false, text: `${verb} failed: ${now.summary.error}` })
          else setMsg({ ok: true, text: `Done: ${summaryText(now.summary)}` })
          return
        }
      }
      setMsg({ ok: false, text: 'Still running after 15 minutes. Refresh the page later to see the result.' })
    } catch (e: any) { setMsg({ ok: false, text: e.message }) }
    finally { setBusy('') }
  }

  async function showPreview(id?: string) {
    try { setPreview(await api(`/api/leads?view=preview${id ? `&id=${id}` : ''}`)) } catch (e: any) { setMsg({ ok: false, text: e.message }) }
  }

  const s = data?.settings
  const tabs: { id: Tab; label: string; icon: any; n?: number }[] = [
    { id: 'overview', label: 'Overview', icon: Target },
    { id: 'permits', label: 'New Permits', icon: FileCheck, n: data?.permits?.length },
    { id: 'queue', label: 'Email Queue', icon: Mail, n: data?.counts?.queued },
    { id: 'contractors', label: 'Contractors', icon: Users, n: data?.counts?.leads },
    { id: 'template', label: 'Email Template', icon: Settings },
    { id: 'log', label: 'Send Log', icon: History },
  ]

  return (
    <div className="p-4 md:p-8 pt-16 md:pt-8">
      <div className="flex items-start justify-between gap-3 flex-wrap mb-4">
        <div>
          <h1 className="text-2xl font-extrabold text-gray-900">Leads Generator</h1>
          <p className="text-gray-500 text-sm">Cabinet sales: licensed contractors and new permits in Okaloosa, Walton and Santa Rosa counties</p>
        </div>
        {s && (
          <div className={`flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-semibold ${s.auto_send ? 'bg-green-50 text-green-700' : 'bg-gray-100 text-gray-600'}`}>
            <Power size={14} /> Auto-email {s.auto_send ? 'ON' : 'OFF'}
          </div>
        )}
      </div>

      {loadError && <div className="mb-4 p-4 rounded-xl bg-red-50 text-red-700 text-sm flex gap-2"><AlertTriangle size={16} className="flex-shrink-0 mt-0.5" />{loadError}</div>}
      {msg && <div className={`mb-4 p-3 rounded-xl text-sm flex justify-between gap-2 ${msg.ok ? 'bg-green-50 text-green-800' : 'bg-red-50 text-red-700'}`}><span className="whitespace-pre-wrap">{msg.text}</span><button onClick={() => setMsg(null)}><X size={14} /></button></div>}

      <div className="flex gap-1 mb-5 border-b border-gray-200 overflow-x-auto">
        {tabs.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={`flex items-center gap-2 px-4 py-2.5 text-sm font-semibold border-b-2 -mb-px whitespace-nowrap ${tab === t.id ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-800'}`}>
            <t.icon size={15} />{t.label}{t.n ? <span className="text-xs bg-gray-100 text-gray-600 rounded-full px-2">{t.n}</span> : null}
          </button>
        ))}
      </div>

      {!data && !loadError && <div className="flex justify-center py-16"><Loader2 className="animate-spin" style={{ color: BRAND }} /></div>}
      {data && tab === 'overview' && <Overview data={data} busy={busy} run={run} runJob={runJob} />}
      {data && tab === 'permits' && <Permits data={data} busy={busy} run={run} />}
      {data && tab === 'queue' && <Queue data={data} busy={busy} run={run} showPreview={showPreview} />}
      {data && tab === 'contractors' && <Contractors run={run} busy={busy} />}
      {data && tab === 'template' && <Template data={data} busy={busy} run={run} showPreview={showPreview} />}
      {data && tab === 'log' && <Log data={data} />}

      {preview && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4" onClick={() => setPreview(null)}>
          <div className="bg-white rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="sticky top-0 bg-white px-5 py-3 border-b flex justify-between items-start gap-3">
              <div className="text-sm"><div className="text-gray-500">To: {preview.to}</div><div className="font-bold text-gray-900">{preview.subject}</div></div>
              <button onClick={() => setPreview(null)}><X size={18} className="text-gray-400" /></button>
            </div>
            <iframe title="Email preview" srcDoc={preview.html} className="w-full h-[60vh] border-0" sandbox="" />
          </div>
        </div>
      )}
    </div>
  )
}

type RunFn = (label: string, fn: () => Promise<any>, done?: (r: any) => string) => Promise<void>
const Btn = ({ onClick, busy, icon: Icon, children, primary, disabled }: any) => (
  <button onClick={onClick} disabled={!!busy || disabled}
    className={`flex items-center gap-2 font-semibold px-4 py-2.5 rounded-xl text-sm disabled:opacity-50 ${primary ? 'text-white shadow' : 'border border-gray-200 text-gray-700 bg-white hover:bg-gray-50'}`}
    style={primary ? { background: BRAND } : undefined}>
    {busy ? <Loader2 size={14} className="animate-spin" /> : <Icon size={14} />}{children}
  </button>
)
const Card = ({ children, className = '' }: any) => <div className={`bg-white rounded-2xl border border-gray-100 shadow-sm p-5 ${className}`}>{children}</div>
const summaryText = (r: any) => Object.entries(r || {}).filter(([k]) => k !== 'ran_at' && k !== 'manual').map(([k, v]) => `${k.replace(/_/g, ' ')}: ${v}`).join(' · ')

function Overview({ data, busy, runJob }: { data: any; busy: string; run: RunFn; runJob: (label: "import" | "run", action: string, key: "last_import" | "last_run", verb: string) => Promise<void> }) {
  const { counts, settings: s } = data
  const stats = [
    { label: 'Contractor leads', v: counts.leads }, { label: 'Leads with email', v: counts.leadsWithEmail },
    { label: 'Emails waiting for review', v: counts.queued }, { label: 'Cabinet customers', v: counts.customers }, { label: 'Unsubscribed', v: counts.optedOut },
  ]
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        {stats.map(x => <Card key={x.label} className="!p-4"><div className="text-2xl font-extrabold text-gray-900">{x.v ?? 0}</div><div className="text-xs text-gray-500">{x.label}</div></Card>)}
      </div>

      <div className="grid md:grid-cols-2 gap-5">
        <Card>
          <h2 className="font-bold text-gray-900 mb-1">1 · Contractor list (Florida DBPR)</h2>
          <p className="text-sm text-gray-600 mb-3">Downloads the state's licensee file and adds every active general and building contractor whose address is in the three counties to the CRM, tagged <b>cabinet contractor</b>. People already in the CRM are matched (licence, name + city) and tagged instead of duplicated. It refreshes automatically on the 1st of each month.</p>
          <p className="text-xs text-gray-500 mb-3">Licence types: {s.license_types.join(', ')}. The state file has no emails or phone numbers. Those come from permits, or you can add them yourself.</p>
          {s.last_import && <p className="text-xs text-gray-500 mb-3">Last import {fmtDateTime(s.last_import.at)}: {summaryText(s.last_import.summary)}</p>}
          <Btn primary busy={busy === 'import'} icon={Download} disabled={!!busy} onClick={() => runJob('import', 'import_dbpr', 'last_import', 'Importing contractors')}>Import / refresh contractors</Btn>
        </Card>

        <Card>
          <h2 className="font-bold text-gray-900 mb-1">2 · Daily permit check</h2>
          <p className="text-sm text-gray-600 mb-3">Every day the daily job reads new <b>new-construction and remodel</b> permits from the Okaloosa and Walton county portals, saves the contractor (with email and phone) to the CRM, and queues one email per contractor. It never emails the same contractor more often than every {s.min_days_between} days.</p>
          {s.last_run && <p className="text-xs text-gray-500 mb-3">Last run {fmtDateTime(s.last_run.at)}: {summaryText(s.last_run.summary)}</p>}
          <Btn busy={busy === 'run'} icon={RefreshCw} disabled={!!busy} onClick={() => runJob('run', 'run_now', 'last_run', 'Checking permits')}>Check for new permits now</Btn>
        </Card>
      </div>

      <Card>
        <h2 className="font-bold text-gray-900 mb-3">Where the data comes from</h2>
        <div className="divide-y text-sm">
          {[
            ['Contractors: Florida DBPR licensee file', 'Automatic', 'Free public download, refreshed daily by the state. It has no email or phone.'],
            ['Okaloosa County permits (EnerGov portal)', 'Automatic', 'Public portal data includes the contractor’s company, email and phone.'],
            ['Walton County permits (EnerGov portal)', 'Automatic', 'Same system as Okaloosa, with contractor email and phone.'],
            ['Santa Rosa County permits (MGO Connect)', 'Manual', 'Searching MGO needs a signed-in account, so there is no public feed. Export or copy permits into a CSV and upload it under New Permits, or ask srcpermits@santarosa.fl.gov for a weekly issued-permits report.'],
            ['City permits (Destin, Fort Walton Beach, Crestview, Niceville, Milton, Gulf Breeze, DeFuniak…)', 'Not covered yet', 'Cities issue their own permits. Destin also uses EnerGov, so it can be added as another automatic source. A paid permit-data service (Shovels, Construction Monitor, BuildZoom) would cover every city in one feed.'],
            ['Emails for contractors with no permits yet', 'Manual / paid', 'Add them in the CRM, or use a paid enrichment service to find emails for the DBPR list.'],
          ].map(([a, b, c]) => (
            <div key={a} className="py-2.5 grid md:grid-cols-[1.3fr_auto_2fr] gap-1 md:gap-4">
              <div className="font-semibold text-gray-800">{a}</div>
              <div><span className={`text-xs font-bold px-2 py-0.5 rounded-full ${b === 'Automatic' ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'}`}>{b}</span></div>
              <div className="text-gray-600">{c}</div>
            </div>
          ))}
        </div>
      </Card>
    </div>
  )
}

function Permits({ data, busy, run }: { data: any; busy: string; run: RunFn }) {
  const [county, setCounty] = useState('Santa Rosa')
  async function upload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]; e.target.value = ''
    if (!file) return
    const { default: Papa } = await import('papaparse')
    const rows = Papa.parse(await file.text(), { header: true, skipEmptyLines: true }).data as any[]
    await run('upload', () => api('/api/leads?action=upload_permits', { county, rows }), r => `Upload: ${r.rows} rows, ${r.recognised} with a permit number, ${r.kept} new-construction/remodel. ${summaryText({ permits_saved: r.permits_saved, contacts_created: r.contacts_created, contacts_linked: r.contacts_linked, emails_queued: r.emails_queued })}`)
  }
  return (
    <div className="space-y-4">
      <Card className="!p-4 flex flex-wrap items-center gap-3">
        <div className="text-sm text-gray-600 flex-1 min-w-[240px]">Upload a permit spreadsheet (CSV) for counties without an automatic feed. Columns are matched by name: permit number, type, address, city, date, contractor, email, phone.</div>
        <select value={county} onChange={e => setCounty(e.target.value)} className="px-3 py-2.5 rounded-xl border border-gray-200 text-sm">
          {['Santa Rosa', 'Okaloosa', 'Walton'].map(c => <option key={c}>{c}</option>)}
        </select>
        <label className={`flex items-center gap-2 border border-gray-200 text-gray-700 font-semibold px-4 py-2.5 rounded-xl cursor-pointer text-sm hover:bg-gray-50 ${busy ? 'opacity-50 pointer-events-none' : ''}`}>
          {busy === 'upload' ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />} Upload CSV
          <input type="file" accept=".csv" className="hidden" onChange={upload} />
        </label>
      </Card>
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-x-auto">
        <table className="w-full text-sm">
          <thead><tr className="text-left text-xs text-gray-500 uppercase border-b"><th className="p-3">Applied</th><th className="p-3">Permit</th><th className="p-3">Address</th><th className="p-3">Contractor</th><th className="p-3">Contact</th></tr></thead>
          <tbody>
            {data.permits.length === 0 && <tr><td colSpan={5} className="p-8 text-center text-gray-400">No permits yet. Click “Check for new permits now” on the Overview tab.</td></tr>}
            {data.permits.map((p: any) => (
              <tr key={p.id} className="border-b border-gray-50 align-top">
                <td className="p-3 whitespace-nowrap">{fmtDate(p.apply_date || p.created_at)}<div className="text-xs text-gray-400">{p.county}</div></td>
                <td className="p-3"><div className="font-semibold">{p.permit_number}</div><div className="text-xs text-gray-500">{p.permit_type}</div><div className="text-xs text-gray-400">{[p.status, p.square_feet ? `${p.square_feet} sq ft` : '', money(p.valuation)].filter(Boolean).join(' · ')}</div></td>
                <td className="p-3">{p.address}</td>
                <td className="p-3">{p.contractor_company || p.contractor_name || <span className="text-gray-400">Owner/none listed</span>}{p.contractor_company && p.contractor_name && <div className="text-xs text-gray-500">{p.contractor_name}</div>}</td>
                <td className="p-3 text-xs">{p.contractor_email && <div>{p.contractor_email}</div>}{p.contractor_phone && <div>{formatPhone(p.contractor_phone)}</div>}{p.contact_id && <div className="text-green-700 font-semibold">In CRM</div>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function Queue({ data, busy, run, showPreview }: { data: any; busy: string; run: RunFn; showPreview: (id?: string) => void }) {
  const [sel, setSel] = useState<Set<string>>(new Set())
  const approved = data.settings.approved
  const toggle = (id: string) => setSel(p => { const n = new Set(p); n.has(id) ? n.delete(id) : n.add(id); return n })
  const ids = Array.from(sel)
  function send() {
    if (!confirm(`Send ${ids.length} real marketing email${ids.length === 1 ? '' : 's'} now?`)) return
    run('send', () => api('/api/leads?action=send', { ids }), r => `Sent ${r.sent}, failed ${r.failed}, skipped ${r.skipped}`).then(() => setSel(new Set()))
  }
  return (
    <div className="space-y-4">
      {!approved && <div className="p-3 rounded-xl bg-amber-50 text-amber-800 text-sm flex gap-2"><AlertTriangle size={16} className="flex-shrink-0 mt-0.5" />Nothing can be sent until the email template is approved (Email Template tab).</div>}
      <div className="flex flex-wrap gap-2 items-center">
        <button className="text-sm text-blue-700 font-semibold" onClick={() => setSel(sel.size === data.queue.length ? new Set() : new Set(data.queue.map((q: any) => q.id)))}>{sel.size === data.queue.length && sel.size ? 'Clear selection' : 'Select all'}</button>
        <div className="flex-1" />
        <Btn icon={X} busy={busy === 'cancel'} disabled={!ids.length} onClick={() => run('cancel', () => api('/api/leads?action=cancel', { ids }), () => 'Removed from queue').then(() => setSel(new Set()))}>Remove</Btn>
        <Btn primary icon={Send} busy={busy === 'send'} disabled={!ids.length || !approved} onClick={send}>Send selected ({ids.length})</Btn>
      </div>
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm divide-y">
        {data.queue.length === 0 && <div className="p-8 text-center text-gray-400 text-sm">No emails waiting. New permits add contractors here every day.</div>}
        {data.queue.map((q: any) => (
          <div key={q.id} className="flex items-center gap-3 p-3">
            <input type="checkbox" checked={sel.has(q.id)} onChange={() => toggle(q.id)} className="w-4 h-4" />
            <div className="flex-1 min-w-0 text-sm">
              <div className="font-semibold text-gray-900 truncate">{who(q.contacts) || q.to_email}</div>
              <div className="text-xs text-gray-500 truncate">{q.to_email}{q.lead_permits ? ` · ${q.lead_permits.permit_type} · ${q.lead_permits.address}` : ''}</div>
            </div>
            <div className="text-xs text-gray-400 hidden sm:block">{fmtDate(q.created_at)}</div>
            <button onClick={() => showPreview(q.id)} className="p-2 rounded-lg hover:bg-gray-100 text-gray-500" title="Preview"><Eye size={15} /></button>
          </div>
        ))}
      </div>
    </div>
  )
}

function Contractors({ run, busy }: { run: RunFn; busy: string }) {
  const [tag, setTag] = useState('cabinet contractor')
  const [q, setQ] = useState('')
  const [hasEmail, setHasEmail] = useState(false)
  const [page, setPage] = useState(0)
  const [list, setList] = useState<{ contacts: any[]; total: number } | null>(null)
  const load = useCallback(async () => {
    setList(null)
    try { setList(await api(`/api/leads?view=contacts&tag=${encodeURIComponent(tag)}&q=${encodeURIComponent(q)}&page=${page}${hasEmail ? '&has_email=1' : ''}`)) }
    catch { setList({ contacts: [], total: 0 }) }
  }, [tag, q, page, hasEmail])
  useEffect(() => { load() }, [tag, page, hasEmail]) // eslint-disable-line react-hooks/exhaustive-deps

  const act = (label: string, body: any, action: string, done: string) => run(label, () => api(`/api/leads?action=${action}`, body), () => done).then(load)
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2 items-center">
        {[['cabinet contractor', 'Leads'], ['cabinet customer', 'Cabinet customers']].map(([t, l]) => (
          <button key={t} onClick={() => { setTag(t); setPage(0) }} className={`px-3 py-2 rounded-xl text-sm font-semibold ${tag === t ? 'text-white' : 'bg-white border border-gray-200 text-gray-600'}`} style={tag === t ? { background: BRAND } : undefined}>{l}</button>
        ))}
        <label className="flex items-center gap-2 text-sm text-gray-600 ml-2"><input type="checkbox" checked={hasEmail} onChange={e => { setHasEmail(e.target.checked); setPage(0) }} />Has email</label>
        <div className="relative flex-1 min-w-[200px]">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input value={q} onChange={e => setQ(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') { setPage(0); load() } }} placeholder="Search name, company, city, licence… (Enter)" className="w-full pl-9 pr-3 py-2 rounded-xl border border-gray-200 text-sm" />
        </div>
      </div>
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm divide-y">
        {!list && <div className="p-8 flex justify-center"><Loader2 className="animate-spin" style={{ color: BRAND }} /></div>}
        {list && list.contacts.length === 0 && <div className="p-8 text-center text-gray-400 text-sm">No contacts. Import contractors from the Overview tab.</div>}
        {list?.contacts.map(c => (
          <div key={c.id} className="p-3 flex flex-wrap items-center gap-3">
            <div className="flex-1 min-w-[220px] text-sm">
              <div className="font-semibold text-gray-900">{c.company_name || `${c.first_name} ${c.last_name}`}</div>
              <div className="text-xs text-gray-500">{c.company_name ? `${c.first_name} ${c.last_name} · ` : ''}{[c.license_number, c.city, c.county].filter(Boolean).join(' · ')}</div>
              <div className="text-xs text-gray-500">{[c.email, c.phone && formatPhone(c.phone)].filter(Boolean).join(' · ')}{c.email_opt_out && <span className="ml-2 text-red-600 font-semibold">Unsubscribed</span>}{c.last_marketing_email_at && <span className="ml-2 text-gray-400">Last emailed {fmtDate(c.last_marketing_email_at)}</span>}</div>
            </div>
            {tag === 'cabinet contractor' && <Btn icon={UserCheck} busy={busy === `conv${c.id}`} onClick={() => confirm(`Mark ${c.company_name || c.first_name} as a cabinet customer?`) && act(`conv${c.id}`, { contact_id: c.id }, 'convert', 'Tagged “cabinet customer” + “contractor”')}>Became a customer</Btn>}
            <button onClick={() => act(`opt${c.id}`, { contact_id: c.id, opt_out: !c.email_opt_out }, 'opt_out', c.email_opt_out ? 'Emails allowed again' : 'Unsubscribed')} className="p-2 rounded-lg hover:bg-gray-100 text-gray-500" title={c.email_opt_out ? 'Allow emails again' : 'Unsubscribe from marketing emails'}><Ban size={15} className={c.email_opt_out ? 'text-red-500' : ''} /></button>
          </div>
        ))}
      </div>
      {list && list.total > 100 && (
        <div className="flex items-center justify-center gap-3 text-sm">
          <button disabled={page === 0} onClick={() => setPage(p => p - 1)} className="px-3 py-1.5 rounded-lg border disabled:opacity-40">Previous</button>
          <span className="text-gray-500">{page * 100 + 1}–{Math.min(list.total, page * 100 + 100)} of {list.total}</span>
          <button disabled={(page + 1) * 100 >= list.total} onClick={() => setPage(p => p + 1)} className="px-3 py-1.5 rounded-lg border disabled:opacity-40">Next</button>
        </div>
      )}
    </div>
  )
}

function Template({ data, busy, run, showPreview }: { data: any; busy: string; run: RunFn; showPreview: (id?: string) => void }) {
  const s = data.settings
  const [f, setF] = useState({ subject: s.subject, body: s.body, mailing_address: s.mailing_address, button_label: s.button_label, button_url: s.button_url, min_days_between: s.min_days_between, daily_cap: s.daily_cap, license_types: s.license_types as string[] })
  const dirty = ['subject', 'body', 'mailing_address', 'button_label', 'button_url', 'min_days_between', 'daily_cap'].some(k => String((f as any)[k]) !== String(s[k])) || f.license_types.join() !== s.license_types.join()
  const input = 'w-full px-3 py-2.5 rounded-xl border border-gray-200 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:border-blue-400'
  const save = () => run('save', () => api('/api/leads?action=save_settings', f), () => 'Saved. If you changed the wording, approve the template again.')
  return (
    <div className="grid lg:grid-cols-[1fr_340px] gap-5">
      <Card className="space-y-4">
        <div>
          <label className="block text-sm font-semibold text-gray-700 mb-1">Subject</label>
          <input className={input} value={f.subject} onChange={e => setF({ ...f, subject: e.target.value })} />
        </div>
        <div>
          <label className="block text-sm font-semibold text-gray-700 mb-1">Message</label>
          <textarea className={`${input} font-mono`} rows={14} value={f.body} onChange={e => setF({ ...f, body: e.target.value })} />
          <p className="text-xs text-gray-500 mt-1">Leave a blank line between paragraphs. Fill-ins: {'{first_name} {company} {address} {city} {city_suffix} {permit_type}'}</p>
        </div>
        <div className="grid sm:grid-cols-2 gap-3">
          <div><label className="block text-sm font-semibold text-gray-700 mb-1">Button text (optional)</label><input className={input} value={f.button_label} onChange={e => setF({ ...f, button_label: e.target.value })} placeholder="See our cabinet lines" /></div>
          <div><label className="block text-sm font-semibold text-gray-700 mb-1">Button link</label><input className={input} value={f.button_url} onChange={e => setF({ ...f, button_url: e.target.value })} placeholder="https://…" /></div>
        </div>
        <div>
          <label className="block text-sm font-semibold text-gray-700 mb-1">Business mailing address (required by law in marketing emails)</label>
          <input className={input} value={f.mailing_address} onChange={e => setF({ ...f, mailing_address: e.target.value })} placeholder="Street, City, FL ZIP (a PO box is fine)" />
        </div>
        <div className="grid sm:grid-cols-2 gap-3">
          <div><label className="block text-sm font-semibold text-gray-700 mb-1">Don't email the same contractor more than once every (days)</label><input type="number" min={7} className={input} value={f.min_days_between} onChange={e => setF({ ...f, min_days_between: Number(e.target.value) })} /></div>
          <div><label className="block text-sm font-semibold text-gray-700 mb-1">Most automatic emails per day</label><input type="number" min={0} className={input} value={f.daily_cap} onChange={e => setF({ ...f, daily_cap: Number(e.target.value) })} /></div>
        </div>
        <div>
          <label className="block text-sm font-semibold text-gray-700 mb-1">DBPR licence types to import</label>
          <div className="flex flex-wrap gap-3">
            {Object.entries(data.licenseTypes as Record<string, string>).map(([k, l]) => (
              <label key={k} className="flex items-center gap-1.5 text-sm text-gray-700"><input type="checkbox" checked={f.license_types.includes(k)} onChange={e => setF({ ...f, license_types: e.target.checked ? [...f.license_types, k] : f.license_types.filter(x => x !== k) })} />{k} <span className="text-gray-400">({l})</span></label>
            ))}
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Btn primary icon={CheckCircle2} busy={busy === 'save'} disabled={!dirty} onClick={save}>Save</Btn>
          <Btn icon={Eye} disabled={dirty} onClick={() => showPreview()}>Preview sample</Btn>
        </div>
      </Card>

      <div className="space-y-5">
        <Card>
          <h3 className="font-bold text-gray-900 mb-2">Approval</h3>
          {s.approved
            ? <p className="text-sm text-green-700 flex gap-2"><CheckCircle2 size={16} className="flex-shrink-0 mt-0.5" />Approved {fmtDateTime(s.approved_at)}. Changing the wording un-approves it.</p>
            : <p className="text-sm text-amber-700 flex gap-2"><AlertTriangle size={16} className="flex-shrink-0 mt-0.5" />Not approved. No emails can be sent until you approve this template.</p>}
          <div className="mt-3 flex gap-2 flex-wrap">
            {!s.approved && <Btn primary icon={CheckCircle2} busy={busy === 'approve'} disabled={dirty} onClick={() => run('approve', () => api('/api/leads?action=approve', { approve: true }), () => 'Template approved')}>Approve template</Btn>}
            {s.approved && <Btn icon={X} busy={busy === 'approve'} onClick={() => run('approve', () => api('/api/leads?action=approve', { approve: false }), () => 'Approval removed')}>Un-approve</Btn>}
          </div>
        </Card>
        <Card>
          <h3 className="font-bold text-gray-900 mb-2">Automatic daily emails</h3>
          <p className="text-sm text-gray-600 mb-3">When ON, the daily job sends queued emails by itself (up to {s.daily_cap} a day). When OFF, emails wait in the Email Queue for you to send.</p>
          <button disabled={!!busy || (!s.auto_send && !s.approved)} onClick={() => (s.auto_send || confirm('Turn ON automatic emails? The daily job will email contractors without asking.')) && run('auto', () => api('/api/leads?action=set_auto_send', { on: !s.auto_send }), r => `Automatic emails ${r.auto_send ? 'ON' : 'OFF'}`)}
            className={`w-full flex items-center justify-center gap-2 py-2.5 rounded-xl font-bold text-sm disabled:opacity-50 ${s.auto_send ? 'bg-green-600 text-white' : 'bg-gray-200 text-gray-700'}`}>
            <Power size={15} />{s.auto_send ? 'ON (click to turn off)' : 'OFF (click to turn on)'}
          </button>
        </Card>
        <Card>
          <h3 className="font-bold text-gray-900 mb-2">Sending</h3>
          <p className="text-sm text-gray-600">Sent through Resend from <b>{data.fromEmail}</b>, with replies going to your inbox. Every email has an unsubscribe link and a one-click unsubscribe header, and every send is recorded in the Send Log.{!data.emailReady && <span className="block mt-1 text-red-600 font-semibold">The Resend key is missing on this server.</span>}</p>
        </Card>
      </div>
    </div>
  )
}

function Log({ data }: { data: any }) {
  const color: Record<string, string> = { sent: 'bg-green-100 text-green-700', failed: 'bg-red-100 text-red-700', skipped: 'bg-gray-100 text-gray-600', cancelled: 'bg-gray-100 text-gray-500' }
  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm divide-y">
      {data.log.length === 0 && <div className="p-8 text-center text-gray-400 text-sm">Nothing sent yet.</div>}
      {data.log.map((l: any) => (
        <div key={l.id} className="p-3 flex flex-wrap items-center gap-3 text-sm">
          <span className={`text-xs font-bold px-2 py-0.5 rounded-full capitalize ${color[l.status] || 'bg-gray-100'}`}>{l.status}</span>
          <div className="flex-1 min-w-[200px]"><div className="font-semibold text-gray-900">{who(l.contacts) || l.to_email}</div><div className="text-xs text-gray-500">{l.to_email}{l.subject ? ` · ${l.subject}` : ''}{l.error ? ` · ${l.error}` : ''}</div></div>
          <div className="text-xs text-gray-400">{fmtDateTime(l.sent_at || l.created_at)}{l.sent_by ? ` · ${l.sent_by}` : ''}</div>
        </div>
      ))}
    </div>
  )
}
