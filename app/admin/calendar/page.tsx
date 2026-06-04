'use client'
import { useEffect, useState } from 'react'
import { ChevronLeft, ChevronRight, Plus, X, Loader2, Calendar, List, Grid } from 'lucide-react'
import { formatCurrency, formatPhone } from '@/lib/utils'

interface Appointment {
  id: string
  title: string
  customer_name: string
  customer_email: string
  customer_phone: string
  service_address: string
  service_type: string
  notes: string
  start_time: string
  end_time: string
  status: string
  contact_id?: string
}

const HOURS = Array.from({ length: 13 }, (_, i) => i + 7) // 7am - 7pm
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December']
const SERVICE_TYPES = ['Service', 'Draw']


function getWeekDates(date: Date) {
  const d = new Date(date)
  const day = d.getDay()
  const diff = d.getDate() - day
  return Array.from({ length: 7 }, (_, i) => { const nd = new Date(d); nd.setDate(diff + i); return nd })
}

function isSameDay(a: Date, b: Date) {
  return a.getDate() === b.getDate() && a.getMonth() === b.getMonth() && a.getFullYear() === b.getFullYear()
}

function getMonthDates(year: number, month: number) {
  const first = new Date(year, month, 1)
  const last = new Date(year, month + 1, 0)
  const startDay = first.getDay()
  const days: (Date | null)[] = []
  for (let i = 0; i < startDay; i++) days.push(null)
  for (let i = 1; i <= last.getDate(); i++) days.push(new Date(year, month, i))
  return days
}

export default function CalendarPage() {
  const [view, setView] = useState<'week' | 'month' | 'list'>('week')
  const [current, setCurrent] = useState(new Date())
  const [appointments, setAppointments] = useState<Appointment[]>([])
  const [loading, setLoading] = useState(true)
  const [creating, setCreating] = useState(false)
  const [editing, setEditing] = useState<Appointment | null>(null)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState<Partial<Appointment>>({})
  const [contacts, setContacts] = useState<any[]>([])

  useEffect(() => { load(); loadContacts() }, [])

  async function load() {
    setLoading(true)
    const res = await fetch('/api/appointments')
    const d = await res.json()
    setAppointments(Array.isArray(d) ? d : [])
    setLoading(false)
  }

  async function loadContacts() {
    const res = await fetch('/api/contacts')
    const d = await res.json()
    setContacts(Array.isArray(d) ? d : [])
  }

  function openCreate(defaultStart?: string) {
    const d = defaultStart ? new Date(defaultStart) : new Date()
    const pad = (n: number) => String(n).padStart(2, '0')
    const dateStr = `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`
    const period = d.getHours() < 12 ? 'AM' : 'PM'
    setForm({ appt_date: dateStr, appt_period: period, status: 'scheduled' } as any)
    setCreating(true)
  }

  function autofillContact(contactId: string) {
    const c = contacts.find(x => x.id === contactId)
    if (!c) return
    setForm(f => ({
      ...f,
      contact_id: c.id,
      customer_name: `${c.first_name} ${c.last_name}`,
      customer_email: c.email || '',
      customer_phone: c.phone || '',
      service_address: c.address || '',
    }))
  }

  async function save() {
    setSaving(true)
    try {
      const method = editing ? 'PATCH' : 'POST'
      const f = form as any
      // Convert date + AM/PM to start/end times
      let payload: any = { ...form }
      if (f.appt_date) {
        const startHour = f.appt_period === 'AM' ? 8 : 12
        const endHour = f.appt_period === 'AM' ? 12 : 17
        payload.start_time = new Date(`${f.appt_date}T${String(startHour).padStart(2,'0')}:00`).toISOString()
        payload.end_time = new Date(`${f.appt_date}T${String(endHour).padStart(2,'0')}:00`).toISOString()
        delete payload.appt_date
        delete payload.appt_period
      }
      const body = editing ? { ...payload, id: editing.id } : payload
      const res = await fetch('/api/appointments', { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      if (res.ok) { await load(); setCreating(false); setEditing(null); setForm({}) }
      else alert('Failed to save appointment')
    } finally { setSaving(false) }
  }

  async function deleteAppt(id: string) {
    if (!confirm('Delete this appointment?')) return
    await fetch('/api/appointments', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id }) })
    await load()
    setEditing(null)
  }

  function apptColor(status: string) {
    if (status === 'completed') return 'bg-green-100 border-green-300 text-green-800'
    if (status === 'cancelled') return 'bg-red-100 border-red-300 text-red-700'
    return 'border-l-4 text-white'
  }

  const weekDates = getWeekDates(current)
  const monthDates = getMonthDates(current.getFullYear(), current.getMonth())

  function navigate(dir: number) {
    const d = new Date(current)
    if (view === 'week') d.setDate(d.getDate() + dir * 7)
    else if (view === 'month') d.setMonth(d.getMonth() + dir)
    else d.setDate(d.getDate() + dir * 7)
    setCurrent(d)
  }

  function apptForSlot(date: Date, hour: number) {
    return appointments.filter(a => {
      const s = new Date(a.start_time)
      return isSameDay(s, date) && s.getHours() === hour
    })
  }

  function apptForDay(date: Date) {
    return appointments.filter(a => isSameDay(new Date(a.start_time), date))
  }

  const inputCls = 'w-full px-3 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:border-blue-400'
  const labelCls = 'block text-sm font-semibold text-gray-700 mb-1'

  const modalOpen = creating || !!editing
  const modalData = editing || form

  return (
    <div className="p-6 md:p-8 pt-16 md:pt-8 h-full flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between mb-5">
        <div>
          <h1 className="text-2xl font-extrabold text-gray-900">Calendar</h1>
          <p className="text-gray-500 text-sm mt-0.5">Manage appointments · syncs with Google Calendar</p>
        </div>
        <button onClick={() => openCreate()} className="flex items-center gap-2 text-white font-semibold px-4 py-2.5 rounded-xl shadow-md" style={{ background: '#b8895a' }}>
          <Plus size={16} />New Appointment
        </button>
      </div>

      {/* Toolbar */}
      <div className="flex items-center gap-3 mb-4">
        <div className="flex gap-1 bg-gray-100 rounded-xl p-1">
          {([['week', 'Week'], ['month', 'Month'], ['list', 'List']] as const).map(([k, l]) => (
            <button key={k} onClick={() => setView(k)} className={`px-3 py-1.5 rounded-lg text-sm font-semibold transition-all flex items-center gap-1.5 ${view === k ? 'bg-white shadow-sm' : 'text-gray-500'}`} style={{ color: view === k ? '#b8895a' : undefined }}>
              {k === 'week' && <Grid size={13} />}{k === 'list' && <List size={13} />}{k === 'month' && <Calendar size={13} />}{l}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2 ml-2">
          <button onClick={() => navigate(-1)} className="p-2 rounded-lg hover:bg-gray-100"><ChevronLeft size={16} /></button>
          <button onClick={() => setCurrent(new Date())} className="px-3 py-1.5 rounded-lg text-sm font-semibold hover:bg-gray-100">Today</button>
          <button onClick={() => navigate(1)} className="p-2 rounded-lg hover:bg-gray-100"><ChevronRight size={16} /></button>
        </div>
        <span className="text-base font-bold text-gray-800 ml-1">
          {view === 'week' ? `${MONTHS[weekDates[0].getMonth()]} ${weekDates[0].getDate()} – ${weekDates[6].getDate()}, ${weekDates[0].getFullYear()}`
            : `${MONTHS[current.getMonth()]} ${current.getFullYear()}`}
        </span>
      </div>

      {loading ? (
        <div className="flex-1 flex items-center justify-center"><Loader2 className="animate-spin" style={{ color: '#b8895a' }} size={28} /></div>
      ) : (
        <>
          {/* Week View */}
          {view === 'week' && (
            <div className="flex-1 bg-white rounded-2xl shadow-sm border border-gray-100 overflow-auto">
              <div className="grid grid-cols-8 border-b border-gray-100 sticky top-0 bg-white z-10">
                <div className="p-3 text-xs text-gray-400 font-medium border-r border-gray-100" />
                {weekDates.map((d, i) => (
                  <div key={i} className={`p-3 text-center border-r border-gray-100 ${isSameDay(d, new Date()) ? 'bg-blue-50' : ''}`}>
                    <div className="text-xs text-gray-500 font-medium">{DAYS[i]}</div>
                    <div className={`text-lg font-bold ${isSameDay(d, new Date()) ? 'text-blue-600' : 'text-gray-800'}`}>{d.getDate()}</div>
                  </div>
                ))}
              </div>
              {HOURS.map(h => (
                <div key={h} className="grid grid-cols-8 border-b border-gray-50 min-h-[56px]">
                  <div className="px-2 py-1 text-xs text-gray-400 border-r border-gray-100 pt-1">{h % 12 || 12}{h < 12 ? 'am' : 'pm'}</div>
                  {weekDates.map((d, i) => {
                    const appts = apptForSlot(d, h)
                    return (
                      <div key={i} onClick={() => { if (!appts.length) openCreate(new Date(d.getFullYear(), d.getMonth(), d.getDate(), h).toISOString().slice(0, 16)) }}
                        className={`p-1 border-r border-gray-50 cursor-pointer hover:bg-blue-50/40 transition-colors relative ${isSameDay(d, new Date()) ? 'bg-blue-50/30' : ''}`}>
                        {appts.map(a => (
                          <div key={a.id} onClick={e => { e.stopPropagation(); setEditing(a); const sd = new Date(a.start_time); const pad2 = (n: number) => String(n).padStart(2,'0'); setForm({ ...a, appt_date: `${sd.getFullYear()}-${pad2(sd.getMonth()+1)}-${pad2(sd.getDate())}`, appt_period: sd.getHours() < 12 ? 'AM' : 'PM' } as any) }}
                            className={`text-xs rounded px-1.5 py-0.5 mb-0.5 truncate cursor-pointer ${a.status === 'scheduled' ? 'text-white' : apptColor(a.status)}`}
                            style={a.status === 'scheduled' ? { background: '#b8895a', borderLeft: '3px solid #1f2a2e' } : {}}>
                            {a.customer_name}
                          </div>
                        ))}
                      </div>
                    )
                  })}
                </div>
              ))}
            </div>
          )}

          {/* Month View */}
          {view === 'month' && (
            <div className="flex-1 bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
              <div className="grid grid-cols-7 border-b border-gray-100">
                {DAYS.map(d => <div key={d} className="p-3 text-center text-xs font-bold text-gray-500 uppercase tracking-wider">{d}</div>)}
              </div>
              <div className="grid grid-cols-7">
                {monthDates.map((d, i) => {
                  const appts = d ? apptForDay(d) : []
                  return (
                    <div key={i} onClick={() => d && openCreate(new Date(d.getFullYear(), d.getMonth(), d.getDate(), 9).toISOString().slice(0, 16))}
                      className={`min-h-[90px] p-2 border-b border-r border-gray-50 cursor-pointer hover:bg-gray-50/60 transition-colors ${d && isSameDay(d, new Date()) ? 'bg-blue-50/30' : ''}`}>
                      {d && (
                        <>
                          <div className={`text-sm font-bold w-7 h-7 flex items-center justify-center rounded-full mb-1 ${isSameDay(d, new Date()) ? 'text-white' : 'text-gray-700'}`}
                            style={isSameDay(d, new Date()) ? { background: '#b8895a' } : {}}>
                            {d.getDate()}
                          </div>
                          {appts.slice(0, 3).map(a => (
                            <div key={a.id} onClick={e => { e.stopPropagation(); setEditing(a); const sd = new Date(a.start_time); const pad2 = (n: number) => String(n).padStart(2,'0'); setForm({ ...a, appt_date: `${sd.getFullYear()}-${pad2(sd.getMonth()+1)}-${pad2(sd.getDate())}`, appt_period: sd.getHours() < 12 ? 'AM' : 'PM' } as any) }}
                              className="text-xs rounded px-1.5 py-0.5 mb-0.5 truncate cursor-pointer text-white"
                              style={{ background: a.status === 'cancelled' ? '#ef4444' : '#b8895a' }}>
                              {a.customer_name}
                            </div>
                          ))}
                          {appts.length > 3 && <div className="text-xs text-gray-400">+{appts.length - 3} more</div>}
                        </>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* List View */}
          {view === 'list' && (
            <div className="flex-1 bg-white rounded-2xl shadow-sm border border-gray-100 overflow-auto">
              {appointments.length === 0 ? (
                <div className="py-16 text-center text-gray-400">
                  <Calendar size={32} className="mx-auto mb-2 opacity-30" />
                  <p className="text-sm">No appointments scheduled</p>
                </div>
              ) : (
                <table className="w-full text-sm">
                  <thead><tr className="bg-gray-50 border-b border-gray-100">
                    {['Date & Time', 'Customer', 'Service', 'Address', 'Status', ''].map(h => (
                      <th key={h} className="text-left px-5 py-3 text-xs font-semibold text-gray-600 uppercase tracking-wider">{h}</th>
                    ))}
                  </tr></thead>
                  <tbody className="divide-y divide-gray-50">
                    {[...appointments].sort((a, b) => new Date(a.start_time).getTime() - new Date(b.start_time).getTime()).map(a => (
                      <tr key={a.id} className="hover:bg-gray-50">
                        <td className="px-5 py-3 text-xs text-gray-600 whitespace-nowrap">
                          <div className="font-medium">{new Date(a.start_time).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}</div>
                          <div className="text-gray-400">{new Date(a.start_time).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}</div>
                        </td>
                        <td className="px-5 py-3"><div className="font-semibold text-gray-900">{a.customer_name}</div><div className="text-xs text-gray-400">{formatPhone(a.customer_phone)}</div></td>
                        <td className="px-5 py-3 text-xs text-gray-600">{a.service_type || '—'}</td>
                        <td className="px-5 py-3 text-xs text-gray-600 max-w-[180px] truncate">{a.service_address || '—'}</td>
                        <td className="px-5 py-3"><span className={`text-xs px-2 py-0.5 rounded-full font-medium ${a.status === 'completed' ? 'bg-green-100 text-green-700' : a.status === 'cancelled' ? 'bg-red-100 text-red-600' : 'bg-blue-100 text-blue-700'}`}>{a.status}</span></td>
                        <td className="px-5 py-3"><button onClick={() => { setEditing(a); const sd = new Date(a.start_time); const pad2 = (n: number) => String(n).padStart(2,'0'); setForm({ ...a, appt_date: `${sd.getFullYear()}-${pad2(sd.getMonth()+1)}-${pad2(sd.getDate())}`, appt_period: sd.getHours() < 12 ? 'AM' : 'PM' } as any) }} className="text-xs font-medium underline" style={{ color: '#b8895a' }}>Edit</button></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          )}
        </>
      )}

      {/* Modal */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between sticky top-0 bg-white">
              <h2 className="font-bold text-gray-900">{editing ? 'Edit Appointment' : 'New Appointment'}</h2>
              <button onClick={() => { setCreating(false); setEditing(null); setForm({}) }}><X size={18} className="text-gray-400" /></button>
            </div>
            <div className="p-6 space-y-4">
              {/* Autofill from contact */}
              {!editing && (
                <div>
                  <label className={labelCls}>Autofill from Contact (optional)</label>
                  <select onChange={e => autofillContact(e.target.value)} className={inputCls} defaultValue="">
                    <option value="">Select a contact...</option>
                    {contacts.map(c => <option key={c.id} value={c.id}>{c.first_name} {c.last_name}{c.company ? ` — ${c.company}` : ''}</option>)}
                  </select>
                </div>
              )}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={labelCls}>Date *</label>
                  <input type="date" value={(form as any).appt_date || ''} onChange={e => setForm(f => ({ ...f, appt_date: e.target.value }))} className={inputCls} />
                </div>
                <div>
                  <label className={labelCls}>Time Frame *</label>
                  <div className="flex gap-2">
                    <button type="button" onClick={() => setForm(f => ({ ...f, appt_period: 'AM' } as any))}
                      className={`flex-1 py-2.5 rounded-xl text-sm font-bold border-2 transition-all ${(form as any).appt_period === 'AM' ? 'text-white border-transparent' : 'text-gray-500 border-gray-200 bg-white hover:bg-gray-50'}`}
                      style={(form as any).appt_period === 'AM' ? { background: '#b8895a', borderColor: '#b8895a' } : {}}>
                      AM
                    </button>
                    <button type="button" onClick={() => setForm(f => ({ ...f, appt_period: 'PM' } as any))}
                      className={`flex-1 py-2.5 rounded-xl text-sm font-bold border-2 transition-all ${(form as any).appt_period === 'PM' ? 'text-white border-transparent' : 'text-gray-500 border-gray-200 bg-white hover:bg-gray-50'}`}
                      style={(form as any).appt_period === 'PM' ? { background: '#b8895a', borderColor: '#b8895a' } : {}}>
                      PM
                    </button>
                  </div>
                </div>
              </div>
              {[{ l: 'Customer Name *', k: 'customer_name', t: 'text' }, { l: 'Customer Email', k: 'customer_email', t: 'email' }, { l: 'Customer Phone', k: 'customer_phone', t: 'tel' }, { l: 'Service Address *', k: 'service_address', t: 'text' }].map(({ l, k, t }) => (
                <div key={k}>
                  <label className={labelCls}>{l}</label>
                  <input type={t} value={(form as any)[k] || ''} onChange={e => setForm(f => ({ ...f, [k]: e.target.value }))} className={inputCls} />
                </div>
              ))}
              <div>
                <label className={labelCls}>Service Type</label>
                <select value={(form as any).service_type || ''} onChange={e => setForm(f => ({ ...f, service_type: e.target.value }))} className={inputCls}>
                  <option value="">Select service...</option>
                  {SERVICE_TYPES.map(s => <option key={s}>{s}</option>)}
                </select>
              </div>
              <div>
                <label className={labelCls}>Status</label>
                <select value={(form as any).status || 'scheduled'} onChange={e => setForm(f => ({ ...f, status: e.target.value }))} className={inputCls}>
                  {['scheduled', 'completed', 'cancelled'].map(s => <option key={s}>{s}</option>)}
                </select>
              </div>
              <div>
                <label className={labelCls}>Notes</label>
                <textarea value={(form as any).notes || ''} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} rows={3} className={inputCls} placeholder="Additional notes..." />
              </div>
              <div className="flex gap-3 pt-2">
                <button onClick={save} disabled={saving} className="flex-1 text-white font-bold py-3 rounded-xl flex items-center justify-center gap-2 disabled:opacity-60" style={{ background: '#b8895a' }}>
                  {saving ? <Loader2 size={16} className="animate-spin" /> : null}{saving ? 'Saving...' : editing ? 'Save Changes' : 'Create Appointment'}
                </button>
                {editing && (
                  <button onClick={() => deleteAppt(editing.id)} className="px-4 py-3 rounded-xl border border-red-200 text-red-600 font-semibold hover:bg-red-50">Delete</button>
                )}
              </div>
              {!editing && <p className="text-xs text-gray-400 text-center">📅 Will sync to Google Calendar · 📧 Confirmation email will be sent · 💬 SMS reminders at 12h & 1h</p>}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
