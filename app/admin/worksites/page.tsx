'use client'
import { useEffect, useState, useRef } from 'react'
import { MapPin, Plus, Search, X, Loader2, Camera, Image as ImageIcon, ChevronRight, Trash2, Edit3, ClipboardList, Calendar, FileText, Home, Building2, Key, ChevronLeft, Upload, CheckCircle2, AlertCircle, Receipt, DollarSign, Link2, Users, FileCheck, Clock, ExternalLink, Sparkles } from 'lucide-react'
import { formatDateShort } from '@/lib/utils'

const SERVICE_TYPES = ['Service', 'Draw']

const PHOTO_TYPES = [
  { value: 'before', label: 'Before' },
  { value: 'after', label: 'After' },
  { value: 'install', label: 'Install' },
  { value: 'meter', label: 'Meter' },
  { value: 'inspection', label: 'Inspection' },
  { value: 'general', label: 'General' },
]

const PROPERTY_TYPES = [
  { value: 'residential', label: 'Residential', icon: Home },
  { value: 'commercial', label: 'Commercial', icon: Building2 },
  { value: 'rental', label: 'Rental', icon: Key },
]

interface Worksite {
  id: string
  address: string
  city: string
  state: string
  zip: string
  property_type: string
  notes: string
  created_at: string
  visit_count: number
  photo_count: number
  last_visit: string | null
  last_service: string | null
}

interface Visit {
  id: string
  worksite_id: string
  visit_date: string
  service_type: string
  work_performed: string
  technician: string
  customer_name: string
  customer_phone: string
  notes: string
  invoice_id: string | null
  appointment_id: string | null
  created_at: string
}

interface Photo {
  id: string
  worksite_id: string
  visit_id: string | null
  file_url: string
  file_name: string
  caption: string
  photo_type: string
  created_at: string
}

const inputCls = 'w-full px-3 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:border-blue-400'

export default function WorksitesPage() {
  const [sites, setSites] = useState<Worksite[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState<Worksite & { visits: Visit[]; photos: Photo[] } | null>(null)
  // Open permit counts per address
  const [openPermitsByAddress, setOpenPermitsByAddress] = useState<Record<string, number>>({})
  const [detailLoading, setDetailLoading] = useState(false)
  const [view, setView] = useState<'list' | 'detail'>('list')
  const [detailTab, setDetailTab] = useState<'history' | 'contacts' | 'photos' | 'permits'>('history')

  // Permits for this worksite
  const [sitePermits, setSitePermits] = useState<any[]>([])
  const [permitsLoading, setPermitsLoading] = useState(false)
  const [showAddPermit, setShowAddPermit] = useState(false)
  const [permitForm, setPermitForm] = useState<any>({})
  const [savingPermit, setSavingPermit] = useState(false)

  // Import from invoices
  const [importing, setImporting] = useState(false)
  const [importResult, setImportResult] = useState<{ sitesCreated: number; visitsCreated: number; skipped: number } | null>(null)
  const [merging, setMerging] = useState(false)
  const [mergeResult, setMergeResult] = useState<{ merged: number; groupsFound: number; mergedGroups: any[]; failures?: any[] } | null>(null)
  const [financialAccounts, setFinancialAccounts] = useState<Array<{ id: string; name: string; color?: string }>>([])

  // Manual merge selection mode
  const [mergeSelectMode, setMergeSelectMode] = useState(false)
  const [mergeSelected, setMergeSelected] = useState<Set<string>>(new Set())
  const [showMergeModal, setShowMergeModal] = useState(false)
  const [mergeKeepId, setMergeKeepId] = useState<string>('')

  // New site modal
  const [showNewSite, setShowNewSite] = useState(false)
  const [savingSite, setSavingSite] = useState(false)
  const [siteForm, setSiteForm] = useState({ address: '', city: '', state: 'FL', zip: '', property_type: 'residential', notes: '' })

  // New visit modal
  const [showNewVisit, setShowNewVisit] = useState(false)
  const [savingVisit, setSavingVisit] = useState(false)
  const [visitForm, setVisitForm] = useState({
    visit_date: new Date().toISOString().split('T')[0],
    service_type: '', work_performed: '', technician: 'Lacey Price',
    customer_name: '', customer_phone: '', notes: '',
  })

  // Photo upload
  const [uploadingPhoto, setUploadingPhoto] = useState(false)
  const [photoType, setPhotoType] = useState('general')
  const [photoCaption, setPhotoCaption] = useState('')
  const [pendingVisitId, setPendingVisitId] = useState<string | null>(null)
  const photoRef = useRef<HTMLInputElement>(null)
  const cameraRef = useRef<HTMLInputElement>(null)

  // Edit site
  const [editingSite, setEditingSite] = useState(false)
  const [savingEdit, setSavingEdit] = useState(false)

  // Lightbox
  const [lightbox, setLightbox] = useState<Photo | null>(null)

  useEffect(() => { loadSites(); loadFinancialAccounts() }, [])

  async function loadFinancialAccounts() {
    try {
      const res = await fetch('/api/financial-accounts')
      const d = await res.json()
      setFinancialAccounts(Array.isArray(d) ? d : [])
    } catch {}
  }

  async function loadSites() {
    setLoading(true)
    try {
      const [sitesRes, permitsRes] = await Promise.all([
        fetch('/api/worksites' + (search ? `?search=${encodeURIComponent(search)}` : '')),
        fetch('/api/permits'),
      ])
      const sitesData = await sitesRes.json()
      const permitsData = await permitsRes.json()
      setSites(Array.isArray(sitesData) ? sitesData : [])
      // Build address → open permit count map
      const CLOSED_STATUSES = ['passed', 'closed', 'not_required']
      const countMap: Record<string, number> = {}
      if (Array.isArray(permitsData)) {
        for (const p of permitsData) {
          if (!CLOSED_STATUSES.includes(p.status) && p.job_address) {
            const key = p.job_address.toLowerCase().trim()
            countMap[key] = (countMap[key] || 0) + 1
          }
        }
      }
      setOpenPermitsByAddress(countMap)
    } catch { setSites([]) }
    setLoading(false)
  }

  async function importFromInvoices() {
    if (!confirm('This will create worksites and visit records from all existing invoices with a job address. Already-imported invoices will be skipped. Continue?')) return
    setImporting(true)
    setImportResult(null)
    try {
      const res = await fetch('/api/worksites?action=import-from-invoices', { method: 'POST' })
      const d = await res.json()
      if (!res.ok) { alert(d.error || 'Import failed'); return }
      setImportResult(d)
      await loadSites()
    } finally { setImporting(false) }
  }

  async function mergeDuplicates() {
    if (!confirm('Find worksites with the same street address + unit (regardless of city/format differences) and merge them into one canonical record? Visits, photos, and bookkeeping links from duplicates are reassigned to the surviving site, then the duplicates are deleted.')) return
    setMerging(true)
    setMergeResult(null)
    try {
      const res = await fetch('/api/worksites?action=merge-duplicates', { method: 'POST' })
      const d = await res.json()
      if (!res.ok) { alert(d.error || 'Merge failed'); return }
      setMergeResult(d)
      await loadSites()
    } finally { setMerging(false) }
  }

  async function manualMerge() {
    if (mergeSelected.size < 2 || !mergeKeepId) return
    const duplicateIds = Array.from(mergeSelected).filter(id => id !== mergeKeepId)
    setMerging(true)
    try {
      const res = await fetch('/api/worksites?action=manual-merge', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ keep_id: mergeKeepId, merge_ids: duplicateIds }),
      })
      const d = await res.json()
      if (!res.ok) { alert(d.error || 'Merge failed'); setMerging(false); return }
      setMergeResult(d)
      setMergeSelectMode(false)
      setMergeSelected(new Set())
      setShowMergeModal(false)
      await loadSites()
    } catch (e: any) {
      alert(e?.message || 'Merge failed')
    }
    setMerging(false)
  }

  async function setWorksiteAccount(financialAccountId: string | null) {
    if (!selected) return
    await fetch('/api/worksites', {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: selected.id, table: 'worksites', financial_account_id: financialAccountId }),
    })
    await refreshDetail()
    await loadSites()
  }

  async function openSite(site: Worksite) {
    setDetailLoading(true)
    setView('detail')
    try {
      const res = await fetch(`/api/worksites?id=${site.id}`)
      const d = await res.json()
      setSelected(d)
    } catch {}
    setDetailLoading(false)
  }

  async function refreshDetail() {
    if (!selected) return
    const res = await fetch(`/api/worksites?id=${selected.id}`)
    const d = await res.json()
    setSelected(d)
    // Update list too
    setSites(prev => prev.map(s => s.id === d.id ? {
      ...s, visit_count: d.visits?.length || 0, photo_count: d.photos?.length || 0,
      last_visit: d.visits?.[0]?.visit_date || null, last_service: d.visits?.[0]?.service_type || null,
    } : s))
  }

  async function createSite(e: React.FormEvent) {
    e.preventDefault()
    setSavingSite(true)
    try {
      const res = await fetch('/api/worksites?action=create-site', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(siteForm),
      })
      if (!res.ok) { const e = await res.json(); alert(e.error); return }
      setShowNewSite(false)
      setSiteForm({ address: '', city: '', state: 'FL', zip: '', property_type: 'residential', notes: '' })
      await loadSites()
    } finally { setSavingSite(false) }
  }

  async function saveSiteEdit(e: React.FormEvent) {
    e.preventDefault()
    if (!selected) return
    setSavingEdit(true)
    try {
      const fd = new FormData(e.currentTarget as HTMLFormElement)
      const updates = {
        address: fd.get('address') as string,
        city: fd.get('city') as string,
        state: fd.get('state') as string,
        zip: fd.get('zip') as string,
        property_type: fd.get('property_type') as string,
        notes: fd.get('notes') as string,
      }
      await fetch('/api/worksites', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: selected.id, table: 'worksites', ...updates }) })
      setEditingSite(false)
      await refreshDetail()
    } finally { setSavingEdit(false) }
  }

  async function createVisit(e: React.FormEvent) {
    e.preventDefault()
    if (!selected) return
    setSavingVisit(true)
    try {
      const res = await fetch('/api/worksites?action=create-visit', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...visitForm, worksite_id: selected.id }),
      })
      if (!res.ok) { const e = await res.json(); alert(e.error); return }
      setShowNewVisit(false)
      setVisitForm({ visit_date: new Date().toISOString().split('T')[0], service_type: '', work_performed: '', technician: 'Lacey Price', customer_name: '', customer_phone: '', notes: '' })
      await refreshDetail()
      setDetailTab('history')
    } finally { setSavingVisit(false) }
  }

  async function deleteVisit(id: string) {
    if (!confirm('Delete this visit record?')) return
    await fetch(`/api/worksites?id=${id}&table=worksite_visits`, { method: 'DELETE' })
    await refreshDetail()
  }

  async function loadSitePermits(address: string) {
    setPermitsLoading(true)
    try {
      const res = await fetch(`/api/permits?search=${encodeURIComponent(address)}`)
      const d = await res.json()
      setSitePermits(Array.isArray(d) ? d : [])
    } catch { setSitePermits([]) }
    setPermitsLoading(false)
  }

  async function savePermit(e: React.FormEvent) {
    e.preventDefault()
    if (!selected) return
    setSavingPermit(true)
    try {
      const res = await fetch('/api/permits', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          job_address: selected.address,
          city: selected.city,
          state: selected.state,
          permit_type: 'gas',
          status: 'pending_application',
          source: 'manual',
          ...permitForm,
        }),
      })
      if (!res.ok) { const e = await res.json(); alert(e.error || 'Failed to save permit'); return }
      setShowAddPermit(false)
      setPermitForm({})
      await loadSitePermits(selected.address)
    } finally { setSavingPermit(false) }
  }

  async function updatePermitStatus(id: string, status: string) {
    await fetch('/api/permits', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, status }),
    })
    if (selected) await loadSitePermits(selected.address)
  }

  async function deletePermit(id: string) {
    if (!confirm('Delete this permit?')) return
    await fetch(`/api/permits?id=${id}`, { method: 'DELETE' })
    if (selected) await loadSitePermits(selected.address)
  }

  async function deletePhoto(id: string) {
    if (!confirm('Delete this photo?')) return
    await fetch(`/api/worksites?id=${id}&table=worksite_photos`, { method: 'DELETE' })
    await refreshDetail()
    if (lightbox?.id === id) setLightbox(null)
  }

  async function deleteSite() {
    if (!selected) return
    if (!confirm(`Delete worksite at ${selected.address}? This will also delete all visits and photos.`)) return
    await fetch(`/api/worksites?id=${selected.id}&table=worksites`, { method: 'DELETE' })
    setSelected(null)
    setView('list')
    await loadSites()
  }

  async function uploadPhoto(file: File, visitId?: string | null) {
    if (!selected) return
    setUploadingPhoto(true)
    try {
      const fd = new FormData()
      fd.append('file', file)
      fd.append('worksite_id', selected.id)
      if (visitId) fd.append('visit_id', visitId)
      fd.append('photo_type', photoType)
      if (photoCaption) fd.append('caption', photoCaption)
      const res = await fetch('/api/worksites?action=upload-photo', { method: 'POST', body: fd })
      if (!res.ok) { const e = await res.json(); alert(e.error || 'Upload failed'); return }
      setPhotoCaption('')
      await refreshDetail()
      setDetailTab('photos')
    } finally {
      setUploadingPhoto(false)
      if (photoRef.current) photoRef.current.value = ''
      if (cameraRef.current) cameraRef.current.value = ''
    }
  }

  const propIcon = (type: string) => {
    if (type === 'commercial') return Building2
    if (type === 'rental') return Key
    return Home
  }

  const filtered = sites.filter(s =>
    !search || `${s.address} ${s.city} ${s.zip}`.toLowerCase().includes(search.toLowerCase())
  )

  // â"€â"€ Detail view â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€
  if (view === 'detail' && selected) {
    const PropIcon = propIcon(selected.property_type)
    const visitsByDate = [...(selected.visits || [])].sort((a, b) => b.visit_date.localeCompare(a.visit_date))
    const photosByVisit: Record<string, Photo[]> = {}
    const unlinkedPhotos: Photo[] = []
    for (const p of selected.photos || []) {
      if (p.visit_id) {
        if (!photosByVisit[p.visit_id]) photosByVisit[p.visit_id] = []
        photosByVisit[p.visit_id].push(p)
      } else {
        unlinkedPhotos.push(p)
      }
    }

    return (
      <div className="p-6 md:p-8 pt-16 md:pt-8 max-w-5xl">
        {/* Back + header */}
        <div className="flex items-start gap-3 mb-6">
          <button onClick={() => { setView('list'); setSelected(null); setEditingSite(false) }}
            className="flex items-center gap-1 text-sm font-semibold text-gray-500 hover:text-gray-800 mt-0.5">
            <ChevronLeft size={16} />Back
          </button>
          <div className="flex-1">
            <div className="flex items-center gap-3 flex-wrap">
              <div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: '#f3ede3' }}>
                <PropIcon size={18} style={{ color: '#b8895a' }} />
              </div>
              <div>
                <h1 className="text-xl font-extrabold text-gray-900">{selected.address}</h1>
                <p className="text-sm text-gray-500">{[selected.city, selected.state, selected.zip].filter(Boolean).join(', ')} · <span className="capitalize">{selected.property_type}</span></p>
              </div>
              <div className="ml-auto flex gap-2">
                <button onClick={() => setEditingSite(!editingSite)}
                  className="flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg border border-gray-200 hover:bg-gray-50">
                  <Edit3 size={12} />Edit
                </button>
                <button onClick={deleteSite}
                  className="flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg border border-red-200 text-red-600 hover:bg-red-50">
                  <Trash2 size={12} />Delete
                </button>
              </div>
            </div>
          </div>
        </div>

        {detailLoading ? (
          <div className="flex justify-center py-20"><Loader2 size={28} className="animate-spin" style={{ color: '#b8895a' }} /></div>
        ) : (
          <>
            {/* Edit form */}
            {editingSite && (
              <form onSubmit={saveSiteEdit} className="bg-blue-50 border border-blue-100 rounded-2xl p-5 mb-5 space-y-3">
                <h3 className="font-bold text-sm text-gray-800">Edit Property</h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="sm:col-span-2">
                    <label className="block text-xs font-semibold text-gray-600 mb-1">Address</label>
                    <input name="address" defaultValue={selected.address} required className={inputCls} />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-gray-600 mb-1">City</label>
                    <input name="city" defaultValue={selected.city} className={inputCls} />
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block text-xs font-semibold text-gray-600 mb-1">State</label>
                      <input name="state" defaultValue={selected.state || 'FL'} className={inputCls} />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-gray-600 mb-1">ZIP</label>
                      <input name="zip" defaultValue={selected.zip} className={inputCls} />
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-gray-600 mb-1">Property Type</label>
                    <select name="property_type" defaultValue={selected.property_type} className={inputCls}>
                      {PROPERTY_TYPES.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
                    </select>
                  </div>
                  <div className="sm:col-span-2">
                    <label className="block text-xs font-semibold text-gray-600 mb-1">Notes</label>
                    <textarea name="notes" defaultValue={selected.notes} rows={2} className={inputCls} />
                  </div>
                </div>
                <div className="flex gap-2">
                  <button type="submit" disabled={savingEdit}
                    className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-white text-sm font-bold disabled:opacity-60"
                    style={{ background: '#b8895a' }}>
                    {savingEdit ? <Loader2 size={13} className="animate-spin" /> : <CheckCircle2 size={13} />}Save
                  </button>
                  <button type="button" onClick={() => setEditingSite(false)} className="px-4 py-2 rounded-xl border border-gray-200 text-sm font-semibold">Cancel</button>
                </div>
              </form>
            )}

            {/* Notes */}
            {selected.notes && !editingSite && (
              <div className="bg-gray-50 border border-gray-100 rounded-xl px-4 py-3 mb-5 text-sm text-gray-700">{selected.notes}</div>
            )}

            {/* Stats */}
            {(() => {
              const s = selected as any
              const totalInvoices = (s.allInvoices || []).length
              const totalContacts = (s.contacts || []).length
              const allDates = [
                ...(s.allInvoices || []).map((i: any) => i.service_date || i.created_at?.split('T')[0]),
                ...(s.appointments || []).map((a: any) => a.start_time?.split('T')[0]),
                ...(s.visits || []).map((v: any) => v.visit_date),
              ].filter(Boolean).sort((a: string, b: string) => b.localeCompare(a))
              const lastActivity = allDates[0] || null
              return (
                <div className="grid grid-cols-4 gap-3 mb-5">
                  <div className="bg-white rounded-2xl border border-gray-100 p-4 shadow-sm">
                    <div className="text-2xl font-extrabold" style={{ color: '#b8895a' }}>{totalInvoices}</div>
                    <div className="text-xs text-gray-500 mt-0.5">Invoices</div>
                  </div>
                  <div className="bg-white rounded-2xl border border-gray-100 p-4 shadow-sm">
                    <div className="text-2xl font-extrabold text-gray-800">{(s.appointments || []).length}</div>
                    <div className="text-xs text-gray-500 mt-0.5">Appointments</div>
                  </div>
                  <div className="bg-white rounded-2xl border border-gray-100 p-4 shadow-sm">
                    <div className="text-2xl font-extrabold text-gray-800">{totalContacts}</div>
                    <div className="text-xs text-gray-500 mt-0.5">Contacts</div>
                  </div>
                  <div className="bg-white rounded-2xl border border-gray-100 p-4 shadow-sm">
                    <div className="text-sm font-extrabold text-gray-800">{lastActivity ? formatDateShort(lastActivity) : 'â€"'}</div>
                    <div className="text-xs text-gray-500 mt-0.5">Last Activity</div>
                  </div>
                </div>
              )
            })()}

            {/* Linked Bookkeeping Account */}
            <div className="bg-white rounded-2xl border border-gray-100 p-4 shadow-sm mb-5 flex items-center gap-3 flex-wrap">
              <DollarSign size={16} style={{ color: '#b8895a' }} />
              <div className="flex-1 min-w-[160px]">
                <div className="text-xs font-bold uppercase tracking-wider text-gray-500">Linked Bookkeeping Account</div>
                <div className="text-xs text-gray-400 mt-0.5">Job costs and draws posted to this account roll up here automatically.</div>
              </div>
              <select
                value={(selected as any).financial_account_id || ''}
                onChange={e => setWorksiteAccount(e.target.value || null)}
                className="px-3 py-2 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:border-blue-400 min-w-[220px]"
              >
                <option value="">— Not linked —</option>
                {financialAccounts.map(a => (
                  <option key={a.id} value={a.id}>{a.name}</option>
                ))}
              </select>
              {(selected as any).financial_account && (
                <a href={`/admin/bookkeeping`} className="text-xs font-semibold px-3 py-2 rounded-lg border border-gray-200 hover:bg-gray-50">View ledger →</a>
              )}
            </div>

            {/* Linked Job Plans / Estimates */}
            {Array.isArray((selected as any).jobPlans) && (selected as any).jobPlans.length > 0 && (
              <div className="bg-white rounded-2xl border border-gray-100 p-4 shadow-sm mb-5">
                <div className="flex items-center gap-2 mb-3">
                  <Sparkles size={15} style={{ color: '#b8895a' }} />
                  <div className="text-xs font-bold uppercase tracking-wider text-gray-500">Job Plans &amp; Estimates</div>
                </div>
                <div className="divide-y divide-gray-100">
                  {(selected as any).jobPlans.map((jp: any) => {
                    const PLAN_STATUS: Record<string, { label: string; color: string }> = {
                      draft: { label: 'Draft', color: 'bg-amber-100 text-amber-700' },
                      estimated: { label: 'Estimated', color: 'bg-green-100 text-green-700' },
                      sent_to_customer: { label: 'Sent', color: 'bg-blue-100 text-blue-700' },
                      approved: { label: 'Approved', color: 'bg-emerald-100 text-emerald-700' },
                      scheduled: { label: 'Scheduled', color: 'bg-indigo-100 text-indigo-700' },
                      in_progress: { label: 'In Progress', color: 'bg-orange-100 text-orange-700' },
                      completed: { label: 'Completed', color: 'bg-gray-200 text-gray-700' },
                    }
                    const st = PLAN_STATUS[jp.status || 'draft'] || PLAN_STATUS.draft
                    const total = jp.estimate ? (jp.estimate.estimated_total + jp.estimate.design_pm_fee) : null
                    return (
                      <a key={jp.id} href={`/admin/plan-job?id=${jp.id}`} className="flex items-center justify-between gap-3 py-2.5 hover:bg-gray-50 -mx-2 px-2 rounded-lg">
                        <div className="min-w-0">
                          <div className="text-sm font-semibold text-gray-800 truncate flex items-center gap-2">
                            {jp.title}
                            <span className={`text-[10px] uppercase font-bold tracking-wider px-1.5 py-0.5 rounded ${st.color}`}>{st.label}</span>
                            {jp.shared_with_account_id && <span className="text-[10px] uppercase font-bold tracking-wider px-1.5 py-0.5 rounded bg-purple-100 text-purple-700">Shared</span>}
                          </div>
                          <div className="text-[11px] text-gray-400">Updated {new Date(jp.updated_at).toLocaleDateString()}</div>
                        </div>
                        {total != null && <div className="font-mono font-bold text-sm text-gray-900 whitespace-nowrap">${total.toFixed(2)}</div>}
                      </a>
                    )
                  })}
                </div>
              </div>
            )}

            {/* Tabs */}
            <div className="flex gap-1 bg-gray-100 rounded-xl p-1 w-fit mb-5 flex-wrap">
              {([
                ['history', 'History'],
                ['contacts', 'Contacts / Owners'],
                ['photos', 'Photos & Docs'],
                ['permits', 'Permits'],
              ] as const).map(([k, l]) => {
                const s = selected as any
                const count = k === 'history'
                  ? ((s.allInvoices||[]).length + (s.appointments||[]).length + (s.scheduleRequests||[]).length + (s.visits||[]).length)
                  : k === 'contacts' ? (s.contacts||[]).length
                  : k === 'photos' ? (s.photos||[]).length
                  : sitePermits.length
                return (
                  <button key={k} onClick={() => {
                    setDetailTab(k)
                    if (k === 'permits' && selected) loadSitePermits(selected.address)
                  }}
                    className={`px-4 py-2 rounded-lg text-sm font-semibold transition-all ${detailTab === k ? 'bg-white shadow-sm' : 'text-gray-500'}`}
                    style={{ color: detailTab === k ? '#b8895a' : undefined }}>
                    {l}
                    {count > 0 && <span className="ml-1.5 text-xs bg-blue-100 text-blue-700 rounded-full px-1.5 py-0.5">{count}</span>}
                  </button>
                )
              })}
            </div>

            {/* â"€â"€ HISTORY TAB â"€â"€ */}
            {detailTab === 'history' && (() => {
              const s = selected as any
              type TLEvent = { id: string; date: string; type: 'invoice'|'appointment'|'schedule_request'|'visit'; data: any }
              const events: TLEvent[] = [
                ...(s.allInvoices||[]).map((inv: any) => ({ id: `inv-${inv.id}`, date: inv.service_date || inv.created_at?.split('T')[0] || '', type: 'invoice' as const, data: inv })),
                ...(s.appointments||[]).map((a: any) => ({ id: `appt-${a.id}`, date: a.start_time?.split('T')[0] || '', type: 'appointment' as const, data: a })),
                ...(s.scheduleRequests||[]).map((sr: any) => ({ id: `sr-${sr.id}`, date: sr.preferred_date || sr.created_at?.split('T')[0] || '', type: 'schedule_request' as const, data: sr })),
                ...(s.visits||[]).filter((v: any) => !v.invoice_id).map((v: any) => ({ id: `visit-${v.id}`, date: v.visit_date || '', type: 'visit' as const, data: v })),
              ].sort((a, b) => b.date.localeCompare(a.date))
              const typeStyle: Record<string, { bg: string; border: string; label: string; icon: any }> = {
                invoice:          { bg: '#f3ede3', border: '#b8895a', label: 'Invoice',          icon: Receipt },
                appointment:      { bg: '#F0FDF4', border: '#16A34A', label: 'Appointment',      icon: Calendar },
                schedule_request: { bg: '#FFFBEB', border: '#D97706', label: 'Schedule Request', icon: ClipboardList },
                visit:            { bg: '#F5F3FF', border: '#7C3AED', label: 'Work Visit',        icon: FileText },
              }
              return (
                <div className="space-y-4">
                  <button onClick={() => setShowNewVisit(true)}
                    className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-white text-sm font-bold shadow-sm"
                    style={{ background: '#b8895a' }}>
                    <Plus size={14} />Log Visit / Work
                  </button>
                  {events.length === 0 ? (
                    <div className="text-center py-16 text-gray-400">
                      <ClipboardList size={30} className="mx-auto mb-2 opacity-30" />
                      <p className="text-sm">No history yet</p>
                      <p className="text-xs mt-1">History auto-populates from invoices, appointments &amp; schedule requests</p>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {events.map(ev => {
                        const ts = typeStyle[ev.type]
                        const Icon = ts.icon
                        if (ev.type === 'invoice') {
                          const inv = ev.data
                          return (
                            <div key={ev.id} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
                              <div className="flex items-start gap-3">
                                <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0" style={{ background: ts.bg }}>
                                  <Icon size={14} style={{ color: ts.border }} />
                                </div>
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center gap-2 flex-wrap mb-1">
                                    <span className="text-xs font-bold uppercase tracking-wider" style={{ color: ts.border }}>{ts.label}</span>
                                    <span className="text-xs text-gray-400">{ev.date ? formatDateShort(ev.date) : 'â€"'}</span>
                                    <span className={`text-xs px-1.5 py-0.5 rounded-full font-semibold capitalize ${inv.invoice_status==='paid'?'bg-green-100 text-green-700':inv.invoice_status==='sent'?'bg-blue-100 text-blue-700':inv.invoice_status==='overdue'?'bg-red-100 text-red-600':'bg-gray-100 text-gray-600'}`}>{inv.invoice_status}</span>
                                  </div>
                                  <div className="flex items-start justify-between gap-3">
                                    <div>
                                      <div className="font-bold text-gray-900 text-sm">{inv.invoice_number}</div>
                                      <div className="text-xs text-gray-500">{inv.customer_name}{inv.service_type ? ` · ${inv.service_type}` : ''}</div>
                                      {inv.service_description && <div className="text-xs text-gray-600 mt-1 line-clamp-2">{inv.service_description}</div>}
                                    </div>
                                    <div className="text-right flex-shrink-0">
                                      <div className="font-bold text-gray-900 text-sm">${Number(inv.amount_due||0).toLocaleString('en-US',{minimumFractionDigits:2})}</div>
                                      {inv.invoice_status==='paid'&&<div className="text-xs text-green-600">Paid ${Number(inv.amount_paid||0).toLocaleString('en-US',{minimumFractionDigits:2})}</div>}
                                    </div>
                                  </div>
                                </div>
                                <a href={`/admin/invoices?id=${inv.id}`} target="_blank" rel="noopener noreferrer" className="text-gray-300 hover:text-blue-500 flex-shrink-0 mt-1"><ChevronRight size={16} /></a>
                              </div>
                            </div>
                          )
                        }
                        if (ev.type === 'appointment') {
                          const appt = ev.data
                          return (
                            <div key={ev.id} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
                              <div className="flex items-start gap-3">
                                <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0" style={{ background: ts.bg }}>
                                  <Icon size={14} style={{ color: ts.border }} />
                                </div>
                                <div className="flex-1">
                                  <div className="flex items-center gap-2 flex-wrap mb-1">
                                    <span className="text-xs font-bold uppercase tracking-wider" style={{ color: ts.border }}>{ts.label}</span>
                                    <span className="text-xs text-gray-400">{appt.start_time ? formatDateShort(appt.start_time.split('T')[0]) : 'â€"'}</span>
                                    <span className={`text-xs px-1.5 py-0.5 rounded-full font-semibold capitalize ${appt.status==='completed'?'bg-green-100 text-green-700':appt.status==='cancelled'?'bg-red-100 text-red-600':'bg-blue-100 text-blue-700'}`}>{appt.status}</span>
                                  </div>
                                  <div className="font-bold text-gray-900 text-sm">{appt.title||appt.service_type}</div>
                                  <div className="text-xs text-gray-500">{appt.customer_name}{appt.customer_phone?` · ${appt.customer_phone}`:''}{appt.customer_email?` · ${appt.customer_email}`:''}</div>
                                  {appt.notes && <div className="text-xs text-gray-600 mt-1 bg-gray-50 rounded-lg px-3 py-2">{appt.notes}</div>}
                                </div>
                              </div>
                            </div>
                          )
                        }
                        if (ev.type === 'schedule_request') {
                          const sr = ev.data
                          const name = [sr.first_name, sr.last_name].filter(Boolean).join(' ')
                          return (
                            <div key={ev.id} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
                              <div className="flex items-start gap-3">
                                <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0" style={{ background: ts.bg }}>
                                  <Icon size={14} style={{ color: ts.border }} />
                                </div>
                                <div className="flex-1">
                                  <div className="flex items-center gap-2 flex-wrap mb-1">
                                    <span className="text-xs font-bold uppercase tracking-wider" style={{ color: ts.border }}>{ts.label}</span>
                                    <span className="text-xs text-gray-400">{sr.created_at ? formatDateShort(sr.created_at.split('T')[0]) : 'â€"'}</span>
                                    <span className={`text-xs px-1.5 py-0.5 rounded-full font-semibold capitalize ${sr.status==='approved'?'bg-green-100 text-green-700':sr.status==='declined'?'bg-red-100 text-red-600':'bg-amber-100 text-amber-700'}`}>{sr.status}</span>
                                  </div>
                                  <div className="font-bold text-gray-900 text-sm">{name}</div>
                                  <div className="text-xs text-gray-500">{sr.phone}{sr.email?` · ${sr.email}`:''}{sr.service_type?` · ${sr.service_type}`:''}</div>
                                  {sr.preferred_date && <div className="text-xs text-gray-400">Requested: {formatDateShort(sr.preferred_date)}{sr.preferred_time?` ${sr.preferred_time}`:''}</div>}
                                  {sr.notes && <div className="text-xs text-gray-600 mt-1 bg-gray-50 rounded-lg px-3 py-2">{sr.notes}</div>}
                                  {sr.owner_name && sr.owner_name !== name && <div className="text-xs text-gray-500 mt-1">Owner: {sr.owner_name}{sr.owner_phone?` · ${sr.owner_phone}`:''}</div>}
                                  {sr.company_name && <div className="text-xs text-gray-500">Company: {sr.company_name}</div>}
                                </div>
                              </div>
                            </div>
                          )
                        }
                        // visit (no invoice)
                        const v = ev.data
                        return (
                          <div key={ev.id} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
                            <div className="flex items-start gap-3">
                              <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0" style={{ background: ts.bg }}>
                                <Icon size={14} style={{ color: ts.border }} />
                              </div>
                              <div className="flex-1">
                                <div className="flex items-center gap-2 flex-wrap mb-1">
                                  <span className="text-xs font-bold uppercase tracking-wider" style={{ color: ts.border }}>{ts.label}</span>
                                  <span className="text-xs text-gray-400">{formatDateShort(v.visit_date)}</span>
                                  {v.service_type && <span className="text-xs px-1.5 py-0.5 rounded-full font-semibold" style={{ background: '#f3ede3', color: '#b8895a' }}>{v.service_type}</span>}
                                </div>
                                {v.customer_name && <div className="text-xs text-gray-500">{v.customer_name}{v.customer_phone?` · ${v.customer_phone}`:''}</div>}
                                {v.technician && <div className="text-xs text-gray-500">Tech: {v.technician}</div>}
                                {v.work_performed && <div className="text-xs text-gray-700 mt-1 bg-gray-50 rounded-lg px-3 py-2 whitespace-pre-wrap">{v.work_performed}</div>}
                                {v.notes && <div className="text-xs text-gray-500 italic mt-1">{v.notes}</div>}
                                {photosByVisit[v.id]?.length > 0 && (
                                  <div className="flex flex-wrap gap-1.5 mt-2">
                                    {photosByVisit[v.id].map((p: Photo) => (
                                      <div key={p.id} className="relative group">
                                        <img src={p.file_url} alt={p.caption||p.photo_type} onClick={()=>setLightbox(p)} className="w-14 h-14 object-cover rounded-lg cursor-pointer hover:opacity-90 border border-gray-100" />
                                        <button onClick={()=>deletePhoto(p.id)} className="absolute top-0.5 right-0.5 w-4 h-4 rounded-full bg-red-500 text-white flex items-center justify-center opacity-0 group-hover:opacity-100"><X size={8}/></button>
                                      </div>
                                    ))}
                                  </div>
                                )}
                                <div className="flex items-center gap-2 mt-2">
                                  <label className={`flex items-center gap-1 text-xs font-semibold px-2 py-1 rounded-lg border border-gray-200 cursor-pointer hover:bg-gray-50 ${uploadingPhoto?'opacity-50':''}`}>
                                    {uploadingPhoto?<Loader2 size={10} className="animate-spin"/>:<Camera size={10}/>} Photo
                                    <input type="file" accept="image/*" capture="environment" className="hidden" disabled={uploadingPhoto} onChange={e=>{const f=e.target.files?.[0];if(f)uploadPhoto(f,v.id)}} />
                                  </label>
                                  <label className={`flex items-center gap-1 text-xs font-semibold px-2 py-1 rounded-lg border border-gray-200 cursor-pointer hover:bg-gray-50 ${uploadingPhoto?'opacity-50':''}`}>
                                    {uploadingPhoto?<Loader2 size={10} className="animate-spin"/>:<Upload size={10}/>} Upload
                                    <input type="file" accept="image/*,.pdf,.doc,.docx" className="hidden" disabled={uploadingPhoto} onChange={e=>{const f=e.target.files?.[0];if(f)uploadPhoto(f,v.id)}} />
                                  </label>
                                  <button onClick={()=>deleteVisit(v.id)} className="text-gray-300 hover:text-red-500 ml-auto"><Trash2 size={13}/></button>
                                </div>
                              </div>
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  )}
                </div>
              )
            })()}

            {/* â"€â"€ CONTACTS TAB â"€â"€ */}
            {detailTab === 'contacts' && (() => {
              const s = selected as any
              const contacts: any[] = s.contacts || []
              return (
                <div className="space-y-3">
                  {contacts.length === 0 ? (
                    <div className="text-center py-16 text-gray-400">
                      <Users size={30} className="mx-auto mb-2 opacity-30" />
                      <p className="text-sm">No contacts found</p>
                      <p className="text-xs mt-1">Contacts appear automatically from invoices, appointments &amp; schedule requests</p>
                    </div>
                  ) : contacts.map((c: any, i: number) => (
                    <div key={i} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
                      <div className="flex items-start gap-3">
                        <div className="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 font-bold text-sm text-white" style={{ background: '#b8895a' }}>
                          {c.name.split(' ').map((n: string) => n[0]).slice(0,2).join('').toUpperCase()}
                        </div>
                        <div className="flex-1">
                          <div className="flex items-center gap-2 flex-wrap mb-1">
                            <span className="font-bold text-gray-900">{c.name}</span>
                            {c.sources.map((src: string) => (
                              <span key={src} className="text-xs px-1.5 py-0.5 rounded-full bg-gray-100 text-gray-500 capitalize">{src.replace(/_/g,' ')}</span>
                            ))}
                          </div>
                          {c.phone && <div className="text-xs text-gray-600">ðŸ"ž {c.phone}</div>}
                          {c.email && <div className="text-xs text-gray-600">âœ‰ï¸ {c.email}</div>}
                          {(c.firstSeen||c.lastSeen) && (
                            <div className="text-xs text-gray-400 mt-1">
                              {c.firstSeen&&c.lastSeen&&c.firstSeen!==c.lastSeen
                                ? `${formatDateShort(c.firstSeen)} â€" ${formatDateShort(c.lastSeen)}`
                                : `Active: ${formatDateShort(c.firstSeen||c.lastSeen)}`}
                            </div>
                          )}
                        </div>
                        {c.contact_id && (
                          <a href={`/admin/crm?id=${c.contact_id}`} target="_blank" rel="noopener noreferrer" className="text-gray-300 hover:text-blue-500 flex-shrink-0" title="Open CRM record">
                            <ChevronRight size={16} />
                          </a>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )
            })()}

            {/* ── PERMITS TAB ── */}
            {detailTab === 'permits' && (() => {
              const PERMIT_STATUS_CFG: Record<string, { label: string; color: string; bg: string }> = {
                inquiry:              { label: 'Inquiry',          color: '#6b7280', bg: '#f3f4f6' },
                not_required:         { label: 'Not Required',     color: '#059669', bg: '#d1fae5' },
                pending_application:  { label: 'Pending App',      color: '#d97706', bg: '#fef3c7' },
                applied:              { label: 'Applied',          color: '#2563eb', bg: '#dbeafe' },
                approved:             { label: 'Approved',         color: '#7c3aed', bg: '#ede9fe' },
                issued:               { label: 'Issued',           color: '#059669', bg: '#d1fae5' },
                inspection_scheduled: { label: 'Inspection',       color: '#0891b2', bg: '#cffafe' },
                passed:               { label: 'Passed',           color: '#16a34a', bg: '#dcfce7' },
                closed:               { label: 'Closed',           color: '#374151', bg: '#e5e7eb' },
              }
              const activePermits = sitePermits.filter(p => !['passed','closed','not_required'].includes(p.status))
              const closedPermits = sitePermits.filter(p => ['passed','closed','not_required'].includes(p.status))
              const fmtDate = (d: string | null) => d ? new Date(d + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : null

              return (
                <div className="space-y-4">
                  <div className="flex items-center gap-3">
                    <button onClick={() => { setPermitForm({ permit_type: 'gas', status: 'pending_application' }); setShowAddPermit(true) }}
                      className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-white text-sm font-bold shadow-sm"
                      style={{ background: '#b8895a' }}>
                      <Plus size={14} />Add Permit
                    </button>
                    <a href="/admin/permits" className="flex items-center gap-1 text-xs text-blue-600 hover:underline">
                      <ExternalLink size={11} />View all permits
                    </a>
                  </div>

                  {permitsLoading ? (
                    <div className="flex justify-center py-12"><Loader2 size={24} className="animate-spin" style={{ color: '#b8895a' }} /></div>
                  ) : sitePermits.length === 0 ? (
                    <div className="text-center py-12 text-gray-400">
                      <FileCheck size={30} className="mx-auto mb-2 opacity-30" />
                      <p className="text-sm">No permits found for this address</p>
                      <p className="text-xs mt-1">Add one manually or use Sync Invoices in the Permits section</p>
                    </div>
                  ) : (
                    <div className="space-y-5">
                      {activePermits.length > 0 && (
                        <div>
                          <div className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">Active ({activePermits.length})</div>
                          <div className="space-y-2">
                            {activePermits.map((p: any) => {
                              const cfg = PERMIT_STATUS_CFG[p.status] || { label: p.status, color: '#6b7280', bg: '#f3f4f6' }
                              const today = new Date()
                              const expiry = p.expiry_date ? new Date(p.expiry_date + 'T00:00:00') : null
                              const daysToExpiry = expiry ? Math.ceil((expiry.getTime() - today.getTime()) / 86400000) : null
                              return (
                                <div key={p.id} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
                                  <div className="flex items-start justify-between gap-3">
                                    <div className="flex-1 min-w-0">
                                      <div className="flex flex-wrap items-center gap-2 mb-1.5">
                                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold"
                                          style={{ color: cfg.color, background: cfg.bg }}>{cfg.label}</span>
                                        <span className="text-xs bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded font-semibold uppercase">{p.permit_type}</span>
                                        {p.permit_number && <span className="text-xs font-bold text-gray-700">#{p.permit_number}</span>}
                                        {daysToExpiry !== null && daysToExpiry <= 30 && daysToExpiry > 0 && (
                                          <span className="text-xs bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded font-semibold">Expires in {daysToExpiry}d</span>
                                        )}
                                      </div>
                                      <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-gray-500">
                                        {p.jurisdiction_name && <span>📍 {p.jurisdiction_name}</span>}
                                        {p.application_date && <span>Applied {fmtDate(p.application_date)}</span>}
                                        {p.issued_date && <span>Issued {fmtDate(p.issued_date)}</span>}
                                        {p.inspection_date && <span>Inspection {fmtDate(p.inspection_date)}</span>}
                                        {p.permit_fee != null && (
                                          <span className={p.fee_paid ? 'text-green-600 font-semibold' : 'text-red-500 font-semibold'}>
                                            ${Number(p.permit_fee).toFixed(2)} {p.fee_paid ? '✓ Paid' : '— Unpaid'}
                                          </span>
                                        )}
                                      </div>
                                      {p.inspector_notes && <p className="text-xs text-gray-500 mt-1 italic">{p.inspector_notes}</p>}
                                    </div>
                                    <div className="flex flex-col items-end gap-1.5 flex-shrink-0">
                                      <select value={p.status}
                                        onChange={e => updatePermitStatus(p.id, e.target.value)}
                                        className="text-xs border border-gray-200 rounded-lg px-2 py-1 focus:outline-none">
                                        {Object.entries(PERMIT_STATUS_CFG).map(([val, c]) => (
                                          <option key={val} value={val}>{c.label}</option>
                                        ))}
                                      </select>
                                      <button onClick={() => deletePermit(p.id)} className="text-gray-300 hover:text-red-500 transition-colors">
                                        <Trash2 size={13} />
                                      </button>
                                    </div>
                                  </div>
                                </div>
                              )
                            })}
                          </div>
                        </div>
                      )}
                      {closedPermits.length > 0 && (
                        <div>
                          <div className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">Closed / Complete ({closedPermits.length})</div>
                          <div className="space-y-2">
                            {closedPermits.map((p: any) => {
                              const cfg = PERMIT_STATUS_CFG[p.status] || { label: p.status, color: '#6b7280', bg: '#f3f4f6' }
                              return (
                                <div key={p.id} className="bg-gray-50 rounded-2xl border border-gray-100 p-4">
                                  <div className="flex items-center justify-between gap-3">
                                    <div className="flex flex-wrap items-center gap-2">
                                      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold"
                                        style={{ color: cfg.color, background: cfg.bg }}>{cfg.label}</span>
                                      <span className="text-xs bg-white text-gray-500 px-1.5 py-0.5 rounded font-semibold uppercase border">{p.permit_type}</span>
                                      {p.permit_number && <span className="text-xs font-bold text-gray-600">#{p.permit_number}</span>}
                                      {p.final_date && <span className="text-xs text-gray-400">Closed {fmtDate(p.final_date)}</span>}
                                    </div>
                                    <button onClick={() => deletePermit(p.id)} className="text-gray-300 hover:text-red-500"><Trash2 size={13} /></button>
                                  </div>
                                </div>
                              )
                            })}
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Add Permit Modal */}
                  {showAddPermit && (
                    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
                      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
                        <div className="px-6 py-4 border-b flex items-center justify-between sticky top-0 bg-white">
                          <h2 className="font-bold text-gray-900">Add Permit</h2>
                          <button onClick={() => setShowAddPermit(false)}><X size={18} className="text-gray-400" /></button>
                        </div>
                        <form onSubmit={savePermit} className="p-6 space-y-4">
                          <div className="bg-blue-50 rounded-xl px-4 py-2.5 text-sm text-blue-800 font-medium flex items-center gap-2">
                            <MapPin size={13} />{selected?.address}
                          </div>
                          <div className="grid grid-cols-2 gap-3">
                            <div>
                              <label className="block text-xs font-semibold text-gray-700 mb-1">Permit Number</label>
                              <input value={permitForm.permit_number || ''} onChange={e => setPermitForm((f: any) => ({ ...f, permit_number: e.target.value }))}
                                placeholder="e.g. BP-2024-1234" className={inputCls} />
                            </div>
                            <div>
                              <label className="block text-xs font-semibold text-gray-700 mb-1">Type</label>
                              <select value={permitForm.permit_type || 'gas'} onChange={e => setPermitForm((f: any) => ({ ...f, permit_type: e.target.value }))} className={inputCls}>
                                {['gas','lp','hvac','electrical','mechanical','plumbing','other'].map(t => <option key={t} value={t}>{t.toUpperCase()}</option>)}
                              </select>
                            </div>
                          </div>
                          <div>
                            <label className="block text-xs font-semibold text-gray-700 mb-1">Status</label>
                            <select value={permitForm.status || 'pending_application'} onChange={e => setPermitForm((f: any) => ({ ...f, status: e.target.value }))} className={inputCls}>
                              {Object.entries(PERMIT_STATUS_CFG).map(([val, c]) => <option key={val} value={val}>{c.label}</option>)}
                            </select>
                          </div>
                          <div className="grid grid-cols-2 gap-3">
                            <div>
                              <label className="block text-xs font-semibold text-gray-700 mb-1">Application Date</label>
                              <input type="date" value={permitForm.application_date || ''} onChange={e => setPermitForm((f: any) => ({ ...f, application_date: e.target.value || null }))} className={inputCls} />
                            </div>
                            <div>
                              <label className="block text-xs font-semibold text-gray-700 mb-1">Permit Fee</label>
                              <input type="number" step="0.01" value={permitForm.permit_fee || ''} onChange={e => setPermitForm((f: any) => ({ ...f, permit_fee: e.target.value ? parseFloat(e.target.value) : null }))} placeholder="0.00" className={inputCls} />
                            </div>
                          </div>
                          <div>
                            <label className="block text-xs font-semibold text-gray-700 mb-1">Jurisdiction</label>
                            <input value={permitForm.jurisdiction_name || ''} onChange={e => setPermitForm((f: any) => ({ ...f, jurisdiction_name: e.target.value }))} placeholder="e.g. City of Crestview" className={inputCls} />
                          </div>
                          <div>
                            <label className="block text-xs font-semibold text-gray-700 mb-1">Notes</label>
                            <textarea value={permitForm.notes || ''} onChange={e => setPermitForm((f: any) => ({ ...f, notes: e.target.value }))} rows={2} className={inputCls} />
                          </div>
                          <div className="flex gap-3 pt-1">
                            <button type="submit" disabled={savingPermit}
                              className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl text-white font-bold disabled:opacity-60"
                              style={{ background: '#b8895a' }}>
                              {savingPermit ? <Loader2 size={15} className="animate-spin" /> : <FileCheck size={15} />}Add Permit
                            </button>
                            <button type="button" onClick={() => setShowAddPermit(false)} className="px-5 py-3 rounded-xl border border-gray-200 font-semibold text-sm">Cancel</button>
                          </div>
                        </form>
                      </div>
                    </div>
                  )}
                </div>
              )
            })()}

            {/* ── PHOTOS TAB ── */}
            {detailTab === 'photos' && (
              <div>
                <div className="flex flex-wrap items-center gap-3 mb-5 p-4 bg-white rounded-2xl border border-gray-100 shadow-sm">
                  <select value={photoType} onChange={e => setPhotoType(e.target.value)} className="text-sm px-3 py-2 rounded-xl border border-gray-200 focus:outline-none">
                    {PHOTO_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                  </select>
                  <input value={photoCaption} onChange={e => setPhotoCaption(e.target.value)} placeholder="Caption (optional)" className="flex-1 min-w-32 px-3 py-2 rounded-xl border border-gray-200 text-sm focus:outline-none" />
                  <label className={`flex items-center gap-2 px-3 py-2 rounded-xl text-white text-sm font-bold cursor-pointer ${uploadingPhoto?'opacity-50 cursor-not-allowed':''}`} style={{ background: '#b8895a' }}>
                    {uploadingPhoto?<Loader2 size={14} className="animate-spin"/>:<Camera size={14}/>} Take Photo
                    <input type="file" accept="image/*" capture="environment" className="hidden" disabled={uploadingPhoto} onChange={e=>{const f=e.target.files?.[0];if(f)uploadPhoto(f,null)}} />
                  </label>
                  <label className={`flex items-center gap-2 px-3 py-2 rounded-xl border-2 text-sm font-bold cursor-pointer hover:bg-blue-50 ${uploadingPhoto?'opacity-50 cursor-not-allowed':''}`} style={{ borderColor:'#b8895a', color:'#b8895a' }}>
                    {uploadingPhoto?<Loader2 size={14} className="animate-spin"/>:<Upload size={14}/>} Upload
                    <input type="file" accept="image/*,.pdf,.doc,.docx" className="hidden" disabled={uploadingPhoto} onChange={e=>{const f=e.target.files?.[0];if(f)uploadPhoto(f,null)}} />
                  </label>
                </div>
                {selected.photos?.length === 0 ? (
                  <div className="text-center py-16 text-gray-400">
                    <ImageIcon size={30} className="mx-auto mb-2 opacity-30" />
                    <p className="text-sm">No photos yet</p>
                  </div>
                ) : (
                  <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-2">
                    {selected.photos.map((p: Photo) => (
                      <PhotoTile key={p.id} photo={p} onView={() => setLightbox(p)} onDelete={() => deletePhoto(p.id)} />
                    ))}
                  </div>
                )}
              </div>
            )}
          </>
        )}

        {/* Manual Merge Modal */}
        {showMergeModal && mergeSelected.size >= 2 && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg">
              <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
                <h2 className="font-bold text-gray-900">Merge {mergeSelected.size} Worksites</h2>
                <button onClick={() => setShowMergeModal(false)}><X size={18} className="text-gray-400" /></button>
              </div>
              <div className="p-6 space-y-4">
                <p className="text-sm text-gray-600">Choose which address to <strong>keep</strong>. All visits, photos, and data from the others will be moved to it, then the duplicates will be deleted.</p>
                <div className="space-y-2">
                  {Array.from(mergeSelected).map(id => {
                    const site = sites.find(s => s.id === id)
                    if (!site) return null
                    return (
                      <label key={id} className={`flex items-start gap-3 p-3 rounded-xl border-2 cursor-pointer transition-colors ${mergeKeepId === id ? 'border-amber-400 bg-amber-50' : 'border-gray-200 hover:border-gray-300'}`}>
                        <input type="radio" name="keepSite" value={id} checked={mergeKeepId === id}
                          onChange={() => setMergeKeepId(id)} className="mt-0.5" style={{ accentColor: '#b8895a' }} />
                        <div>
                          <div className="font-semibold text-gray-900 text-sm">{site.address}</div>
                          <div className="text-xs text-gray-500">{[site.city, site.state].filter(Boolean).join(', ')} · {(site as any).visit_count || 0} visits</div>
                        </div>
                        {mergeKeepId === id && <span className="ml-auto text-xs font-bold text-amber-700 bg-amber-100 px-2 py-0.5 rounded-full">KEEP</span>}
                      </label>
                    )
                  })}
                </div>
                <button onClick={manualMerge} disabled={!mergeKeepId || merging}
                  className="w-full py-3 rounded-xl text-white font-bold disabled:opacity-50 flex items-center justify-center gap-2"
                  style={{ background: '#b8895a' }}>
                  {merging && <Loader2 size={14} className="animate-spin" />}
                  Merge — Keep "{sites.find(s => s.id === mergeKeepId)?.address}"
                </button>
              </div>
            </div>
          </div>
        )}

        {/* New Visit Modal */}
        {showNewVisit && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
              <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between sticky top-0 bg-white">
                <h2 className="font-bold text-gray-900">Log Visit / Work</h2>
                <button onClick={() => setShowNewVisit(false)}><X size={18} className="text-gray-400" /></button>
              </div>
              <form onSubmit={createVisit} className="p-6 space-y-4">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-gray-700 mb-1">Date</label>
                    <input type="date" value={visitForm.visit_date} onChange={e => setVisitForm(f => ({ ...f, visit_date: e.target.value }))} required className={inputCls} />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-gray-700 mb-1">Service Type</label>
                    <select value={visitForm.service_type} onChange={e => setVisitForm(f => ({ ...f, service_type: e.target.value }))} className={inputCls}>
                      <option value="">Select...</option>
                      {SERVICE_TYPES.map(s => <option key={s} value={s}>{s}</option>)}
                    </select>
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1">Work Performed</label>
                  <textarea value={visitForm.work_performed} onChange={e => setVisitForm(f => ({ ...f, work_performed: e.target.value }))}
                    rows={4} placeholder="Describe all work performed, materials used, pressures tested..." className={inputCls} />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-gray-700 mb-1">Customer Name</label>
                    <input value={visitForm.customer_name} onChange={e => setVisitForm(f => ({ ...f, customer_name: e.target.value }))} placeholder="Homeowner at time of visit" className={inputCls} />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-gray-700 mb-1">Customer Phone</label>
                    <input value={visitForm.customer_phone} onChange={e => setVisitForm(f => ({ ...f, customer_phone: e.target.value }))} placeholder="555-000-0000" className={inputCls} />
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1">Technician</label>
                  <input value={visitForm.technician} onChange={e => setVisitForm(f => ({ ...f, technician: e.target.value }))} className={inputCls} />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1">Internal Notes</label>
                  <textarea value={visitForm.notes} onChange={e => setVisitForm(f => ({ ...f, notes: e.target.value }))} rows={2} placeholder="Any additional notes..." className={inputCls} />
                </div>
                <div className="flex gap-3 pt-2">
                  <button type="submit" disabled={savingVisit}
                    className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl text-white font-bold disabled:opacity-60"
                    style={{ background: '#b8895a' }}>
                    {savingVisit ? <Loader2 size={15} className="animate-spin" /> : <CheckCircle2 size={15} />}Save Visit
                  </button>
                  <button type="button" onClick={() => setShowNewVisit(false)} className="px-5 py-3 rounded-xl border border-gray-200 font-semibold text-sm">Cancel</button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Lightbox */}
        {lightbox && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 p-4" onClick={() => setLightbox(null)}>
            <div className="relative max-w-4xl max-h-full" onClick={e => e.stopPropagation()}>
              <img src={lightbox.file_url} alt={lightbox.caption || ''} className="max-w-full max-h-[80vh] rounded-xl object-contain" />
              {(lightbox.caption || lightbox.photo_type !== 'general') && (
                <div className="absolute bottom-0 left-0 right-0 bg-black/60 text-white px-4 py-2 rounded-b-xl text-sm">
                  {lightbox.photo_type !== 'general' && <span className="capitalize font-semibold mr-2">{lightbox.photo_type}</span>}
                  {lightbox.caption}
                </div>
              )}
              <button onClick={() => setLightbox(null)} className="absolute top-2 right-2 w-8 h-8 rounded-full bg-black/50 text-white flex items-center justify-center hover:bg-black/80">
                <X size={16} />
              </button>
              <button onClick={() => deletePhoto(lightbox.id)} className="absolute top-2 left-2 w-8 h-8 rounded-full bg-red-500/80 text-white flex items-center justify-center hover:bg-red-600">
                <Trash2 size={14} />
              </button>
            </div>
          </div>
        )}
      </div>
    )
  }

  // â"€â"€ List view â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€
  return (
    <div className="p-6 md:p-8 pt-16 md:pt-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-extrabold text-gray-900">Worksites</h1>
          <p className="text-gray-500 text-sm mt-0.5">Property history</p>
        </div>
        <div className="flex items-center gap-2">
          {mergeSelectMode ? (
            <>
              <span className="text-xs text-gray-500 font-semibold">{mergeSelected.size} selected</span>
              <button onClick={() => { setShowMergeModal(true); setMergeKeepId(Array.from(mergeSelected)[0] || '') }}
                disabled={mergeSelected.size < 2 || merging}
                className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl font-bold text-sm text-white disabled:opacity-50"
                style={{ background: '#b8895a' }}>
                {merging ? <Loader2 size={13} className="animate-spin" /> : <Link2 size={13} />}
                Merge {mergeSelected.size} Sites
              </button>
              <button onClick={() => { setMergeSelectMode(false); setMergeSelected(new Set()) }}
                className="px-4 py-2.5 rounded-xl font-bold text-sm border border-gray-200 hover:bg-gray-50">
                Cancel
              </button>
            </>
          ) : (
            <>
              <button onClick={() => setMergeSelectMode(true)}
                className="flex items-center gap-2 px-4 py-2.5 rounded-xl font-bold text-sm border border-gray-200 hover:bg-gray-50 transition-all"
                title="Select worksites to manually merge">
                <Link2 size={14} /> Merge Sites
              </button>
              <button onClick={mergeDuplicates} disabled={merging}
                className="flex items-center gap-2 px-4 py-2.5 rounded-xl font-bold text-sm border border-gray-200 hover:bg-gray-50 disabled:opacity-60 transition-all"
                title="Auto-detect and merge worksites with the same address">
                {merging ? <Loader2 size={14} className="animate-spin" /> : null}
                {merging ? 'Auto-mergingâ€¦' : 'Auto-merge'}
              </button>
            </>
          )}
          <button onClick={importFromInvoices} disabled={importing}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl font-bold text-sm border border-gray-200 hover:bg-gray-50 disabled:opacity-60 transition-all"
            style={{ color: '#b8895a' }}>
            {importing ? <Loader2 size={14} className="animate-spin" /> : <FileText size={14} />}
            {importing ? 'Importingâ€¦' : 'Import from Invoices'}
          </button>
          <button onClick={() => setShowNewSite(true)}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-white font-bold shadow-md text-sm"
            style={{ background: '#b8895a' }}>
            <Plus size={14} />Add Property
          </button>
        </div>
      </div>

      {/* Merge result banner */}
      {mergeResult && (
        <div className={`mb-4 flex items-start gap-3 px-4 py-3 rounded-xl text-sm border ${mergeResult.failures && mergeResult.failures.length > 0 ? 'bg-red-50 border-red-200' : 'bg-amber-50 border-amber-200'}`}>
          {mergeResult.failures && mergeResult.failures.length > 0 ? (
            <AlertCircle size={16} className="text-red-700 flex-shrink-0 mt-0.5" />
          ) : (
            <CheckCircle2 size={16} className="text-amber-700 flex-shrink-0 mt-0.5" />
          )}
          <div className="flex-1">
            <div className={`font-semibold ${mergeResult.failures && mergeResult.failures.length > 0 ? 'text-red-900' : 'text-amber-900'}`}>
              {mergeResult.groupsFound === 0
                ? 'No duplicate worksites found.'
                : mergeResult.merged === 0
                  ? `Found ${mergeResult.groupsFound} duplicate group${mergeResult.groupsFound === 1 ? '' : 's'} but couldn't merge — see failures below.`
                  : `Merged ${mergeResult.merged} duplicate worksite${mergeResult.merged === 1 ? '' : 's'} (${mergeResult.groupsFound} group${mergeResult.groupsFound === 1 ? '' : 's'}).`}
            </div>
            {mergeResult.mergedGroups && mergeResult.mergedGroups.length > 0 && (
              <ul className="text-xs text-amber-800 mt-1 space-y-0.5">
                {mergeResult.mergedGroups.slice(0, 8).map((g: any, i: number) => (
                  <li key={i}>· Kept "<strong>{g.kept.address}</strong>" — merged: {g.merged_addresses.join(' / ')}</li>
                ))}
              </ul>
            )}
            {mergeResult.failures && mergeResult.failures.length > 0 && (
              <ul className="text-xs text-red-800 mt-2 space-y-1">
                {mergeResult.failures.slice(0, 8).map((f: any, i: number) => (
                  <li key={i}>
                    <div className="font-semibold">{f.addresses?.join(' / ')}</div>
                    <div className="opacity-80">{f.reason}</div>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <button onClick={() => setMergeResult(null)} className="text-amber-700 hover:text-amber-900"><X size={14} /></button>
        </div>
      )}

      {/* Import result banner */}
      {importResult && (
        <div className="mb-4 flex items-center gap-3 px-4 py-3 bg-green-50 border border-green-200 rounded-xl text-sm">
          <CheckCircle2 size={16} className="text-green-600 flex-shrink-0" />
          <span className="text-green-800 font-semibold">
            Import complete â€" {importResult.sitesCreated} new properties, {importResult.visitsCreated} visit records created
            {importResult.skipped > 0 ? `, ${importResult.skipped} already existed (skipped)` : ''}
          </span>
          <button onClick={() => setImportResult(null)} className="ml-auto text-green-600 hover:text-green-800"><X size={14} /></button>
        </div>
      )}

      {/* Search */}
      <div className="relative mb-5">
        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
        <input value={search} onChange={e => setSearch(e.target.value)} onKeyDown={e => e.key === 'Enter' && loadSites()}
          placeholder="Search by address..." className="w-full max-w-sm pl-9 pr-3 py-2 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:border-blue-400" />
      </div>

      {/* List */}
      {loading ? (
        <div className="flex justify-center py-20"><Loader2 size={28} className="animate-spin" style={{ color: '#b8895a' }} /></div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-20 text-gray-400">
          <MapPin size={32} className="mx-auto mb-3 opacity-30" />
          <p className="text-sm font-medium">No worksites yet</p>
          <p className="text-xs mt-1 mb-5">Import from your existing invoices or add a property manually</p>
          <div className="flex items-center justify-center gap-3">
            <button onClick={importFromInvoices} disabled={importing}
              className="flex items-center gap-2 px-5 py-2.5 rounded-xl font-bold text-sm border-2 disabled:opacity-60"
              style={{ borderColor: '#b8895a', color: '#b8895a' }}>
              {importing ? <Loader2 size={14} className="animate-spin" /> : <FileText size={14} />}
              {importing ? 'Importingâ€¦' : 'Import from Invoices'}
            </button>
            <button onClick={() => setShowNewSite(true)}
              className="text-white font-bold px-6 py-2.5 rounded-xl shadow-md text-sm"
              style={{ background: '#b8895a' }}>Add First Property</button>
          </div>
        </div>
      ) : (
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="overflow-x-auto" style={{ WebkitOverflowScrolling: 'touch' }}>
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-100">
                  {['', 'Address', 'Type', 'Account', 'Visits', 'Open Tasks', ''].map((h, i) => (
                    <th key={i} className="text-left px-5 py-3 text-xs font-semibold text-gray-600 uppercase tracking-wider">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {filtered.map(site => {
                  const PropIcon = propIcon(site.property_type)
                  const isSelForMerge = mergeSelected.has(site.id)
                  return (
                    <tr key={site.id}
                      onClick={() => {
                        if (mergeSelectMode) {
                          setMergeSelected(prev => { const n = new Set(prev); n.has(site.id) ? n.delete(site.id) : n.add(site.id); return n })
                        } else {
                          openSite(site)
                        }
                      }}
                      className={`hover:bg-gray-50 cursor-pointer transition-colors ${isSelForMerge ? 'bg-amber-50 ring-1 ring-amber-300' : ''}`}>
                      <td className="px-5 py-3">
                        {mergeSelectMode ? (
                          <input type="checkbox" checked={isSelForMerge} readOnly
                            className="w-4 h-4 rounded cursor-pointer" style={{ accentColor: '#b8895a' }} />
                        ) : (
                          <div className="w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: '#f3ede3' }}>
                            <PropIcon size={15} style={{ color: '#b8895a' }} />
                          </div>
                        )}
                      </td>
                      <td className="px-5 py-3">
                        <div className="font-semibold text-gray-900">{site.address}</div>
                        <div className="text-xs text-gray-500">{[site.city, site.state, site.zip].filter(Boolean).join(', ')}</div>
                      </td>
                      <td className="px-5 py-3">
                        <span className="text-xs capitalize text-gray-500">{site.property_type}</span>
                      </td>
                      <td className="px-5 py-3">
                        {(site as any).financial_account ? (
                          <span className="inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full"
                            style={{ background: 'rgba(184,137,90,0.12)', color: (site as any).financial_account.color || '#b8895a' }}>
                            <DollarSign size={10} />{(site as any).financial_account.name}
                          </span>
                        ) : <span className="text-xs text-gray-300">—</span>}
                      </td>
                      <td className="px-5 py-3">
                        <span className={`text-sm font-bold ${site.visit_count > 0 ? '' : 'text-gray-400'}`} style={{ color: site.visit_count > 0 ? '#b8895a' : undefined }}>{site.visit_count}</span>
                      </td>
                      <td className="px-5 py-3">
                        {(() => {
                          const count = openPermitsByAddress[site.address.toLowerCase().trim()] || 0
                          return count > 0 ? (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-bold bg-amber-100 text-amber-700">
                              <FileCheck size={10} />{count} open
                            </span>
                          ) : <span className="text-gray-300 text-xs">—</span>
                        })()}
                      </td>
                      <td className="px-5 py-3">
                        <ChevronRight size={16} className="text-gray-300" />
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* New Site Modal */}
      {showNewSite && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg">
            <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
              <h2 className="font-bold text-gray-900">Add Property</h2>
              <button onClick={() => setShowNewSite(false)}><X size={18} className="text-gray-400" /></button>
            </div>
            <form onSubmit={createSite} className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">Street Address <span className="text-red-500">*</span></label>
                <input value={siteForm.address} onChange={e => setSiteForm(f => ({ ...f, address: e.target.value }))}
                  placeholder="123 Main St" required className={inputCls} autoFocus />
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div className="col-span-3 sm:col-span-1">
                  <label className="block text-xs font-semibold text-gray-700 mb-1">City</label>
                  <input value={siteForm.city} onChange={e => setSiteForm(f => ({ ...f, city: e.target.value }))} placeholder="Crestview" className={inputCls} />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1">State</label>
                  <input value={siteForm.state} onChange={e => setSiteForm(f => ({ ...f, state: e.target.value }))} className={inputCls} />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1">ZIP</label>
                  <input value={siteForm.zip} onChange={e => setSiteForm(f => ({ ...f, zip: e.target.value }))} className={inputCls} />
                </div>
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">Property Type</label>
                <div className="flex gap-2">
                  {PROPERTY_TYPES.map(({ value, label, icon: Icon }) => (
                    <button key={value} type="button"
                      onClick={() => setSiteForm(f => ({ ...f, property_type: value }))}
                      className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl border-2 text-sm font-semibold transition-all ${siteForm.property_type === value ? 'text-white border-transparent' : 'border-gray-200 text-gray-500 hover:border-gray-300'}`}
                      style={{ background: siteForm.property_type === value ? '#b8895a' : undefined }}>
                      <Icon size={14} />{label}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">Notes</label>
                <textarea value={siteForm.notes} onChange={e => setSiteForm(f => ({ ...f, notes: e.target.value }))}
                  rows={2} placeholder="Gate code, access notes, special instructions..." className={inputCls} />
              </div>
              <div className="flex gap-3 pt-1">
                <button type="submit" disabled={savingSite}
                  className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl text-white font-bold disabled:opacity-60"
                  style={{ background: '#b8895a' }}>
                  {savingSite ? <Loader2 size={15} className="animate-spin" /> : <MapPin size={15} />}Add Property
                </button>
                <button type="button" onClick={() => setShowNewSite(false)} className="px-5 py-3 rounded-xl border border-gray-200 font-semibold text-sm">Cancel</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}

function PhotoTile({ photo, onView, onDelete }: { photo: Photo; onView: () => void; onDelete: () => void }) {
  return (
    <div className="relative group aspect-square">
      <img src={photo.file_url} alt={photo.caption || photo.photo_type}
        onClick={onView}
        className="w-full h-full object-cover rounded-xl cursor-pointer hover:opacity-90 transition-opacity border border-gray-100" />
      {photo.photo_type !== 'general' && (
        <span className="absolute bottom-1 left-1 text-xs bg-black/60 text-white px-1.5 py-0.5 rounded font-medium capitalize">{photo.photo_type}</span>
      )}
      {photo.caption && (
        <span className="absolute bottom-1 right-1 w-4 h-4 rounded-full bg-black/60 flex items-center justify-center" title={photo.caption}>
          <span className="text-white text-xs">i</span>
        </span>
      )}
      <button onClick={onDelete}
        className="absolute top-1 right-1 w-5 h-5 rounded-full bg-red-500 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
        <X size={10} />
      </button>
    </div>
  )
}
