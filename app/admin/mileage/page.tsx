'use client'
import { useCallback, useEffect, useState } from 'react'
import { Download, Loader2, Plus, Trash2 } from 'lucide-react'
import { Empty, ErrorNote, PageHeader, PrimaryButton, Stat, fmtDate, inp, lbl, money } from '@/components/admin/ui'
import { postJson } from '@/lib/offline-queue'

// Business mileage for the tax deduction. Log a trip in a few taps; works offline (syncs later).
const todayStr = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}` }

export default function MileagePage() {
  const [year, setYear] = useState(new Date().getFullYear())
  const [data, setData] = useState<{ entries: any[]; miles: number; deduction: number; rate: number } | null>(null)
  const [f, setF] = useState({ trip_date: todayStr(), miles: '', purpose: '', from_location: '', to_location: '', vehicle: '' })
  const [err, setErr] = useState(''), [note, setNote] = useState(''), [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    try { const r = await fetch(`/api/mileage?year=${year}`, { cache: 'no-store' }); const d = await r.json(); if (!r.ok) throw new Error(d.error); setData(d) } catch (e: any) { setErr(e.message || 'Could not load'); setData({ entries: [], miles: 0, deduction: 0, rate: 0.7 }) }
  }, [year])
  useEffect(() => { load() }, [load])

  async function add() {
    setErr(''); setNote(''); setBusy(true)
    const r = await postJson('/api/mileage', f, 'Mileage')
    setBusy(false)
    if (!r.ok) return setErr(r.error || 'Could not save')
    if (r.queued) setNote('Saved on this device — it will sync when you’re back online.')
    setF({ ...f, miles: '', purpose: '', to_location: '' }); load()
  }
  async function remove(id: string) { if (confirm('Delete this trip?')) { await fetch(`/api/mileage?id=${id}`, { method: 'DELETE' }); load() } }
  function csv() {
    const rows = [['Date', 'Miles', 'Purpose', 'From', 'To', 'Vehicle', 'Rate', 'Deduction'], ...(data?.entries || []).map(e => [e.trip_date, e.miles, e.purpose || '', e.from_location || '', e.to_location || '', e.vehicle || '', e.rate, (e.miles * e.rate).toFixed(2)])]
    const text = rows.map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n')
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([text], { type: 'text/csv' })); a.download = `mileage-${year}.csv`; a.click(); URL.revokeObjectURL(a.href)
  }
  const years = [new Date().getFullYear(), new Date().getFullYear() - 1, new Date().getFullYear() - 2]

  return (
    <div className="p-4 md:p-8 pt-16 md:pt-8">
      <PageHeader title="Mileage" subtitle="Log business trips for the mileage deduction. The rate (set in Business Settings) is saved with each trip, so past years never change.">
        <select value={year} onChange={e => setYear(Number(e.target.value))} className={inp + ' !w-auto'}>{years.map(y => <option key={y}>{y}</option>)}</select>
        <button onClick={csv} disabled={!data?.entries.length} className="inline-flex items-center gap-2 text-sm font-bold px-4 py-2.5 rounded-xl border border-gray-200 bg-white disabled:opacity-40"><Download size={15} /> CSV</button>
      </PageHeader>
      <div className="grid grid-cols-3 gap-3 mb-5">
        <Stat label={`Miles in ${year}`} value={data ? data.miles.toLocaleString('en-US', { maximumFractionDigits: 1 }) : '…'} />
        <Stat label="Deduction" value={money(data?.deduction)} tone="good" /><Stat label="Current rate" value={`$${(data?.rate ?? 0.7).toFixed(2)}/mi`} />
      </div>

      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 mb-5">
        <h2 className="font-bold text-gray-900 text-sm mb-3">Log a trip</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div><label className={lbl}>Date</label><input type="date" className={inp} value={f.trip_date} onChange={e => setF({ ...f, trip_date: e.target.value })} /></div>
          <div><label className={lbl}>Miles *</label><input type="number" inputMode="decimal" step="0.1" min="0" className={inp} value={f.miles} onChange={e => setF({ ...f, miles: e.target.value })} /></div>
          <div><label className={lbl}>From</label><input className={inp} placeholder="Shop" value={f.from_location} onChange={e => setF({ ...f, from_location: e.target.value })} /></div>
          <div><label className={lbl}>To</label><input className={inp} placeholder="123 Main St" value={f.to_location} onChange={e => setF({ ...f, to_location: e.target.value })} /></div>
          <div className="col-span-2"><label className={lbl}>Purpose</label><input className={inp} placeholder="Gas line install — Smith" value={f.purpose} onChange={e => setF({ ...f, purpose: e.target.value })} /></div>
          <div><label className={lbl}>Vehicle</label><input className={inp} placeholder="F-250" value={f.vehicle} onChange={e => setF({ ...f, vehicle: e.target.value })} /></div>
          <div className="flex items-end"><PrimaryButton onClick={add} disabled={busy}>{busy ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />} Add trip</PrimaryButton></div>
        </div>
        <div className="mt-2"><ErrorNote>{err}</ErrorNote>{note && <div className="text-xs bg-amber-50 text-amber-800 rounded-lg px-3 py-2">{note}</div>}</div>
      </div>

      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        {!data ? <div className="py-12 flex justify-center"><Loader2 className="animate-spin text-gray-300" /></div> : data.entries.length === 0 ? <Empty>No trips logged for {year}.</Empty>
          : data.entries.map(e => (
            <div key={e.id} className="flex items-center gap-3 px-4 py-3 border-b border-gray-50 last:border-0 text-sm">
              <div className="w-24 text-xs text-gray-500 flex-shrink-0">{fmtDate(e.trip_date)}</div>
              <div className="min-w-0 flex-1"><div className="font-semibold text-gray-900 truncate">{e.purpose || 'Business trip'}</div><div className="text-xs text-gray-400 truncate">{[e.from_location, e.to_location].filter(Boolean).join(' → ')}{e.vehicle ? ` · ${e.vehicle}` : ''}</div></div>
              <div className="text-right"><div className="font-bold">{Number(e.miles).toLocaleString('en-US', { maximumFractionDigits: 1 })} mi</div><div className="text-xs text-gray-400">{money(e.miles * e.rate)}</div></div>
              <button onClick={() => remove(e.id)} className="text-gray-300 hover:text-red-500"><Trash2 size={15} /></button>
            </div>))}
      </div>
    </div>
  )
}
