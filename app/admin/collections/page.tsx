'use client'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Ban, Loader2, Mail, MessageSquare, RotateCcw, Send } from 'lucide-react'
import { BRAND, Empty, ErrorNote, PageHeader, Stat, fmtDate, money } from '@/components/admin/ui'

// Who owes you money, how late it is, and a one-click reminder (email / text / both).
type Item = { id: string; invoice_number: string; customer_name: string; customer_email?: string; customer_phone?: string; job_address?: string; due_date?: string; balance: number; days_past_due: number; bucket: string; last_reminder_at: string | null; reminder_count: number }
type Bucket = { key: string; label: string; total: number; count: number }

const BUCKET_STYLE: Record<string, string> = { current: 'bg-gray-100 text-gray-600', d1_30: 'bg-amber-100 text-amber-800', d31_60: 'bg-orange-100 text-orange-800', d61_90: 'bg-red-100 text-red-700', d90_plus: 'bg-red-200 text-red-900' }

export default function CollectionsPage() {
  const [items, setItems] = useState<Item[] | null>(null)
  const [buckets, setBuckets] = useState<Bucket[]>([])
  const [total, setTotal] = useState(0)
  const [pick, setPick] = useState<Set<string>>(new Set())
  const [filter, setFilter] = useState<string>('all')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [report, setReport] = useState<string[]>([])
  const [off, setOff] = useState<{ items: any[]; total: number }>({ items: [], total: 0 })
  const [showOff, setShowOff] = useState(false)

  const load = useCallback(async () => {
    try {
      const r = await fetch('/api/collections', { cache: 'no-store' }); const d = await r.json()
      if (!r.ok) throw new Error(d.error || 'Could not load')
      setItems(d.items); setBuckets(d.buckets); setTotal(d.total); setOff({ items: d.written_off || [], total: d.written_off_total || 0 })
    } catch (e: any) { setErr(e.message); setItems([]) }
  }, [])
  useEffect(() => { load() }, [load])

  const shown = useMemo(() => (items || []).filter(i => filter === 'all' || i.bucket === filter), [items, filter])
  const toggle = (id: string) => setPick(p => { const n = new Set(p); n.has(id) ? n.delete(id) : n.add(id); return n })
  const overdue = (items || []).filter(i => i.days_past_due > 0)

  async function send(ids: string[], channel: 'email' | 'sms' | 'both') {
    if (!ids.length) return
    if (!confirm(`Send a payment reminder to ${ids.length} customer${ids.length === 1 ? '' : 's'} by ${channel === 'sms' ? 'text' : channel}?`)) return
    setBusy(true); setErr(''); setReport([])
    try {
      const r = await fetch('/api/collections', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ invoice_ids: ids, channel }) })
      const d = await r.json(); if (!r.ok) throw new Error(d.error || 'Failed')
      setReport((d.results as any[]).map(x => `${x.invoice_number}: ${x.sent.length ? 'sent by ' + x.sent.join(' + ') : x.skipped || (x.errors || []).join('; ') || 'not sent'}${x.sent.length && x.errors?.length ? ' (' + x.errors.join('; ') + ')' : ''}`))
      setPick(new Set()); await load()
    } catch (e: any) { setErr(e.message) }
    setBusy(false)
  }

  async function writeOff(ids: string[], label: string, amount: number) {
    const reason = prompt(`Write off ${label} (${money(amount)}) as uncollectible?\n\nThey stop counting as money owed to you. You can undo this later.\nOptional note — why (customer unreachable, disputed, bankrupt…):`, '')
    if (reason === null) return
    setBusy(true); setErr(''); setReport([])
    try {
      const r = await fetch('/api/collections?action=write_off', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ invoice_ids: ids, reason }) })
      const d = await r.json(); if (!r.ok) throw new Error(d.error || 'Failed')
      if (d.skipped?.length) setReport(d.skipped)
      setPick(new Set()); await load()
    } catch (e: any) { setErr(e.message) }
    setBusy(false)
  }
  async function restore(id: string, label: string) {
    if (!confirm(`Put ${label} back on the list of money owed?`)) return
    setBusy(true); setErr('')
    try {
      const r = await fetch('/api/collections?action=restore', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ invoice_ids: [id] }) })
      const d = await r.json(); if (!r.ok) throw new Error(d.error || 'Failed')
      await load()
    } catch (e: any) { setErr(e.message) }
    setBusy(false)
  }

  return (
    <div className="p-4 md:p-8 pt-16 md:pt-8">
      <PageHeader title="Collections" subtitle="Unpaid invoices, oldest first. Reminders start friendly and get firmer the later the invoice is. Nothing is sent until you click.">
        <button onClick={() => send(overdue.map(i => i.id), 'both')} disabled={busy || overdue.length === 0}
          className="inline-flex items-center gap-2 text-white text-sm font-bold px-4 py-2.5 rounded-xl disabled:opacity-50" style={{ background: BRAND }}>
          {busy ? <Loader2 size={15} className="animate-spin" /> : <Send size={15} />} Remind all overdue ({overdue.length})
        </button>
      </PageHeader>

      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 mb-5">
        {items === null ? [...Array(5)].map((_, i) => <div key={i} className="h-20 rounded-2xl bg-gray-200 animate-pulse" />) : buckets.map(b => (
          <button key={b.key} onClick={() => setFilter(f => f === b.key ? 'all' : b.key)} className={`text-left rounded-2xl ${filter === b.key ? 'ring-2' : ''}`} style={filter === b.key ? { ['--tw-ring-color' as any]: BRAND } : undefined}>
            <Stat label={b.label} value={money(b.total)} sub={`${b.count} invoice${b.count === 1 ? '' : 's'}`} tone={b.key === 'current' ? undefined : b.total > 0 ? (b.key === 'd1_30' ? 'warn' : 'bad') : undefined} />
          </button>
        ))}
      </div>
      <div className="text-sm text-gray-500 mb-3">Total owed: <b className="text-gray-900">{money(total)}</b>{filter !== 'all' && <button onClick={() => setFilter('all')} className="ml-3 underline">show all</button>}</div>

      <ErrorNote>{err}</ErrorNote>
      {report.length > 0 && <div className="mb-4 bg-green-50 border border-green-100 text-green-800 text-sm px-4 py-3 rounded-xl space-y-0.5">{report.map((r, i) => <div key={i}>{r}</div>)}</div>}

      {pick.size > 0 && (
        <div className="sticky top-2 z-10 mb-3 bg-white border border-gray-200 shadow-md rounded-xl px-4 py-2.5 flex items-center gap-2 flex-wrap">
          <b className="text-sm">{pick.size} selected</b>
          <button onClick={() => send([...pick], 'email')} disabled={busy} className="text-xs font-bold px-3 py-1.5 rounded-lg border border-gray-200 hover:bg-gray-50 flex items-center gap-1"><Mail size={13} /> Email</button>
          <button onClick={() => send([...pick], 'sms')} disabled={busy} className="text-xs font-bold px-3 py-1.5 rounded-lg border border-gray-200 hover:bg-gray-50 flex items-center gap-1"><MessageSquare size={13} /> Text</button>
          <button onClick={() => send([...pick], 'both')} disabled={busy} className="text-xs font-bold px-3 py-1.5 rounded-lg text-white" style={{ background: BRAND }}>Both</button>
          <button onClick={() => writeOff([...pick], `${pick.size} invoice${pick.size === 1 ? '' : 's'}`, (items || []).filter(i => pick.has(i.id)).reduce((s, i) => s + i.balance, 0))} disabled={busy} className="text-xs font-bold px-3 py-1.5 rounded-lg border border-orange-200 text-orange-700 hover:bg-orange-50 flex items-center gap-1 ml-auto"><Ban size={13} /> Write off</button>
        </div>
      )}

      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        {items === null ? <div className="py-16 flex justify-center"><Loader2 className="animate-spin text-gray-300" /></div>
          : shown.length === 0 ? <Empty>{items.length === 0 ? 'Nobody owes you anything. 🎉' : 'Nothing in this group.'}</Empty>
          : shown.map(i => (
            <label key={i.id} className="flex items-center gap-3 px-4 py-3 border-b border-gray-50 last:border-0 hover:bg-gray-50 cursor-pointer">
              <input type="checkbox" checked={pick.has(i.id)} onChange={() => toggle(i.id)} />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-semibold text-gray-900 text-sm">{i.customer_name}</span>
                  <span className="text-xs text-gray-400">#{i.invoice_number}</span>
                  <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full ${BUCKET_STYLE[i.bucket]}`}>{i.days_past_due > 0 ? `${i.days_past_due}d late` : i.days_past_due === 0 ? 'due today' : `due in ${-i.days_past_due}d`}</span>
                </div>
                <div className="text-xs text-gray-500 truncate">{[i.job_address, i.due_date ? 'due ' + fmtDate(i.due_date) : null].filter(Boolean).join(' · ')}</div>
                <div className="text-[11px] text-gray-400">{i.reminder_count > 0 ? `Reminded ${i.reminder_count}× · last ${fmtDate(i.last_reminder_at)}` : 'No reminder sent yet'}{!i.customer_email && !i.customer_phone ? ' · no email or phone on file' : ''}</div>
              </div>
              <div className="font-extrabold text-gray-900 text-sm sm:text-base">{money(i.balance)}</div>
              <button onClick={e => { e.preventDefault(); writeOff([i.id], `${i.customer_name} #${i.invoice_number}`, i.balance) }} title="Write off as uncollectible" aria-label="Write off as uncollectible" className="p-1.5 rounded-lg text-gray-300 hover:text-orange-600 hover:bg-orange-50"><Ban size={15} /></button>
            </label>
          ))}
      </div>

      {/* Written off: not counted as money owed. Kept here so nothing disappears. */}
      <div className="mt-6">
        <button onClick={() => setShowOff(s => !s)} className="text-sm font-semibold text-gray-600 hover:text-gray-900">
          {showOff ? '▾' : '▸'} Written off as uncollectible ({off.items.length}){off.total > 0 ? ` · ${money(off.total)}` : ''}
        </button>
        {showOff && (
          <div className="mt-2 bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
            {off.items.length === 0 ? <Empty>Nothing written off.</Empty> : off.items.map((i: any) => (
              <div key={i.id} className="flex items-center gap-3 px-4 py-3 border-b border-gray-50 last:border-0">
                <div className="min-w-0 flex-1">
                  <div className="font-semibold text-gray-900 text-sm">{i.customer_name} <span className="text-xs font-normal text-gray-400">#{i.invoice_number}</span></div>
                  <div className="text-xs text-gray-500 truncate">Written off {fmtDate(i.written_off_at)}{i.write_off_reason ? ` · ${i.write_off_reason}` : ''}</div>
                </div>
                <div className="font-bold text-gray-500 text-sm">{money(i.balance)}</div>
                <button onClick={() => restore(i.id, `${i.customer_name} #${i.invoice_number}`)} disabled={busy} title="Undo write-off" className="p-1.5 rounded-lg text-gray-400 hover:text-gray-800 hover:bg-gray-50"><RotateCcw size={15} /></button>
              </div>))}
          </div>)}
        <p className="text-xs text-gray-400 mt-2 max-w-2xl">Writing off doesn’t erase the invoice or the customer’s debt — it just stops counting it as money you expect. On a cash basis you only report income when it’s paid, so an unpaid invoice was never income and there’s nothing to deduct. If they ever pay, mark the invoice paid and it counts then.</p>
      </div>
    </div>
  )
}
