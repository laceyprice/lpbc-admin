'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import {
  Award, Plus, Search, Edit2, Trash2, X, Save, Loader2, Calendar,
  Building2, AlertTriangle, CheckCircle2, ExternalLink, Globe, FileCheck,
} from 'lucide-react'

interface Jurisdiction {
  id: string
  name: string
  state: string | null
  agency_type?: string
  website_url?: string | null
  permit_office_name?: string | null
}

interface License {
  id: string
  license_number: string | null
  license_type: string
  classification: string | null
  description: string | null
  holder_name: string
  holder_type: string
  jurisdiction_id: string | null
  jurisdiction_name: string | null
  jurisdiction?: Jurisdiction | null
  status: string
  application_date: string | null
  issue_date: string | null
  expiry_date: string | null
  last_renewed_date: string | null
  renewal_url: string | null
  renewal_period_months: number | null
  fee: number | null
  fee_paid: boolean
  notes: string | null
  days_until_expiry?: number | null
  is_expiring_soon?: boolean
  is_expired?: boolean
}

const STATUS_CONFIG: Record<string, { label: string; color: string; bg: string }> = {
  pending_application:   { label: 'Pending Application', color: '#a16207', bg: '#fef3c7' },
  applied:               { label: 'Applied',              color: '#1d4ed8', bg: '#dbeafe' },
  active:                { label: 'Active',               color: '#047857', bg: '#d1fae5' },
  renewal_due:           { label: 'Renewal Due',          color: '#b45309', bg: '#fed7aa' },
  expired:               { label: 'Expired',              color: '#b91c1c', bg: '#fecaca' },
  suspended:             { label: 'Suspended',            color: '#9d174d', bg: '#fbcfe8' },
  revoked:               { label: 'Revoked',              color: '#7f1d1d', bg: '#fecaca' },
  cancelled:             { label: 'Cancelled',            color: '#374151', bg: '#e5e7eb' },
}

const LICENSE_TYPES = [
  { value: 'contractor',     label: 'Contractor License' },
  { value: 'gas_fitter',     label: 'Gas Fitter Cert' },
  { value: 'lp_dealer',      label: 'LP Gas Dealer/Installer' },
  { value: 'master_plumber', label: 'Master Plumber' },
  { value: 'business',       label: 'Business License' },
  { value: 'occupational',   label: 'Occupational License' },
  { value: 'bonded',         label: 'Bond' },
  { value: 'insurance',      label: 'Insurance Policy' },
  { value: 'other',          label: 'Other' },
]

export default function LicensingPage() {
  const [licenses, setLicenses] = useState<License[]>([])
  const [jurisdictions, setJurisdictions] = useState<Jurisdiction[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [showForm, setShowForm] = useState(false)
  const [editing, setEditing] = useState<License | null>(null)
  const [form, setForm] = useState<Partial<License>>({})
  const [saving, setSaving] = useState(false)

  useEffect(() => { load() }, [])

  async function load() {
    setLoading(true)
    const [resL, resJ] = await Promise.all([
      fetch('/api/licenses'),
      fetch('/api/permit-jurisdictions'),
    ])
    const dL = await resL.json()
    const dJ = await resJ.json()
    setLicenses(Array.isArray(dL) ? dL : [])
    setJurisdictions(Array.isArray(dJ) ? dJ : [])
    setLoading(false)
  }

  function openAdd() {
    setEditing(null)
    setForm({
      license_type: 'contractor',
      holder_name: 'The Gasologist LLC',
      holder_type: 'business',
      status: 'active',
      renewal_period_months: 12,
      fee_paid: false,
    })
    setShowForm(true)
  }

  function openEdit(lic: License) {
    setEditing(lic)
    setForm({ ...lic })
    setShowForm(true)
  }

  async function save() {
    setSaving(true)
    try {
      const payload: any = { ...form }
      // Auto-fill jurisdiction_name from selected jurisdiction
      if (payload.jurisdiction_id) {
        const j = jurisdictions.find(x => x.id === payload.jurisdiction_id)
        if (j) payload.jurisdiction_name = j.name
      }
      if (editing) {
        await fetch('/api/licenses', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: editing.id, ...payload }),
        })
      } else {
        await fetch('/api/licenses', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        })
      }
      await load()
      setShowForm(false)
      setEditing(null)
      setForm({})
    } finally { setSaving(false) }
  }

  async function del(id: string) {
    if (!confirm('Delete this license? This cannot be undone.')) return
    await fetch(`/api/licenses?id=${id}`, { method: 'DELETE' })
    await load()
  }

  const filtered = licenses.filter(l => {
    const matchesStatus = statusFilter === 'all' ? true :
      statusFilter === 'expiring' ? l.is_expiring_soon :
      statusFilter === 'expired' ? l.is_expired :
      l.status === statusFilter
    const q = search.toLowerCase()
    const matchesSearch = !q || `${l.license_number || ''} ${l.holder_name} ${l.classification || ''} ${l.jurisdiction_name || ''}`.toLowerCase().includes(q)
    return matchesStatus && matchesSearch
  })

  const expiringCount = licenses.filter(l => l.is_expiring_soon).length
  const expiredCount = licenses.filter(l => l.is_expired).length
  const activeCount = licenses.filter(l => l.status === 'active' && !l.is_expired).length

  const fmtDate = (d: string | null) => d ? new Date(d + 'T00:00:00').toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' }) : '—'
  const inputCls = 'w-full px-3 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:border-blue-400'

  return (
    <div className="p-6 md:p-8 pt-16 md:pt-8">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-2xl font-extrabold text-gray-900">Permits / Licensing</h1>
          <p className="text-gray-500 text-sm">{licenses.length} licenses tracked · {activeCount} active</p>
        </div>
        <button onClick={openAdd} className="flex items-center gap-2 text-white font-semibold px-4 py-2.5 rounded-xl shadow-md" style={{ background:'#185FA5' }}>
          <Plus size={16} /> Add License
        </button>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-5 border-b border-gray-200">
        <Link href="/admin/permits"
          className="flex items-center gap-2 px-4 py-2.5 text-sm font-semibold border-b-2 -mb-px border-transparent text-gray-500 hover:text-gray-800">
          <FileCheck size={15} />Permits
        </Link>
        <span className="flex items-center gap-2 px-4 py-2.5 text-sm font-semibold border-b-2 -mb-px border-blue-600 text-blue-600">
          <Award size={15} />Licenses ({licenses.length})
        </span>
        <Link href="/admin/permits?tab=jurisdictions"
          className="flex items-center gap-2 px-4 py-2.5 text-sm font-semibold border-b-2 -mb-px border-transparent text-gray-500 hover:text-gray-800">
          <Building2 size={15} />Jurisdictions
        </Link>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-3 mb-5">
        <StatCard icon={<CheckCircle2 size={14} />} label="Active" value={activeCount} color="#16a34a" />
        <StatCard icon={<AlertTriangle size={14} />} label="Expiring Soon (60 days)" value={expiringCount} color={expiringCount > 0 ? '#d97706' : '#9ca3af'} />
        <StatCard icon={<AlertTriangle size={14} />} label="Expired" value={expiredCount} color={expiredCount > 0 ? '#dc2626' : '#9ca3af'} />
        <StatCard icon={<Award size={14} />} label="Total" value={licenses.length} color="#185FA5" />
      </div>

      {/* Search + filter */}
      <div className="flex flex-wrap gap-3 mb-5">
        <div className="relative flex-1 min-w-[220px]">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Search licenses…" className="w-full pl-10 pr-3 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:border-blue-400" />
        </div>
        <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}
          className="px-3 py-2.5 rounded-xl border border-gray-200 text-sm">
          <option value="all">All statuses</option>
          <option value="active">Active</option>
          <option value="expiring">Expiring Soon</option>
          <option value="expired">Expired</option>
          <option value="renewal_due">Renewal Due</option>
          <option value="pending_application">Pending</option>
          <option value="cancelled">Cancelled</option>
        </select>
      </div>

      {/* List */}
      {loading ? (
        <div className="flex justify-center py-12"><Loader2 size={28} className="animate-spin text-gray-400" /></div>
      ) : filtered.length === 0 ? (
        <div className="bg-white rounded-2xl border border-gray-100 p-12 text-center">
          <Award size={32} className="mx-auto mb-2 text-gray-300" />
          <p className="text-sm font-semibold text-gray-700 mb-1">No licenses yet</p>
          <p className="text-xs text-gray-500 mb-3">Track contractor licenses, LP gas dealer permits (FDACS), bonds, and insurance with renewal dates.</p>
          <button onClick={openAdd} className="px-4 py-2 rounded-xl text-white text-sm font-bold" style={{ background:'#185FA5' }}>
            <Plus size={14} className="inline mr-1" />Add Your First License
          </button>
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map(l => {
            const cfg = STATUS_CONFIG[l.status] || STATUS_CONFIG.active
            const daysLeft = l.days_until_expiry
            const expiryColor = l.is_expired ? '#dc2626' : l.is_expiring_soon ? '#d97706' : '#6b7280'
            return (
              <div key={l.id} className="bg-white rounded-2xl border border-gray-100 p-4 hover:shadow-md transition-shadow">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                      <span className="text-xs font-bold px-2 py-0.5 rounded-full" style={{ background: cfg.bg, color: cfg.color }}>{cfg.label}</span>
                      <span className="text-xs text-gray-500">{LICENSE_TYPES.find(t => t.value === l.license_type)?.label || l.license_type}</span>
                      {l.is_expiring_soon && !l.is_expired && (
                        <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-amber-100 text-amber-700">Expires in {daysLeft}d</span>
                      )}
                      {l.is_expired && (
                        <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-red-100 text-red-700">Expired {Math.abs(daysLeft || 0)}d ago</span>
                      )}
                    </div>
                    <h3 className="text-base font-extrabold text-gray-900 mb-0.5">
                      {l.classification || LICENSE_TYPES.find(t => t.value === l.license_type)?.label || 'License'}
                      {l.license_number && <span className="ml-2 text-sm font-normal text-gray-500">#{l.license_number}</span>}
                    </h3>
                    <div className="text-sm text-gray-600 flex flex-wrap gap-x-4 gap-y-1">
                      {l.holder_name && <span><Building2 size={12} className="inline mr-1" />{l.holder_name}</span>}
                      {(l.jurisdiction?.name || l.jurisdiction_name) && (
                        <span>
                          {l.jurisdiction?.website_url ? (
                            <a href={l.jurisdiction.website_url} target="_blank" rel="noreferrer" className="text-blue-600 hover:underline">
                              {l.jurisdiction.name || l.jurisdiction_name} <ExternalLink size={10} className="inline" />
                            </a>
                          ) : (l.jurisdiction?.name || l.jurisdiction_name)}
                        </span>
                      )}
                      {l.expiry_date && (
                        <span style={{ color: expiryColor }}>
                          <Calendar size={12} className="inline mr-1" />Expires {fmtDate(l.expiry_date)}
                        </span>
                      )}
                      {l.fee && <span>${Number(l.fee).toFixed(2)}{l.fee_paid ? ' paid' : ' unpaid'}</span>}
                    </div>
                    {l.notes && <p className="text-xs text-gray-500 mt-2 italic">{l.notes}</p>}
                  </div>
                  <div className="flex items-center gap-1 flex-shrink-0">
                    {l.renewal_url && (
                      <a href={l.renewal_url} target="_blank" rel="noreferrer"
                        className="px-2.5 py-1.5 rounded-lg bg-blue-50 text-blue-600 text-xs font-bold hover:bg-blue-100">Renew ↗</a>
                    )}
                    <button onClick={() => openEdit(l)} className="p-1.5 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-lg"><Edit2 size={14} /></button>
                    <button onClick={() => del(l.id)} className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg"><Trash2 size={14} /></button>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Add/Edit modal */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <div className="sticky top-0 bg-white px-6 py-4 border-b border-gray-100 flex items-center justify-between">
              <h2 className="text-lg font-bold text-gray-900">{editing ? 'Edit License' : 'Add License'}</h2>
              <button onClick={() => { setShowForm(false); setEditing(null); setForm({}) }}><X size={18} className="text-gray-400" /></button>
            </div>
            <div className="p-6 grid grid-cols-2 gap-3">
              <div className="col-span-2">
                <label className="text-xs font-semibold text-gray-600 mb-1 block">License Type *</label>
                <select value={form.license_type || 'contractor'} onChange={e => setForm(p => ({ ...p, license_type: e.target.value }))} className={inputCls}>
                  {LICENSE_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs font-semibold text-gray-600 mb-1 block">License Number</label>
                <input value={form.license_number || ''} onChange={e => setForm(p => ({ ...p, license_number: e.target.value }))} className={inputCls} placeholder="e.g. CLF202100456" />
              </div>
              <div>
                <label className="text-xs font-semibold text-gray-600 mb-1 block">Classification</label>
                <input value={form.classification || ''} onChange={e => setForm(p => ({ ...p, classification: e.target.value }))} className={inputCls} placeholder='e.g. "Class 4 LP Gas Installer"' />
              </div>
              <div>
                <label className="text-xs font-semibold text-gray-600 mb-1 block">Holder Name *</label>
                <input value={form.holder_name || ''} onChange={e => setForm(p => ({ ...p, holder_name: e.target.value }))} className={inputCls} required />
              </div>
              <div>
                <label className="text-xs font-semibold text-gray-600 mb-1 block">Holder Type</label>
                <select value={form.holder_type || 'business'} onChange={e => setForm(p => ({ ...p, holder_type: e.target.value }))} className={inputCls}>
                  <option value="business">Business</option>
                  <option value="individual">Individual</option>
                </select>
              </div>
              <div className="col-span-2">
                <label className="text-xs font-semibold text-gray-600 mb-1 block">Issuing Authority (Jurisdiction)</label>
                <select value={form.jurisdiction_id || ''} onChange={e => setForm(p => ({ ...p, jurisdiction_id: e.target.value || null }))} className={inputCls}>
                  <option value="">— select issuing authority —</option>
                  {jurisdictions.map(j => (
                    <option key={j.id} value={j.id}>{j.name}{j.state ? ` (${j.state})` : ''}{j.agency_type === 'permit' ? ' [permit]' : ''}</option>
                  ))}
                </select>
                <p className="text-xs text-gray-500 mt-1">FDACS and DBPR are pre-loaded. Add more from the Permits → Jurisdictions tab.</p>
              </div>
              <div>
                <label className="text-xs font-semibold text-gray-600 mb-1 block">Status</label>
                <select value={form.status || 'active'} onChange={e => setForm(p => ({ ...p, status: e.target.value }))} className={inputCls}>
                  {Object.entries(STATUS_CONFIG).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs font-semibold text-gray-600 mb-1 block">Renewal Period (months)</label>
                <input type="number" value={form.renewal_period_months ?? 12} onChange={e => setForm(p => ({ ...p, renewal_period_months: Number(e.target.value) }))} className={inputCls} />
              </div>
              <div>
                <label className="text-xs font-semibold text-gray-600 mb-1 block">Issue Date</label>
                <input type="date" value={form.issue_date || ''} onChange={e => setForm(p => ({ ...p, issue_date: e.target.value || null }))} className={inputCls} />
              </div>
              <div>
                <label className="text-xs font-semibold text-gray-600 mb-1 block">Expiry / Renewal Date</label>
                <input type="date" value={form.expiry_date || ''} onChange={e => setForm(p => ({ ...p, expiry_date: e.target.value || null }))} className={inputCls} />
              </div>
              <div>
                <label className="text-xs font-semibold text-gray-600 mb-1 block">Last Renewed</label>
                <input type="date" value={form.last_renewed_date || ''} onChange={e => setForm(p => ({ ...p, last_renewed_date: e.target.value || null }))} className={inputCls} />
              </div>
              <div>
                <label className="text-xs font-semibold text-gray-600 mb-1 block">Fee</label>
                <input type="number" step="0.01" value={form.fee || ''} onChange={e => setForm(p => ({ ...p, fee: e.target.value ? Number(e.target.value) : null }))} className={inputCls} />
              </div>
              <div className="col-span-2">
                <label className="text-xs font-semibold text-gray-600 mb-1 block">Renewal URL</label>
                <input value={form.renewal_url || ''} onChange={e => setForm(p => ({ ...p, renewal_url: e.target.value }))} className={inputCls} placeholder="https://www.fdacs.gov/…" />
              </div>
              <div className="col-span-2">
                <label className="text-xs font-semibold text-gray-600 mb-1 block">Notes</label>
                <textarea value={form.notes || ''} onChange={e => setForm(p => ({ ...p, notes: e.target.value }))} rows={3} className={inputCls} />
              </div>
              <div className="col-span-2 flex items-center gap-2">
                <input type="checkbox" id="fee_paid" checked={form.fee_paid || false} onChange={e => setForm(p => ({ ...p, fee_paid: e.target.checked }))} />
                <label htmlFor="fee_paid" className="text-sm text-gray-700">Fee paid</label>
              </div>
            </div>
            <div className="sticky bottom-0 bg-white flex justify-end gap-2 px-6 py-4 border-t border-gray-100">
              <button onClick={() => { setShowForm(false); setEditing(null); setForm({}) }} className="px-4 py-2 rounded-xl text-sm font-semibold text-gray-600 hover:bg-gray-100">Cancel</button>
              <button onClick={save} disabled={saving || !form.holder_name} className="flex items-center gap-2 px-5 py-2 rounded-xl text-white text-sm font-bold disabled:opacity-50" style={{ background:'#185FA5' }}>
                {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
                {editing ? 'Save Changes' : 'Add License'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function StatCard({ icon, label, value, color }: { icon: React.ReactNode; label: string; value: number; color: string }) {
  return (
    <div className="bg-white rounded-xl border border-gray-100 p-3">
      <div className="flex items-center gap-1.5 text-xs font-semibold mb-1" style={{ color }}>{icon}{label}</div>
      <div className="text-2xl font-extrabold text-gray-900">{value}</div>
    </div>
  )
}
