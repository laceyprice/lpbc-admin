'use client'
import { useCallback, useEffect, useState } from 'react'
import { CheckCircle2, Loader2, Pencil, Plus, Trash2 } from 'lucide-react'
import { Empty, ErrorNote, Modal, PageHeader, PrimaryButton, Stat, fmtDate, inp, lbl, money } from '@/components/admin/ui'
import { FREQUENCIES, daysUntil } from '@/lib/agreements'

// Recurring service agreements: yearly inspections, maintenance contracts. The daily job turns anything due
// within 30 days into a Todo (and can email the customer). "Mark serviced" moves the next date forward.
type Agreement = { id: string; customer_name: string; customer_email?: string; customer_phone?: string; service_address?: string; service_description?: string; amount: number; frequency: string; next_service_date?: string; last_service_date?: string; remind_customer: boolean; is_active: boolean; notes?: string }
const blank = { customer_name: '', customer_email: '', customer_phone: '', service_address: '', service_description: '', amount: '', frequency: 'annual', next_service_date: '', remind_customer: false, notes: '' }
const todayStr = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}` }

export default function AgreementsPage() {
  const [rows, setRows] = useState<Agreement[] | null>(null)
  const [edit, setEdit] = useState<any | null>(null)
  const [err, setErr] = useState(''), [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    try { const r = await fetch('/api/agreements', { cache: 'no-store' }); const d = await r.json(); if (!r.ok) throw new Error(d.error); setRows(d) } catch (e: any) { setErr(e.message || 'Could not load'); setRows([]) }
  }, [])
  useEffect(() => { load() }, [load])

  async function save() {
    setErr(''); setBusy(true)
    try {
      const body = { ...edit, amount: edit.amount === '' ? 0 : Number(edit.amount) }
      const r = await fetch('/api/agreements', { method: edit.id ? 'PATCH' : 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      const d = await r.json(); if (!r.ok) throw new Error(d.error || 'Could not save')
      setEdit(null); await load()
    } catch (e: any) { setErr(e.message) }
    setBusy(false)
  }
  async function serviced(a: Agreement) {
    if (!confirm(`Mark ${a.customer_name}'s service as done today? The next one will be scheduled automatically.`)) return
    await fetch('/api/agreements?action=serviced', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: a.id }) }); load()
  }
  async function remove(a: Agreement) { if (confirm(`Delete the agreement for ${a.customer_name}?`)) { await fetch(`/api/agreements?id=${a.id}`, { method: 'DELETE' }); load() } }

  const active = (rows || []).filter(r => r.is_active)
  const due30 = active.filter(r => r.next_service_date && daysUntil(r.next_service_date, todayStr()) <= 30).length
  const yearly = active.reduce((s, r) => s + Number(r.amount || 0) * (12 / (FREQUENCIES.find(f => f.value === r.frequency)?.months || 12)), 0)

  return (
    <div className="p-4 md:p-8 pt-16 md:pt-8">
      <PageHeader title="Service Agreements" subtitle="Customers on a repeat schedule. Due services land on your Todo list automatically — you never have to remember them.">
        <PrimaryButton onClick={() => { setErr(''); setEdit({ ...blank, next_service_date: todayStr() }) }}><Plus size={15} /> New agreement</PrimaryButton>
      </PageHeader>
      <div className="grid grid-cols-3 gap-3 mb-5">
        <Stat label="Active agreements" value={String(active.length)} /><Stat label="Due in 30 days" value={String(due30)} tone={due30 ? 'warn' : undefined} /><Stat label="Recurring revenue / yr" value={money(yearly)} tone="good" />
      </div>
      <ErrorNote>{!edit && err}</ErrorNote>
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        {rows === null ? <div className="py-16 flex justify-center"><Loader2 className="animate-spin text-gray-300" /></div>
          : rows.length === 0 ? <Empty>No agreements yet. Add the customers who get a yearly inspection or a maintenance contract.</Empty>
          : rows.map(a => {
            const d = a.next_service_date ? daysUntil(a.next_service_date, todayStr()) : null
            const badge = !a.is_active ? ['Paused', 'bg-gray-100 text-gray-500'] : d === null ? ['No date', 'bg-gray-100 text-gray-500'] : d < 0 ? [`${-d}d overdue`, 'bg-red-100 text-red-700'] : d <= 30 ? [`in ${d}d`, 'bg-amber-100 text-amber-800'] : [fmtDate(a.next_service_date), 'bg-gray-100 text-gray-600']
            return (
              <div key={a.id} className={`flex items-center gap-3 px-4 py-3 border-b border-gray-50 last:border-0 ${a.is_active ? '' : 'opacity-60'}`}>
                <span className={`text-[11px] font-bold px-2 py-1 rounded-full w-24 text-center flex-shrink-0 ${badge[1]}`}>{badge[0]}</span>
                <div className="min-w-0 flex-1">
                  <div className="font-semibold text-gray-900 text-sm">{a.customer_name}{a.service_description ? <span className="font-normal text-gray-500"> — {a.service_description}</span> : null}</div>
                  <div className="text-xs text-gray-400 truncate">{[FREQUENCIES.find(f => f.value === a.frequency)?.label, a.amount ? money(a.amount) : null, a.service_address, a.last_service_date ? 'last ' + fmtDate(a.last_service_date) : null].filter(Boolean).join(' · ')}</div>
                </div>
                <button onClick={() => serviced(a)} title="Mark serviced" className="p-2 text-gray-400 hover:text-green-600"><CheckCircle2 size={18} /></button>
                <button onClick={() => { setErr(''); setEdit({ ...a, amount: a.amount ?? '' }) }} title="Edit" className="p-2 text-gray-400 hover:text-gray-800"><Pencil size={16} /></button>
                <button onClick={() => remove(a)} title="Delete" className="p-2 text-gray-300 hover:text-red-500"><Trash2 size={16} /></button>
              </div>)
          })}
      </div>

      {edit && (
        <Modal title={edit.id ? 'Edit agreement' : 'New agreement'} onClose={() => setEdit(null)}
          footer={<><button onClick={() => setEdit(null)} className="px-4 py-2 rounded-xl text-sm font-semibold text-gray-500 hover:bg-gray-100">Cancel</button><PrimaryButton onClick={save} disabled={busy}>{busy ? 'Saving…' : 'Save'}</PrimaryButton></>}>
          <ErrorNote>{err}</ErrorNote>
          <div><label className={lbl}>Customer *</label><input className={inp} value={edit.customer_name} onChange={e => setEdit({ ...edit, customer_name: e.target.value })} /></div>
          <div className="grid grid-cols-2 gap-3">
            <div><label className={lbl}>Email</label><input type="email" className={inp} value={edit.customer_email || ''} onChange={e => setEdit({ ...edit, customer_email: e.target.value })} /></div>
            <div><label className={lbl}>Phone</label><input type="tel" className={inp} value={edit.customer_phone || ''} onChange={e => setEdit({ ...edit, customer_phone: e.target.value })} /></div>
          </div>
          <div><label className={lbl}>Service address</label><input className={inp} value={edit.service_address || ''} onChange={e => setEdit({ ...edit, service_address: e.target.value })} /></div>
          <div><label className={lbl}>What service</label><input className={inp} placeholder="Annual gas line inspection" value={edit.service_description || ''} onChange={e => setEdit({ ...edit, service_description: e.target.value })} /></div>
          <div className="grid grid-cols-3 gap-3">
            <div><label className={lbl}>How often</label><select className={inp} value={edit.frequency} onChange={e => setEdit({ ...edit, frequency: e.target.value })}>{FREQUENCIES.map(f => <option key={f.value} value={f.value}>{f.label}</option>)}</select></div>
            <div><label className={lbl}>Next due</label><input type="date" className={inp} value={(edit.next_service_date || '').slice(0, 10)} onChange={e => setEdit({ ...edit, next_service_date: e.target.value })} /></div>
            <div><label className={lbl}>Price / visit</label><input type="number" min="0" step="0.01" className={inp} value={edit.amount} onChange={e => setEdit({ ...edit, amount: e.target.value })} /></div>
          </div>
          <label className="flex items-center gap-2 text-sm text-gray-600"><input type="checkbox" checked={!!edit.remind_customer} onChange={e => setEdit({ ...edit, remind_customer: e.target.checked })} /> Email the customer a reminder ~30 days before it’s due</label>
          <label className="flex items-center gap-2 text-sm text-gray-600"><input type="checkbox" checked={edit.is_active !== false} onChange={e => setEdit({ ...edit, is_active: e.target.checked })} /> Active</label>
          <div><label className={lbl}>Notes</label><textarea rows={2} className={inp} value={edit.notes || ''} onChange={e => setEdit({ ...edit, notes: e.target.value })} /></div>
        </Modal>)}
    </div>
  )
}
