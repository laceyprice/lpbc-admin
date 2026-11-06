'use client'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Loader2, Plus, Search, Trash2 } from 'lucide-react'
import { BRAND, Empty, ErrorNote, Modal, PageHeader, PrimaryButton, Stat, fmtDate, inp, lbl, money } from '@/components/admin/ui'
import { postJson } from '@/lib/offline-queue'

// Profit per job. A job is an invoice: what you billed, minus the hours and costs you log against it.
type Job = { id: string; invoice_number: string; customer_name: string; job_address?: string; invoice_status: string; revenue: number; hours: number; labor_cost: number; other_costs: number; profit: number; margin: number | null; has_costs: boolean; created_at: string }
const CATS = ['materials', 'subcontractor', 'permit', 'equipment', 'fuel', 'other']
const pct = (m: number | null) => (m === null ? '—' : `${Math.round(m * 100)}%`)
const marginTone = (m: number | null, has: boolean) => !has ? 'text-gray-400' : m === null ? 'text-gray-400' : m < 0 ? 'text-red-600' : m < 0.2 ? 'text-amber-700' : 'text-green-700'

export default function JobProfitPage() {
  const [jobs, setJobs] = useState<Job[] | null>(null)
  const [rate, setRate] = useState(65)
  const [q, setQ] = useState('')
  const [only, setOnly] = useState<'all' | 'costed' | 'losing'>('all')
  const [open, setOpen] = useState<Job | null>(null)
  const [err, setErr] = useState('')

  const load = useCallback(async () => {
    try {
      const r = await fetch('/api/job-profit', { cache: 'no-store' }); const d = await r.json()
      if (!r.ok) throw new Error(d.error || 'Could not load')
      setJobs(d.jobs); setRate(d.default_rate || 65)
    } catch (e: any) { setErr(e.message); setJobs([]) }
  }, [])
  useEffect(() => { load() }, [load])

  const shown = useMemo(() => (jobs || []).filter(j =>
    (!q || `${j.customer_name} ${j.invoice_number} ${j.job_address || ''}`.toLowerCase().includes(q.toLowerCase())) &&
    (only === 'all' || (only === 'costed' ? j.has_costs : j.has_costs && j.profit < 0))), [jobs, q, only])
  const costed = shown.filter(j => j.has_costs)
  const sum = (f: (j: Job) => number) => costed.reduce((s, j) => s + f(j), 0)
  const rev = sum(j => j.revenue), profit = sum(j => j.profit)

  return (
    <div className="p-4 md:p-8 pt-16 md:pt-8">
      <PageHeader title="Job Profit" subtitle="Tap a job to log hours and costs (materials, subs, permits). Profit = what you billed − labor − costs. Jobs with nothing logged yet show a dash." />
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-5">
        <Stat label="Billed (costed jobs)" value={money(rev)} sub={`${costed.length} job${costed.length === 1 ? '' : 's'} with costs logged`} />
        <Stat label="Labor + costs" value={money(sum(j => j.labor_cost + j.other_costs))} sub={`${sum(j => j.hours).toFixed(1)} hours`} />
        <Stat label="Profit" value={money(profit)} tone={profit < 0 ? 'bad' : 'good'} />
        <Stat label="Margin" value={rev > 0 ? pct(profit / rev) : '—'} tone={rev > 0 && profit / rev < 0.2 ? 'warn' : 'good'} sub={`${(jobs || []).filter(j => !j.has_costs).length} jobs not costed yet`} />
      </div>

      <div className="flex gap-2 mb-3 flex-wrap items-center">
        <div className="relative flex-1 min-w-[200px] max-w-sm"><Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" /><input value={q} onChange={e => setQ(e.target.value)} placeholder="Search customer, invoice, address…" className={inp + ' pl-9'} /></div>
        {(['all', 'costed', 'losing'] as const).map(k => (
          <button key={k} onClick={() => setOnly(k)} className={`text-xs font-bold px-3 py-2 rounded-lg border ${only === k ? 'text-white border-transparent' : 'bg-white border-gray-200 text-gray-600'}`} style={only === k ? { background: BRAND } : undefined}>
            {k === 'all' ? 'All jobs' : k === 'costed' ? 'Costed' : 'Losing money'}</button>
        ))}
      </div>
      <ErrorNote>{err}</ErrorNote>

      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-x-auto">
        {jobs === null ? <div className="py-16 flex justify-center"><Loader2 className="animate-spin text-gray-300" /></div>
          : shown.length === 0 ? <Empty>No jobs match.</Empty>
          : <table className="w-full text-sm min-w-[640px]">
            <thead><tr className="text-left text-[11px] uppercase tracking-wider text-gray-400 border-b border-gray-100">
              <th className="px-4 py-3">Job</th><th className="px-3 py-3 text-right">Billed</th><th className="px-3 py-3 text-right">Labor</th><th className="px-3 py-3 text-right">Costs</th><th className="px-3 py-3 text-right">Profit</th><th className="px-4 py-3 text-right">Margin</th></tr></thead>
            <tbody>{shown.map(j => (
              <tr key={j.id} onClick={() => setOpen(j)} className="border-b border-gray-50 last:border-0 hover:bg-gray-50 cursor-pointer">
                <td className="px-4 py-3"><div className="font-semibold text-gray-900">{j.customer_name}</div><div className="text-xs text-gray-400">#{j.invoice_number} · {fmtDate(j.created_at)}{j.job_address ? ' · ' + j.job_address : ''}</div></td>
                <td className="px-3 py-3 text-right">{money(j.revenue)}</td>
                <td className="px-3 py-3 text-right text-gray-600">{j.has_costs ? <>{money(j.labor_cost)}<div className="text-[11px] text-gray-400">{j.hours.toFixed(1)}h</div></> : '—'}</td>
                <td className="px-3 py-3 text-right text-gray-600">{j.has_costs ? money(j.other_costs) : '—'}</td>
                <td className={`px-3 py-3 text-right font-bold ${marginTone(j.margin, j.has_costs)}`}>{j.has_costs ? money(j.profit) : '—'}</td>
                <td className={`px-4 py-3 text-right font-bold ${marginTone(j.margin, j.has_costs)}`}>{j.has_costs ? pct(j.margin) : '—'}</td>
              </tr>))}</tbody>
          </table>}
      </div>
      {open && <JobDrawer job={open} rate={rate} onClose={() => { setOpen(null); load() }} />}
    </div>
  )
}

function JobDrawer({ job, rate, onClose }: { job: Job; rate: number; onClose: () => void }) {
  const [time, setTime] = useState<any[]>([]), [costs, setCosts] = useState<any[]>([])
  const [loading, setLoading] = useState(true), [err, setErr] = useState(''), [note, setNote] = useState('')
  const [t, setT] = useState({ hours: '', worker: '', hourly_rate: String(rate), notes: '' })
  const [c, setC] = useState({ amount: '', category: 'materials', description: '', vendor: '' })

  const load = useCallback(async () => {
    const r = await fetch(`/api/job-profit?invoice_id=${job.id}`, { cache: 'no-store' }); const d = await r.json().catch(() => ({}))
    if (r.ok) { setTime(d.time); setCosts(d.costs) } else setErr(d.error || 'Could not load')
    setLoading(false)
  }, [job.id])
  useEffect(() => { load() }, [load])

  async function add(kind: 'time' | 'cost') {
    setErr(''); setNote('')
    const body = kind === 'time' ? { invoice_id: job.id, ...t } : { invoice_id: job.id, ...c }
    const r = await postJson(`/api/job-profit?action=${kind}`, body, kind === 'time' ? 'Hours' : 'Cost')
    if (!r.ok) return setErr(r.error || 'Could not save')
    if (r.queued) setNote('Saved on this device — it will sync when you’re back online.')
    if (kind === 'time') setT({ ...t, hours: '', notes: '' }); else setC({ ...c, amount: '', description: '', vendor: '' })
    await load()
  }
  async function del(kind: 'time' | 'cost', id: string) {
    if (!confirm('Delete this entry?')) return
    await fetch(`/api/job-profit?kind=${kind}&id=${id}`, { method: 'DELETE' }); load()
  }
  const labor = time.reduce((s, x) => s + x.hours * x.hourly_rate, 0), other = costs.reduce((s, x) => s + Number(x.amount), 0)
  const profit = job.revenue - labor - other

  return (
    <Modal title={`${job.customer_name} · #${job.invoice_number}`} onClose={onClose} wide footer={<button onClick={onClose} className="px-4 py-2 rounded-xl text-sm font-semibold text-gray-500 hover:bg-gray-100">Close</button>}>
      <div className="grid grid-cols-3 gap-2 text-center">
        <Stat label="Billed" value={money(job.revenue)} /><Stat label="Labor + costs" value={money(labor + other)} />
        <Stat label="Profit" value={money(profit)} tone={profit < 0 ? 'bad' : 'good'} sub={job.revenue > 0 ? pct(profit / job.revenue) : undefined} />
      </div>
      <ErrorNote>{err}</ErrorNote>{note && <div className="text-xs bg-amber-50 text-amber-800 rounded-lg px-3 py-2">{note}</div>}
      {loading ? <div className="py-6 flex justify-center"><Loader2 className="animate-spin text-gray-300" /></div> : (
        <div className="grid md:grid-cols-2 gap-5">
          <section>
            <h4 className="font-bold text-gray-900 mb-2 text-sm">Hours</h4>
            <div className="space-y-2 mb-2">
              <div className="grid grid-cols-3 gap-2">
                <div><label className={lbl}>Hours</label><input type="number" step="0.25" min="0" className={inp} value={t.hours} onChange={e => setT({ ...t, hours: e.target.value })} /></div>
                <div><label className={lbl}>$/hour</label><input type="number" step="1" min="0" className={inp} value={t.hourly_rate} onChange={e => setT({ ...t, hourly_rate: e.target.value })} /></div>
                <div><label className={lbl}>Who</label><input className={inp} value={t.worker} onChange={e => setT({ ...t, worker: e.target.value })} /></div>
              </div>
              <input className={inp} placeholder="Notes (optional)" value={t.notes} onChange={e => setT({ ...t, notes: e.target.value })} />
              <PrimaryButton onClick={() => add('time')}><Plus size={14} /> Add hours</PrimaryButton>
            </div>
            {time.map(x => (<div key={x.id} className="flex items-center gap-2 text-sm py-1.5 border-t border-gray-50"><div className="flex-1 min-w-0"><b>{x.hours}h</b> × {money(x.hourly_rate)}{x.worker ? ` · ${x.worker}` : ''}<div className="text-xs text-gray-400">{fmtDate(x.work_date)}{x.notes ? ' · ' + x.notes : ''}</div></div><span className="font-semibold">{money(x.hours * x.hourly_rate)}</span><button onClick={() => del('time', x.id)} className="text-gray-300 hover:text-red-500"><Trash2 size={14} /></button></div>))}
          </section>
          <section>
            <h4 className="font-bold text-gray-900 mb-2 text-sm">Costs</h4>
            <div className="space-y-2 mb-2">
              <div className="grid grid-cols-2 gap-2">
                <div><label className={lbl}>Amount</label><input type="number" step="0.01" min="0" className={inp} value={c.amount} onChange={e => setC({ ...c, amount: e.target.value })} /></div>
                <div><label className={lbl}>Type</label><select className={inp} value={c.category} onChange={e => setC({ ...c, category: e.target.value })}>{CATS.map(x => <option key={x} value={x}>{x}</option>)}</select></div>
              </div>
              <input className={inp} placeholder="What (e.g. 3/4 black pipe, regulator)" value={c.description} onChange={e => setC({ ...c, description: e.target.value })} />
              <input className={inp} placeholder="Vendor (optional)" value={c.vendor} onChange={e => setC({ ...c, vendor: e.target.value })} />
              <PrimaryButton onClick={() => add('cost')}><Plus size={14} /> Add cost</PrimaryButton>
            </div>
            {costs.map(x => (<div key={x.id} className="flex items-center gap-2 text-sm py-1.5 border-t border-gray-50"><div className="flex-1 min-w-0"><b className="capitalize">{x.category}</b>{x.description ? ` — ${x.description}` : ''}<div className="text-xs text-gray-400">{fmtDate(x.cost_date)}{x.vendor ? ' · ' + x.vendor : ''}</div></div><span className="font-semibold">{money(x.amount)}</span><button onClick={() => del('cost', x.id)} className="text-gray-300 hover:text-red-500"><Trash2 size={14} /></button></div>))}
          </section>
        </div>)}
    </Modal>
  )
}
