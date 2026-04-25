'use client'
import { useEffect, useState, useRef } from 'react'
import { FileText, Upload, Trash2, ExternalLink, Plus, Loader2, X, AlertCircle, CheckCircle2, Clock, ShieldCheck, File, Mail, ScanLine } from 'lucide-react'
import { formatDateShort } from '@/lib/utils'

const DOC_TYPES = [
  { value: 'all', label: 'All Documents' },
  { value: 'coi', label: 'Certificates of Insurance' },
  { value: 'w9', label: 'W-9 Forms' },
  { value: 'contract', label: 'Contracts' },
  { value: 'license', label: 'Licenses' },
  { value: 'other', label: 'Other' },
]

const TYPE_STYLES: Record<string, { bg: string; text: string; label: string }> = {
  coi:      { bg: 'bg-blue-100',   text: 'text-blue-700',   label: 'COI' },
  w9:       { bg: 'bg-purple-100', text: 'text-purple-700', label: 'W-9' },
  contract: { bg: 'bg-amber-100',  text: 'text-amber-700',  label: 'Contract' },
  license:  { bg: 'bg-teal-100',   text: 'text-teal-700',   label: 'License' },
  other:    { bg: 'bg-gray-100',   text: 'text-gray-600',   label: 'Doc' },
}

const inputCls = 'w-full px-3 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:border-blue-400'

function daysUntilExpiry(expiry: string | null): number | null {
  if (!expiry) return null
  const diff = new Date(expiry).getTime() - Date.now()
  return Math.ceil(diff / (1000 * 60 * 60 * 24))
}

export default function DocumentsPage() {
  const [docs, setDocs] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [typeFilter, setTypeFilter] = useState('all')
  const [showUpload, setShowUpload] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [form, setForm] = useState({ doc_type: 'coi', vendor_name: '', expiry_date: '', notes: '' })
  const fileRef = useRef<HTMLInputElement>(null)
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editForm, setEditForm] = useState<any>({})
  const [savingEdit, setSavingEdit] = useState(false)

  // Email scan
  const [scanning, setScanning] = useState(false)
  const [scanResult, setScanResult] = useState<any | null>(null)
  const [scanError, setScanError] = useState<string | null>(null)
  const [needsAuth, setNeedsAuth] = useState(false)
  const [authUrl, setAuthUrl] = useState<string | null>(null)
  const [daysBack, setDaysBack] = useState(30)

  useEffect(() => { load() }, [typeFilter])

  async function runScan() {
    setScanning(true)
    setScanResult(null)
    setScanError(null)
    setNeedsAuth(false)
    try {
      const res = await fetch('/api/email-scan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ days_back: daysBack }),
      })
      const d = await res.json()
      if (!res.ok) {
        if (d.needsAuth) {
          setNeedsAuth(true)
          setScanError(d.message || 'Gmail access not authorized.')
          const authRes = await fetch('/api/email-scan?action=auth-url')
          const authData = await authRes.json()
          if (authData.authUrl) setAuthUrl(authData.authUrl)
        } else {
          setScanError(d.error || 'Scan failed')
        }
        return
      }
      setScanResult(d)
      if (d.totalImported > 0) await load()
    } catch (e: any) {
      setScanError(e.message || 'Scan failed')
    } finally {
      setScanning(false)
    }
  }

  async function load() {
    setLoading(true)
    const q = typeFilter !== 'all' ? `?type=${typeFilter}` : ''
    const res = await fetch(`/api/vendor-documents${q}`)
    const d = await res.json()
    setDocs(Array.isArray(d) ? d : [])
    setLoading(false)
  }

  async function uploadDoc() {
    if (!selectedFile) { alert('Select a file first'); return }
    setUploading(true)
    try {
      const fd = new FormData()
      fd.append('file', selectedFile)
      fd.append('doc_type', form.doc_type)
      if (form.vendor_name) fd.append('vendor_name', form.vendor_name)
      if (form.expiry_date) fd.append('expiry_date', form.expiry_date)
      if (form.notes) fd.append('notes', form.notes)
      const res = await fetch('/api/vendor-documents?action=upload', { method: 'POST', body: fd })
      if (!res.ok) { const e = await res.json(); alert(e.error || 'Upload failed'); return }
      setShowUpload(false)
      setSelectedFile(null)
      setForm({ doc_type: 'coi', vendor_name: '', expiry_date: '', notes: '' })
      if (fileRef.current) fileRef.current.value = ''
      await load()
    } finally { setUploading(false) }
  }

  async function deleteDoc(id: string, name: string) {
    if (!confirm(`Delete "${name}"?`)) return
    await fetch(`/api/vendor-documents?id=${id}`, { method: 'DELETE' })
    await load()
  }

  async function saveEdit() {
    if (!editingId) return
    setSavingEdit(true)
    try {
      await fetch('/api/vendor-documents', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: editingId, ...editForm }),
      })
      setEditingId(null)
      await load()
    } finally { setSavingEdit(false) }
  }

  // Split docs into expiring soon vs rest
  const expiringSoon = docs.filter(d => {
    const days = daysUntilExpiry(d.expiry_date)
    return days !== null && days <= 30 && days >= 0
  })
  const expired = docs.filter(d => {
    const days = daysUntilExpiry(d.expiry_date)
    return days !== null && days < 0
  })

  return (
    <div className="p-6 md:p-8 pt-16 md:pt-8 max-w-5xl">
      {/* Header */}
      <div className="flex items-start justify-between mb-6 flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-extrabold text-gray-900">Vendor Documents</h1>
          <p className="text-sm text-gray-500 mt-0.5">W-9s, certificates of insurance, contracts — auto-imported from email or uploaded manually</p>
        </div>
        <button onClick={() => setShowUpload(true)}
          className="flex items-center gap-2 text-white font-semibold px-4 py-2.5 rounded-xl shadow-md"
          style={{ background: '#185FA5' }}>
          <Plus size={14} /> Upload Document
        </button>
      </div>

      {/* ── Email Scan Panel ── */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 mb-5">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="flex items-start gap-3">
            <div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: '#EBF3FC' }}>
              <Mail size={16} style={{ color: '#185FA5' }} />
            </div>
            <div>
              <p className="font-bold text-gray-900 text-sm">Scan office@thegasologist.com</p>
              <p className="text-xs text-gray-500 mt-0.5">Finds W-9s, COIs, and receipts — imports them automatically</p>
            </div>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <select value={daysBack} onChange={e => setDaysBack(Number(e.target.value))}
              className="text-sm px-3 py-2 rounded-xl border border-gray-200 focus:outline-none">
              <option value={7}>Last 7 days</option>
              <option value={30}>Last 30 days</option>
              <option value={60}>Last 60 days</option>
              <option value={90}>Last 90 days</option>
            </select>
            <button onClick={runScan} disabled={scanning}
              className="flex items-center gap-2 text-white font-semibold px-4 py-2 rounded-xl shadow-sm disabled:opacity-60 text-sm"
              style={{ background: '#185FA5' }}>
              {scanning ? <Loader2 size={14} className="animate-spin" /> : <ScanLine size={14} />}
              {scanning ? 'Scanning...' : 'Scan Email'}
            </button>
          </div>
        </div>

        {/* Needs Gmail auth */}
        {needsAuth && (
          <div className="mt-4 bg-amber-50 border border-amber-200 rounded-xl p-4">
            <div className="flex items-start gap-3">
              <AlertCircle size={15} className="text-amber-600 flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-bold text-amber-800 mb-1">Gmail Permission Required</p>
                <p className="text-xs text-amber-700 mb-3">{scanError}</p>
                <p className="text-xs text-amber-700 mb-3">
                  Your current Google token only has Calendar access. Click below to re-authorize —
                  Google will redirect back and show your new refresh token.
                  Copy it and update <code className="bg-amber-100 px-1 rounded font-mono">GOOGLE_REFRESH_TOKEN</code> in your Flux config, then redeploy.
                </p>
                {authUrl && (
                  <a href={authUrl} target="_blank" rel="noopener noreferrer"
                    className="inline-flex items-center gap-2 bg-amber-600 hover:bg-amber-700 text-white font-semibold text-xs px-4 py-2 rounded-lg">
                    <ExternalLink size={12} /> Authorize Gmail Access
                  </a>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Generic error */}
        {scanError && !needsAuth && (
          <div className="mt-3 flex items-center gap-2 bg-red-50 border border-red-200 rounded-xl p-3">
            <AlertCircle size={14} className="text-red-500 flex-shrink-0" />
            <p className="text-sm text-red-700">{scanError}</p>
          </div>
        )}

        {/* Scan results */}
        {scanResult && !needsAuth && (
          <div className="mt-4 space-y-3">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {[
                { label: 'Emails Found', val: scanResult.totalFound },
                { label: 'Already Imported', val: scanResult.alreadyProcessed },
                { label: 'New Checked', val: scanResult.newChecked },
                { label: 'Documents Imported', val: scanResult.totalImported, highlight: scanResult.totalImported > 0 },
              ].map(c => (
                <div key={c.label} className="bg-gray-50 rounded-xl p-3 text-center">
                  <div className={`text-2xl font-extrabold ${c.highlight ? 'text-green-700' : 'text-gray-700'}`}>{c.val ?? 0}</div>
                  <div className="text-xs text-gray-500 mt-0.5">{c.label}</div>
                </div>
              ))}
            </div>
            {scanResult.results?.length > 0 && (
              <div className="bg-green-50 border border-green-100 rounded-xl p-3">
                <p className="text-xs font-bold text-green-800 mb-2">✅ Imported from:</p>
                {scanResult.results.map((r: any, i: number) => (
                  <div key={i} className="flex items-center gap-2 text-xs text-green-800 mb-1">
                    <Mail size={11} className="text-green-500 flex-shrink-0" />
                    <span className="font-medium truncate">{r.subject}</span>
                    <span className="text-green-600 flex-shrink-0 ml-auto">· {r.date}</span>
                  </div>
                ))}
              </div>
            )}
            {scanResult.totalImported === 0 && scanResult.newChecked > 0 && (
              <p className="text-xs text-gray-500 text-center py-1">
                No W-9, COI, or receipt attachments found in new emails for the selected date range.
              </p>
            )}
            {scanResult.totalFound === 0 && (
              <p className="text-xs text-gray-500 text-center py-1">
                No matching emails found in the last {daysBack} days.
              </p>
            )}
          </div>
        )}
      </div>

      {/* Expiry alerts */}
      {(expiringSoon.length > 0 || expired.length > 0) && (
        <div className="space-y-2 mb-5">
          {expired.length > 0 && (
            <div className="flex items-center gap-3 bg-red-50 border border-red-200 rounded-xl px-4 py-3">
              <AlertCircle size={15} className="text-red-500 flex-shrink-0" />
              <p className="text-sm text-red-700 font-semibold">
                {expired.length} document{expired.length !== 1 ? 's' : ''} expired —
                <span className="font-normal ml-1">{expired.map(d => d.vendor_name || d.file_name).join(', ')}</span>
              </p>
            </div>
          )}
          {expiringSoon.length > 0 && (
            <div className="flex items-center gap-3 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3">
              <Clock size={15} className="text-amber-600 flex-shrink-0" />
              <p className="text-sm text-amber-700 font-semibold">
                {expiringSoon.length} document{expiringSoon.length !== 1 ? 's' : ''} expiring within 30 days —
                <span className="font-normal ml-1">{expiringSoon.map(d => d.vendor_name || d.file_name).join(', ')}</span>
              </p>
            </div>
          )}
        </div>
      )}

      {/* Type filter tabs */}
      <div className="flex gap-1 bg-gray-100 rounded-xl p-1 w-fit mb-5 flex-wrap">
        {DOC_TYPES.map(t => (
          <button key={t.value} onClick={() => setTypeFilter(t.value)}
            className={`px-4 py-2 rounded-lg text-sm font-semibold transition-all ${typeFilter === t.value ? 'bg-white shadow-sm' : 'text-gray-500'}`}
            style={{ color: typeFilter === t.value ? '#185FA5' : undefined }}>
            {t.label}
          </button>
        ))}
      </div>

      {/* Document list */}
      {loading ? (
        <div className="flex justify-center py-20"><Loader2 size={22} className="animate-spin" style={{ color: '#185FA5' }} /></div>
      ) : docs.length === 0 ? (
        <div className="text-center py-20 text-gray-400">
          <FileText size={30} className="mx-auto mb-2 opacity-30" />
          <p className="text-sm">No documents yet</p>
          <p className="text-xs mt-1">Documents auto-import from the email scanner in Bookkeeping, or upload manually above</p>
        </div>
      ) : (
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-100">
                {['Type', 'Vendor / Contractor', 'File', 'Issued', 'Expiry', 'Source', ''].map(h => (
                  <th key={h} className="text-left px-4 py-3 text-xs font-semibold text-gray-600 uppercase tracking-wider">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {docs.map(doc => {
                const ts = TYPE_STYLES[doc.doc_type] || TYPE_STYLES.other
                const days = daysUntilExpiry(doc.expiry_date)
                const isExpired = days !== null && days < 0
                const isExpiring = days !== null && days >= 0 && days <= 30
                const isEditing = editingId === doc.id

                return (
                  <tr key={doc.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3">
                      <span className={`text-xs px-2.5 py-1 rounded-full font-semibold ${ts.bg} ${ts.text}`}>
                        {ts.label}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      {isEditing ? (
                        <input value={editForm.vendor_name || ''} onChange={e => setEditForm((f: any) => ({ ...f, vendor_name: e.target.value }))}
                          className="px-2 py-1 rounded-lg border border-gray-200 text-sm w-40 focus:outline-none" />
                      ) : (
                        <span className="font-semibold text-gray-800 text-xs">
                          {doc.vendor_name || <span className="text-gray-400 italic">Unknown vendor</span>}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <a href={doc.file_url} target="_blank" rel="noopener noreferrer"
                        className="flex items-center gap-1.5 text-xs font-medium hover:underline truncate max-w-36"
                        style={{ color: '#185FA5' }}>
                        <File size={12} />
                        {doc.file_name || 'View file'}
                        <ExternalLink size={10} className="opacity-60" />
                      </a>
                    </td>
                    <td className="px-4 py-3 text-xs text-gray-500">
                      {doc.issued_date ? formatDateShort(doc.issued_date) : '—'}
                    </td>
                    <td className="px-4 py-3">
                      {isEditing ? (
                        <input type="date" value={editForm.expiry_date || ''} onChange={e => setEditForm((f: any) => ({ ...f, expiry_date: e.target.value }))}
                          className="px-2 py-1 rounded-lg border border-gray-200 text-sm focus:outline-none" />
                      ) : doc.expiry_date ? (
                        <span className={`text-xs font-semibold ${isExpired ? 'text-red-600' : isExpiring ? 'text-amber-600' : 'text-gray-600'}`}>
                          {isExpired ? '⚠️ ' : isExpiring ? '⏰ ' : ''}{formatDateShort(doc.expiry_date)}
                          {days !== null && !isExpired && <span className="ml-1 font-normal text-gray-400">({days}d)</span>}
                        </span>
                      ) : (
                        <span className="text-xs text-gray-400">No expiry</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`text-xs px-2 py-0.5 rounded-full ${doc.source === 'email' ? 'bg-blue-50 text-blue-600' : 'bg-gray-100 text-gray-500'}`}>
                        {doc.source === 'email' ? '📧 Email' : '📤 Manual'}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1.5">
                        {isEditing ? (
                          <>
                            <button onClick={saveEdit} disabled={savingEdit}
                              className="text-green-500 hover:text-green-700 disabled:opacity-40">
                              {savingEdit ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle2 size={14} />}
                            </button>
                            <button onClick={() => setEditingId(null)} className="text-gray-400 hover:text-gray-600">
                              <X size={14} />
                            </button>
                          </>
                        ) : (
                          <>
                            <button onClick={() => { setEditingId(doc.id); setEditForm({ vendor_name: doc.vendor_name || '', expiry_date: doc.expiry_date || '' }) }}
                              className="text-gray-400 hover:text-blue-600 text-xs font-semibold">Edit</button>
                            <button onClick={() => deleteDoc(doc.id, doc.vendor_name || doc.file_name || 'this document')}
                              className="text-gray-400 hover:text-red-500">
                              <Trash2 size={13} />
                            </button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Upload modal */}
      {showUpload && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
            <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
              <h2 className="font-bold text-gray-900">Upload Document</h2>
              <button onClick={() => { setShowUpload(false); setSelectedFile(null) }}><X size={18} className="text-gray-400" /></button>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">Document Type</label>
                <select value={form.doc_type} onChange={e => setForm(f => ({ ...f, doc_type: e.target.value }))} className={inputCls}>
                  <option value="coi">Certificate of Insurance (COI)</option>
                  <option value="w9">W-9 Form</option>
                  <option value="contract">Contract</option>
                  <option value="license">License</option>
                  <option value="other">Other</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">Vendor / Contractor Name</label>
                <input value={form.vendor_name} onChange={e => setForm(f => ({ ...f, vendor_name: e.target.value }))}
                  placeholder="ACME Plumbing LLC" className={inputCls} />
              </div>
              {(form.doc_type === 'coi' || form.doc_type === 'contract' || form.doc_type === 'license') && (
                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1">
                    Expiry Date {form.doc_type === 'coi' ? '(important for insurance tracking)' : ''}
                  </label>
                  <input type="date" value={form.expiry_date} onChange={e => setForm(f => ({ ...f, expiry_date: e.target.value }))} className={inputCls} />
                </div>
              )}
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">File (PDF, image)</label>
                <label className={`flex items-center gap-3 border-2 border-dashed border-gray-200 rounded-xl px-4 py-5 cursor-pointer hover:bg-gray-50 hover:border-blue-300 transition-all`}>
                  <File size={20} className="text-gray-400 flex-shrink-0" />
                  <div>
                    <p className="text-sm font-semibold text-gray-700">{selectedFile ? selectedFile.name : 'Choose file'}</p>
                    <p className="text-xs text-gray-400">PDF, JPG, PNG</p>
                  </div>
                  <input ref={fileRef} type="file" accept=".pdf,.jpg,.jpeg,.png" className="hidden"
                    onChange={e => setSelectedFile(e.target.files?.[0] || null)} />
                </label>
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">Notes (optional)</label>
                <textarea value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} rows={2} className={inputCls} />
              </div>
            </div>
            <div className="px-6 pb-5 flex gap-3">
              <button onClick={uploadDoc} disabled={uploading || !selectedFile}
                className="flex-1 flex items-center justify-center gap-2 text-white font-bold py-2.5 rounded-xl disabled:opacity-60 shadow-sm"
                style={{ background: '#185FA5' }}>
                {uploading ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />}
                {uploading ? 'Uploading...' : 'Upload'}
              </button>
              <button onClick={() => { setShowUpload(false); setSelectedFile(null) }}
                className="px-4 py-2.5 rounded-xl border border-gray-200 text-sm font-semibold">Cancel</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
