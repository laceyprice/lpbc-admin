'use client'
import { useCallback, useEffect, useState } from 'react'
import { AlertTriangle, ChevronDown, Download, Loader2, Pencil, Plus, Trash2 } from 'lucide-react'
import { Empty, ErrorNote, Modal, PageHeader, PrimaryButton, Stat, fmtDate, inp, lbl, money } from '@/components/admin/ui'

// Subcontractors and what you've paid them, so 1099s at year end aren't a scramble.
type Sub = { id: string; name: string; business_name?: string; trade?: string; email?: string; phone?: string; tax_id_last4?: string; w9_on_file: boolean; coi_expiry?: string; is_active: boolean; notes?: string; paid_ytd: number; flags: string[] }
const FLAG: Record<string, [string, string]> = {
  needs_1099: ['Needs 1099', 'bg-red-100 text-red-700'], near_threshold: ['Near 1099 limit', 'bg-amber-100 text-amber-800'],
  missing_w9: ['No W-9 on file', 'bg-red-100 text-red-700'], coi_expired: ['Insurance expired', 'bg-red-100 text-red-700'], coi_expiring: ['Insurance expiring', 'bg-amber-100 text-amber-800'],
}
const todayStr = () => new Date().toISOString().slice(0, 10)

export default function SubcontractorsPage() {
  const [year, setYear] = useState(new Date().getFullYear())
  const [subs, setSubs] = useState<Sub[] | null>(null)
  const [threshold, setThreshold] = useState(600)
  const [edit, setEdit] = useState<any | null>(null)
  const [openId, setOpenId] = useState<string | null>(null)
  const [err, setErr] = useState(''), [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    try { const r = await fetch(`/api/subcontractors?year=${year}`, { cache: 'no-store' }); const d = await r.json(); if (!r.ok) throw new Error(d.error); setSubs(d.subs); setThreshold(d.threshold) } catch (e: any) { setErr(e.message || 'Could not load'); setSubs([]) }
  }, [year])
  useEffect(() => { load() }, [load])

  async function save() {
    setErr(''); setBusy(true)
    try {
      const r = await fetch('/api/subcontractors', { method: edit.id ? 'PATCH' : 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(edit) })
      const d = await r.json(); if (!r.ok) throw new Error(d.error || 'Could not save'); setEdit(null); load()
    } catch (e: any) { setErr(e.message) }
    setBusy(false)
  }
  async function remove(s: Sub) { if (confirm(`Delete ${s.name} and all their payment records?`)) { await fetch(`/api/subcontractors?id=${s.id}`, { method: 'DELETE' }); load() } }
  function csv() {
    const rows = [['Name', 'Business', 'Trade', 'Email', 'Phone', 'Tax ID (last 4)', 'W-9 on file', `Paid ${year}`, 'Needs 1099'], ...(subs || []).map(s => [s.name, s.business_name || '', s.trade || '', s.email || '', s.phone || '', s.tax_id_last4 || '', s.w9_on_file ? 'yes' : 'no', s.paid_ytd.toFixed(2), s.paid_ytd >= threshold ? 'YES' : ''])]
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([rows.map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n')], { type: 'text/csv' })); a.download = `subcontractors-${year}.csv`; a.click(); URL.revokeObjectURL(a.href)
  }
  const list = subs || []
  const years = [new Date().getFullYear(), new Date().getFullYear() - 1, new Date().getFullYear() - 2]

  return (
    <div className="p-4 md:p-8 pt-16 md:pt-8">
      <PageHeader title="Subcontractors" subtitle={`Track who you pay and what they've been paid. Contractors paid ${money(threshold)}+ in a year generally need a 1099-NEC — confirm the current limit with your accountant.`}>
        <select value={year} onChange={e => setYear(Number(e.target.value))} className={inp + ' !w-auto'}>{years.map(y => <option key={y}>{y}</option>)}</select>
        <button onClick={csv} disabled={!list.length} className="inline-flex items-center gap-2 text-sm font-bold px-4 py-2.5 rounded-xl border border-gray-200 bg-white disabled:opacity-40"><Download size={15} /> CSV</button>
        <PrimaryButton onClick={() => { setErr(''); setEdit({ name: '', w9_on_file: false, is_active: true }) }}><Plus size={15} /> Add sub</PrimaryButton>
      </PageHeader>
      <div className="grid grid-cols-3 gap-3 mb-5">
        <Stat label="Subcontractors" value={String(list.filter(s => s.is_active).length)} /><Stat label={`Paid in ${year}`} value={money(list.reduce((s, x) => s + x.paid_ytd, 0))} />
        <Stat label="Need a 1099" value={String(list.filter(s => s.flags.includes('needs_1099')).length)} tone={list.some(s => s.flags.includes('needs_1099')) ? 'warn' : undefined} />
      </div>
      <ErrorNote>{!edit && err}</ErrorNote>
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        {subs === null ? <div className="py-16 flex justify-center"><Loader2 className="animate-spin text-gray-300" /></div> : list.length === 0 ? <Empty>No subcontractors yet.</Empty>
          : list.map(s => (
            <div key={s.id} className={`border-b border-gray-50 last:border-0 ${s.is_active ? '' : 'opacity-60'}`}>
              <div className="flex items-center gap-3 px-4 py-3">
                <button onClick={() => setOpenId(openId === s.id ? null : s.id)} className="p-1 text-gray-400"><ChevronDown size={16} className={openId === s.id ? 'rotate-180' : ''} /></button>
                <div className="min-w-0 flex-1">
                  <div className="font-semibold text-gray-900 text-sm">{s.name}{s.business_name ? <span className="font-normal text-gray-500"> · {s.business_name}</span> : null}</div>
                  <div className="flex flex-wrap gap-1 mt-0.5">{[s.trade, s.phone].filter(Boolean).map((x, i) => <span key={i} className="text-xs text-gray-400">{x}</span>)}
                    {s.flags.map(f => <span key={f} className={`text-[10px] font-bold px-2 py-0.5 rounded-full flex items-center gap-1 ${FLAG[f][1]}`}><AlertTriangle size={9} />{FLAG[f][0]}</span>)}</div>
                </div>
                <div className="text-right font-extrabold text-sm">{money(s.paid_ytd)}</div>
                <button onClick={() => { setErr(''); setEdit({ ...s }) }} className="p-2 text-gray-400 hover:text-gray-800"><Pencil size={15} /></button>
                <button onClick={() => remove(s)} className="p-2 text-gray-300 hover:text-red-500"><Trash2 size={15} /></button>
              </div>
              {openId === s.id && <Payments sub={s} year={year} onChange={load} />}
            </div>))}
      </div>
      {edit && (
        <Modal title={edit.id ? 'Edit subcontractor' : 'Add subcontractor'} onClose={() => setEdit(null)} footer={<><button onClick={() => setEdit(null)} className="px-4 py-2 rounded-xl text-sm font-semibold text-gray-500 hover:bg-gray-100">Cancel</button><PrimaryButton onClick={save} disabled={busy}>{busy ? 'Saving…' : 'Save'}</PrimaryButton></>}>
          <ErrorNote>{err}</ErrorNote>
          <div className="grid grid-cols-2 gap-3">
            <div><label className={lbl}>Name *</label><input className={inp} value={edit.name || ''} onChange={e => setEdit({ ...edit, name: e.target.value })} /></div>
            <div><label className={lbl}>Business</label><input className={inp} value={edit.business_name || ''} onChange={e => setEdit({ ...edit, business_name: e.target.value })} /></div>
            <div><label className={lbl}>Trade</label><input className={inp} placeholder="Plumber, electrician…" value={edit.trade || ''} onChange={e => setEdit({ ...edit, trade: e.target.value })} /></div>
            <div><label className={lbl}>Phone</label><input type="tel" className={inp} value={edit.phone || ''} onChange={e => setEdit({ ...edit, phone: e.target.value })} /></div>
            <div><label className={lbl}>Email</label><input type="email" className={inp} value={edit.email || ''} onChange={e => setEdit({ ...edit, email: e.target.value })} /></div>
            <div><label className={lbl}>Tax ID — last 4 only</label><input inputMode="numeric" maxLength={4} className={inp} value={edit.tax_id_last4 || ''} onChange={e => setEdit({ ...edit, tax_id_last4: e.target.value })} /></div>
            <div><label className={lbl}>Insurance (COI) expires</label><input type="date" className={inp} value={(edit.coi_expiry || '').slice(0, 10)} onChange={e => setEdit({ ...edit, coi_expiry: e.target.value })} /></div>
          </div>
          <label className="flex items-center gap-2 text-sm text-gray-600"><input type="checkbox" checked={!!edit.w9_on_file} onChange={e => setEdit({ ...edit, w9_on_file: e.target.checked })} /> W-9 on file (keep the form itself in Insurance &amp; Other Docs)</label>
          <label className="flex items-center gap-2 text-sm text-gray-600"><input type="checkbox" checked={edit.is_active !== false} onChange={e => setEdit({ ...edit, is_active: e.target.checked })} /> Active</label>
          <div><label className={lbl}>Notes</label><textarea rows={2} className={inp} value={edit.notes || ''} onChange={e => setEdit({ ...edit, notes: e.target.value })} /></div>
        </Modal>)}
    </div>
  )
}

function Payments({ sub, year, onChange }: { sub: Sub; year: number; onChange: () => void }) {
  const [rows, setRows] = useState<any[] | null>(null)
  const [f, setF] = useState({ amount: '', pay_date: todayStr(), description: '' })
  const [err, setErr] = useState('')
  const load = useCallback(async () => { const r = await fetch(`/api/subcontractors?id=${sub.id}&year=${year}`, { cache: 'no-store' }); setRows(r.ok ? await r.json() : []) }, [sub.id, year])
  useEffect(() => { load() }, [load])
  async function add() {
    setErr(''); const r = await fetch('/api/subcontractors?action=payment', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ subcontractor_id: sub.id, ...f }) })
    const d = await r.json().catch(() => ({})); if (!r.ok) return setErr(d.error || 'Could not save')
    setF({ ...f, amount: '', description: '' }); load(); onChange()
  }
  async function del(id: string) { if (confirm('Delete this payment?')) { await fetch(`/api/subcontractors?payment_id=${id}`, { method: 'DELETE' }); load(); onChange() } }
  return (
    <div className="bg-gray-50 px-4 sm:px-12 py-3">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 items-end mb-2">
        <div><label className={lbl}>Amount</label><input type="number" min="0" step="0.01" className={inp} value={f.amount} onChange={e => setF({ ...f, amount: e.target.value })} /></div>
        <div><label className={lbl}>Date</label><input type="date" className={inp} value={f.pay_date} onChange={e => setF({ ...f, pay_date: e.target.value })} /></div>
        <div className="col-span-2 sm:col-span-1"><label className={lbl}>For</label><input className={inp} placeholder="Job / invoice" value={f.description} onChange={e => setF({ ...f, description: e.target.value })} /></div>
        <PrimaryButton onClick={add}><Plus size={14} /> Record payment</PrimaryButton>
      </div>
      <ErrorNote>{err}</ErrorNote>
      {rows === null ? <Loader2 size={14} className="animate-spin text-gray-300" /> : rows.length === 0 ? <div className="text-xs text-gray-400 py-1">No payments in {year}.</div>
        : rows.map(p => <div key={p.id} className="flex items-center gap-3 text-sm py-1 border-t border-gray-100"><span className="w-28 text-xs text-gray-500">{fmtDate(p.pay_date)}</span><span className="flex-1 text-gray-600 truncate">{p.description || '—'}</span><b>{money(p.amount)}</b><button onClick={() => del(p.id)} className="text-gray-300 hover:text-red-500"><Trash2 size={13} /></button></div>)}
    </div>
  )
}
