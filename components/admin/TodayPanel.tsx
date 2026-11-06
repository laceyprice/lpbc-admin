'use client'
import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { Calendar, CheckSquare, Square, MapPin, Phone, Plus, Loader2, AlertCircle, ShieldAlert, Truck } from 'lucide-react'

// Dashboard "Today" strip: today's calendar events (app + Google) and the running
// todo list — overdue first, then due today, then high-priority items with no date.
// Refreshes when something is added through Quick Add and every few minutes.

const ymd = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
const fmtTime = (iso: string) => new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }).replace(' ', '').toLowerCase()
const PRIORITY_DOT: Record<string, string> = { high: 'bg-red-500', medium: 'bg-amber-400', low: 'bg-gray-300' }

export default function TodayPanel({ brand = '#b8895a', showEvents = true }: { brand?: string; showEvents?: boolean }) {
  const [events, setEvents] = useState<any[] | null>(null)
  const [todos, setTodos] = useState<any[] | null>(null)
  const [renewals, setRenewals] = useState<any[]>([])
  const [failed, setFailed] = useState(false)
  const [busyId, setBusyId] = useState('')
  const [toast, setToast] = useState('')

  const load = useCallback(async () => {
    const start = new Date(); start.setHours(0, 0, 0, 0)
    const end = new Date(start); end.setDate(end.getDate() + 1)
    try {
      const [a, t] = await Promise.all([
        showEvents ? fetch(`/api/appointments?from=${encodeURIComponent(start.toISOString())}&to=${encodeURIComponent(end.toISOString())}`, { cache: 'no-store' }).then(r => r.json()) : Promise.resolve([]),
        fetch('/api/todos?status=open', { cache: 'no-store' }).then(r => r.json()),
      ])
      const list = (Array.isArray(a) ? a : []).filter((e: any) => !['cancelled', 'canceled'].includes(String(e.status || '').toLowerCase()))
      // all-day Google events first, then by start time
      list.sort((x: any, y: any) => (Number(!!y._all_day) - Number(!!x._all_day)) || new Date(x.start_time).getTime() - new Date(y.start_time).getTime())
      setEvents(list); setTodos(Array.isArray(t) ? t : []); setFailed(false)
      if (showEvents) fetch('/api/expirations?days=45', { cache: 'no-store' }).then(r => r.json()).then(r => setRenewals(Array.isArray(r) ? r : [])).catch(() => {})
    } catch { setFailed(true); setEvents(e => e || []); setTodos(t => t || []) }
  }, [showEvents])

  useEffect(() => {
    load()
    const on = () => load()
    window.addEventListener('quick-add-done', on)
    const timer = setInterval(load, 5 * 60 * 1000)
    return () => { window.removeEventListener('quick-add-done', on); clearInterval(timer) }
  }, [load])

  async function complete(id: string) {
    setBusyId(id)
    setTodos(ts => (ts || []).filter(t => t.id !== id))                 // optimistic
    try {
      const res = await fetch('/api/todos', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id, status: 'done' }) })
      if (!res.ok) throw new Error()
    } catch { load() }                                                   // put it back if it failed
    setBusyId('')
  }

  async function onMyWay(e: any) {
    const eta = prompt(`Text ${e.customer_name || 'the customer'} that you're on your way.\nAbout how many minutes away? (blank = don't say)`, '20')
    if (eta === null) return
    setBusyId('otw' + e.id)
    try {
      const r = await fetch('/api/notify', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ kind: 'otw', phone: e.customer_phone, name: e.customer_name, eta_minutes: Number(eta) || undefined }) })
      const d = await r.json().catch(() => ({}))
      setToast(r.ok ? 'Text sent ✓' : (d.error || 'Could not send'))
    } catch { setToast('Could not send') }
    setBusyId(''); setTimeout(() => setToast(''), 3500)
  }

  const today = ymd(new Date())
  const open = todos || []
  const overdue = open.filter(t => t.due_date && String(t.due_date).slice(0, 10) < today)
  const dueToday = open.filter(t => t.due_date && String(t.due_date).slice(0, 10) === today)
  const undated = open.filter(t => !t.due_date && t.priority === 'high')
  const shown = [...overdue, ...dueToday, ...undated]
  const restCount = open.length - shown.length

  const quickAdd = () => window.dispatchEvent(new Event('open-quick-add'))

  const TodoRow = ({ t, late }: { t: any; late?: boolean }) => (
    <div className="flex items-start gap-3 px-5 py-3 border-b border-gray-50 last:border-0">
      <button onClick={() => complete(t.id)} disabled={busyId === t.id} aria-label="Mark done" className="mt-0.5 text-gray-300 hover:text-green-600 flex-shrink-0">
        {busyId === t.id ? <Loader2 size={18} className="animate-spin" /> : <Square size={18} />}
      </button>
      <div className="min-w-0 flex-1">
        <div className="text-sm font-semibold text-gray-900 break-words">{t.title}</div>
        <div className="flex flex-wrap items-center gap-x-2 text-[11px] text-gray-400 mt-0.5">
          <span className={`inline-block w-1.5 h-1.5 rounded-full ${PRIORITY_DOT[t.priority] || PRIORITY_DOT.medium}`} />
          {late && <span className="font-bold text-red-600">Overdue · {new Date(String(t.due_date).slice(0, 10) + 'T12:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</span>}
          {!late && t.due_date && <span>Due today</span>}
          {t.assigned_to_name && <span>→ {t.assigned_to_name}</span>}
        </div>
      </div>
    </div>
  )

  return (
    <>
    <div className={`grid gap-4 mb-4 ${showEvents ? 'lg:grid-cols-2' : ''}`}>
      {showEvents && (
        <section className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
            <h2 className="font-bold text-gray-900 flex items-center gap-2"><Calendar size={17} style={{ color: brand }} /> Today’s schedule
              {events && events.length > 0 && <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-blue-50 text-blue-700">{events.length}</span>}</h2>
            <Link href="/admin/calendar" className="text-sm font-medium" style={{ color: brand }}>Calendar</Link>
          </div>
          {events === null ? <div className="py-10 flex justify-center"><Loader2 size={18} className="animate-spin text-gray-300" /></div>
            : events.length === 0 ? <div className="py-9 text-center text-gray-400 text-sm">Nothing on the calendar today</div>
            : events.map((e: any) => (
              <div key={e.id} className="flex gap-3 px-5 py-3 border-b border-gray-50 last:border-0">
                <div className="w-16 flex-shrink-0 text-xs font-bold pt-0.5" style={{ color: brand }}>
                  {e._all_day ? 'All day' : <>{fmtTime(e.start_time)}<div className="font-medium text-gray-400">{e.end_time && fmtTime(e.end_time)}</div></>}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-semibold text-gray-900 break-words line-clamp-2">{e.customer_name || e.title}</div>
                  {e.service_type && <div className="text-xs text-gray-500">{e.service_type}</div>}
                  <div className="flex flex-wrap gap-x-4 gap-y-1 mt-1">
                    {e.service_address && <a href={`https://maps.google.com/?q=${encodeURIComponent(e.service_address)}`} target="_blank" rel="noopener noreferrer" className="text-xs text-gray-500 hover:text-blue-700 flex items-center gap-1"><MapPin size={12} /> {e.service_address}</a>}
                    {e.customer_phone && <a href={`tel:${e.customer_phone}`} className="text-xs text-gray-500 hover:text-blue-700 flex items-center gap-1"><Phone size={12} /> {e.customer_phone}</a>}
                    {e.customer_phone && e._source !== 'google' && <button onClick={() => onMyWay(e)} disabled={busyId === 'otw' + e.id} className="text-xs font-semibold flex items-center gap-1 hover:underline disabled:opacity-50" style={{ color: brand }}><Truck size={12} /> On my way</button>}
                  </div>
                </div>
              </div>
            ))}
        </section>
      )}

      <section className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between gap-2">
          <h2 className="font-bold text-gray-900 flex items-center gap-2"><CheckSquare size={17} style={{ color: brand }} /> To do
            {overdue.length > 0 && <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-red-50 text-red-600 flex items-center gap-1"><AlertCircle size={11} /> {overdue.length} overdue</span>}</h2>
          <div className="flex items-center gap-3">
            <button onClick={quickAdd} className="text-sm font-semibold flex items-center gap-1" style={{ color: brand }}><Plus size={14} /> Add</button>
            <Link href="/admin/todo" className="text-sm font-medium text-gray-500 hover:text-gray-800">All</Link>
          </div>
        </div>
        {todos === null ? <div className="py-10 flex justify-center"><Loader2 size={18} className="animate-spin text-gray-300" /></div>
          : shown.length === 0 ? <div className="py-9 text-center text-gray-400 text-sm">{open.length === 0 ? 'All caught up 🎉' : 'Nothing due today'}</div>
          : <>
              {overdue.map(t => <TodoRow key={t.id} t={t} late />)}
              {dueToday.map(t => <TodoRow key={t.id} t={t} />)}
              {undated.map(t => <TodoRow key={t.id} t={t} />)}
            </>}
        {restCount > 0 && <Link href="/admin/todo" className="block px-5 py-3 text-xs font-semibold text-gray-500 hover:bg-gray-50 border-t border-gray-100">+ {restCount} more open on your list →</Link>}
        {failed && <div className="px-5 py-2 text-xs text-amber-700 bg-amber-50">Couldn’t refresh — showing what loaded earlier.</div>}
      </section>
    </div>
    {toast && <div className="fixed z-50 left-1/2 -translate-x-1/2 bottom-24 bg-gray-900 text-white text-sm font-semibold px-4 py-2.5 rounded-xl shadow-lg">{toast}</div>}
    {showEvents && renewals.length > 0 && (
      <section className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden mb-8">
        <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
          <h2 className="font-bold text-gray-900 flex items-center gap-2"><ShieldAlert size={17} className="text-amber-600" /> Renewals due
            <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-amber-50 text-amber-700">{renewals.length}</span></h2>
          <span className="text-xs text-gray-400">licenses · insurance · permits · next 45 days</span>
        </div>
        {renewals.slice(0, 6).map(r => {
          const late = r.days_left < 0, soon = r.days_left <= 14
          return (
            <Link key={r.kind + r.id} href={r.href} className="flex items-center gap-3 px-5 py-3 border-b border-gray-50 last:border-0 hover:bg-gray-50">
              <span className={`text-[11px] font-bold px-2 py-1 rounded-full flex-shrink-0 w-24 text-center ${late ? 'bg-red-100 text-red-700' : soon ? 'bg-amber-100 text-amber-800' : 'bg-gray-100 text-gray-600'}`}>
                {late ? `${-r.days_left}d overdue` : r.days_left === 0 ? 'Today' : `in ${r.days_left}d`}
              </span>
              <div className="min-w-0 flex-1">
                <div className="text-sm font-semibold text-gray-900 truncate">{r.title}</div>
                <div className="text-xs text-gray-500 truncate">{r.kind}{r.subtitle ? ` · ${r.subtitle}` : ''}</div>
              </div>
            </Link>
          )
        })}
        {renewals.length > 6 && <div className="px-5 py-2.5 text-xs text-gray-400">+ {renewals.length - 6} more — see Licensing, Permits and Documents</div>}
      </section>
    )}
    </>
  )
}
