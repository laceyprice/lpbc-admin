'use client'
import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import {
  FileCheck, Plus, Search, RefreshCw, Mail, Sparkles, ChevronRight,
  Edit2, Trash2, X, Save, ExternalLink, Phone, Globe, MapPin,
  Calendar, DollarSign, User, Building2, AlertCircle, CheckCircle2,
  Clock, FileText, BookOpen, Loader2, AlertTriangle, Award
} from 'lucide-react'

// ── Types ─────────────────────────────────────────────────────
interface Jurisdiction {
  id: string
  name: string
  state: string | null
  county: string | null
  permit_office_name: string | null
  permit_office_phone: string | null
  permit_office_email: string | null
  permit_office_address: string | null
  website_url: string | null
  application_url: string | null
  online_portal_url: string | null
  instructions: string | null
  required_documents: string[] | null
  typical_fee_range: string | null
  typical_processing_days: number | null
  inspection_required: boolean
  gas_permit_required: boolean
  lp_permit_required: boolean
  notes: string | null
  ai_populated: boolean
  last_verified: string | null
}

interface Permit {
  id: string
  created_at: string
  permit_number: string | null
  permit_type: string
  description: string | null
  job_address: string
  city: string | null
  state: string | null
  jurisdiction_id: string | null
  jurisdiction_name: string | null
  jurisdiction?: { id: string; name: string; website_url: string | null; permit_office_phone: string | null } | null
  contact_id: string | null
  customer_name: string | null
  contact?: { id: string; first_name: string; last_name: string } | null
  invoice_id: string | null
  invoice?: { id: string; invoice_number: string } | null
  status: string
  application_date: string | null
  approved_date: string | null
  issued_date: string | null
  expiry_date: string | null
  inspection_date: string | null
  final_date: string | null
  inspector_name: string | null
  inspector_phone: string | null
  inspector_notes: string | null
  permit_fee: number | null
  fee_paid: boolean
  source: string
  notes: string | null
}

// ── Status config ─────────────────────────────────────────────
const STATUS_CONFIG: Record<string, { label: string; color: string; bg: string; icon: any }> = {
  inquiry:               { label: 'Inquiry',         color: '#6b7280', bg: '#f3f4f6', icon: AlertCircle },
  not_required:          { label: 'Not Required',    color: '#059669', bg: '#d1fae5', icon: CheckCircle2 },
  pending_application:   { label: 'Pending App',     color: '#d97706', bg: '#fef3c7', icon: Clock },
  applied:               { label: 'Applied',         color: '#2563eb', bg: '#dbeafe', icon: FileText },
  approved:              { label: 'Approved',        color: '#7c3aed', bg: '#ede9fe', icon: CheckCircle2 },
  issued:                { label: 'Issued',          color: '#059669', bg: '#d1fae5', icon: FileCheck },
  inspection_scheduled:  { label: 'Inspection Sched.',color: '#0891b2', bg: '#cffafe', icon: Calendar },
  passed:                { label: 'Passed',          color: '#16a34a', bg: '#dcfce7', icon: CheckCircle2 },
  closed:                { label: 'Closed',          color: '#374151', bg: '#e5e7eb', icon: CheckCircle2 },
}

const STATUSES = Object.keys(STATUS_CONFIG)

const PERMIT_TYPES = ['gas', 'lp', 'hvac', 'electrical', 'mechanical', 'plumbing', 'other']

function StatusBadge({ status }: { status: string }) {
  const cfg = STATUS_CONFIG[status] || { label: status, color: '#6b7280', bg: '#f3f4f6', icon: AlertCircle }
  const Icon = cfg.icon
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold"
      style={{ color: cfg.color, background: cfg.bg }}>
      <Icon size={10} />
      {cfg.label}
    </span>
  )
}

function fmtDate(d: string | null) {
  if (!d) return '—'
  return new Date(d + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

// ══════════════════════════════════════════════════════════════
// PERMIT FORM MODAL
// ══════════════════════════════════════════════════════════════
function PermitModal({
  permit, jurisdictions, onSave, onClose
}: {
  permit: Partial<Permit> | null
  jurisdictions: Jurisdiction[]
  onSave: () => void
  onClose: () => void
}) {
  const isNew = !permit?.id
  const [form, setForm] = useState<any>(permit || {
    permit_type: 'gas', status: 'pending_application', source: 'manual', fee_paid: false
  })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const set = (k: string, v: any) => setForm((p: any) => ({ ...p, [k]: v }))

  async function save() {
    if (!form.job_address) { setError('Job address is required'); return }
    setSaving(true)
    setError('')
    const res = await fetch('/api/permits', {
      method: isNew ? 'POST' : 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form),
    })
    const data = await res.json()
    if (!res.ok) { setError(data.error || 'Save failed'); setSaving(false); return }
    onSave()
  }

  const inp = "w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
  const lbl = "block text-xs font-semibold text-gray-500 mb-1 uppercase tracking-wide"

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-5 border-b sticky top-0 bg-white z-10">
          <h2 className="font-bold text-gray-900 text-lg">{isNew ? 'Add Permit' : 'Edit Permit'}</h2>
          <button onClick={onClose} className="p-1 rounded-lg hover:bg-gray-100"><X size={18} /></button>
        </div>
        <div className="p-5 space-y-4">
          {error && <div className="text-red-600 text-sm bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</div>}

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={lbl}>Permit Number</label>
              <input className={inp} value={form.permit_number || ''} onChange={e => set('permit_number', e.target.value)} placeholder="e.g. BP-2024-1234" />
            </div>
            <div>
              <label className={lbl}>Type</label>
              <select className={inp} value={form.permit_type || 'gas'} onChange={e => set('permit_type', e.target.value)}>
                {PERMIT_TYPES.map(t => <option key={t} value={t}>{t.toUpperCase()}</option>)}
              </select>
            </div>
          </div>

          <div>
            <label className={lbl}>Job Address *</label>
            <input className={inp} value={form.job_address || ''} onChange={e => set('job_address', e.target.value)} placeholder="123 Main St, Baton Rouge, LA" />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={lbl}>City</label>
              <input className={inp} value={form.city || ''} onChange={e => set('city', e.target.value)} />
            </div>
            <div>
              <label className={lbl}>State</label>
              <input className={inp} value={form.state || ''} onChange={e => set('state', e.target.value)} placeholder="LA" maxLength={2} />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={lbl}>Customer Name</label>
              <input className={inp} value={form.customer_name || ''} onChange={e => set('customer_name', e.target.value)} />
            </div>
            <div>
              <label className={lbl}>Status</label>
              <select className={inp} value={form.status || 'pending_application'} onChange={e => set('status', e.target.value)}>
                {STATUSES.map(s => <option key={s} value={s}>{STATUS_CONFIG[s]?.label || s}</option>)}
              </select>
            </div>
          </div>

          <div>
            <label className={lbl}>Jurisdiction</label>
            <select className={inp} value={form.jurisdiction_id || ''} onChange={e => {
              const j = jurisdictions.find(j => j.id === e.target.value)
              set('jurisdiction_id', e.target.value || null)
              if (j) set('jurisdiction_name', j.name)
            }}>
              <option value="">— Select jurisdiction —</option>
              {jurisdictions.map(j => <option key={j.id} value={j.id}>{j.name}{j.state ? `, ${j.state}` : ''}</option>)}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={lbl}>Application Date</label>
              <input type="date" className={inp} value={form.application_date || ''} onChange={e => set('application_date', e.target.value || null)} />
            </div>
            <div>
              <label className={lbl}>Issued Date</label>
              <input type="date" className={inp} value={form.issued_date || ''} onChange={e => set('issued_date', e.target.value || null)} />
            </div>
            <div>
              <label className={lbl}>Inspection Date</label>
              <input type="date" className={inp} value={form.inspection_date || ''} onChange={e => set('inspection_date', e.target.value || null)} />
            </div>
            <div>
              <label className={lbl}>Expiry Date</label>
              <input type="date" className={inp} value={form.expiry_date || ''} onChange={e => set('expiry_date', e.target.value || null)} />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={lbl}>Inspector Name</label>
              <input className={inp} value={form.inspector_name || ''} onChange={e => set('inspector_name', e.target.value)} />
            </div>
            <div>
              <label className={lbl}>Inspector Phone</label>
              <input className={inp} value={form.inspector_phone || ''} onChange={e => set('inspector_phone', e.target.value)} />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={lbl}>Permit Fee</label>
              <input type="number" step="0.01" className={inp} value={form.permit_fee || ''} onChange={e => set('permit_fee', e.target.value ? parseFloat(e.target.value) : null)} placeholder="0.00" />
            </div>
            <div className="flex items-end pb-2">
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={form.fee_paid || false} onChange={e => set('fee_paid', e.target.checked)} className="w-4 h-4 rounded" />
                <span className="text-sm font-medium text-gray-700">Fee Paid</span>
              </label>
            </div>
          </div>

          <div>
            <label className={lbl}>Inspector Notes</label>
            <textarea className={inp} rows={2} value={form.inspector_notes || ''} onChange={e => set('inspector_notes', e.target.value)} />
          </div>

          <div>
            <label className={lbl}>Notes</label>
            <textarea className={inp} rows={3} value={form.notes || ''} onChange={e => set('notes', e.target.value)} />
          </div>
        </div>
        <div className="flex justify-end gap-2 p-5 border-t">
          <button onClick={onClose} className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg">Cancel</button>
          <button onClick={save} disabled={saving}
            className="flex items-center gap-2 px-4 py-2 text-sm text-white rounded-lg disabled:opacity-50"
            style={{ background: '#2f5a5e' }}>
            {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
            {isNew ? 'Create Permit' : 'Save Changes'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ══════════════════════════════════════════════════════════════
// JURISDICTION MODAL
// ══════════════════════════════════════════════════════════════
function JurisdictionModal({
  jurisdiction, onSave, onClose
}: {
  jurisdiction: Partial<Jurisdiction> | null
  onSave: () => void
  onClose: () => void
}) {
  const isNew = !jurisdiction?.id
  const [form, setForm] = useState<any>(jurisdiction || {
    inspection_required: true, gas_permit_required: true, lp_permit_required: true
  })
  const [saving, setSaving] = useState(false)
  const [researching, setResearching] = useState(false)
  const [error, setError] = useState('')
  const [researchName, setResearchName] = useState('')
  const [researchState, setResearchState] = useState('')

  const set = (k: string, v: any) => setForm((p: any) => ({ ...p, [k]: v }))

  async function research() {
    if (!researchName) { setError('Enter jurisdiction name to research'); return }
    setResearching(true)
    setError('')
    const res = await fetch(`/api/permit-jurisdictions?action=research&name=${encodeURIComponent(researchName)}&state=${encodeURIComponent(researchState)}`)
    const data = await res.json()
    if (!res.ok) { setError(data.error || 'Research failed'); setResearching(false); return }
    setForm((prev: any) => ({ ...prev, ...data }))
    setResearching(false)
  }

  async function save() {
    if (!form.name) { setError('Jurisdiction name is required'); return }
    setSaving(true)
    setError('')
    const res = await fetch('/api/permit-jurisdictions', {
      method: isNew ? 'POST' : 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form),
    })
    const data = await res.json()
    if (!res.ok) { setError(data.error || 'Save failed'); setSaving(false); return }
    onSave()
  }

  const inp = "w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
  const lbl = "block text-xs font-semibold text-gray-500 mb-1 uppercase tracking-wide"

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-5 border-b sticky top-0 bg-white z-10">
          <h2 className="font-bold text-gray-900 text-lg">{isNew ? 'Add Jurisdiction' : 'Edit Jurisdiction'}</h2>
          <button onClick={onClose} className="p-1 rounded-lg hover:bg-gray-100"><X size={18} /></button>
        </div>
        <div className="p-5 space-y-4">
          {error && <div className="text-red-600 text-sm bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</div>}

          {/* AI Research Panel */}
          <div className="rounded-xl p-4 border-2 border-dashed" style={{ borderColor: '#2f5a5e22', background: '#f0f7ff' }}>
            <div className="flex items-center gap-2 mb-3">
              <Sparkles size={16} style={{ color: '#2f5a5e' }} />
              <span className="text-sm font-semibold" style={{ color: '#2f5a5e' }}>AI Research — auto-fill permit info</span>
            </div>
            <div className="flex gap-2">
              <input className={inp + ' flex-1'} value={researchName} onChange={e => setResearchName(e.target.value)}
                placeholder="City or jurisdiction name (e.g. City of Baton Rouge)" />
              <input className={inp} style={{ width: '80px' }} value={researchState} onChange={e => setResearchState(e.target.value)}
                placeholder="State" maxLength={2} />
              <button onClick={research} disabled={researching}
                className="flex items-center gap-2 px-4 py-2 text-sm text-white rounded-lg whitespace-nowrap disabled:opacity-50"
                style={{ background: '#2f5a5e' }}>
                {researching ? <Loader2 size={13} className="animate-spin" /> : <Sparkles size={13} />}
                {researching ? 'Researching...' : 'Research'}
              </button>
            </div>
            {form.ai_populated && (
              <p className="text-xs text-blue-700 mt-2 flex items-center gap-1">
                <CheckCircle2 size={11} /> AI filled this in — review and edit as needed before saving
              </p>
            )}
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div className="col-span-2">
              <label className={lbl}>Jurisdiction Name *</label>
              <input className={inp} value={form.name || ''} onChange={e => set('name', e.target.value)} placeholder="City of Baton Rouge" />
            </div>
            <div>
              <label className={lbl}>State</label>
              <input className={inp} value={form.state || ''} onChange={e => set('state', e.target.value)} placeholder="LA" maxLength={2} />
            </div>
          </div>

          <div>
            <label className={lbl}>County</label>
            <input className={inp} value={form.county || ''} onChange={e => set('county', e.target.value)} placeholder="East Baton Rouge Parish" />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={lbl}>Permit Office Name</label>
              <input className={inp} value={form.permit_office_name || ''} onChange={e => set('permit_office_name', e.target.value)} />
            </div>
            <div>
              <label className={lbl}>Permit Office Phone</label>
              <input className={inp} value={form.permit_office_phone || ''} onChange={e => set('permit_office_phone', e.target.value)} />
            </div>
            <div>
              <label className={lbl}>Permit Office Email</label>
              <input className={inp} value={form.permit_office_email || ''} onChange={e => set('permit_office_email', e.target.value)} />
            </div>
            <div>
              <label className={lbl}>Office Address</label>
              <input className={inp} value={form.permit_office_address || ''} onChange={e => set('permit_office_address', e.target.value)} />
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3">
            <div>
              <label className={lbl}>Website URL</label>
              <input className={inp} value={form.website_url || ''} onChange={e => set('website_url', e.target.value)} placeholder="https://" />
            </div>
            <div>
              <label className={lbl}>Application URL</label>
              <input className={inp} value={form.application_url || ''} onChange={e => set('application_url', e.target.value)} placeholder="https://" />
            </div>
            <div>
              <label className={lbl}>Online Portal URL</label>
              <input className={inp} value={form.online_portal_url || ''} onChange={e => set('online_portal_url', e.target.value)} placeholder="https://" />
            </div>
          </div>

          <div>
            <label className={lbl}>How to Pull a Gas Permit (Instructions)</label>
            <textarea className={inp} rows={6} value={form.instructions || ''} onChange={e => set('instructions', e.target.value)}
              placeholder="Step-by-step instructions..." />
          </div>

          <div>
            <label className={lbl}>Required Documents (one per line)</label>
            <textarea className={inp} rows={3}
              value={(form.required_documents || []).join('\n')}
              onChange={e => set('required_documents', e.target.value.split('\n').filter(Boolean))}
              placeholder="Contractor license&#10;Site plan&#10;Gas load calculation" />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={lbl}>Typical Fee Range</label>
              <input className={inp} value={form.typical_fee_range || ''} onChange={e => set('typical_fee_range', e.target.value)} placeholder="$50–$150" />
            </div>
            <div>
              <label className={lbl}>Typical Processing Days</label>
              <input type="number" className={inp} value={form.typical_processing_days || ''} onChange={e => set('typical_processing_days', e.target.value ? parseInt(e.target.value) : null)} />
            </div>
          </div>

          <div className="flex gap-6">
            {[
              { key: 'inspection_required', label: 'Inspection Required' },
              { key: 'gas_permit_required', label: 'Gas Permit Required' },
              { key: 'lp_permit_required', label: 'LP Permit Required' },
            ].map(({ key, label }) => (
              <label key={key} className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={form[key] ?? true} onChange={e => set(key, e.target.checked)} className="w-4 h-4 rounded" />
                <span className="text-sm text-gray-700">{label}</span>
              </label>
            ))}
          </div>

          <div>
            <label className={lbl}>Notes</label>
            <textarea className={inp} rows={2} value={form.notes || ''} onChange={e => set('notes', e.target.value)} />
          </div>
        </div>
        <div className="flex justify-end gap-2 p-5 border-t">
          <button onClick={onClose} className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg">Cancel</button>
          <button onClick={save} disabled={saving}
            className="flex items-center gap-2 px-4 py-2 text-sm text-white rounded-lg disabled:opacity-50"
            style={{ background: '#2f5a5e' }}>
            {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
            {isNew ? 'Add Jurisdiction' : 'Save Changes'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ══════════════════════════════════════════════════════════════
// PERMIT DETAIL PANEL
// ══════════════════════════════════════════════════════════════
function PermitDetail({ permit, jurisdictions, onEdit, onDelete, onClose }: {
  permit: Permit
  jurisdictions: Jurisdiction[]
  onEdit: () => void
  onDelete: () => void
  onClose: () => void
}) {
  const jx = jurisdictions.find(j => j.id === permit.jurisdiction_id)

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-5 border-b sticky top-0 bg-white z-10">
          <div>
            <h2 className="font-bold text-gray-900 text-lg">
              {permit.permit_number ? `Permit #${permit.permit_number}` : 'Permit (No Number Yet)'}
            </h2>
            <p className="text-sm text-gray-500">{permit.job_address}</p>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={onEdit} className="flex items-center gap-1 px-3 py-1.5 text-sm text-white rounded-lg" style={{ background: '#2f5a5e' }}>
              <Edit2 size={13} /> Edit
            </button>
            <button onClick={onClose} className="p-1 rounded-lg hover:bg-gray-100"><X size={18} /></button>
          </div>
        </div>

        <div className="p-5 space-y-5">
          {/* Status + Type */}
          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge status={permit.status} />
            <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full font-semibold uppercase">{permit.permit_type}</span>
            <span className="text-xs bg-blue-50 text-blue-600 px-2 py-0.5 rounded-full font-semibold">
              {permit.source === 'invoice' ? '📄 From Invoice' : permit.source === 'email' ? '📧 From Email' : '✋ Manual'}
            </span>
          </div>

          {/* Key Info Grid */}
          <div className="grid grid-cols-2 gap-4">
            {permit.customer_name && (
              <div><div className="text-xs text-gray-400 font-semibold uppercase mb-0.5">Customer</div>
                <div className="text-sm font-medium text-gray-800">{permit.customer_name}</div></div>
            )}
            {permit.jurisdiction_name && (
              <div><div className="text-xs text-gray-400 font-semibold uppercase mb-0.5">Jurisdiction</div>
                <div className="text-sm font-medium text-gray-800">{permit.jurisdiction_name}</div></div>
            )}
            {permit.invoice && (
              <div><div className="text-xs text-gray-400 font-semibold uppercase mb-0.5">Invoice</div>
                <div className="text-sm font-medium text-gray-800">#{permit.invoice.invoice_number}</div></div>
            )}
            {permit.permit_fee != null && (
              <div><div className="text-xs text-gray-400 font-semibold uppercase mb-0.5">Fee</div>
                <div className="text-sm font-medium text-gray-800">
                  ${permit.permit_fee.toFixed(2)} {permit.fee_paid
                    ? <span className="text-green-600 text-xs font-semibold ml-1">PAID</span>
                    : <span className="text-red-500 text-xs font-semibold ml-1">UNPAID</span>}
                </div></div>
            )}
          </div>

          {/* Timeline */}
          <div>
            <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">Timeline</h3>
            <div className="space-y-1.5">
              {[
                { label: 'Application', date: permit.application_date },
                { label: 'Approved', date: permit.approved_date },
                { label: 'Issued', date: permit.issued_date },
                { label: 'Inspection', date: permit.inspection_date },
                { label: 'Final', date: permit.final_date },
                { label: 'Expires', date: permit.expiry_date },
              ].map(({ label, date }) => date && (
                <div key={label} className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-blue-400 flex-shrink-0" />
                  <span className="text-xs text-gray-500 w-20">{label}</span>
                  <span className="text-sm font-medium text-gray-700">{fmtDate(date)}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Inspector */}
          {(permit.inspector_name || permit.inspector_notes) && (
            <div>
              <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">Inspector</h3>
              {permit.inspector_name && <p className="text-sm text-gray-700 font-medium">{permit.inspector_name}</p>}
              {permit.inspector_phone && <p className="text-sm text-gray-500">{permit.inspector_phone}</p>}
              {permit.inspector_notes && <p className="text-sm text-gray-600 mt-1 bg-gray-50 rounded-lg p-2">{permit.inspector_notes}</p>}
            </div>
          )}

          {/* Jurisdiction info */}
          {jx && (
            <div className="rounded-xl border p-4 bg-blue-50/50">
              <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2 flex items-center gap-1">
                <Building2 size={11} /> Jurisdiction Info
              </h3>
              {jx.permit_office_phone && (
                <a href={`tel:${jx.permit_office_phone}`} className="flex items-center gap-2 text-sm text-blue-700 hover:underline mb-1">
                  <Phone size={12} /> {jx.permit_office_phone}
                </a>
              )}
              {jx.website_url && (
                <a href={jx.website_url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 text-sm text-blue-700 hover:underline mb-1">
                  <Globe size={12} /> Website
                </a>
              )}
              {jx.instructions && (
                <details className="mt-2">
                  <summary className="text-xs font-semibold text-blue-800 cursor-pointer">How to pull permit</summary>
                  <p className="text-xs text-gray-700 mt-1 whitespace-pre-wrap">{jx.instructions}</p>
                </details>
              )}
            </div>
          )}

          {permit.notes && (
            <div>
              <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-1">Notes</h3>
              <p className="text-sm text-gray-700 whitespace-pre-wrap bg-gray-50 rounded-lg p-3">{permit.notes}</p>
            </div>
          )}
        </div>

        <div className="flex justify-between p-5 border-t">
          <button onClick={onDelete}
            className="flex items-center gap-1 px-3 py-1.5 text-sm text-red-600 hover:bg-red-50 rounded-lg">
            <Trash2 size={13} /> Delete
          </button>
          <button onClick={onClose} className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg">Close</button>
        </div>
      </div>
    </div>
  )
}

// ══════════════════════════════════════════════════════════════
// JURISDICTION LIST VIEW
// ══════════════════════════════════════════════════════════════
function JurisdictionsView({ jurisdictions, onRefresh }: { jurisdictions: Jurisdiction[]; onRefresh: () => void }) {
  const [editJx, setEditJx] = useState<Partial<Jurisdiction> | null>(null)
  const [showModal, setShowModal] = useState(false)
  const [search, setSearch] = useState('')

  const filtered = jurisdictions.filter(j =>
    !search || j.name.toLowerCase().includes(search.toLowerCase()) ||
    (j.state || '').toLowerCase().includes(search.toLowerCase())
  )

  async function deleteJx(id: string) {
    if (!confirm('Delete this jurisdiction?')) return
    await fetch(`/api/permit-jurisdictions?id=${id}`, { method: 'DELETE' })
    onRefresh()
  }

  return (
    <div>
      <div className="flex items-center gap-3 mb-4">
        <div className="relative flex-1 max-w-sm">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input className="w-full border border-gray-200 rounded-xl pl-9 pr-3 py-2 text-sm" value={search} onChange={e => setSearch(e.target.value)} placeholder="Search jurisdictions..." />
        </div>
        <button onClick={() => { setEditJx({}); setShowModal(true) }}
          className="flex items-center gap-2 px-4 py-2 text-sm text-white rounded-xl"
          style={{ background: '#2f5a5e' }}>
          <Plus size={15} /> Add Jurisdiction
        </button>
      </div>

      {filtered.length === 0 ? (
        <div className="text-center py-16 text-gray-400">
          <Building2 size={36} className="mx-auto mb-3 opacity-30" />
          <p className="font-medium">No jurisdictions yet</p>
          <p className="text-sm mt-1">Add your first jurisdiction or use AI Research to auto-fill</p>
        </div>
      ) : (
        <div className="grid gap-3">
          {filtered.map(j => (
            <div key={j.id} className="bg-white rounded-xl border p-4 hover:shadow-sm transition-shadow">
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h3 className="font-semibold text-gray-900">{j.name}</h3>
                    {j.state && <span className="text-xs bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded font-semibold">{j.state}</span>}
                    {j.ai_populated && <span className="text-xs bg-purple-100 text-purple-700 px-1.5 py-0.5 rounded font-semibold flex items-center gap-1"><Sparkles size={9} />AI</span>}
                  </div>
                  {j.county && <p className="text-xs text-gray-500 mt-0.5">{j.county}</p>}
                  <div className="flex flex-wrap items-center gap-3 mt-2">
                    {j.permit_office_phone && (
                      <a href={`tel:${j.permit_office_phone}`} className="flex items-center gap-1 text-xs text-blue-600 hover:underline">
                        <Phone size={10} /> {j.permit_office_phone}
                      </a>
                    )}
                    {j.website_url && (
                      <a href={j.website_url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 text-xs text-blue-600 hover:underline">
                        <Globe size={10} /> Website
                      </a>
                    )}
                    {j.application_url && (
                      <a href={j.application_url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 text-xs text-green-600 hover:underline">
                        <ExternalLink size={10} /> Apply Online
                      </a>
                    )}
                    {j.typical_fee_range && <span className="text-xs text-gray-500 flex items-center gap-1"><DollarSign size={10} />{j.typical_fee_range}</span>}
                    {j.typical_processing_days && <span className="text-xs text-gray-500 flex items-center gap-1"><Clock size={10} />{j.typical_processing_days} days</span>}
                  </div>
                  {j.instructions && (
                    <details className="mt-2">
                      <summary className="text-xs font-semibold text-blue-700 cursor-pointer">How to pull permit</summary>
                      <p className="text-xs text-gray-600 mt-1 whitespace-pre-wrap pl-2 border-l-2 border-blue-200">{j.instructions}</p>
                    </details>
                  )}
                </div>
                <div className="flex items-center gap-1 ml-3">
                  <button onClick={() => { setEditJx(j); setShowModal(true) }}
                    className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg">
                    <Edit2 size={14} />
                  </button>
                  <button onClick={() => deleteJx(j.id)}
                    className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg">
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {showModal && (
        <JurisdictionModal
          jurisdiction={editJx}
          onSave={() => { setShowModal(false); onRefresh() }}
          onClose={() => setShowModal(false)}
        />
      )}
    </div>
  )
}

// ══════════════════════════════════════════════════════════════
// MAIN PAGE
// ══════════════════════════════════════════════════════════════
export default function PermitsPage() {
  const [tab, setTab] = useState<'permits' | 'jurisdictions'>(
    typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('tab') === 'jurisdictions'
      ? 'jurisdictions'
      : 'permits'
  )
  const [permits, setPermits] = useState<Permit[]>([])
  const [jurisdictions, setJurisdictions] = useState<Jurisdiction[]>([])
  const [loading, setLoading] = useState(true)
  const [statusFilter, setStatusFilter] = useState('all')
  const [search, setSearch] = useState('')
  const [editPermit, setEditPermit] = useState<Partial<Permit> | null>(null)
  const [showPermitModal, setShowPermitModal] = useState(false)
  const [viewPermit, setViewPermit] = useState<Permit | null>(null)
  const [syncing, setSyncing] = useState(false)
  const [scanning, setScanning] = useState(false)
  const [syncMsg, setSyncMsg] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    const [pRes, jRes] = await Promise.all([
      fetch(`/api/permits${statusFilter !== 'all' ? `?status=${statusFilter}` : ''}${search ? `${statusFilter !== 'all' ? '&' : '?'}search=${encodeURIComponent(search)}` : ''}`),
      fetch('/api/permit-jurisdictions'),
    ])
    const [p, j] = await Promise.all([pRes.json(), jRes.json()])
    setPermits(Array.isArray(p) ? p : [])
    setJurisdictions(Array.isArray(j) ? j : [])
    setLoading(false)
  }, [statusFilter, search])

  useEffect(() => { load() }, [load])

  async function syncInvoices() {
    setSyncing(true)
    setSyncMsg('')
    const res = await fetch('/api/permits?action=sync-invoices')
    const data = await res.json()
    setSyncMsg(`✓ Scanned ${data.scanned} invoices — imported ${data.imported} new permits`)
    setSyncing(false)
    load()
  }

  async function scanEmails() {
    setScanning(true)
    setSyncMsg('')
    const res = await fetch('/api/permits?action=scan-emails')
    const data = await res.json()
    if (data.needsAuth) {
      setSyncMsg('⚠ Gmail not authorized — connect Gmail in Settings first')
    } else if (data.error) {
      setSyncMsg(`✗ ${data.error}`)
    } else {
      setSyncMsg(`✓ Scanned ${data.scanned} emails — imported ${data.imported} new permits`)
    }
    setScanning(false)
    load()
  }

  async function deletePermit(id: string) {
    if (!confirm('Delete this permit?')) return
    await fetch(`/api/permits?id=${id}`, { method: 'DELETE' })
    setViewPermit(null)
    load()
  }

  // Group permits by status for pipeline view
  const pipeline = STATUSES.map(s => ({
    status: s,
    items: permits.filter(p => p.status === s),
  })).filter(g => g.items.length > 0)

  const allStatuses = ['all', ...STATUSES]

  return (
    <div className="p-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <FileCheck size={24} style={{ color: '#2f5a5e' }} />
            Permits / Licensing
          </h1>
          <p className="text-gray-500 text-sm mt-0.5">Track permits, jurisdictions, inspections & deadlines</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button onClick={syncInvoices} disabled={syncing}
            className="flex items-center gap-2 px-3 py-2 text-sm border border-gray-200 rounded-xl hover:bg-gray-50 disabled:opacity-50">
            {syncing ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
            Sync Invoices
          </button>
          <button onClick={scanEmails} disabled={scanning}
            className="flex items-center gap-2 px-3 py-2 text-sm border border-gray-200 rounded-xl hover:bg-gray-50 disabled:opacity-50">
            {scanning ? <Loader2 size={14} className="animate-spin" /> : <Mail size={14} />}
            Scan Emails
          </button>
          <button onClick={() => { setEditPermit({}); setShowPermitModal(true) }}
            className="flex items-center gap-2 px-4 py-2 text-sm text-white rounded-xl"
            style={{ background: '#2f5a5e' }}>
            <Plus size={15} /> Add Permit
          </button>
        </div>
      </div>

      {syncMsg && (
        <div className={`mb-4 px-4 py-3 rounded-xl text-sm font-medium border ${syncMsg.startsWith('✓') ? 'bg-green-50 border-green-200 text-green-700' : 'bg-amber-50 border-amber-200 text-amber-700'}`}>
          {syncMsg}
          <button onClick={() => setSyncMsg('')} className="ml-3 opacity-60 hover:opacity-100"><X size={13} /></button>
        </div>
      )}

      {/* Unified tab strip: Permits | Licenses | Jurisdictions */}
      <div className="flex gap-1 mb-5 border-b border-gray-200">
        <button onClick={() => setTab('permits')}
          className={`flex items-center gap-2 px-4 py-2.5 text-sm font-semibold border-b-2 -mb-px transition-colors ${tab === 'permits' ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-800'}`}>
          <FileCheck size={15} />Permits ({permits.length})
        </button>
        <Link href="/admin/licensing"
          className="flex items-center gap-2 px-4 py-2.5 text-sm font-semibold border-b-2 -mb-px border-transparent text-gray-500 hover:text-gray-800">
          <Award size={15} />Licenses
        </Link>
        <button onClick={() => setTab('jurisdictions')}
          className={`flex items-center gap-2 px-4 py-2.5 text-sm font-semibold border-b-2 -mb-px transition-colors ${tab === 'jurisdictions' ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-800'}`}>
          <Building2 size={15} />Jurisdictions ({jurisdictions.length})
        </button>
      </div>

      {/* ── PERMITS TAB ──────────────────────────────────────── */}
      {tab === 'permits' && (
        <div>
          {/* Summary Cards */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-5">
            {[
              { label: 'Total', value: permits.length, color: '#2f5a5e' },
              { label: 'Active', value: permits.filter(p => !['closed', 'not_required', 'passed'].includes(p.status)).length, color: '#d97706' },
              { label: 'Issued', value: permits.filter(p => p.status === 'issued').length, color: '#059669' },
              { label: 'Fee Due', value: permits.filter(p => p.permit_fee && !p.fee_paid).length, color: '#dc2626' },
            ].map(({ label, value, color }) => (
              <div key={label} className="bg-white rounded-xl border p-4 text-center">
                <div className="text-2xl font-bold" style={{ color }}>{value}</div>
                <div className="text-xs text-gray-500 font-medium mt-0.5">{label}</div>
              </div>
            ))}
          </div>

          {/* Filters */}
          <div className="flex flex-wrap gap-2 mb-4">
            <div className="relative">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input className="border border-gray-200 rounded-xl pl-9 pr-3 py-2 text-sm w-56"
                value={search} onChange={e => setSearch(e.target.value)} placeholder="Search permits..." />
            </div>
            <div className="flex flex-wrap gap-1.5">
              {allStatuses.map(s => (
                <button key={s} onClick={() => setStatusFilter(s)}
                  className={`px-3 py-1.5 rounded-xl text-xs font-semibold border transition-all ${statusFilter === s ? 'border-transparent text-white' : 'border-gray-200 text-gray-600 hover:border-gray-300'}`}
                  style={statusFilter === s ? { background: '#2f5a5e' } : {}}>
                  {s === 'all' ? 'All' : STATUS_CONFIG[s]?.label || s}
                </button>
              ))}
            </div>
          </div>

          {loading ? (
            <div className="flex items-center justify-center py-16 text-gray-400">
              <Loader2 size={28} className="animate-spin" />
            </div>
          ) : permits.length === 0 ? (
            <div className="text-center py-16 text-gray-400">
              <FileCheck size={36} className="mx-auto mb-3 opacity-30" />
              <p className="font-medium">No permits found</p>
              <p className="text-sm mt-1">Add a permit manually, sync from invoices, or scan emails</p>
            </div>
          ) : (
            <>
              {/* Pipeline view when showing all statuses */}
              {statusFilter === 'all' && !search && pipeline.length > 0 ? (
                <div className="space-y-6">
                  {pipeline.map(({ status, items }) => {
                    const cfg = STATUS_CONFIG[status]
                    return (
                      <div key={status}>
                        <div className="flex items-center gap-2 mb-2">
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold"
                            style={{ color: cfg?.color || '#6b7280', background: cfg?.bg || '#f3f4f6' }}>
                            {cfg?.label || status} ({items.length})
                          </span>
                        </div>
                        <div className="grid gap-2">
                          {items.map(p => <PermitRow key={p.id} permit={p} onClick={() => setViewPermit(p)} />)}
                        </div>
                      </div>
                    )
                  })}
                </div>
              ) : (
                <div className="grid gap-2">
                  {permits.map(p => <PermitRow key={p.id} permit={p} onClick={() => setViewPermit(p)} />)}
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* ── JURISDICTIONS TAB ──────────────────────────────── */}
      {tab === 'jurisdictions' && (
        <JurisdictionsView jurisdictions={jurisdictions} onRefresh={load} />
      )}

      {/* Modals */}
      {showPermitModal && (
        <PermitModal
          permit={editPermit}
          jurisdictions={jurisdictions}
          onSave={() => { setShowPermitModal(false); load() }}
          onClose={() => setShowPermitModal(false)}
        />
      )}

      {viewPermit && (
        <PermitDetail
          permit={viewPermit}
          jurisdictions={jurisdictions}
          onEdit={() => { setEditPermit(viewPermit); setShowPermitModal(true); setViewPermit(null) }}
          onDelete={() => deletePermit(viewPermit.id)}
          onClose={() => setViewPermit(null)}
        />
      )}
    </div>
  )
}

// ── Permit Row Component ───────────────────────────────────────
function PermitRow({ permit, onClick }: { permit: Permit; onClick: () => void }) {
  const today = new Date()
  const expiry = permit.expiry_date ? new Date(permit.expiry_date + 'T00:00:00') : null
  const daysToExpiry = expiry ? Math.ceil((expiry.getTime() - today.getTime()) / (1000 * 60 * 60 * 24)) : null
  const isExpiringSoon = daysToExpiry !== null && daysToExpiry <= 30 && daysToExpiry > 0
  const isExpired = daysToExpiry !== null && daysToExpiry <= 0

  return (
    <div onClick={onClick}
      className="bg-white rounded-xl border p-4 hover:shadow-sm hover:border-blue-200 transition-all cursor-pointer">
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-2 mb-1">
            <span className="font-semibold text-gray-900 text-sm truncate">
              {permit.permit_number ? `#${permit.permit_number}` : '(No number)'}
            </span>
            <StatusBadge status={permit.status} />
            {(isExpiringSoon || isExpired) && (
              <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold ${isExpired ? 'bg-red-100 text-red-600' : 'bg-amber-100 text-amber-600'}`}>
                <AlertTriangle size={9} />
                {isExpired ? 'Expired' : `Expires in ${daysToExpiry}d`}
              </span>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-3 text-xs text-gray-500">
            <span className="flex items-center gap-1 truncate"><MapPin size={10} />{permit.job_address}</span>
            {permit.customer_name && <span className="flex items-center gap-1"><User size={10} />{permit.customer_name}</span>}
            {permit.jurisdiction_name && <span className="flex items-center gap-1"><Building2 size={10} />{permit.jurisdiction_name}</span>}
            {permit.permit_fee != null && (
              <span className={`flex items-center gap-1 font-medium ${permit.fee_paid ? 'text-green-600' : 'text-red-500'}`}>
                <DollarSign size={10} />${permit.permit_fee.toFixed(0)} {permit.fee_paid ? '✓' : 'UNPAID'}
              </span>
            )}
          </div>
          {permit.application_date && (
            <div className="text-xs text-gray-400 mt-1">Applied {fmtDate(permit.application_date)}</div>
          )}
        </div>
        <ChevronRight size={16} className="text-gray-300 flex-shrink-0 mt-1" />
      </div>
    </div>
  )
}
