'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { ClipboardList, Calendar, Check, X, ChevronDown, ChevronUp, Loader2, Phone, Mail, MapPin, User, FileText, Receipt, Search, Trash2 } from 'lucide-react'
import { formatDateShort, formatPhone } from '@/lib/utils'

interface ScheduleRequest {
  id: string
  created_at: string
  first_name: string
  last_name: string
  phone: string
  email: string
  jobsite_address: string
  service_type: string
  preferred_date: string
  preferred_time: string
  notes: string
  is_owner: boolean
  owner_name?: string
  owner_phone?: string
  owner_email?: string
  company_name?: string
  is_company_owner?: boolean
  billing_address?: string
  billing_phone?: string
  billing_email?: string
  status: 'pending' | 'scheduled' | 'declined'
}

const SERVICE_TYPES = ['Service Call','Gas Line Installation','Gas Appliance Connection','Gas Leak Detection','Emergency Repair','Rough-In','Trim-Out','Retrofit','Pool/Spa Heater','Outdoor Kitchen','Generator Connection','Inspection & Compliance','Other']

export default function ScheduleRequestsPage() {
  const router = useRouter()
  const [requests, setRequests] = useState<ScheduleRequest[]>([])
  const [loading, setLoading] = useState(true)
  const [expanded, setExpanded] = useState<string | null>(null)
  const [scheduling, setScheduling] = useState<ScheduleRequest | null>(null)
  const [apptForm, setApptForm] = useState({ date: '', period: 'AM' as 'AM' | 'PM', service_type: '', notes: '' })
  const [saving, setSaving] = useState(false)
  const [filter, setFilter] = useState<'all' | 'pending' | 'scheduled' | 'declined'>('pending')
  const [declining, setDeclining] = useState<ScheduleRequest | null>(null)
  const [declineReason, setDeclineReason] = useState('')
  const [decliningLoading, setDecliningLoading] = useState(false)
  const [search, setSearch] = useState('')
  const [deleting, setDeleting] = useState<string | null>(null)

  useEffect(() => { load() }, [])

  async function load() {
    setLoading(true)
    const res = await fetch('/api/schedule')
    const d = await res.json()
    setRequests(Array.isArray(d) ? d : [])
    setLoading(false)
  }

  async function updateStatus(id: string, status: string) {
    await fetch('/api/schedule', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id, status }) })
    setRequests(p => p.map(r => r.id === id ? { ...r, status: status as any } : r))
  }

  async function scheduleAppointment() {
    if (!scheduling) return
    setSaving(true)
    try {
      // AM = 8am-12pm, PM = 12pm-5pm
      const startHour = apptForm.period === 'AM' ? 8 : 12
      const endHour = apptForm.period === 'AM' ? 12 : 17
      const startTime = new Date(`${apptForm.date}T${String(startHour).padStart(2,'0')}:00`).toISOString()
      const endTime = new Date(`${apptForm.date}T${String(endHour).padStart(2,'0')}:00`).toISOString()

      const apptRes = await fetch('/api/appointments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customer_name: `${scheduling.first_name} ${scheduling.last_name}`,
          customer_email: scheduling.email,
          customer_phone: scheduling.phone,
          service_address: scheduling.jobsite_address,
          service_type: apptForm.service_type || scheduling.service_type,
          notes: apptForm.notes || scheduling.notes,
          start_time: startTime,
          end_time: endTime,
          status: 'scheduled',
          schedule_request_id: scheduling.id,
        })
      })
      if (apptRes.ok) {
        await updateStatus(scheduling.id, 'scheduled')
        setScheduling(null)
        setApptForm({ date: '', period: 'AM', service_type: '', notes: '' })
        alert('✅ Appointment created! Google Calendar invite sent and confirmation email dispatched.')
      } else {
        alert('Failed to create appointment. Please try again.')
      }
    } finally { setSaving(false) }
  }

  function convertTo(req: ScheduleRequest, type: 'invoice' | 'quote') {
    const params = new URLSearchParams({
      type,
      customer_name: `${req.first_name} ${req.last_name}`,
      customer_email: req.email,
      customer_phone: req.phone,
      job_address: req.jobsite_address,
      service_type: req.service_type || '',
      company_name: req.company_name || '',
      notes: req.notes || '',
    })
    router.push(`/admin/invoices?prefill=${encodeURIComponent(params.toString())}`)
  }

  async function declineRequest() {
    if (!declining) return
    setDecliningLoading(true)
    try {
      await updateStatus(declining.id, 'declined')
      // Send decline email
      await fetch('/api/schedule', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'decline-email',
          email: declining.email,
          customerName: `${declining.first_name} ${declining.last_name}`,
          reason: declineReason,
        }),
      })
      setDeclining(null)
      setDeclineReason('')
    } finally { setDecliningLoading(false) }
  }

  async function deleteRequest(id: string) {
    if (!confirm('Are you sure you want to delete this request? This cannot be undone.')) return
    setDeleting(id)
    try {
      await fetch(`/api/schedule?id=${id}`, { method: 'DELETE' })
      setRequests(p => p.filter(r => r.id !== id))
      if (expanded === id) setExpanded(null)
    } finally { setDeleting(null) }
  }

  const filtered = requests.filter(r => {
    if (filter !== 'all' && r.status !== filter) return false
    if (search.trim()) {
      const q = search.toLowerCase()
      return (
        r.first_name.toLowerCase().includes(q) ||
        r.last_name.toLowerCase().includes(q) ||
        `${r.first_name} ${r.last_name}`.toLowerCase().includes(q) ||
        r.email.toLowerCase().includes(q) ||
        r.phone.includes(q) ||
        r.jobsite_address.toLowerCase().includes(q) ||
        (r.service_type || '').toLowerCase().includes(q) ||
        (r.company_name || '').toLowerCase().includes(q) ||
        (r.notes || '').toLowerCase().includes(q)
      )
    }
    return true
  })

  const statusBadge = (s: string) => {
    if (s === 'pending') return 'bg-yellow-100 text-yellow-700'
    if (s === 'scheduled') return 'bg-green-100 text-green-700'
    if (s === 'declined') return 'bg-red-100 text-red-600'
    return 'bg-gray-100 text-gray-600'
  }

  return (
    <div className="p-6 md:p-8 pt-16 md:pt-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-extrabold text-gray-900">Schedule Requests</h1>
          <p className="text-gray-500 text-sm mt-0.5">Review incoming service requests from the public form</p>
        </div>
        <div className="flex items-center gap-2 text-sm">
          <span className="bg-yellow-100 text-yellow-700 font-bold px-2.5 py-1 rounded-full">
            {requests.filter(r => r.status === 'pending').length} pending
          </span>
        </div>
      </div>

      {/* Search & Filter */}
      <div className="flex flex-col sm:flex-row gap-3 mb-5">
        <div className="relative flex-1 max-w-md">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input type="text" value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Search by name, email, phone, address..."
            className="w-full pl-9 pr-4 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:border-blue-400" />
          {search && (
            <button onClick={() => setSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
              <X size={14} />
            </button>
          )}
        </div>
        <div className="flex gap-1 bg-gray-100 rounded-xl p-1 w-fit">
          {(['pending', 'scheduled', 'declined', 'all'] as const).map(f => (
            <button key={f} onClick={() => setFilter(f)}
              className={`px-4 py-2 rounded-lg text-sm font-semibold transition-all capitalize ${filter === f ? 'bg-white shadow-sm' : 'text-gray-500'}`}
              style={{ color: filter === f ? '#185FA5' : undefined }}>{f}</button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20"><Loader2 className="animate-spin" style={{ color: '#185FA5' }} size={28} /></div>
      ) : filtered.length === 0 ? (
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 py-16 text-center text-gray-400">
          <ClipboardList size={32} className="mx-auto mb-2 opacity-30" />
          <p className="text-sm">No {filter === 'all' ? '' : filter} requests</p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map(req => (
            <div key={req.id} className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
              {/* Header Row */}
              <div className="px-5 py-4 flex items-center justify-between cursor-pointer hover:bg-gray-50 transition-colors"
                onClick={() => setExpanded(expanded === req.id ? null : req.id)}>
                <div className="flex items-center gap-4">
                  <div className="w-10 h-10 rounded-full flex items-center justify-center text-white font-bold text-sm" style={{ background: '#185FA5' }}>
                    {req.first_name[0]}{req.last_name[0]}
                  </div>
                  <div>
                    <div className="font-bold text-gray-900">{req.first_name} {req.last_name}</div>
                    <div className="text-xs text-gray-500 flex items-center gap-3 mt-0.5">
                      <span className="flex items-center gap-1"><Phone size={10} />{formatPhone(req.phone)}</span>
                      <span className="flex items-center gap-1"><MapPin size={10} />{req.jobsite_address}</span>
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-xs text-gray-400">{formatDateShort(req.created_at)}</span>
                  <span className={`text-xs font-semibold px-2 py-0.5 rounded-full capitalize ${statusBadge(req.status)}`}>{req.status}</span>
                  <button onClick={e => { e.stopPropagation(); deleteRequest(req.id) }}
                    className="p-1.5 rounded-lg text-gray-300 hover:text-red-500 hover:bg-red-50 transition-colors" title="Delete request">
                    {deleting === req.id ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
                  </button>
                  {expanded === req.id ? <ChevronUp size={16} className="text-gray-400" /> : <ChevronDown size={16} className="text-gray-400" />}
                </div>
              </div>

              {/* Expanded Detail */}
              {expanded === req.id && (
                <div className="border-t border-gray-100 px-5 py-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                    <div className="space-y-2">
                      <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wider">Contact Info</h3>
                      <div className="text-sm space-y-1">
                        <div className="flex items-center gap-2 text-gray-700"><User size={13} />{req.first_name} {req.last_name}</div>
                        <div className="flex items-center gap-2 text-gray-700"><Phone size={13} />{formatPhone(req.phone)}</div>
                        <div className="flex items-center gap-2 text-gray-700"><Mail size={13} />{req.email}</div>
                        <div className="flex items-center gap-2 text-gray-700"><MapPin size={13} />{req.jobsite_address}</div>
                      </div>
                    </div>
                    <div className="space-y-2">
                      <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wider">Service Details</h3>
                      <div className="text-sm space-y-1 text-gray-700">
                        <div><span className="font-medium">Service:</span> {req.service_type || 'Not specified'}</div>
                        {req.preferred_date && <div><span className="font-medium">Preferred Date:</span> {req.preferred_date}</div>}
                        {req.preferred_time && <div><span className="font-medium">Preferred Time:</span> {req.preferred_time}</div>}
                        {req.notes && <div><span className="font-medium">Notes:</span> {req.notes}</div>}
                      </div>
                    </div>
                    {!req.is_owner && (req.owner_name || req.owner_email) && (
                      <div className="space-y-2">
                        <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wider">Property Owner</h3>
                        <div className="text-sm space-y-1 text-gray-700">
                          {req.owner_name && <div>{req.owner_name}</div>}
                          {req.owner_phone && <div className="flex items-center gap-2"><Phone size={13} />{formatPhone(req.owner_phone || '')}</div>}
                          {req.owner_email && <div className="flex items-center gap-2"><Mail size={13} />{req.owner_email}</div>}
                        </div>
                      </div>
                    )}
                    {req.company_name && (
                      <div className="space-y-2">
                        <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wider">Company</h3>
                        <div className="text-sm space-y-1 text-gray-700">
                          <div className="font-medium">{req.company_name}</div>
                          {!req.is_company_owner && req.billing_address && (
                            <>
                              <div>{req.billing_address}</div>
                              {req.billing_phone && <div className="flex items-center gap-2"><Phone size={13} />{formatPhone(req.billing_phone || '')}</div>}
                              {req.billing_email && <div className="flex items-center gap-2"><Mail size={13} />{req.billing_email}</div>}
                            </>
                          )}
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Actions */}
                  {req.status === 'pending' && (
                    <div className="flex flex-wrap gap-3 pt-3 border-t border-gray-100">
                      <button onClick={() => { setScheduling(req); setApptForm({ date: '', period: 'AM', service_type: req.service_type || '', notes: req.notes || '' }) }}
                        className="flex items-center gap-2 text-white font-semibold px-4 py-2 rounded-xl text-sm" style={{ background: '#185FA5' }}>
                        <Calendar size={14} />Schedule Appointment
                      </button>
                      <button onClick={() => convertTo(req, 'quote')}
                        className="flex items-center gap-2 text-white font-semibold px-4 py-2 rounded-xl text-sm" style={{ background: '#f59e0b' }}>
                        <FileText size={14} />Create Quote
                      </button>
                      <button onClick={() => convertTo(req, 'invoice')}
                        className="flex items-center gap-2 text-white font-semibold px-4 py-2 rounded-xl text-sm" style={{ background: '#16a34a' }}>
                        <Receipt size={14} />Create Invoice
                      </button>
                      <button onClick={() => { setDeclining(req); setDeclineReason('') }}
                        className="flex items-center gap-2 border border-red-200 text-red-600 font-semibold px-4 py-2 rounded-xl text-sm hover:bg-red-50">
                        <X size={14} />Decline
                      </button>
                    </div>
                  )}
                  {req.status === 'scheduled' && (
                    <div className="flex items-center justify-between pt-3 border-t border-gray-100">
                      <div className="flex items-center gap-2 text-sm text-green-700">
                        <Check size={14} />Appointment scheduled
                      </div>
                      <button onClick={() => deleteRequest(req.id)}
                        className="flex items-center gap-1.5 text-red-500 hover:text-red-700 font-semibold text-sm px-3 py-1.5 rounded-lg hover:bg-red-50">
                        <Trash2 size={13} />Delete
                      </button>
                    </div>
                  )}
                  {req.status === 'declined' && (
                    <div className="flex items-center justify-end pt-3 border-t border-gray-100">
                      <button onClick={() => deleteRequest(req.id)}
                        className="flex items-center gap-1.5 text-red-500 hover:text-red-700 font-semibold text-sm px-3 py-1.5 rounded-lg hover:bg-red-50">
                        <Trash2 size={13} />Delete
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Decline Modal */}
      {declining && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
            <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
              <h2 className="font-bold text-gray-900">Decline Request</h2>
              <button onClick={() => setDeclining(null)}><X size={18} className="text-gray-400" /></button>
            </div>
            <div className="p-6 space-y-4">
              <div className="bg-gray-50 rounded-xl p-3 text-sm text-gray-700">
                <div className="font-semibold">{declining.first_name} {declining.last_name}</div>
                <div className="text-xs text-gray-500 mt-0.5">{declining.email}</div>
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1">Reason for declining (optional)</label>
                <textarea value={declineReason} onChange={e => setDeclineReason(e.target.value)} rows={3}
                  placeholder="e.g., Outside service area, fully booked, etc."
                  className="w-full px-3 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:border-blue-400 resize-none" />
              </div>
              <p className="text-xs text-gray-400">An email will be sent to the customer letting them know.</p>
              <div className="flex gap-3">
                <button onClick={declineRequest} disabled={decliningLoading}
                  className="flex-1 flex items-center justify-center gap-2 text-white font-bold py-3 rounded-xl disabled:opacity-60 bg-red-600 hover:bg-red-700">
                  {decliningLoading ? <Loader2 size={16} className="animate-spin" /> : <X size={16} />}
                  {decliningLoading ? 'Sending...' : 'Decline & Notify'}
                </button>
                <button onClick={() => setDeclining(null)} className="px-5 py-3 rounded-xl border border-gray-200 text-gray-600 font-semibold">Cancel</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Schedule Modal */}
      {scheduling && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
            <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
              <h2 className="font-bold text-gray-900">Schedule Appointment</h2>
              <button onClick={() => setScheduling(null)}><X size={18} className="text-gray-400" /></button>
            </div>
            <div className="p-6 space-y-4">
              <div className="bg-gray-50 rounded-xl p-3 text-sm text-gray-700">
                <div className="font-semibold">{scheduling.first_name} {scheduling.last_name}</div>
                <div className="text-xs text-gray-500 mt-0.5">{scheduling.jobsite_address}</div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1">Date *</label>
                  <input type="date" value={apptForm.date} onChange={e => setApptForm(f => ({ ...f, date: e.target.value }))}
                    className="w-full px-3 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:border-blue-400" />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1">Time Frame *</label>
                  <div className="flex gap-2">
                    <button type="button" onClick={() => setApptForm(f => ({ ...f, period: 'AM' }))}
                      className={`flex-1 py-2.5 rounded-xl text-sm font-bold border-2 transition-all ${apptForm.period === 'AM' ? 'text-white border-transparent' : 'text-gray-500 border-gray-200 bg-white hover:bg-gray-50'}`}
                      style={apptForm.period === 'AM' ? { background: '#185FA5', borderColor: '#185FA5' } : {}}>
                      AM
                    </button>
                    <button type="button" onClick={() => setApptForm(f => ({ ...f, period: 'PM' }))}
                      className={`flex-1 py-2.5 rounded-xl text-sm font-bold border-2 transition-all ${apptForm.period === 'PM' ? 'text-white border-transparent' : 'text-gray-500 border-gray-200 bg-white hover:bg-gray-50'}`}
                      style={apptForm.period === 'PM' ? { background: '#185FA5', borderColor: '#185FA5' } : {}}>
                      PM
                    </button>
                  </div>
                </div>
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1">Service Type</label>
                <select value={apptForm.service_type} onChange={e => setApptForm(f => ({ ...f, service_type: e.target.value }))}
                  className="w-full px-3 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:border-blue-400">
                  <option value="">Select service...</option>
                  {SERVICE_TYPES.map(s => <option key={s}>{s}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1">Notes</label>
                <textarea value={apptForm.notes} onChange={e => setApptForm(f => ({ ...f, notes: e.target.value }))} rows={2}
                  className="w-full px-3 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:border-blue-400" />
              </div>
              <button onClick={scheduleAppointment} disabled={saving || !apptForm.date}
                className="w-full text-white font-bold py-3 rounded-xl flex items-center justify-center gap-2 disabled:opacity-60" style={{ background: '#185FA5' }}>
                {saving ? <Loader2 size={16} className="animate-spin" /> : <Calendar size={16} />}
                {saving ? 'Creating...' : 'Create Appointment'}
              </button>
              <p className="text-xs text-gray-400 text-center">Google Calendar invite + confirmation email will be sent automatically</p>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
