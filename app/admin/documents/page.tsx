'use client'
import { useEffect, useState, useRef } from 'react'
import { FileText, Upload, Trash2, ExternalLink, Plus, Loader2, X, AlertCircle, CheckCircle2, Clock, ShieldCheck, File, Mail, ScanLine, FolderOpen, PenLine, Send, RefreshCw, Ban, Copy, CheckCheck } from 'lucide-react'
import { formatDateShort } from '@/lib/utils'
import DrivePicker from '@/components/admin/DrivePicker'

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

const SIG_STATUS_STYLES: Record<string, { bg: string; text: string; label: string; dot: string }> = {
  pending:  { bg: 'bg-amber-100',  text: 'text-amber-700',  dot: 'bg-amber-400',  label: 'Pending' },
  signed:   { bg: 'bg-green-100',  text: 'text-green-700',  dot: 'bg-green-500',  label: 'Signed' },
  declined: { bg: 'bg-red-100',    text: 'text-red-700',    dot: 'bg-red-500',    label: 'Declined' },
  expired:  { bg: 'bg-gray-100',   text: 'text-gray-500',   dot: 'bg-gray-400',   label: 'Expired' },
  void:     { bg: 'bg-gray-100',   text: 'text-gray-500',   dot: 'bg-gray-300',   label: 'Void' },
}

export default function DocumentsPage() {
  const [mainTab, setMainTab] = useState<'vendor' | 'signatures'>('vendor')

  // ── Vendor docs state ────────────────────────────────────────────────────
  const [docs, setDocs] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [typeFilter, setTypeFilter] = useState('all')
  const [showUpload, setShowUpload] = useState(false)
  const [showDrivePicker, setShowDrivePicker] = useState(false)
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
  const [daysBack, setDaysBack] = useState(7)

  // ── Signature requests state ──────────────────────────────────────────────
  const [sigRequests, setSigRequests] = useState<any[]>([])
  const [sigLoading, setSigLoading] = useState(false)
  const [showSendModal, setShowSendModal] = useState(false)
  const [sigForm, setSigForm] = useState({ document_name: '', signer_name: '', signer_email: '', sender_message: '', document_text: '', expiry_days: '30', content_type: 'text' as 'text'|'file'|'url', document_url_input: '' })
  const [sigFile, setSigFile] = useState<File | null>(null)
  const sigFileRef = useRef<HTMLInputElement>(null)
  const [sigSending, setSigSending] = useState(false)
  const [sigSendError, setSigSendError] = useState<string | null>(null)
  const [sigSendSuccess, setSigSendSuccess] = useState<{ signingUrl: string } | null>(null)
  const [copiedLink, setCopiedLink] = useState<string | null>(null)
  const [viewingSig, setViewingSig] = useState<any | null>(null)
  const [resendingId, setResendingId] = useState<string | null>(null)
  const [voidingId, setVoidingId] = useState<string | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)

  useEffect(() => { load() }, [typeFilter])
  useEffect(() => { if (mainTab === 'signatures') loadSigRequests() }, [mainTab])

  async function loadSigRequests() {
    setSigLoading(true)
    const res = await fetch('/api/signature-requests?action=list')
    const d = await res.json()
    setSigRequests(Array.isArray(d) ? d : [])
    setSigLoading(false)
  }

  async function sendSignatureRequest() {
    setSigSending(true)
    setSigSendError(null)
    setSigSendSuccess(null)
    try {
      const fd = new FormData()
      fd.append('document_name', sigForm.document_name)
      fd.append('signer_name', sigForm.signer_name)
      fd.append('signer_email', sigForm.signer_email)
      if (sigForm.sender_message) fd.append('sender_message', sigForm.sender_message)
      if (sigForm.expiry_days) fd.append('expiry_days', sigForm.expiry_days)
      if (sigForm.content_type === 'text' && sigForm.document_text) fd.append('document_text', sigForm.document_text)
      if (sigForm.content_type === 'url' && sigForm.document_url_input) fd.append('document_text', `Document available at: ${sigForm.document_url_input}`)
      if (sigForm.content_type === 'file' && sigFile) fd.append('file', sigFile)
      const res = await fetch('/api/signature-requests?action=send', { method: 'POST', body: fd })
      const d = await res.json()
      if (!res.ok) { setSigSendError(d.error || 'Failed to send'); return }
      setSigSendSuccess({ signingUrl: d.signingUrl })
      await loadSigRequests()
    } catch (e: any) {
      setSigSendError(e.message || 'Failed to send')
    } finally {
      setSigSending(false)
    }
  }

  function resetSigModal() {
    setSigForm({ document_name: '', signer_name: '', signer_email: '', sender_message: '', document_text: '', expiry_days: '30', content_type: 'text', document_url_input: '' })
    setSigFile(null)
    setSigSendError(null)
    setSigSendSuccess(null)
    setShowSendModal(false)
    if (sigFileRef.current) sigFileRef.current.value = ''
  }

  async function resendRequest(id: string) {
    setResendingId(id)
    try {
      const res = await fetch('/api/signature-requests?action=resend', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id }),
      })
      const d = await res.json()
      if (!res.ok) alert(d.error || 'Resend failed')
      else alert('✅ Signing email resent!')
    } finally { setResendingId(null) }
  }

  async function voidRequest(id: string, name: string) {
    if (!confirm(`Void the signature request for "${name}"? The signing link will stop working.`)) return
    setVoidingId(id)
    try {
      await fetch('/api/signature-requests?action=void', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id }),
      })
      await loadSigRequests()
    } finally { setVoidingId(null) }
  }

  async function deleteRequest(id: string, name: string) {
    if (!confirm(`Delete this signature request for "${name}"?`)) return
    setDeletingId(id)
    try {
      await fetch(`/api/signature-requests?id=${id}`, { method: 'DELETE' })
      await loadSigRequests()
    } finally { setDeletingId(null) }
  }

  function copyLink(url: string) {
    navigator.clipboard.writeText(url).then(() => {
      setCopiedLink(url)
      setTimeout(() => setCopiedLink(null), 2000)
    })
  }

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
      const ct = res.headers.get('content-type') || ''
      const raw = await res.text()
      // Server returned HTML — likely an ingress timeout (504) or 404 page
      if (!ct.includes('application/json')) {
        if (res.status === 504) {
          setScanError(`Scan timed out at the gateway (504). Try a shorter window — pick "Last 7 days" first, then expand if it works.`)
        } else if (res.status === 404) {
          setScanError(`Scan endpoint not found (404). The new image may not be deployed yet.`)
        } else {
          setScanError(`Server returned ${res.status}. ${raw.slice(0, 200)}`)
        }
        return
      }
      const d = JSON.parse(raw)
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
      <div className="flex items-start justify-between mb-5 flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-extrabold text-gray-900">Documents</h1>
          <p className="text-sm text-gray-500 mt-0.5">Vendor documents, contracts, and digital signature requests</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {mainTab === 'vendor' && (
            <>
              <button onClick={() => setShowDrivePicker(true)}
                className="flex items-center gap-2 font-semibold px-4 py-2.5 rounded-xl shadow-sm border"
                style={{ background: 'white', color: '#2f5a5e', borderColor: '#2f5a5e' }}>
                <FolderOpen size={14} /> Import from Drive
              </button>
              <button onClick={() => setShowUpload(true)}
                className="flex items-center gap-2 text-white font-semibold px-4 py-2.5 rounded-xl shadow-md"
                style={{ background: '#b8895a' }}>
                <Plus size={14} /> Upload Document
              </button>
            </>
          )}
          {mainTab === 'signatures' && (
            <button onClick={() => { setSigSendSuccess(null); setShowSendModal(true) }}
              className="flex items-center gap-2 text-white font-semibold px-4 py-2.5 rounded-xl shadow-md"
              style={{ background: '#2f5a5e' }}>
              <PenLine size={14} /> Send for Signature
            </button>
          )}
        </div>
      </div>

      {/* Main tabs */}
      <div className="flex gap-1 bg-gray-100 rounded-xl p-1 w-fit mb-6">
        <button onClick={() => setMainTab('vendor')}
          className={`px-5 py-2.5 rounded-lg text-sm font-semibold transition-all flex items-center gap-2 ${mainTab === 'vendor' ? 'bg-white shadow-sm' : 'text-gray-500'}`}
          style={{ color: mainTab === 'vendor' ? '#b8895a' : undefined }}>
          <FileText size={14} /> Vendor Documents
        </button>
        <button onClick={() => setMainTab('signatures')}
          className={`px-5 py-2.5 rounded-lg text-sm font-semibold transition-all flex items-center gap-2 ${mainTab === 'signatures' ? 'bg-white shadow-sm' : 'text-gray-500'}`}
          style={{ color: mainTab === 'signatures' ? '#2f5a5e' : undefined }}>
          <PenLine size={14} /> Signature Requests
          {sigRequests.filter(r => r.status === 'pending').length > 0 && (
            <span className="ml-1 px-1.5 py-0.5 rounded-full text-xs font-bold bg-amber-100 text-amber-700">
              {sigRequests.filter(r => r.status === 'pending').length}
            </span>
          )}
        </button>
      </div>
      {mainTab === 'vendor' && (
      <><DrivePicker
        open={showDrivePicker}
        onClose={() => setShowDrivePicker(false)}
        defaultTarget="document"
        onImported={() => { load() }}
      />

      {/* ── Email Scan Panel ── */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 mb-5">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="flex items-start gap-3">
            <div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: '#f3ede3' }}>
              <Mail size={16} style={{ color: '#b8895a' }} />
            </div>
            <div>
              <p className="font-bold text-gray-900 text-sm">Scan Lacey@LaceyNPrice.com</p>
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
              style={{ background: '#b8895a' }}>
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
            style={{ color: typeFilter === t.value ? '#b8895a' : undefined }}>
            {t.label}
          </button>
        ))}
      </div>

      {/* Document list */}
      {loading ? (
        <div className="flex justify-center py-20"><Loader2 size={22} className="animate-spin" style={{ color: '#b8895a' }} /></div>
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
                      {isEditing ? (
                        <select value={editForm.doc_type || doc.doc_type} onChange={e => setEditForm((f: any) => ({ ...f, doc_type: e.target.value }))}
                          className="px-2 py-1 rounded-lg border border-gray-200 text-xs focus:outline-none focus:ring-2 focus:border-blue-400">
                          <option value="coi">COI</option>
                          <option value="w9">W-9</option>
                          <option value="contract">Contract</option>
                          <option value="license">License</option>
                          <option value="other">Other</option>
                        </select>
                      ) : (
                        <span className={`text-xs px-2.5 py-1 rounded-full font-semibold ${ts.bg} ${ts.text}`}>
                          {ts.label}
                        </span>
                      )}
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
                        style={{ color: '#b8895a' }}>
                        <File size={12} />
                        {doc.file_name || 'View file'}
                        <ExternalLink size={10} className="opacity-60" />
                      </a>
                    </td>
                    <td className="px-4 py-3 text-xs text-gray-500">
                      {isEditing ? (
                        <input type="date" value={editForm.issued_date || ''} onChange={e => setEditForm((f: any) => ({ ...f, issued_date: e.target.value }))}
                          className="px-2 py-1 rounded-lg border border-gray-200 text-xs focus:outline-none" />
                      ) : (
                        doc.issued_date ? formatDateShort(doc.issued_date) : '—'
                      )}
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
                            <button onClick={() => { setEditingId(doc.id); setEditForm({ vendor_name: doc.vendor_name || '', expiry_date: doc.expiry_date || '', issued_date: doc.issued_date || '', doc_type: doc.doc_type || 'other' }) }}
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
                style={{ background: '#b8895a' }}>
                {uploading ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />}
                {uploading ? 'Uploading...' : 'Upload'}
              </button>
              <button onClick={() => { setShowUpload(false); setSelectedFile(null) }}
                className="px-4 py-2.5 rounded-xl border border-gray-200 text-sm font-semibold">Cancel</button>
            </div>
          </div>
        </div>
      )}
      </>) /* end mainTab === 'vendor' */}

      {/* ── Signature Requests Tab ─────────────────────────────────────────── */}
      {mainTab === 'signatures' && (
        <div className="space-y-5">
          {/* Stats row */}
          {sigRequests.length > 0 && (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {[
                { label: 'Pending',  val: sigRequests.filter(r => r.status === 'pending').length,  color: 'text-amber-700',  bg: 'bg-amber-50' },
                { label: 'Signed',   val: sigRequests.filter(r => r.status === 'signed').length,   color: 'text-green-700',  bg: 'bg-green-50' },
                { label: 'Declined', val: sigRequests.filter(r => r.status === 'declined').length, color: 'text-red-600',    bg: 'bg-red-50' },
                { label: 'Total',    val: sigRequests.length,                                       color: 'text-gray-700',   bg: 'bg-gray-50' },
              ].map(s => (
                <div key={s.label} className={`${s.bg} rounded-2xl p-4 text-center`}>
                  <div className={`text-2xl font-extrabold ${s.color}`}>{s.val}</div>
                  <div className="text-xs text-gray-500 mt-0.5">{s.label}</div>
                </div>
              ))}
            </div>
          )}

          {sigLoading ? (
            <div className="flex justify-center py-16"><Loader2 size={22} className="animate-spin text-gray-400" /></div>
          ) : sigRequests.length === 0 ? (
            <div className="text-center py-20 text-gray-400 bg-white rounded-2xl border border-gray-100 shadow-sm">
              <PenLine size={32} className="mx-auto mb-3 opacity-30" />
              <p className="text-sm font-medium">No signature requests yet</p>
              <p className="text-xs mt-1">Click "Send for Signature" to send an agreement to a client or contractor</p>
            </div>
          ) : (
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-100">
                    {['Document', 'Signer', 'Status', 'Sent', 'Signed', ''].map(h => (
                      <th key={h} className="text-left px-4 py-3 text-xs font-semibold text-gray-600 uppercase tracking-wider">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {sigRequests.map(req => {
                    const ss = SIG_STATUS_STYLES[req.status] || SIG_STATUS_STYLES.pending
                    const signingUrl = `${typeof window !== 'undefined' ? window.location.origin : ''}/sign/${req.token}`
                    return (
                      <tr key={req.id} className="hover:bg-gray-50">
                        <td className="px-4 py-3">
                          <p className="font-semibold text-gray-900 text-xs">{req.document_name}</p>
                          {req.sender_message && <p className="text-xs text-gray-400 truncate max-w-40 mt-0.5">{req.sender_message}</p>}
                        </td>
                        <td className="px-4 py-3">
                          <p className="text-xs font-medium text-gray-800">{req.signer_name}</p>
                          <p className="text-xs text-gray-400">{req.signer_email}</p>
                        </td>
                        <td className="px-4 py-3">
                          <span className={`inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full font-semibold ${ss.bg} ${ss.text}`}>
                            <span className={`w-1.5 h-1.5 rounded-full ${ss.dot}`} />
                            {ss.label}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-xs text-gray-500">{formatDateShort(req.created_at)}</td>
                        <td className="px-4 py-3 text-xs text-gray-500">{req.signed_at ? formatDateShort(req.signed_at) : '—'}</td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-1">
                            {/* View signature if signed */}
                            {req.status === 'signed' && req.signature_data && (
                              <button onClick={() => setViewingSig(req)}
                                title="View signature"
                                className="text-xs px-2 py-1 rounded-lg bg-green-50 text-green-700 font-semibold hover:bg-green-100 transition-colors">
                                View
                              </button>
                            )}
                            {/* Copy signing link */}
                            {(req.status === 'pending') && (
                              <button onClick={() => copyLink(signingUrl)}
                                title="Copy signing link"
                                className="p-1.5 rounded-lg text-gray-400 hover:text-blue-600 hover:bg-blue-50 transition-colors">
                                {copiedLink === signingUrl ? <CheckCheck size={14} className="text-green-500" /> : <Copy size={14} />}
                              </button>
                            )}
                            {/* Resend email */}
                            {(req.status === 'pending') && (
                              <button onClick={() => resendRequest(req.id)} disabled={resendingId === req.id}
                                title="Resend email"
                                className="p-1.5 rounded-lg text-gray-400 hover:text-amber-600 hover:bg-amber-50 transition-colors disabled:opacity-40">
                                {resendingId === req.id ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
                              </button>
                            )}
                            {/* Void */}
                            {(req.status === 'pending') && (
                              <button onClick={() => voidRequest(req.id, req.document_name)} disabled={voidingId === req.id}
                                title="Void request"
                                className="p-1.5 rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-50 transition-colors disabled:opacity-40">
                                {voidingId === req.id ? <Loader2 size={14} className="animate-spin" /> : <Ban size={14} />}
                              </button>
                            )}
                            {/* Delete */}
                            <button onClick={() => deleteRequest(req.id, req.document_name)} disabled={deletingId === req.id}
                              title="Delete"
                              className="p-1.5 rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-50 transition-colors disabled:opacity-40">
                              {deletingId === req.id ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
                            </button>
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ── View Signature Modal ─────────────────────────────────────────────── */}
      {viewingSig && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
            <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
              <h2 className="font-bold text-gray-900">Signature — {viewingSig.document_name}</h2>
              <button onClick={() => setViewingSig(null)}><X size={18} className="text-gray-400" /></button>
            </div>
            <div className="p-6 space-y-4">
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div><p className="text-xs text-gray-500">Signer</p><p className="font-semibold">{viewingSig.signer_name}</p></div>
                <div><p className="text-xs text-gray-500">Email</p><p className="font-semibold">{viewingSig.signer_email}</p></div>
                <div><p className="text-xs text-gray-500">Signed On</p><p className="font-semibold">{new Date(viewingSig.signed_at).toLocaleString('en-US', { month:'short', day:'numeric', year:'numeric', hour:'numeric', minute:'2-digit' })}</p></div>
                {viewingSig.ip_address && <div><p className="text-xs text-gray-500">IP Address</p><p className="font-semibold font-mono text-xs">{viewingSig.ip_address}</p></div>}
              </div>
              <div className="bg-gray-50 rounded-xl p-4 flex items-center justify-center" style={{ minHeight: 100 }}>
                <img src={viewingSig.signature_data} alt="Signature" className="max-h-24 max-w-full" />
              </div>
            </div>
            <div className="px-6 pb-5">
              <button onClick={() => setViewingSig(null)} className="w-full py-2.5 rounded-xl border border-gray-200 text-sm font-semibold">Close</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Send for Signature Modal ──────────────────────────────────────────── */}
      {showSendModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between sticky top-0 bg-white z-10">
              <div className="flex items-center gap-2">
                <PenLine size={18} style={{ color: '#2f5a5e' }} />
                <h2 className="font-bold text-gray-900">Send Agreement for Signature</h2>
              </div>
              <button onClick={resetSigModal}><X size={18} className="text-gray-400" /></button>
            </div>

            {sigSendSuccess ? (
              <div className="p-6 space-y-4">
                <div className="text-center py-4">
                  <CheckCircle2 size={40} className="mx-auto text-green-500 mb-3" />
                  <h3 className="font-bold text-gray-900 text-lg mb-1">Sent!</h3>
                  <p className="text-sm text-gray-500">A signing email has been sent to <strong>{sigForm.signer_email}</strong>.</p>
                </div>
                <div className="bg-gray-50 rounded-xl p-4">
                  <p className="text-xs font-semibold text-gray-600 mb-2">Signing link (share directly if needed):</p>
                  <div className="flex items-center gap-2">
                    <input readOnly value={sigSendSuccess.signingUrl} className="flex-1 text-xs px-3 py-2 rounded-lg border border-gray-200 bg-white font-mono truncate" />
                    <button onClick={() => copyLink(sigSendSuccess.signingUrl)}
                      className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-gray-200 text-xs font-semibold hover:bg-gray-50 transition-colors">
                      {copiedLink === sigSendSuccess.signingUrl ? <><CheckCheck size={12} className="text-green-500" /> Copied!</> : <><Copy size={12} /> Copy</>}
                    </button>
                  </div>
                </div>
                <div className="flex gap-3">
                  <button onClick={resetSigModal} className="flex-1 py-2.5 rounded-xl border border-gray-200 text-sm font-semibold">Close</button>
                  <button onClick={() => { setSigSendSuccess(null); setSigForm({ document_name: '', signer_name: '', signer_email: '', sender_message: '', document_text: '', expiry_days: '30', content_type: 'text', document_url_input: '' }) }}
                    className="flex-1 py-2.5 rounded-xl text-white text-sm font-semibold" style={{ background: '#2f5a5e' }}>
                    Send Another
                  </button>
                </div>
              </div>
            ) : (
              <div className="p-6 space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1">Document / Agreement Name <span className="text-red-500">*</span></label>
                  <input value={sigForm.document_name} onChange={e => setSigForm(f => ({ ...f, document_name: e.target.value }))}
                    placeholder="e.g. Service Agreement — 123 Main St" className={inputCls} />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-gray-700 mb-1">Signer's Name <span className="text-red-500">*</span></label>
                    <input value={sigForm.signer_name} onChange={e => setSigForm(f => ({ ...f, signer_name: e.target.value }))}
                      placeholder="John Smith" className={inputCls} />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-gray-700 mb-1">Signer's Email <span className="text-red-500">*</span></label>
                    <input type="email" value={sigForm.signer_email} onChange={e => setSigForm(f => ({ ...f, signer_email: e.target.value }))}
                      placeholder="john@example.com" className={inputCls} />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1">Document Content</label>
                  <div className="flex gap-1 bg-gray-100 rounded-xl p-1 mb-3">
                    {([['text','Type Text'],['file','Upload PDF'],['url','Use URL']] as const).map(([v,l]) => (
                      <button key={v} type="button" onClick={() => setSigForm(f => ({ ...f, content_type: v }))}
                        className={`flex-1 py-1.5 rounded-lg text-xs font-semibold transition-all ${sigForm.content_type === v ? 'bg-white shadow-sm text-gray-900' : 'text-gray-500'}`}>
                        {l}
                      </button>
                    ))}
                  </div>
                  {sigForm.content_type === 'text' && (
                    <textarea value={sigForm.document_text} onChange={e => setSigForm(f => ({ ...f, document_text: e.target.value }))}
                      rows={6} placeholder="Paste or type the agreement text here…" className={inputCls} />
                  )}
                  {sigForm.content_type === 'file' && (
                    <label className="flex items-center gap-3 border-2 border-dashed border-gray-200 rounded-xl px-4 py-5 cursor-pointer hover:bg-gray-50 hover:border-blue-300 transition-all">
                      <File size={20} className="text-gray-400 flex-shrink-0" />
                      <div>
                        <p className="text-sm font-semibold text-gray-700">{sigFile ? sigFile.name : 'Choose PDF'}</p>
                        <p className="text-xs text-gray-400">PDF file</p>
                      </div>
                      <input ref={sigFileRef} type="file" accept=".pdf" className="hidden"
                        onChange={e => setSigFile(e.target.files?.[0] || null)} />
                    </label>
                  )}
                  {sigForm.content_type === 'url' && (
                    <input value={sigForm.document_url_input} onChange={e => setSigForm(f => ({ ...f, document_url_input: e.target.value }))}
                      placeholder="https://docs.google.com/..." className={inputCls} />
                  )}
                </div>

                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1">Message to Signer (optional)</label>
                  <textarea value={sigForm.sender_message} onChange={e => setSigForm(f => ({ ...f, sender_message: e.target.value }))}
                    rows={3} placeholder="Please review and sign the attached service agreement…" className={inputCls} />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1">Link Expires After</label>
                  <select value={sigForm.expiry_days} onChange={e => setSigForm(f => ({ ...f, expiry_days: e.target.value }))} className={inputCls}>
                    <option value="7">7 days</option>
                    <option value="14">14 days</option>
                    <option value="30">30 days</option>
                    <option value="60">60 days</option>
                    <option value="90">90 days</option>
                  </select>
                </div>

                {sigSendError && (
                  <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-xl p-3">
                    <AlertCircle size={14} className="text-red-500 flex-shrink-0" />
                    <p className="text-sm text-red-700">{sigSendError}</p>
                  </div>
                )}

                <div className="flex gap-3 pt-1">
                  <button onClick={sendSignatureRequest}
                    disabled={sigSending || !sigForm.document_name || !sigForm.signer_name || !sigForm.signer_email}
                    className="flex-1 flex items-center justify-center gap-2 text-white font-bold py-3 rounded-xl disabled:opacity-50 shadow-sm"
                    style={{ background: '#2f5a5e' }}>
                    {sigSending ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
                    {sigSending ? 'Sending…' : 'Send for Signature'}
                  </button>
                  <button onClick={resetSigModal} className="px-4 py-3 rounded-xl border border-gray-200 text-sm font-semibold">Cancel</button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
