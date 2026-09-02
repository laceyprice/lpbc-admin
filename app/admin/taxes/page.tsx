'use client'
import { useEffect, useState, useRef } from 'react'
import { Upload, Download, FileText, Loader2, Plus, X, Check, AlertCircle, Trash2, Users, Building2 } from 'lucide-react'
import { formatCurrency } from '@/lib/utils'

// S-corp business tax document catalog, grouped by category.
const BIZ_TAX_CATALOG: { group: string; types: string[] }[] = [
  { group: 'Formation & Election', types: ['Articles of Incorporation', 'S-Corp Election (Form 2553)', 'EIN Letter (CP-575)', 'Corporate Bylaws', 'Annual Report / State Registration'] },
  { group: 'Income Tax Returns', types: ['Form 1120-S (Annual Return)', 'Schedule K-1', 'State Corporate / Franchise Return', 'Estimated Tax Vouchers'] },
  { group: 'Payroll Tax', types: ['Form 941 (Quarterly)', 'Form 940 (FUTA)', 'W-2 / W-3', 'Reasonable Compensation Records', 'State Unemployment (SUTA)'] },
  { group: 'Sales & Other', types: ['Sales & Use Tax', 'Business License', 'Other Tax Document'] },
]

interface TaxDocument {
  id: string
  created_at: string
  vendor_name: string
  vendor_email: string
  vendor_phone?: string
  vendor_address?: string
  ein_ssn?: string
  document_type: 'w9' | '1099-nec' | '1099-misc'
  tax_year: number
  amount_paid?: number
  file_url?: string
  file_name?: string
  status: 'pending_w9' | 'w9_received' | '1099_generated' | '1099_filed'
  notes?: string
}

const STATUS_LABELS: Record<string, string> = {
  pending_w9: 'Pending W-9',
  w9_received: 'W-9 Received',
  '1099_generated': '1099 Generated',
  '1099_filed': '1099 Filed',
}

const STATUS_COLORS: Record<string, string> = {
  pending_w9: 'bg-yellow-100 text-yellow-700',
  w9_received: 'bg-blue-100 text-blue-700',
  '1099_generated': 'bg-purple-100 text-purple-700',
  '1099_filed': 'bg-green-100 text-green-700',
}

const currentYear = new Date().getFullYear()
const TAX_YEARS = [currentYear, currentYear - 1, currentYear - 2]

export default function TaxesPage() {
  const [mainTab, setMainTab] = useState<'vendors' | 'business'>('vendors')
  const [docs, setDocs] = useState<TaxDocument[]>([])
  const [loading, setLoading] = useState(true)
  const [creating, setCreating] = useState(false)
  const [editing, setEditing] = useState<TaxDocument | null>(null)
  const [saving, setSaving] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [yearFilter, setYearFilter] = useState(currentYear)
  const [form, setForm] = useState<Partial<TaxDocument>>({ tax_year: currentYear, document_type: 'w9', status: 'pending_w9' })
  const fileRef = useRef<HTMLInputElement>(null)

  useEffect(() => { load() }, [yearFilter])

  async function load() {
    setLoading(true)
    const res = await fetch(`/api/tax-documents?year=${yearFilter}`)
    const d = await res.json()
    setDocs(Array.isArray(d) ? d : [])
    setLoading(false)
  }

  async function save() {
    setSaving(true)
    try {
      const method = editing ? 'PATCH' : 'POST'
      const body = editing ? { ...form, id: editing.id } : form
      const res = await fetch('/api/tax-documents', { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      if (res.ok) { await load(); setCreating(false); setEditing(null); setForm({ tax_year: currentYear, document_type: 'w9', status: 'pending_w9' }) }
      else alert('Failed to save record')
    } finally { setSaving(false) }
  }

  async function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>, docId: string) {
    const file = e.target.files?.[0]; if (!file) return
    setUploading(true)
    try {
      const formData = new FormData()
      formData.append('file', file)
      formData.append('docId', docId)
      const res = await fetch('/api/tax-documents?action=upload', { method: 'POST', body: formData })
      const d = await res.json()
      if (d.url) {
        setDocs(p => p.map(doc => doc.id === docId ? { ...doc, file_url: d.url, file_name: file.name, status: 'w9_received' } : doc))
        alert('✅ W-9 uploaded successfully')
      }
    } catch { alert('Upload failed. Please try again.') }
    finally { setUploading(false) }
  }

  async function generate1099(doc: TaxDocument) {
    if (!doc.amount_paid || doc.amount_paid < 600) {
      alert('1099 is only required for payments of $600 or more.')
      return
    }
    setSaving(true)
    try {
      const res = await fetch('/api/tax-documents?action=generate1099', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: doc.id })
      })
      const d = await res.json()
      if (d.success) {
        await load()
        alert('✅ 1099-NEC generated and ready for review.')
      } else alert('Failed to generate 1099: ' + (d.error || 'Unknown error'))
    } finally { setSaving(false) }
  }

  async function deleteDoc(id: string) {
    if (!confirm('Delete this tax document record?')) return
    await fetch('/api/tax-documents', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id }) })
    await load()
    setEditing(null)
  }

  const threshold1099 = docs.filter(d => (d.amount_paid || 0) >= 600 && d.status === 'w9_received').length
  const totalPaid = docs.reduce((s, d) => s + (d.amount_paid || 0), 0)
  const pendingW9 = docs.filter(d => d.status === 'pending_w9').length

  const inputCls = 'w-full px-3 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:border-blue-400'
  const labelCls = 'block text-sm font-semibold text-gray-700 mb-1'

  return (
    <div className="p-6 md:p-8 pt-16 md:pt-8">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-2xl font-extrabold text-gray-900">Business Tax Center</h1>
          <p className="text-gray-500 text-sm mt-0.5">Vendor W-9s &amp; 1099s, plus your business tax documents</p>
        </div>
        {mainTab === 'vendors' && (
          <div className="flex gap-3">
            <select value={yearFilter} onChange={e => setYearFilter(Number(e.target.value))}
              className="border border-gray-200 rounded-xl px-3 py-2 text-sm font-semibold text-gray-700 focus:outline-none">
              {TAX_YEARS.map(y => <option key={y} value={y}>{y} Tax Year</option>)}
            </select>
            <button onClick={() => { setCreating(true); setForm({ tax_year: yearFilter, document_type: 'w9', status: 'pending_w9' }) }}
              className="flex items-center gap-2 text-white font-semibold px-4 py-2.5 rounded-xl shadow-md" style={{ background: '#b8895a' }}>
              <Plus size={16} />Add Vendor
            </button>
          </div>
        )}
      </div>

      {/* Main tabs */}
      <div className="flex gap-1 bg-gray-100 rounded-xl p-1 w-fit mb-6">
        <button onClick={() => setMainTab('vendors')}
          className={`px-5 py-2.5 rounded-lg text-sm font-semibold transition-all flex items-center gap-2 ${mainTab === 'vendors' ? 'bg-white shadow-sm text-gray-900' : 'text-gray-500'}`}>
          <Users size={14} /> W-9 &amp; 1099 (Vendors)
        </button>
        <button onClick={() => setMainTab('business')}
          className={`px-5 py-2.5 rounded-lg text-sm font-semibold transition-all flex items-center gap-2 ${mainTab === 'business' ? 'bg-white shadow-sm text-gray-900' : 'text-gray-500'}`}>
          <Building2 size={14} /> Business Documents
        </button>
      </div>

      {mainTab === 'business' && <BusinessDocuments />}

      {mainTab === 'vendors' && <>
      {/* Summary Cards */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        <div className="bg-blue-50 border border-blue-100 rounded-2xl p-4">
          <div className="text-xs font-bold text-blue-700 uppercase tracking-wider mb-1">Total Paid ({yearFilter})</div>
          <div className="text-2xl font-extrabold text-blue-700">{formatCurrency(totalPaid)}</div>
        </div>
        <div className="bg-yellow-50 border border-yellow-100 rounded-2xl p-4">
          <div className="text-xs font-bold text-yellow-700 uppercase tracking-wider mb-1">Pending W-9s</div>
          <div className="text-2xl font-extrabold text-yellow-700">{pendingW9}</div>
        </div>
        <div className="bg-purple-50 border border-purple-100 rounded-2xl p-4">
          <div className="text-xs font-bold text-purple-700 uppercase tracking-wider mb-1">1099s Required</div>
          <div className="text-2xl font-extrabold text-purple-700">{threshold1099}</div>
        </div>
      </div>

      {/* Alert for pending W-9s */}
      {pendingW9 > 0 && (
        <div className="flex items-start gap-3 bg-yellow-50 border border-yellow-200 rounded-xl px-4 py-3 mb-5 text-sm text-yellow-800">
          <AlertCircle size={16} className="mt-0.5 shrink-0" />
          <div><span className="font-bold">{pendingW9} vendor{pendingW9 > 1 ? 's' : ''} still need{pendingW9 === 1 ? 's' : ''} to submit a W-9.</span> Collect W-9 forms before paying more than $600 to any contractor.</div>
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-20"><Loader2 className="animate-spin" style={{ color: '#b8895a' }} size={28} /></div>
      ) : docs.length === 0 ? (
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 py-16 text-center text-gray-400">
          <FileText size={32} className="mx-auto mb-2 opacity-30" />
          <p className="text-sm">No tax documents for {yearFilter} · Add vendors above</p>
        </div>
      ) : (
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr className="bg-gray-50 border-b border-gray-100">
              {['Vendor', 'EIN / SSN', 'Amount Paid', 'Status', 'W-9', '1099', 'Actions'].map(h => (
                <th key={h} className="text-left px-5 py-3 text-xs font-semibold text-gray-600 uppercase tracking-wider">{h}</th>
              ))}
            </tr></thead>
            <tbody className="divide-y divide-gray-50">
              {docs.map(doc => (
                <tr key={doc.id} className="hover:bg-gray-50">
                  <td className="px-5 py-3">
                    <div className="font-semibold text-gray-900">{doc.vendor_name}</div>
                    <div className="text-xs text-gray-400">{doc.vendor_email}</div>
                  </td>
                  <td className="px-5 py-3 text-sm text-gray-600 font-mono">{doc.ein_ssn ? `***-**-${doc.ein_ssn.slice(-4)}` : <span className="text-gray-300">—</span>}</td>
                  <td className="px-5 py-3 font-bold text-gray-900">{doc.amount_paid ? formatCurrency(doc.amount_paid) : <span className="text-gray-300">—</span>}</td>
                  <td className="px-5 py-3">
                    <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${STATUS_COLORS[doc.status] || 'bg-gray-100 text-gray-600'}`}>
                      {STATUS_LABELS[doc.status] || doc.status}
                    </span>
                  </td>
                  <td className="px-5 py-3">
                    {doc.file_url ? (
                      <a href={doc.file_url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 text-xs font-medium underline" style={{ color: '#b8895a' }}>
                        <Download size={12} />{doc.file_name || 'W-9'}
                      </a>
                    ) : (
                      <label className="cursor-pointer flex items-center gap-1 text-xs font-medium text-gray-500 hover:text-gray-700">
                        <Upload size={12} />Upload
                        <input type="file" accept=".pdf,.png,.jpg" className="hidden" onChange={e => handleFileUpload(e, doc.id)} />
                      </label>
                    )}
                  </td>
                  <td className="px-5 py-3">
                    {doc.status === 'w9_received' && (doc.amount_paid || 0) >= 600 ? (
                      <button onClick={() => generate1099(doc)} className="text-xs font-semibold px-2 py-1 rounded-lg text-white" style={{ background: '#7c3aed' }}>
                        Generate 1099
                      </button>
                    ) : doc.status === '1099_generated' || doc.status === '1099_filed' ? (
                      <span className="text-xs text-green-600 font-medium flex items-center gap-1"><Check size={12} />Generated</span>
                    ) : (doc.amount_paid || 0) < 600 ? (
                      <span className="text-xs text-gray-400">Under $600</span>
                    ) : (
                      <span className="text-xs text-gray-400">Need W-9</span>
                    )}
                  </td>
                  <td className="px-5 py-3">
                    <button onClick={() => { setEditing(doc); setForm(doc) }} className="text-xs font-medium underline mr-3" style={{ color: '#b8895a' }}>Edit</button>
                    <button onClick={() => deleteDoc(doc.id)} className="text-xs font-medium text-red-500 underline">Delete</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        </div>
      )}
      </>}

      {/* Add/Edit Vendor Modal */}
      {(creating || !!editing) && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md max-h-[90vh] overflow-y-auto">
            <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between sticky top-0 bg-white">
              <h2 className="font-bold text-gray-900">{editing ? 'Edit Vendor' : 'Add Vendor'}</h2>
              <button onClick={() => { setCreating(false); setEditing(null) }}><X size={18} className="text-gray-400" /></button>
            </div>
            <div className="p-6 space-y-4">
              {[{ l: 'Vendor / Contractor Name *', k: 'vendor_name', t: 'text' }, { l: 'Vendor Email', k: 'vendor_email', t: 'email' }, { l: 'Vendor Phone', k: 'vendor_phone', t: 'tel' }, { l: 'Vendor Address', k: 'vendor_address', t: 'text' }].map(({ l, k, t }) => (
                <div key={k}>
                  <label className={labelCls}>{l}</label>
                  <input type={t} value={(form as any)[k] || ''} onChange={e => setForm(f => ({ ...f, [k]: e.target.value }))} className={inputCls} />
                </div>
              ))}
              <div>
                <label className={labelCls}>EIN / SSN (last 4 for reference)</label>
                <input type="text" value={form.ein_ssn || ''} onChange={e => setForm(f => ({ ...f, ein_ssn: e.target.value }))} className={inputCls} placeholder="XX-XXXXXXX" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={labelCls}>Tax Year</label>
                  <select value={form.tax_year || currentYear} onChange={e => setForm(f => ({ ...f, tax_year: Number(e.target.value) }))} className={inputCls}>
                    {TAX_YEARS.map(y => <option key={y} value={y}>{y}</option>)}
                  </select>
                </div>
                <div>
                  <label className={labelCls}>Amount Paid ($)</label>
                  <input type="number" step="0.01" value={form.amount_paid || ''} onChange={e => setForm(f => ({ ...f, amount_paid: Number(e.target.value) }))} className={inputCls} placeholder="0.00" />
                </div>
              </div>
              <div>
                <label className={labelCls}>Status</label>
                <select value={form.status || 'pending_w9'} onChange={e => setForm(f => ({ ...f, status: e.target.value as any }))} className={inputCls}>
                  {Object.entries(STATUS_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </select>
              </div>
              <div>
                <label className={labelCls}>Notes</label>
                <textarea value={form.notes || ''} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} rows={2} className={inputCls} />
              </div>
              <button onClick={save} disabled={saving || !form.vendor_name}
                className="w-full text-white font-bold py-3 rounded-xl flex items-center justify-center gap-2 disabled:opacity-60" style={{ background: '#b8895a' }}>
                {saving ? <Loader2 size={16} className="animate-spin" /> : null}
                {saving ? 'Saving...' : editing ? 'Save Changes' : 'Add Vendor'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Business (S-corp) tax document repository ────────────────────────────────
interface BizDoc { id: string; category: string; doc_type: string; tax_year: number | null; file_url: string | null; file_name: string | null; notes: string | null; created_at: string }

function BusinessDocuments() {
  const [docs, setDocs] = useState<BizDoc[]>([])
  const [loading, setLoading] = useState(true)
  const [showAdd, setShowAdd] = useState(false)
  const [form, setForm] = useState({ category: BIZ_TAX_CATALOG[0].group, doc_type: BIZ_TAX_CATALOG[0].types[0], tax_year: String(new Date().getFullYear()), notes: '' })
  const [file, setFile] = useState<File | null>(null)
  const [saving, setSaving] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  useEffect(() => { load() }, [])
  async function load() {
    setLoading(true)
    try { const r = await fetch('/api/business-tax-docs'); const d = await r.json(); setDocs(Array.isArray(d) ? d : []) } catch {}
    setLoading(false)
  }
  const typesForCategory = (cat: string) => BIZ_TAX_CATALOG.find(c => c.group === cat)?.types || []
  const resetForm = () => setForm({ category: BIZ_TAX_CATALOG[0].group, doc_type: BIZ_TAX_CATALOG[0].types[0], tax_year: String(new Date().getFullYear()), notes: '' })

  async function save() {
    if (!form.category || !form.doc_type) return
    setSaving(true)
    try {
      let file_path: string | null = null, file_url: string | null = null, file_name: string | null = null
      if (file) {
        const fd = new FormData(); fd.append('file', file)
        const up = await fetch('/api/business-tax-docs?action=upload', { method: 'POST', body: fd })
        const ud = await up.json()
        if (up.ok) { file_path = ud.path; file_url = ud.url; file_name = file.name }
        else { alert(ud.error || 'Upload failed'); setSaving(false); return }
      }
      const res = await fetch('/api/business-tax-docs', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ category: form.category, doc_type: form.doc_type, tax_year: form.tax_year ? Number(form.tax_year) : null, notes: form.notes || null, file_path, file_url, file_name }),
      })
      if (res.ok) { await load(); setShowAdd(false); setFile(null); resetForm(); if (fileRef.current) fileRef.current.value = '' }
      else alert('Failed to save')
    } finally { setSaving(false) }
  }
  async function del(id: string) {
    if (!confirm('Delete this document?')) return
    await fetch('/api/business-tax-docs', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id }) })
    await load()
  }

  const inputCls = 'w-full px-3 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:border-blue-400'
  const labelCls = 'block text-sm font-semibold text-gray-700 mb-1'

  return (
    <div>
      <div className="flex justify-between items-center mb-4 flex-wrap gap-3">
        <p className="text-sm text-gray-500">Store your S-corp tax documents — returns, elections, payroll filings, and more.</p>
        <button onClick={() => { resetForm(); setFile(null); setShowAdd(true) }} className="flex items-center gap-2 text-white font-semibold px-4 py-2.5 rounded-xl shadow-md" style={{ background: '#b8895a' }}><Plus size={16} /> Add Document</button>
      </div>

      {loading ? (
        <div className="flex justify-center py-16"><Loader2 className="animate-spin" style={{ color: '#b8895a' }} size={28} /></div>
      ) : (
        <div className="space-y-5">
          {BIZ_TAX_CATALOG.map(cat => {
            const items = docs.filter(d => d.category === cat.group)
            return (
              <div key={cat.group}>
                <h3 className="text-xs font-bold uppercase tracking-wider text-gray-400 mb-2">{cat.group} <span className="text-gray-300">({items.length})</span></h3>
                {items.length === 0 ? (
                  <p className="text-xs text-gray-300 italic mb-2">No documents yet</p>
                ) : (
                  <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
                    {items.map(d => (
                      <div key={d.id} className="flex items-center gap-3 px-4 py-3 border-b border-gray-50 last:border-0">
                        <FileText size={16} className="text-gray-300 flex-shrink-0" />
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-semibold text-gray-900">{d.doc_type}{d.tax_year ? ` · ${d.tax_year}` : ''}</div>
                          {d.notes && <div className="text-xs text-gray-400 truncate">{d.notes}</div>}
                        </div>
                        {d.file_url && <a href={d.file_url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 text-xs font-medium underline whitespace-nowrap" style={{ color: '#b8895a' }}><Download size={12} /> {d.file_name || 'File'}</a>}
                        <button onClick={() => del(d.id)} className="text-gray-300 hover:text-red-500 p-1 flex-shrink-0"><Trash2 size={14} /></button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {showAdd && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md max-h-[90vh] overflow-y-auto">
            <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between sticky top-0 bg-white">
              <h2 className="font-bold text-gray-900">Add Business Document</h2>
              <button onClick={() => setShowAdd(false)}><X size={18} className="text-gray-400" /></button>
            </div>
            <div className="p-6 space-y-4">
              <div><label className={labelCls}>Category</label>
                <select value={form.category} onChange={e => setForm(f => ({ ...f, category: e.target.value, doc_type: (BIZ_TAX_CATALOG.find(c => c.group === e.target.value)?.types || [''])[0] }))} className={inputCls}>
                  {BIZ_TAX_CATALOG.map(c => <option key={c.group} value={c.group}>{c.group}</option>)}
                </select>
              </div>
              <div><label className={labelCls}>Document Type</label>
                <select value={form.doc_type} onChange={e => setForm(f => ({ ...f, doc_type: e.target.value }))} className={inputCls}>
                  {typesForCategory(form.category).map(t => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
              <div><label className={labelCls}>Tax Year (optional)</label>
                <input type="number" value={form.tax_year} onChange={e => setForm(f => ({ ...f, tax_year: e.target.value }))} className={inputCls} placeholder="2026" />
              </div>
              <div><label className={labelCls}>File</label>
                <label className="flex items-center gap-3 border-2 border-dashed border-gray-200 rounded-xl px-4 py-4 cursor-pointer hover:bg-gray-50">
                  <Upload size={18} className="text-gray-400 flex-shrink-0" />
                  <span className="text-sm font-semibold text-gray-700 truncate">{file ? file.name : 'Choose file (PDF, image, doc)'}</span>
                  <input ref={fileRef} type="file" accept=".pdf,.png,.jpg,.jpeg,.doc,.docx,.xls,.xlsx" className="hidden" onChange={e => setFile(e.target.files?.[0] || null)} />
                </label>
              </div>
              <div><label className={labelCls}>Notes</label>
                <textarea value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} rows={2} className={inputCls} />
              </div>
              <button onClick={save} disabled={saving} className="w-full text-white font-bold py-3 rounded-xl flex items-center justify-center gap-2 disabled:opacity-60" style={{ background: '#b8895a' }}>
                {saving ? <Loader2 size={16} className="animate-spin" /> : <Plus size={16} />} {saving ? 'Saving…' : 'Add Document'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
