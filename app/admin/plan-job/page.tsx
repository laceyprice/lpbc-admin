'use client'
import { useEffect, useRef, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { Sparkles, Loader2, ClipboardList, DollarSign, Clock, AlertTriangle, ListChecks, TrendingUp, History, Hammer, Upload, X, Image as ImageIcon, Film, FileText, Ruler, Save, FolderOpen, Plus, Trash2, Archive, Cloud, Folder, ChevronLeft, Search, Download, MapPin, Users2, Pencil, Check, RotateCcw, Wand2, CalendarDays, ExternalLink, FolderPlus, Link2, RefreshCw } from 'lucide-react'
import DesignStudio, { DesignData } from '@/components/admin/DesignStudio'
import ProjectSchedule from '@/components/admin/ProjectSchedule'

interface BudgetLine {
  category: string
  estimated_cost: number
  notes: string
  // Groups the line into a typical contracting trade/phase so the breakdown
  // reads like a real budget (Demo, Electrical, Plumbing, etc) instead of a
  // flat list. Optional + defaulted/inferred for legacy & AI-returned data
  // that doesn't set it.
  section?: string
  // Filled in later as the project moves from estimate → quote → completed job,
  // so the owner can see the spread between what was estimated, quoted, and billed.
  quoted_cost?: number | null
  actual_cost?: number | null
}

// Standard trade/phase sections the Budget Breakdown groups line items into —
// mirrors how a real contractor budget reads (Demo → Rough-in trades → Finishes).
const BUDGET_SECTIONS = [
  'Design & Sourcing',
  'Demo',
  'Framing & Structural',
  'Plumbing',
  'Electrical',
  'HVAC',
  'Drywall & Paint',
  'Flooring & Tile',
  'Cabinetry & Countertops',
  'Trim & Finish Carpentry',
  'Fixtures & Hardware',
  'Other',
]

// Best-effort mapping for legacy/AI line items that don't carry a `section` —
// keyword-matches the category + notes text against the trade vocabulary so
// existing estimates land in sensible groups instead of all piling into "Other".
function inferSection(category: string | undefined, notes: string | undefined): string {
  const text = `${category || ''} ${notes || ''}`.toLowerCase()
  const rules: Array<[string, RegExp]> = [
    ['Demo', /\bdemo(lition)?\b|\btear[\s-]?out\b|\bdemolish/],
    ['Plumbing', /\bplumb|\bpipe|\bvanity|\btoilet|\bfaucet|\bshower valve|\bwater heater|\bdrain|\bsewer|\bsupply line/],
    ['Electrical', /\belectric|\bwiring|\bwire\b|\boutlet|\bcircuit|\bbreaker|\bwafer light|\bceiling fan|\bswitch(es)?\b|\bcable box|\block ?box/],
    ['HVAC', /\bhvac|\bduct|\bair handler|\bcondenser|\bfurnace|\bmini[\s-]?split|\bvent(ilation)?\b/],
    ['Drywall & Paint', /\bdrywall|\bdry[\s-]?wall|\btexture|\bmud(ding)?\b|\btape\b|\bpaint(ing)?\b|\bprimer/],
    ['Flooring & Tile', /\btile|\bflooring|\bfloor(s)?\b|\bgrout|\bbacksplash|\bunderlayment/],
    ['Cabinetry & Countertops', /\bcabinet|\bcountertop|\bquartz|\bgranite|\bvanity cabinet/],
    ['Trim & Finish Carpentry', /\btrim\b|\bbaseboard|\bmolding|\bmoulding|\bcasing\b|\bfinish carpentry|\bdoor(s)? install/],
    ['Framing & Structural', /\bfram(e|ing)|\bstructural|\bjoist|\bheader\b|\bbulkhead|\bceiling (raise|structure)/],
    ['Fixtures & Hardware', /\bfixture|\bhardware|\blighting\b|\bpendant|\bsconce|\bmirror|\btowel bar/],
    ['Design & Sourcing', /\bdesign\b|\bsourcing\b|\bpm fee|\bproject management|\bselections?\b/],
  ]
  for (const [section, re] of rules) if (re.test(text)) return section
  return 'Other'
}
interface ProcessStep { step: number; title: string; description: string; estimated_days: number }
interface SimilarJob { service_date: string; amount: number; description: string }
interface Estimate {
  estimated_total: number
  materials_breakdown: BudgetLine[]
  // Legacy fields from older estimate shapes — folded into materials_breakdown
  // line items by normalizeEstimate() so the UI shows one unified Budget Breakdown.
  labor_estimate?: { hours: number; rate_per_hour: number; total: number }
  subcontractor_estimate?: number
  // Quote/invoice files attached once real numbers come in
  actual_documents?: Attachment[]
  duration_business_days: number
  process_steps: ProcessStep[]
  design_pm_fee: number
  design_pm_fee_percent: number
  design_pm_fee_rationale: string
  confidence: 'low' | 'medium' | 'high'
  confidence_rationale: string
  similar_past_jobs: SimilarJob[]
  assumptions: string[]
  risks: string[]
  photo_observations: string[]
}

interface Attachment {
  path: string
  name: string
  type: string
  size: number
  signed_url: string | null
}

interface JobPlanSummary {
  id: string
  title: string
  description: string
  estimate: Estimate | null
  estimate_generated_at: string | null
  is_archived: boolean
  status?: string
  worksite_id?: string | null
  shared_with_account_id?: string | null
  worksite?: { id: string; address: string; city: string } | null
  created_at: string
  updated_at: string
}

const PLAN_STATUS_LABEL: Record<string, { label: string; color: string }> = {
  draft:            { label: 'Draft',          color: 'bg-amber-100 text-amber-700' },
  estimated:        { label: 'Estimated',      color: 'bg-green-100 text-green-700' },
  sent_to_customer: { label: 'Sent',           color: 'bg-blue-100 text-blue-700' },
  approved:         { label: 'Approved',       color: 'bg-emerald-100 text-emerald-700' },
  scheduled:        { label: 'Scheduled',      color: 'bg-indigo-100 text-indigo-700' },
  in_progress:      { label: 'In Progress',    color: 'bg-orange-100 text-orange-700' },
  completed:        { label: 'Completed',      color: 'bg-gray-200 text-gray-700' },
}

function newSessionId() { return `plan_${Date.now()}_${Math.random().toString(36).slice(2, 8)}` }

// Older estimates carried materials/labor/subcontractor as separate buckets.
// We now show ONE unified "Budget Breakdown" — fold any legacy labor/subcontractor
// totals into line items (once) so nothing gets double-counted or hidden.
function normalizeEstimate(raw: any): Estimate {
  const breakdown: BudgetLine[] = Array.isArray(raw?.materials_breakdown)
    ? raw.materials_breakdown.map((m: any) => {
        const category = m?.category || ''
        const notes = m?.notes || ''
        return {
          category,
          estimated_cost: Number(m?.estimated_cost) || 0,
          notes,
          section: (typeof m?.section === 'string' && BUDGET_SECTIONS.includes(m.section)) ? m.section : inferSection(category, notes),
          quoted_cost: m?.quoted_cost ?? null,
          actual_cost: m?.actual_cost ?? null,
        }
      })
    : []
  const labor = raw?.labor_estimate
  if (labor && (Number(labor.total) > 0 || Number(labor.hours) > 0)) {
    const total = Number(labor.total) || (Number(labor.hours) || 0) * (Number(labor.rate_per_hour) || 0)
    breakdown.push({
      category: 'Labor',
      estimated_cost: Number(total.toFixed(2)),
      notes: labor.hours && labor.rate_per_hour ? `${labor.hours} hrs × $${labor.rate_per_hour}/hr` : '',
      quoted_cost: null, actual_cost: null,
    })
  }
  if (Number(raw?.subcontractor_estimate) > 0) {
    breakdown.push({ category: 'Subcontractors', estimated_cost: Number(raw.subcontractor_estimate), notes: '', quoted_cost: null, actual_cost: null })
  }
  return {
    ...raw,
    materials_breakdown: breakdown,
    labor_estimate: { hours: 0, rate_per_hour: 0, total: 0 },
    subcontractor_estimate: 0,
    actual_documents: Array.isArray(raw?.actual_documents) ? raw.actual_documents : [],
  } as Estimate
}

export default function PlanJobPage() {
  const searchParams = useSearchParams()
  const [planId, setPlanId] = useState<string | null>(null)
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [measurements, setMeasurements] = useState('')
  const [attachments, setAttachments] = useState<Attachment[]>([])
  const [estimate, setEstimate] = useState<Estimate | null>(null)
  const [meta, setMeta] = useState<any>(null)
  const [sessionId, setSessionId] = useState<string>(() => newSessionId())

  const [savedPlans, setSavedPlans] = useState<JobPlanSummary[]>([])
  const [showLoadPanel, setShowLoadPanel] = useState(false)
  const [showArchived, setShowArchived] = useState(false)

  const [uploading, setUploading] = useState(false)
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [savedAt, setSavedAt] = useState<Date | null>(null)
  const [previewing, setPreviewing] = useState<Attachment | null>(null)
  const [drivePickerOpen, setDrivePickerOpen] = useState(false)
  const [drivePickerMoodBoard, setDrivePickerMoodBoard] = useState(false)
  const [drivePickerForSketch, setDrivePickerForSketch] = useState(false)
  const [sketchDriveImageUrl, setSketchDriveImageUrl] = useState<string | null>(null)
  const [progressTokens, setProgressTokens] = useState(0)
  const fileRef = useRef<HTMLInputElement>(null)

  // Scope of work generation — tracks which section keys are in-flight + links to created docs
  const [scopeGenerating, setScopeGenerating] = useState<Set<string>>(new Set())
  const [scopeLinks, setScopeLinks] = useState<Record<string, string>>({})

  // Permit requirement check
  const [permitCheck, setPermitCheck] = useState<any>(null)
  const [permitCheckLoading, setPermitCheckLoading] = useState(false)
  const [permitResearching, setPermitResearching] = useState(false)

  // Auto-save: track dirty state, debounce timer, and a ref to always-current save fn
  const [isDirty, setIsDirty] = useState(false)
  const autoSaveTimerRef = useRef<NodeJS.Timeout | null>(null)
  const saveRef = useRef<() => Promise<void>>(async () => {})
  const isLoadingPlanRef = useRef(false) // true while loadPlan() is running

  // Project linking — worksite, status, customer sharing
  const [worksiteId, setWorksiteId] = useState<string | null>(null)
  const [status, setStatus] = useState<string>('draft')
  const [sharedWithAccountId, setSharedWithAccountId] = useState<string | null>(null)
  const [worksiteOptions, setWorksiteOptions] = useState<Array<{ id: string; address: string; city: string }>>([])
  const [customerOptions, setCustomerOptions] = useState<Array<{ account_id: string; account_name: string; customer_label: string }>>([])
  const [editingEstimate, setEditingEstimate] = useState(false)

  // Design Studio — mood boards, sketches, before/after, AI design directions
  const [design, setDesign] = useState<DesignData>({})
  const [designStudioOpen, setDesignStudioOpen] = useState(false)

  // Drive folder — connected Drive folder for sharing SOW / collecting COIs
  const [driveFolderId,   setDriveFolderId]   = useState<string | null>(null)
  const [driveFolderName, setDriveFolderName] = useState<string | null>(null)
  const [driveFiles,      setDriveFiles]      = useState<any[]>([])
  const [driveLoading,    setDriveLoading]    = useState(false)
  const [driveUploading,  setDriveUploading]  = useState(false)
  const [driveError,      setDriveError]      = useState('')
  const [showConnectUrl,  setShowConnectUrl]  = useState(false)
  const [connectUrlInput, setConnectUrlInput] = useState('')
  const driveFileRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    (async () => {
      try {
        const [wsRes, urRes] = await Promise.all([
          fetch('/api/worksites'),
          fetch('/api/user-roles'),
        ])
        const ws = await wsRes.json()
        if (Array.isArray(ws)) setWorksiteOptions(ws.map((w: any) => ({ id: w.id, address: w.address, city: w.city })))
        const ur = await urRes.json()
        if (Array.isArray(ur)) {
          const customers = ur.filter((u: any) => u.role === 'customer' && u.assigned_account_id)
          setCustomerOptions(customers.map((u: any) => ({
            account_id: u.assigned_account_id,
            account_name: u.assigned_account_id,
            customer_label: u.display_name || u.email,
          })))
        }
      } catch {}
    })()
  }, [])

  async function importFromDrive(files: Array<{ fileId: string; fileName: string; mimeType: string }>) {
    if (!files.length) return
    setUploading(true); setError('')
    try {
      const res = await fetch('/api/google-drive?action=import-to-job-planning', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ session_id: sessionId, files }),
      })
      const ct = res.headers.get('content-type') || ''
      if (!ct.includes('application/json')) {
        // 504 ingress timeout or other proxy error returns HTML — translate to plain English
        setError(res.status === 504
          ? 'Drive import timed out. Try selecting fewer files, or smaller files (videos and >15MB files are skipped).'
          : `Drive import failed (status ${res.status})`)
        setUploading(false); return
      }
      const d = await res.json()
      if (!res.ok) { setError(d.error || 'Drive import failed'); setUploading(false); return }
      const uploaded = d.uploaded || []
      setAttachments(prev => [...prev, ...uploaded])
      // If Drive was opened from Design Studio Mood Board, auto-add images to the board
      if (drivePickerMoodBoard) {
        const images = uploaded.filter((a: any) => typeof a.type === 'string' && a.type.startsWith('image/'))
        if (images.length > 0) {
          setDesign(prev => ({
            ...prev,
            board: [
              ...(prev.board || []),
              ...images.map((att: any) => ({
                id: `board_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
                path: att.path, signed_url: att.signed_url, name: att.name,
                room: 'Other', label: att.name.replace(/\.[^.]+$/, ''), notes: '', price: 0,
              })),
            ],
          }))
        }
        setDrivePickerMoodBoard(false)
      }
      if (drivePickerForSketch) {
        const images = uploaded.filter((a: any) => typeof a.type === 'string' && a.type.startsWith('image/'))
        if (images.length > 0 && images[0].signed_url) {
          setSketchDriveImageUrl(images[0].signed_url)
        }
        setDrivePickerForSketch(false)
      }
      if (Array.isArray(d.skipped) && d.skipped.length > 0) {
        const summary = d.skipped.slice(0, 5).map((s: any) => `• ${s.name}: ${s.reason}`).join('\n')
        const extra = d.skipped.length > 5 ? `\n…and ${d.skipped.length - 5} more` : ''
        setError(`Some files were skipped:\n${summary}${extra}`)
      }
    } catch (e: any) {
      setError(e?.message || 'Drive import failed')
    }
    setUploading(false)
  }

  useEffect(() => { loadPlansList() }, [showArchived])

  // Deep-link support: /admin/plan-job?id=<plan_id> (e.g. from a worksite's "Job Plans" list)
  useEffect(() => {
    const id = searchParams?.get('id')
    if (id) loadPlan(id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams])

  // Always keep saveRef pointing at the latest save() closure (avoids stale-state in setTimeout)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { saveRef.current = save })

  // Warn before closing/refreshing the tab if there are unsaved changes
  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (!isDirty) return
      e.preventDefault()
      e.returnValue = ''
    }
    window.addEventListener('beforeunload', handler)
    return () => window.removeEventListener('beforeunload', handler)
  }, [isDirty])

  async function loadPlansList() {
    try {
      const res = await fetch(`/api/job-plans${showArchived ? '?archived=true' : ''}`)
      const d = await res.json()
      setSavedPlans(Array.isArray(d) ? d : [])
    } catch {}
  }

  function markDirty() {
    if (isLoadingPlanRef.current) return // never mark dirty during a plan load
    setIsDirty(true)
    if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current)
    autoSaveTimerRef.current = setTimeout(async () => {
      await saveRef.current()
      setIsDirty(false)
    }, 3000)
  }

  function clearDirty() {
    setIsDirty(false)
    if (autoSaveTimerRef.current) { clearTimeout(autoSaveTimerRef.current); autoSaveTimerRef.current = null }
  }

  function reset() {
    setPlanId(null)
    setTitle('')
    setDescription('')
    setMeasurements('')
    setAttachments([])
    setEstimate(null)
    setMeta(null)
    setSavedAt(null)
    setError('')
    setSessionId(newSessionId())
    setWorksiteId(null)
    setStatus('draft')
    setSharedWithAccountId(null)
    setEditingEstimate(false)
    setDesign({})
    setDesignStudioOpen(false)
    setDriveFolderId(null)
    setDriveFolderName(null)
    setDriveFiles([])
    setDriveError('')
    setShowConnectUrl(false)
    clearDirty()
  }

  async function loadPlan(id: string) {
    isLoadingPlanRef.current = true
    setError('')
    try {
      const res = await fetch(`/api/job-plans?id=${id}`)
      const d = await res.json()
      if (!res.ok) { setError(d.error || 'Failed to load plan'); isLoadingPlanRef.current = false; return }
      setPlanId(d.id)
      setTitle(d.title || '')
      setDescription(d.description || '')
      setMeasurements(d.measurements || '')
      setAttachments(Array.isArray(d.attachments) ? d.attachments : [])
      setEstimate(d.estimate ? normalizeEstimate(d.estimate) : null)
      setSessionId(d.session_id || newSessionId())
      setShowLoadPanel(false)
      setSavedAt(d.updated_at ? new Date(d.updated_at) : null)
      setMeta(null)
      setWorksiteId(d.worksite_id || null)
      setStatus(d.status || 'draft')
      setSharedWithAccountId(d.shared_with_account_id || null)
      setEditingEstimate(false)
      setDesign(d.design && typeof d.design === 'object' ? d.design : {})
      setDesignStudioOpen(false)
      const fid = d.drive_folder_id || null
      setDriveFolderId(fid)
      setDriveFolderName(d.drive_folder_name || null)
      setDriveFiles([])
      if (fid) loadDriveFiles(fid)
      clearDirty()
    } catch (e: any) {
      setError(e?.message || 'Failed to load plan')
    }
    isLoadingPlanRef.current = false
  }

  async function save() {
    setSaving(true)
    setError('')
    try {
      const body: any = {
        title: title || deriveTitle(description) || 'Untitled Plan',
        description, measurements, session_id: sessionId,
        attachments, estimate, design,
        worksite_id: worksiteId, status, shared_with_account_id: sharedWithAccountId,
        drive_folder_id: driveFolderId, drive_folder_name: driveFolderName,
      }
      const url = '/api/job-plans'
      const method = planId ? 'PATCH' : 'POST'
      if (planId) body.id = planId
      const res = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      const d = await res.json()
      if (!res.ok) { setError(d.error || 'Save failed'); setSaving(false); return }
      if (!planId) setPlanId(d.id)
      setSavedAt(new Date())
      clearDirty()
      await loadPlansList()
    } catch (e: any) {
      setError(e?.message || 'Save failed')
    }
    setSaving(false)
  }

  async function deletePlan(id: string, ttl: string) {
    if (!confirm(`Delete "${ttl}" permanently? This also removes its uploaded files.`)) return
    await fetch(`/api/job-plans?id=${id}`, { method: 'DELETE' })
    if (planId === id) reset()
    await loadPlansList()
  }

  async function toggleArchive(p: JobPlanSummary) {
    await fetch('/api/job-plans', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: p.id, is_archived: !p.is_archived }) })
    await loadPlansList()
  }

  async function handleFiles(files: FileList | File[]) {
    const list = Array.from(files)
    if (!list.length) return
    setUploading(true); setError('')
    try {
      const fd = new FormData()
      fd.append('session_id', sessionId)
      for (const f of list) fd.append('file', f)
      const res = await fetch('/api/job-planning', { method: 'POST', body: fd })
      const d = await res.json()
      if (!res.ok) { setError(d.error || 'Upload failed'); setUploading(false); return }
      setAttachments(prev => [...prev, ...(d.uploaded || [])])
    } catch (e: any) {
      setError(e?.message || 'Upload failed')
    }
    setUploading(false)
    if (fileRef.current) fileRef.current.value = ''
  }

  async function removeAttachment(att: Attachment) {
    await fetch(`/api/job-planning?path=${encodeURIComponent(att.path)}`, { method: 'DELETE' })
    setAttachments(prev => prev.filter(a => a.path !== att.path))
  }

  // ── Drive Folder helpers ──────────────────────────────────────────────────
  async function loadDriveFiles(fid: string) {
    setDriveLoading(true); setDriveError('')
    try {
      const res = await fetch(`/api/drive-folder?action=list&folder_id=${fid}`)
      const d = await res.json()
      if (!res.ok) { setDriveError(d.error || 'Could not list files'); setDriveLoading(false); return }
      setDriveFiles(d.files || [])
    } catch (e: any) { setDriveError(e?.message || 'Drive error') }
    setDriveLoading(false)
  }

  async function createDriveFolder() {
    setDriveLoading(true); setDriveError('')
    const folderName = `${title || deriveTitle(description) || 'Project'} — Documents`
    try {
      const res = await fetch('/api/drive-folder?action=create-folder', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: folderName }),
      })
      const d = await res.json()
      if (!res.ok) { setDriveError(d.error || 'Could not create folder'); setDriveLoading(false); return }
      const folder = d.folder
      setDriveFolderId(folder.id)
      setDriveFolderName(folder.name)
      setDriveFiles([])
      markDirty()
    } catch (e: any) { setDriveError(e?.message || 'Drive error') }
    setDriveLoading(false)
  }

  async function connectFolderFromUrl() {
    const url = connectUrlInput.trim()
    if (!url) return
    // Extract folder ID from Drive URL: https://drive.google.com/drive/folders/<id>
    const match = url.match(/folders\/([a-zA-Z0-9_-]+)/) || url.match(/^([a-zA-Z0-9_-]{25,})$/)
    const fid = match?.[1]
    if (!fid) { setDriveError('Could not extract folder ID from that URL. Paste the full Google Drive folder URL.'); return }
    setDriveLoading(true); setDriveError('')
    try {
      const res = await fetch(`/api/drive-folder?action=folder-info&folder_id=${fid}`)
      const d = await res.json()
      if (!res.ok) { setDriveError(d.error || 'Folder not found or not accessible'); setDriveLoading(false); return }
      setDriveFolderId(d.folder.id)
      setDriveFolderName(d.folder.name)
      setShowConnectUrl(false)
      setConnectUrlInput('')
      loadDriveFiles(d.folder.id)
      markDirty()
    } catch (e: any) { setDriveError(e?.message || 'Drive error') }
    setDriveLoading(false)
  }

  async function disconnectDriveFolder() {
    if (!confirm('Disconnect this Drive folder? The folder itself stays in Google Drive — it just won\'t be linked to this plan.')) return
    setDriveFolderId(null); setDriveFolderName(null); setDriveFiles([])
    markDirty()
  }

  async function uploadToDrive(files: FileList | File[]) {
    if (!driveFolderId || !files.length) return
    setDriveUploading(true); setDriveError('')
    try {
      for (const file of Array.from(files)) {
        const fd = new FormData()
        fd.append('folder_id', driveFolderId)
        fd.append('file', file)
        const res = await fetch('/api/drive-folder?action=upload', { method: 'POST', body: fd })
        const d = await res.json()
        if (!res.ok) { setDriveError(d.error || 'Upload failed'); break }
        if (d.file) setDriveFiles(prev => [d.file, ...prev])
      }
    } catch (e: any) { setDriveError(e?.message || 'Upload failed') }
    setDriveUploading(false)
    if (driveFileRef.current) driveFileRef.current.value = ''
  }

  async function generate() {
    if (description.trim().length < 10) { setError('Add at least a sentence or two describing the job'); return }
    // Regenerating replaces the whole Budget Breakdown — give a heads-up if there's
    // tracked Quoted/Actual data on line items that would otherwise quietly vanish.
    const priorEstimate = estimate
    if (priorEstimate) {
      const hasTrackingData = priorEstimate.materials_breakdown.some(m => m.quoted_cost != null || m.actual_cost != null)
      if (hasTrackingData) {
        const ok = window.confirm(
          "Regenerating replaces the Budget Breakdown with fresh AI numbers based on the updated scope.\n\n" +
          "Any Quoted / Actual Billed amounts you've entered on line items will be lost (attached quote & invoice files will carry over).\n\n" +
          "Continue?"
        )
        if (!ok) return
      }
    }
    setError(''); setLoading(true); setEstimate(null); setMeta(null); setProgressTokens(0)
    try {
      const res = await fetch('/api/estimate-job', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          description, measurements,
          attachments: attachments.map(a => ({ path: a.path, name: a.name, type: a.type, size: a.size })),
        }),
      })
      const ct = res.headers.get('content-type') || ''
      if (!ct.includes('text/event-stream')) {
        // Non-streaming error path (validation failed, JSON error body)
        try {
          const d = await res.json()
          setError(d.error || `Request failed (status ${res.status})`)
        } catch {
          setError(`Estimate request failed (status ${res.status})`)
        }
        setLoading(false); return
      }

      // Parse SSE stream
      const reader = res.body!.getReader()
      const decoder = new TextDecoder()
      let buf = ''
      let finalEstimate: Estimate | null = null
      let finalMeta: any = null

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buf += decoder.decode(value, { stream: true })
        // SSE events separated by \n\n
        let idx
        while ((idx = buf.indexOf('\n\n')) !== -1) {
          const block = buf.slice(0, idx)
          buf = buf.slice(idx + 2)
          if (block.startsWith(':')) continue   // keepalive comment
          const lines = block.split('\n')
          let evt = 'message', data = ''
          for (const line of lines) {
            if (line.startsWith('event: ')) evt = line.slice(7).trim()
            else if (line.startsWith('data: ')) data += line.slice(6)
          }
          if (!data) continue
          let payload: any
          try { payload = JSON.parse(data) } catch { continue }
          if (evt === 'progress') setProgressTokens(payload.tokens_so_far || 0)
          else if (evt === 'result') {
            finalEstimate = payload.estimate ? normalizeEstimate(payload.estimate) : null
            finalMeta = payload.historical_data_used
          } else if (evt === 'error') {
            setError((payload.error || 'Estimate failed') + (payload.detail ? ` — ${payload.detail}` : '') + (payload.raw ? `\n\nRaw AI output (truncated):\n${payload.raw}` : ''))
          }
        }
      }

      if (finalEstimate) {
        // Carry forward attached quote/invoice files across a regeneration —
        // those documents describe the real world, not the AI's draft numbers.
        if (priorEstimate?.actual_documents?.length) {
          finalEstimate.actual_documents = [...priorEstimate.actual_documents, ...(finalEstimate.actual_documents || [])]
        }
        setEstimate(finalEstimate)
        setMeta(finalMeta)
        setTimeout(() => saveAfterEstimate(finalEstimate!), 0)
      }
    } catch (e: any) {
      setError(e?.message || 'Estimate failed')
    }
    setLoading(false)
  }

  async function saveAfterEstimate(est: Estimate) {
    try {
      const body: any = {
        title: title || deriveTitle(description) || 'Untitled Plan',
        description, measurements, session_id: sessionId, attachments, estimate: est, design,
        worksite_id: worksiteId,
        status: status === 'draft' ? 'estimated' : status,
        shared_with_account_id: sharedWithAccountId,
      }
      const method = planId ? 'PATCH' : 'POST'
      if (planId) body.id = planId
      const res = await fetch('/api/job-plans', { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      const d = await res.json()
      if (res.ok) {
        if (!planId) setPlanId(d.id)
        if (d.status) setStatus(d.status)
        setSavedAt(new Date())
        await loadPlansList()
      }
    } catch {}
  }

  function onDrop(e: React.DragEvent) { e.preventDefault(); if (e.dataTransfer.files?.length) handleFiles(e.dataTransfer.files) }

  // ── Live recalculation when the estimate is hand-edited ──────────────────
  // Job cost = sum of every Budget Breakdown line (materials, labor, subs — all
  // unified into one table now). Design/PM fee derives from the (possibly-edited)
  // percent against the freshly recalculated job cost, so any edit ripples through.
  function recalc(est: Estimate): Estimate {
    const estimated_total = Number(est.materials_breakdown.reduce((s, m) => s + (Number(m.estimated_cost) || 0), 0).toFixed(2))
    const design_pm_fee = Number((estimated_total * ((Number(est.design_pm_fee_percent) || 0) / 100)).toFixed(2))
    // Duration is derived from the process steps — the steps are the source of
    // truth for "how long will this take," so editing a step's days (or
    // adding/removing steps) ripples straight up into the headline Duration
    // stat instead of needing to be kept in sync by hand.
    const duration_business_days = est.process_steps.length
      ? Number(est.process_steps.reduce((s, st) => s + (Number(st.estimated_days) || 0), 0).toFixed(1))
      : est.duration_business_days
    return { ...est, estimated_total, design_pm_fee, duration_business_days }
  }
  function patchEstimate(patch: (e: Estimate) => Estimate) {
    setEstimate(prev => prev ? recalc(patch(prev)) : prev)
    markDirty()
  }
  async function generateScope(
    sections: Array<{ name: string; items: BudgetLine[] }>,
    key: string
  ) {
    setScopeGenerating(prev => new Set([...prev, key]))
    try {
      const worksite = worksiteOptions.find(w => w.id === worksiteId)
      const res = await fetch('/api/scope-of-work', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jobTitle: title,
          address: worksite?.address || '',
          city: worksite?.city || '',
          sections: sections.map(s => ({
            name: s.name,
            items: s.items.map(item => ({
              category: item.category,
              notes: item.notes || '',
              estimated_cost: item.estimated_cost,
            })),
          })),
        }),
      })
      const ct = res.headers.get('content-type') || ''
      if (!ct.includes('application/json')) {
        throw new Error(
          res.status === 404
            ? 'Scope of Work API not found — deploy the latest version to enable this feature.'
            : `Google Docs API returned an unexpected response (${res.status}). If this is your first time using Scope of Work, you may need to re-authorize Google at /admin/google-connect to add the Google Docs permission.`
        )
      }
      const d = await res.json()
      if (!res.ok) { alert('Failed to create scope: ' + (d.error || 'Unknown error')); return }
      setScopeLinks(prev => ({ ...prev, [key]: d.docUrl }))
      window.open(d.docUrl, '_blank')
    } catch (e: any) {
      alert('Scope generation error: ' + (e?.message || String(e)))
    } finally {
      setScopeGenerating(prev => { const n = new Set(prev); n.delete(key); return n })
    }
  }

  async function checkPermits() {
    if (!estimate) return
    setPermitCheckLoading(true)
    setPermitCheck(null)
    try {
      const worksite = worksiteOptions.find(w => w.id === worksiteId)
      const bySec = new Map<string, BudgetLine[]>()
      estimate.materials_breakdown.forEach(m => {
        const sec = (m.section && BUDGET_SECTIONS.includes(m.section)) ? m.section : 'Other'
        if (!bySec.has(sec)) bySec.set(sec, [])
        bySec.get(sec)!.push(m)
      })
      const sections = Array.from(bySec.entries()).map(([name, items]) => ({ name, items }))
      const res = await fetch('/api/permit-check', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ city: worksite?.city || '', state: 'FL', sections }),
      })
      const d = await res.json()
      if (!res.ok) throw new Error(d.error || 'Failed')
      setPermitCheck(d)
    } catch (e: any) {
      alert('Permit check failed: ' + (e?.message || String(e)))
    } finally {
      setPermitCheckLoading(false)
    }
  }

  async function researchMunicipalityPermits() {
    const worksite = worksiteOptions.find(w => w.id === worksiteId)
    const city = worksite?.city || ''
    if (!city) return
    setPermitResearching(true)
    try {
      // 1. Research per-trade building permit rules for this city
      const researchRes = await fetch(
        `/api/permit-jurisdictions?action=research-building&name=${encodeURIComponent(city)}&state=FL`
      )
      const researchData = await researchRes.json()
      if (!researchRes.ok) throw new Error(researchData.error || 'Research failed')

      // 2. Check if jurisdiction already exists in DB
      const listRes = await fetch(`/api/permit-jurisdictions?search=${encodeURIComponent(city)}`)
      const existing: any[] = await listRes.json()

      if (existing.length > 0) {
        // Update existing record with building permit notes
        await fetch('/api/permit-jurisdictions', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            id: existing[0].id,
            notes: researchData.notes,
            ai_populated: true,
          }),
        })
      } else {
        // Create a new record for this city
        await fetch('/api/permit-jurisdictions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: city,
            state: 'FL',
            notes: researchData.notes,
            ai_populated: true,
            inspection_required: true,
            gas_permit_required: true,
            lp_permit_required: true,
          }),
        })
      }
    } catch (e: any) {
      alert('Research failed: ' + (e?.message || String(e)))
    } finally {
      setPermitResearching(false)
    }
    // 3. Rerun permit check — will now find the jurisdiction with per-trade notes
    checkPermits()
  }

  function updateMaterial(i: number, field: 'category' | 'notes' | 'section' | 'estimated_cost' | 'quoted_cost' | 'actual_cost', value: string) {
    patchEstimate(e => ({
      ...e,
      materials_breakdown: e.materials_breakdown.map((m, idx) => idx !== i ? m : {
        ...m,
        [field]: (field === 'category' || field === 'notes' || field === 'section')
          ? value
          : (value.trim() === '' ? null : (Number(value) || 0)),
      }),
    }))
  }
  function removeMaterial(i: number) {
    patchEstimate(e => ({ ...e, materials_breakdown: e.materials_breakdown.filter((_, idx) => idx !== i) }))
  }
  function addMaterial(section?: string) {
    patchEstimate(e => ({ ...e, materials_breakdown: [...e.materials_breakdown, { category: 'New line item', estimated_cost: 0, notes: '', section: section || 'Other', quoted_cost: null, actual_cost: null }] }))
  }
  function updateField(field: 'design_pm_fee_percent', value: string) {
    patchEstimate(e => ({ ...e, [field]: Number(value) || 0 }))
  }
  function updateRationale(value: string) {
    patchEstimate(e => ({ ...e, design_pm_fee_rationale: value }))
  }
  function updateStepDays(i: number, value: string) {
    patchEstimate(e => ({ ...e, process_steps: e.process_steps.map((s, idx) => idx !== i ? s : { ...s, estimated_days: Number(value) || 0 }) }))
  }

  // ── Quote / actual-cost document attachments ─────────────────────────────
  // Separate from the planning photos — these are the real quote/invoice once
  // it comes in, so the owner can see estimate vs. quote vs. billed side by side.
  const actualDocsRef = useRef<HTMLInputElement>(null)
  async function addActualDocuments(files: FileList | File[]) {
    const list = Array.from(files)
    if (!list.length || !estimate) return
    setUploading(true); setError('')
    try {
      const fd = new FormData()
      fd.append('session_id', sessionId)
      for (const f of list) fd.append('file', f)
      const res = await fetch('/api/job-planning', { method: 'POST', body: fd })
      const d = await res.json()
      if (!res.ok) { setError(d.error || 'Upload failed'); setUploading(false); return }
      patchEstimate(e => ({ ...e, actual_documents: [...(e.actual_documents || []), ...(d.uploaded || [])] }))
    } catch (e: any) {
      setError(e?.message || 'Upload failed')
    }
    setUploading(false)
    if (actualDocsRef.current) actualDocsRef.current.value = ''
  }
  function removeActualDocument(att: Attachment) {
    fetch(`/api/job-planning?path=${encodeURIComponent(att.path)}`, { method: 'DELETE' })
    patchEstimate(e => ({ ...e, actual_documents: (e.actual_documents || []).filter(a => a.path !== att.path) }))
  }

  const grandTotal = estimate ? estimate.estimated_total + estimate.design_pm_fee : 0
  // Budget comparison roll-ups — only populated once quoted/actual numbers exist
  const quotedLines = estimate ? estimate.materials_breakdown.filter(m => m.quoted_cost != null) : []
  const actualLines = estimate ? estimate.materials_breakdown.filter(m => m.actual_cost != null) : []
  const quotedSum = quotedLines.length ? quotedLines.reduce((s, m) => s + (Number(m.quoted_cost) || 0), 0) : null
  const actualSum = actualLines.length ? actualLines.reduce((s, m) => s + (Number(m.actual_cost) || 0), 0) : null
  const confidenceColor = estimate?.confidence === 'high' ? 'text-green-700 bg-green-50 border-green-200'
    : estimate?.confidence === 'medium' ? 'text-amber-700 bg-amber-50 border-amber-200'
    : 'text-red-700 bg-red-50 border-red-200'

  const isImage = (t: string) => t.startsWith('image/')
  const isVideo = (t: string) => t.startsWith('video/')

  return (
    <div className="p-6 md:p-8 pt-16 md:pt-8 max-w-5xl mx-auto">
      {/* Header */}
      <div className="mb-6 flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-extrabold text-gray-900 flex items-center gap-2"><Sparkles size={22} style={{ color: '#b8895a' }} /> Plan a New Job</h1>
          <p className="text-gray-500 text-sm mt-0.5">Save drafts, come back later, generate estimates with AI vision + your bookkeeping history</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => setShowLoadPanel(!showLoadPanel)}
            className="flex items-center gap-1.5 text-xs font-semibold px-3 py-2 rounded-xl border border-gray-200 hover:bg-gray-50">
            <FolderOpen size={13} /> My Plans ({savedPlans.length})
          </button>
          <button onClick={reset}
            className="flex items-center gap-1.5 text-xs font-semibold px-3 py-2 rounded-xl border border-gray-200 hover:bg-gray-50">
            <Plus size={13} /> New
          </button>
        </div>
      </div>

      {/* ── Section quick-links ──────────────────────────────────────── */}
      <div className="flex items-center gap-2 mb-5 flex-wrap">
        {([
          { id: 'sec-overview', label: 'Overview',  Icon: ClipboardList },
          { id: 'sec-schedule', label: 'Schedule',  Icon: CalendarDays },
          { id: 'sec-drive',    label: 'Drive',     Icon: Folder },
          { id: 'sec-estimate', label: 'Estimate',  Icon: DollarSign },
        ] as const).map(t => (
          <button key={t.id}
            onClick={() => document.getElementById(t.id)?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
            className="flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-xl border border-gray-200 bg-white hover:bg-gray-50 text-gray-600 transition-colors shadow-sm">
            <t.Icon size={12} /> {t.label}
          </button>
        ))}
        <button onClick={() => setDesignStudioOpen(true)}
          className="flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 rounded-xl border transition-colors shadow-sm ml-auto"
          style={{ borderColor: '#e8d9c8', background: '#fbf3ec', color: '#9a6a3c' }}>
          <Wand2 size={12} /> Design Studio
          {(() => {
            const c = (design.board?.length || 0) + (design.sketches?.length || 0) + (design.comparisons?.length || 0) + (design.ai_suggestions?.length || 0)
            return c > 0 ? <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-800 ml-0.5">{c}</span> : null
          })()}
        </button>
      </div>

      {/* Saved plans panel */}
      {showLoadPanel && (
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4 mb-5">
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-bold text-gray-900 text-sm flex items-center gap-2"><FolderOpen size={14} /> Saved plans</h2>
            <div className="flex items-center gap-3">
              <label className="flex items-center gap-1 text-[11px] text-gray-500 cursor-pointer">
                <input type="checkbox" checked={showArchived} onChange={e => setShowArchived(e.target.checked)} /> Show archived
              </label>
              <button onClick={() => setShowLoadPanel(false)}><X size={14} className="text-gray-400" /></button>
            </div>
          </div>
          {savedPlans.length === 0 ? (
            <div className="text-center py-6 text-gray-400 text-sm">No saved plans yet.</div>
          ) : (
            <div className="divide-y divide-gray-100">
              {savedPlans.map(p => (
                <div key={p.id} className={`py-2.5 flex items-center gap-3 ${p.is_archived ? 'opacity-50' : ''}`}>
                  <button onClick={() => loadPlan(p.id)} className="flex-1 min-w-0 text-left hover:bg-gray-50 rounded-lg px-2 py-1 -mx-2">
                    <div className="font-semibold text-gray-900 text-sm truncate flex items-center gap-2">
                      {p.title}
                      {(() => { const st = PLAN_STATUS_LABEL[p.status || 'draft'] || PLAN_STATUS_LABEL.draft
                        return <span className={`text-[10px] uppercase font-bold tracking-wider px-1.5 py-0.5 rounded ${st.color}`}>{st.label}</span> })()}
                      {p.shared_with_account_id && (
                        <span title="Shared with customer" className="text-[10px] uppercase font-bold tracking-wider px-1.5 py-0.5 rounded bg-purple-100 text-purple-700 flex items-center gap-0.5"><Users2 size={9} /> Shared</span>
                      )}
                    </div>
                    <div className="text-[11px] text-gray-500 truncate">
                      {p.worksite ? <span className="inline-flex items-center gap-0.5 text-gray-400 mr-1.5"><MapPin size={10} />{p.worksite.address}{p.worksite.city ? `, ${p.worksite.city}` : ''} ·</span> : null}
                      {p.description}
                    </div>
                    <div className="text-[10px] text-gray-400 mt-0.5">Updated {new Date(p.updated_at).toLocaleDateString()} {new Date(p.updated_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</div>
                  </button>
                  <button onClick={() => toggleArchive(p)} title={p.is_archived ? 'Unarchive' : 'Archive'} className="text-gray-300 hover:text-blue-600 p-1"><Archive size={13} /></button>
                  <button onClick={() => deletePlan(p.id, p.title)} title="Delete" className="text-gray-300 hover:text-red-500 p-1"><Trash2 size={13} /></button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Title + status bar */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 px-4 py-3 mb-5 flex items-center gap-3 flex-wrap">
        <input value={title} onChange={e => { setTitle(e.target.value); markDirty() }}
          placeholder="Plan title (auto-generated from description if blank)"
          className="flex-1 min-w-[200px] px-3 py-2 rounded-xl border border-gray-200 text-sm font-semibold focus:outline-none focus:ring-2 focus:border-blue-400" />
        <div className="text-[11px] text-gray-500 flex items-center gap-2">
          {saving ? (
            <span className="text-blue-500 font-semibold flex items-center gap-1"><Loader2 size={10} className="animate-spin" /> Saving…</span>
          ) : isDirty ? (
            <span className="text-amber-600 font-semibold">● Unsaved changes</span>
          ) : planId ? (
            <span className="text-blue-600 font-semibold">Editing saved plan</span>
          ) : (
            <span className="text-amber-700 font-semibold">Unsaved draft</span>
          )}
          {savedAt && !isDirty && !saving && <span>· Saved {savedAt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>}
        </div>
        <button onClick={save} disabled={saving || (!description && !measurements && attachments.length === 0)}
          className="flex items-center gap-1.5 text-sm font-bold px-4 py-2 rounded-xl border border-gray-200 hover:bg-gray-50 disabled:opacity-50">
          {saving ? <Loader2 size={13} className="animate-spin" /> : <Save size={13} />}
          {planId ? 'Save Changes' : 'Save Draft'}
        </button>
      </div>

      {/* Project linking — worksite, status, customer sharing */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 px-4 py-3 mb-5 grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div>
          <label className="block text-[11px] font-semibold text-gray-500 uppercase tracking-wider mb-1 flex items-center gap-1"><MapPin size={11} /> Worksite</label>
          <select value={worksiteId || ''} onChange={e => { setWorksiteId(e.target.value || null); markDirty() }}
            className="w-full px-3 py-2 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:border-blue-400 bg-white">
            <option value="">— Not linked —</option>
            {worksiteOptions.map(w => <option key={w.id} value={w.id}>{w.address}{w.city ? `, ${w.city}` : ''}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-[11px] font-semibold text-gray-500 uppercase tracking-wider mb-1">Project Status</label>
          <select value={status} onChange={e => { setStatus(e.target.value); markDirty() }}
            className="w-full px-3 py-2 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:border-blue-400 bg-white">
            <option value="draft">Draft</option>
            <option value="estimated">Estimate Ready</option>
            <option value="sent_to_customer">Sent to Customer</option>
            <option value="approved">Approved</option>
            <option value="scheduled">Scheduled</option>
            <option value="in_progress">In Progress</option>
            <option value="completed">Completed</option>
          </select>
        </div>
        <div>
          <label className="block text-[11px] font-semibold text-gray-500 uppercase tracking-wider mb-1 flex items-center gap-1"><Users2 size={11} /> Share with Customer</label>
          <select value={sharedWithAccountId || ''} onChange={e => setSharedWithAccountId(e.target.value || null)}
            className="w-full px-3 py-2 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:border-blue-400 bg-white">
            <option value="">— Not shared —</option>
            {customerOptions.map(c => <option key={c.account_id} value={c.account_id}>{c.customer_label}</option>)}
          </select>
          {sharedWithAccountId && status === 'draft' && (
            <p className="text-[10px] text-amber-600 mt-1">Customer won't see this until status moves past Draft.</p>
          )}
        </div>
      </div>

      {/* Input panel */}
      <div id="sec-overview" className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5 mb-6 space-y-4">
        <div>
          <label className="block text-sm font-semibold text-gray-700 mb-2">Job description</label>
          <textarea
            value={description}
            onChange={e => { setDescription(e.target.value); markDirty() }}
            rows={4}
            placeholder="e.g. Full master bathroom remodel — tear out existing tub/shower/vanity/tile, walk-in shower with custom tile, double vanity, new toilet, paint, lighting. Approx 12x10 ft."
            className="w-full px-4 py-3 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:border-blue-400"
          />
        </div>

        <div>
          <label className="block text-sm font-semibold text-gray-700 mb-2 flex items-center gap-1.5"><Ruler size={13} /> Measurements & scope notes (optional)</label>
          <textarea
            value={measurements}
            onChange={e => { setMeasurements(e.target.value); markDirty() }}
            rows={3}
            placeholder={`Room: 12'×10'×8' ceiling\nShower wall: 6'×4'\nWindow: 36"×48"\nExisting flooring: porcelain tile, mud-set\nPlumbing: PEX, accessible from attic`}
            className="w-full px-4 py-3 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:border-blue-400 font-mono"
          />
        </div>

        <div>
          <div className="flex items-center justify-between mb-2">
            <label className="block text-sm font-semibold text-gray-700 flex items-center gap-1.5"><Upload size={13} /> Photos, videos & documents</label>
            <button type="button" onClick={() => setDrivePickerOpen(true)}
              className="flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg border border-gray-200 hover:bg-gray-50">
              <Cloud size={12} /> Import from Google Drive
            </button>
          </div>
          <div
            onDragOver={e => e.preventDefault()}
            onDrop={onDrop}
            onClick={() => fileRef.current?.click()}
            className="border-2 border-dashed border-gray-200 rounded-xl p-6 text-center cursor-pointer hover:border-blue-300 hover:bg-blue-50/30 transition-colors"
          >
            <Upload size={20} className="mx-auto text-gray-400 mb-1" />
            <div className="text-sm font-semibold text-gray-600">Click or drag files here</div>
            <div className="text-[11px] text-gray-400 mt-0.5">Photos analyzed by AI · videos & docs referenced by name</div>
            <input ref={fileRef} type="file" multiple accept="image/*,video/*,application/pdf" className="hidden"
              onChange={e => e.target.files && handleFiles(e.target.files)} />
          </div>

          {uploading && (
            <div className="mt-2 text-xs text-blue-600 flex items-center gap-1"><Loader2 size={11} className="animate-spin" /> Uploading…</div>
          )}

          {attachments.length > 0 && (
            <div className="mt-3 grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
              {attachments.map(att => (
                <div key={att.path} className="relative group border border-gray-200 rounded-xl overflow-hidden bg-gray-50">
                  {isImage(att.type) && att.signed_url ? (
                    <img src={att.signed_url} alt={att.name} className="w-full h-24 object-cover cursor-pointer" onClick={() => setPreviewing(att)} />
                  ) : isVideo(att.type) ? (
                    <div className="w-full h-24 flex flex-col items-center justify-center text-gray-500 text-xs">
                      <Film size={20} /><span className="mt-1 truncate max-w-[90%] text-[10px]">{att.name}</span>
                    </div>
                  ) : (
                    <div className="w-full h-24 flex flex-col items-center justify-center text-gray-500 text-xs">
                      <FileText size={20} /><span className="mt-1 truncate max-w-[90%] text-[10px]">{att.name}</span>
                    </div>
                  )}
                  <button onClick={(e) => { e.stopPropagation(); removeAttachment(att) }}
                    className="absolute top-1 right-1 bg-white/90 hover:bg-red-100 rounded-full p-1 shadow opacity-0 group-hover:opacity-100 transition-opacity">
                    <X size={11} className="text-red-600" />
                  </button>
                  <div className="px-2 py-1 text-[10px] text-gray-500 truncate" title={att.name}>{att.name}</div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="flex items-center justify-between pt-1">
          <div className="text-xs text-gray-400">
            {estimate
              ? 'Changed the scope above? Click Regenerate for fresh numbers — quote/invoice files carry over automatically.'
              : planId ? 'Changes auto-save when you generate an estimate.' : 'Save your draft now — come back later, generate when ready.'}
          </div>
          <button onClick={generate} disabled={loading || description.trim().length < 10}
            className="flex items-center gap-2 text-sm font-bold px-5 py-2.5 rounded-xl text-white shadow-md disabled:opacity-50"
            style={{ background: '#b8895a' }}>
            {loading ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
            {loading ? 'Analyzing your books + photos…' : estimate ? 'Regenerate Estimate' : 'Generate Estimate'}
          </button>
        </div>
        {error && <div className="bg-red-50 border border-red-100 text-red-700 text-sm px-4 py-3 rounded-xl whitespace-pre-wrap break-words">{error}</div>}
      </div>

      {/* ── Project Schedule ─────────────────────────────────────────────── */}
      <div id="sec-schedule" className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden mb-5">
        <div className="px-5 py-3 border-b border-gray-100 flex items-center gap-2">
          <CalendarDays size={14} style={{ color: '#b8895a' }} />
          <h2 className="font-bold text-gray-900 text-sm">Project Schedule</h2>
          <span className="text-[11px] text-gray-400 ml-1">Tasks, milestones, deliveries &amp; inspections</span>
        </div>
        {planId ? (
          <div className="p-5">
            <ProjectSchedule planId={planId} />
          </div>
        ) : (
          <div className="px-5 py-6 text-center text-gray-400 text-sm">
            Save this plan first to start building the schedule.
          </div>
        )}
      </div>

      {/* ── Project Drive Folder ─────────────────────────────────────────── */}
      <div id="sec-drive" className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden mb-6">
        <div className="px-5 py-3 border-b border-gray-100 flex items-center gap-2">
          <Folder size={14} style={{ color: '#b8895a' }} />
          <h2 className="font-bold text-gray-900 text-sm">Project Drive Folder</h2>
          <span className="text-[11px] text-gray-400 ml-1">Share scope of work · collect COIs &amp; docs from subs</span>
          <div className="flex-1" />
          {driveFolderId && (
            <button onClick={() => loadDriveFiles(driveFolderId!)} disabled={driveLoading} title="Refresh files"
              className="p-1.5 rounded-lg border border-gray-200 hover:bg-gray-50 disabled:opacity-40">
              <RefreshCw size={12} className={driveLoading ? 'animate-spin text-blue-500' : 'text-gray-500'} />
            </button>
          )}
        </div>

        <div className="p-5">
          {driveError && (
            <div className="mb-3 bg-red-50 border border-red-100 text-red-700 text-xs px-3 py-2 rounded-lg">{driveError}</div>
          )}

          {!driveFolderId ? (
            /* No folder connected yet */
            <div className="space-y-3">
              <p className="text-xs text-gray-500">
                Connect a Google Drive folder to this project — upload scope of work PDFs for subs, and have them drop COIs &amp; signed docs right into the same folder.
              </p>
              <div className="flex flex-wrap gap-2">
                <button onClick={createDriveFolder} disabled={driveLoading}
                  className="flex items-center gap-1.5 text-xs font-bold px-4 py-2 rounded-xl text-white disabled:opacity-50"
                  style={{ background: '#2f5a5e' }}>
                  {driveLoading ? <Loader2 size={11} className="animate-spin" /> : <FolderPlus size={12} />}
                  Create New Folder
                </button>
                <button onClick={() => { setShowConnectUrl(v => !v); setDriveError('') }}
                  className="flex items-center gap-1.5 text-xs font-semibold px-4 py-2 rounded-xl border border-gray-200 hover:bg-gray-50">
                  <Link2 size={12} /> Connect Existing Folder
                </button>
              </div>
              {showConnectUrl && (
                <div className="flex items-center gap-2 mt-2">
                  <input value={connectUrlInput} onChange={e => setConnectUrlInput(e.target.value)}
                    placeholder="Paste Google Drive folder URL or folder ID"
                    className="flex-1 px-3 py-2 rounded-xl border border-gray-200 text-xs focus:outline-none focus:ring-2 focus:border-blue-400" />
                  <button onClick={connectFolderFromUrl} disabled={!connectUrlInput.trim() || driveLoading}
                    className="flex items-center gap-1 text-xs font-bold px-3 py-2 rounded-xl text-white disabled:opacity-50"
                    style={{ background: '#b8895a' }}>
                    {driveLoading ? <Loader2 size={11} className="animate-spin" /> : <Check size={11} />} Connect
                  </button>
                </div>
              )}
            </div>
          ) : (
            /* Folder is connected */
            <div className="space-y-4">
              {/* Folder info bar */}
              <div className="flex items-center gap-3 bg-green-50 border border-green-200 rounded-xl px-4 py-3">
                <Folder size={16} className="text-green-600 flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-bold text-green-800 truncate">{driveFolderName || 'Project Folder'}</div>
                  <div className="text-[11px] text-green-600">{driveFiles.length} file{driveFiles.length !== 1 ? 's' : ''} in folder</div>
                </div>
                <a href={`https://drive.google.com/drive/folders/${driveFolderId}`} target="_blank" rel="noopener noreferrer"
                  className="flex items-center gap-1 text-xs font-semibold text-green-700 hover:text-green-900">
                  Open in Drive <ExternalLink size={11} />
                </a>
                <button onClick={disconnectDriveFolder} className="text-gray-400 hover:text-red-500 ml-2 p-1 rounded-lg hover:bg-red-50 transition-colors" title="Disconnect folder">
                  <X size={13} />
                </button>
              </div>

              {/* Sharing tip */}
              <div className="bg-blue-50 border border-blue-100 rounded-xl px-4 py-3 text-xs text-blue-800">
                <strong>Sharing with subs:</strong> Open the folder in Drive → click Share → paste the sub's email or copy the link. Anyone with the link can view files. To let subs upload, grant Editor access.
              </div>

              {/* Upload area */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-semibold text-gray-700">Upload to Project Folder</span>
                  <label className="flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 rounded-xl text-white cursor-pointer disabled:opacity-50"
                    style={{ background: '#b8895a' }}>
                    {driveUploading ? <Loader2 size={11} className="animate-spin" /> : <Upload size={11} />}
                    {driveUploading ? 'Uploading…' : 'Upload File'}
                    <input ref={driveFileRef} type="file" multiple className="hidden"
                      onChange={e => e.target.files && uploadToDrive(e.target.files)} />
                  </label>
                </div>

                {/* File list */}
                {driveLoading && driveFiles.length === 0 ? (
                  <div className="text-center py-4 text-gray-400 text-xs flex items-center justify-center gap-1">
                    <Loader2 size={12} className="animate-spin" /> Loading files…
                  </div>
                ) : driveFiles.length === 0 ? (
                  <div className="text-center py-4 text-gray-400 text-xs">No files yet — upload a scope of work, COI, or other docs.</div>
                ) : (
                  <div className="divide-y divide-gray-100 border border-gray-100 rounded-xl overflow-hidden">
                    {driveFiles.slice(0, 20).map((f: any) => (
                      <a key={f.id} href={f.webViewLink} target="_blank" rel="noopener noreferrer"
                        className="flex items-center gap-3 px-3 py-2.5 hover:bg-gray-50 transition-colors group">
                        {f.thumbnailLink
                          ? <img src={f.thumbnailLink} alt="" className="w-8 h-8 rounded object-cover flex-shrink-0" />
                          : <FileText size={16} className="text-gray-400 flex-shrink-0" />
                        }
                        <div className="flex-1 min-w-0">
                          <div className="text-xs font-semibold text-gray-800 truncate group-hover:text-blue-700">{f.name}</div>
                          <div className="text-[10px] text-gray-400">
                            {f.mimeType?.split('.').pop()?.split('/').pop()?.toUpperCase() || 'File'}
                            {f.size ? ` · ${Math.round(Number(f.size) / 1024)} KB` : ''}
                            {f.modifiedTime ? ` · ${new Date(f.modifiedTime).toLocaleDateString()}` : ''}
                          </div>
                        </div>
                        <ExternalLink size={11} className="text-gray-300 group-hover:text-blue-500 flex-shrink-0" />
                      </a>
                    ))}
                    {driveFiles.length > 20 && (
                      <a href={`https://drive.google.com/drive/folders/${driveFolderId}`} target="_blank" rel="noopener noreferrer"
                        className="flex items-center justify-center gap-1 px-3 py-2 text-xs text-blue-600 hover:bg-blue-50 font-semibold">
                        View all {driveFiles.length} files in Drive <ExternalLink size={10} />
                      </a>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      <div id="sec-estimate" />

      {loading && (
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-8 text-center text-gray-400">
          <Loader2 size={28} className="animate-spin mx-auto mb-3" style={{ color: '#b8895a' }} />
          <p className="text-sm">Reading invoice history, examining photos, analyzing scope…</p>
          {progressTokens > 0 ? (
            <p className="text-xs mt-2 text-blue-600 font-semibold">~{progressTokens.toLocaleString()} tokens generated · streaming response</p>
          ) : (
            <p className="text-xs mt-1">Calling Claude — first tokens arrive in 2–5 seconds.</p>
          )}
        </div>
      )}

      {estimate && !loading && (
        <div className="space-y-5">
          <div className="flex flex-wrap items-center gap-3 justify-between">
            <div className="flex flex-wrap items-center gap-3">
              <span className={`inline-flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 rounded-full border ${confidenceColor}`}>
                <TrendingUp size={11} /> {estimate.confidence.toUpperCase()} CONFIDENCE
              </span>
              {meta && (
                <span className="text-xs text-gray-500">
                  {meta.invoices_considered} invoices · {meta.expenses_considered} expenses · {meta.images_analyzed > 0 && `${meta.images_analyzed} photos analyzed · `}{meta.other_files > 0 && `${meta.other_files} other files · `}{meta.top_vendors} vendors
                </span>
              )}
            </div>
            <button onClick={async () => {
                const leavingEdit = editingEstimate
                setEditingEstimate(v => !v)
                if (leavingEdit) await save()   // persist edits the moment you exit edit mode — no separate "Save" step to remember
              }}
              disabled={saving}
              className={`flex items-center gap-1.5 text-xs font-bold px-3 py-2 rounded-xl border transition-colors disabled:opacity-60 ${editingEstimate ? 'border-green-200 bg-green-50 text-green-700' : 'border-gray-200 hover:bg-gray-50 text-gray-700'}`}>
              {editingEstimate ? (saving ? <><Loader2 size={13} className="animate-spin" /> Saving…</> : <><Check size={13} /> Done Editing</>) : <><Pencil size={13} /> Edit Numbers</>}
            </button>
          </div>
          {editingEstimate && (
            <div className="text-xs text-gray-500 bg-blue-50 border border-blue-100 rounded-xl px-4 py-2.5 flex items-center gap-2">
              <RotateCcw size={13} className="text-blue-500" /> Edit any cost, hours, rate, fee %, or duration below — totals recalculate live. Click <strong className="mx-0.5">Done Editing</strong> when you're finished and it'll save automatically.
            </div>
          )}

          {estimate.photo_observations && estimate.photo_observations.length > 0 && (
            <Section title="What the photos revealed" icon={ImageIcon}>
              <ul className="px-5 py-3 space-y-1.5 text-sm text-gray-700 list-disc list-inside">
                {estimate.photo_observations.map((o, i) => <li key={i}>{o}</li>)}
              </ul>
            </Section>
          )}

          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <Stat label="Job Cost" value={`$${estimate.estimated_total.toFixed(2)}`} icon={Hammer} />
            <Stat label="Design + PM Fee" value={`$${estimate.design_pm_fee.toFixed(2)}`} sublabel={`${estimate.design_pm_fee_percent}% of job`} accent="#b8895a" icon={ClipboardList} />
            <Stat label="Total to Client" value={`$${grandTotal.toFixed(2)}`} accent="#185FA5" icon={DollarSign} big />
            <Stat label="Duration" value={`${estimate.duration_business_days} days`}
              sublabel={editingEstimate ? '= sum of process step days below' : undefined} icon={Clock} />
          </div>

          <Section title="Budget Breakdown" icon={ListChecks}>
            <div className="px-5 pt-3 pb-2 flex items-start justify-between gap-4">
              <p className="text-[11px] text-gray-400 flex-1">
                Materials, labor, and subcontractor costs all live here as one unified budget. Fill in <span className="text-blue-600 font-semibold">Quoted</span> once a real quote comes in, and <span className="text-emerald-600 font-semibold">Actual Billed</span> once the job wraps — the spread shows automatically.
              </p>
              {estimate.materials_breakdown.length > 0 && (() => {
                // Build the full section list for the "all sections" scope button
                const bySec = new Map<string, BudgetLine[]>()
                estimate.materials_breakdown.forEach(m => {
                  const sec = (m.section && BUDGET_SECTIONS.includes(m.section)) ? m.section : 'Other'
                  if (!bySec.has(sec)) bySec.set(sec, [])
                  bySec.get(sec)!.push(m)
                })
                const allSecs = [
                  ...BUDGET_SECTIONS.filter(s => bySec.has(s)),
                  ...Array.from(bySec.keys()).filter(s => !BUDGET_SECTIONS.includes(s)),
                ].map(name => ({ name, items: bySec.get(name)! }))
                const isGenerating = scopeGenerating.has('__all__')
                return (
                  <div className="flex items-center gap-2 flex-shrink-0">
                    {scopeLinks['__all__'] && (
                      <a href={scopeLinks['__all__']} target="_blank" rel="noopener noreferrer"
                        className="text-[10px] text-blue-600 underline font-semibold whitespace-nowrap">
                        View Full Scope ↗
                      </a>
                    )}
                    <button
                      onClick={() => generateScope(allSecs, '__all__')}
                      disabled={isGenerating}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-semibold text-white disabled:opacity-60 transition-colors whitespace-nowrap"
                      style={{ background: '#b8895a' }}
                    >
                      {isGenerating ? <Loader2 size={11} className="animate-spin" /> : <FileText size={11} />}
                      Full Scope of Work
                    </button>
                  </div>
                )
              })()}
            </div>
            <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-100">
                <tr>
                  <th className="text-left px-4 py-2.5 text-[11px] font-semibold text-gray-600 uppercase tracking-wider">Category</th>
                  <th className="text-left px-4 py-2.5 text-[11px] font-semibold text-gray-600 uppercase tracking-wider">Notes</th>
                  <th className="text-right px-4 py-2.5 text-[11px] font-semibold text-gray-600 uppercase tracking-wider">Estimated</th>
                  <th className="text-right px-4 py-2.5 text-[11px] font-semibold text-blue-600 uppercase tracking-wider">Quoted</th>
                  <th className="text-right px-4 py-2.5 text-[11px] font-semibold text-emerald-600 uppercase tracking-wider">Actual Billed</th>
                  {editingEstimate && <th className="w-8"></th>}
                </tr>
              </thead>
              {(() => {
                const bySection = new Map<string, number[]>()
                estimate.materials_breakdown.forEach((m, i) => {
                  const sec = (m.section && BUDGET_SECTIONS.includes(m.section)) ? m.section : 'Other'
                  if (!bySection.has(sec)) bySection.set(sec, [])
                  bySection.get(sec)!.push(i)
                })
                const orderedSections = [
                  ...BUDGET_SECTIONS.filter(s => bySection.has(s)),
                  ...Array.from(bySection.keys()).filter(s => !BUDGET_SECTIONS.includes(s)),
                ]
                const colSpan = editingEstimate ? 6 : 5
                return orderedSections.map(section => {
                  const indices = bySection.get(section)!
                  const subtotal = indices.reduce((s, i) => s + (Number(estimate.materials_breakdown[i].estimated_cost) || 0), 0)
                  return (
                    <tbody key={section} className="divide-y divide-gray-50">
                      <tr className="bg-gray-50/70">
                        <td colSpan={colSpan} className="px-4 py-1.5">
                          <div className="flex items-center justify-between">
                            <span className="text-[11px] font-bold text-gray-500 uppercase tracking-wider">
                              {section} <span className="font-normal normal-case text-gray-400">· {indices.length} item{indices.length === 1 ? '' : 's'}</span>
                            </span>
                            <div className="flex items-center gap-2">
                              {scopeLinks[section] && (
                                <a href={scopeLinks[section]} target="_blank" rel="noopener noreferrer"
                                  className="text-[10px] text-blue-500 underline font-semibold">
                                  View ↗
                                </a>
                              )}
                              <button
                                onClick={() => generateScope(
                                  [{ name: section, items: indices.map(i => estimate.materials_breakdown[i]) }],
                                  section
                                )}
                                disabled={scopeGenerating.has(section)}
                                className="flex items-center gap-1 text-[10px] font-semibold text-gray-400 hover:text-blue-600 disabled:opacity-50 transition-colors"
                                title={`Generate scope of work for ${section}`}
                              >
                                {scopeGenerating.has(section)
                                  ? <Loader2 size={10} className="animate-spin" />
                                  : <FileText size={10} />}
                                Scope
                              </button>
                            </div>
                          </div>
                        </td>
                      </tr>
                      {indices.map(i => {
                        const m = estimate.materials_breakdown[i]
                        return (
                          <tr key={i}>
                            {editingEstimate ? (
                              <>
                                <td className="px-4 py-1.5">
                                  <select value={(m.section && BUDGET_SECTIONS.includes(m.section)) ? m.section : 'Other'}
                                    onChange={e => updateMaterial(i, 'section', e.target.value)}
                                    className="w-full mb-1 px-2 py-0.5 rounded border border-gray-200 text-[10px] text-gray-500 uppercase tracking-wide focus:outline-none focus:ring-2 focus:border-blue-400">
                                    {BUDGET_SECTIONS.map(s => <option key={s} value={s}>{s}</option>)}
                                  </select>
                                  <input value={m.category} onChange={e => updateMaterial(i, 'category', e.target.value)}
                                    className="w-full px-2 py-1 rounded-lg border border-gray-200 text-sm font-medium focus:outline-none focus:ring-2 focus:border-blue-400" />
                                </td>
                                <td className="px-4 py-1.5">
                                  <textarea
                                    ref={el => { if (el) { el.style.height = 'auto'; el.style.height = el.scrollHeight + 'px' } }}
                                    value={m.notes}
                                    onChange={e => {
                                      updateMaterial(i, 'notes', e.target.value)
                                      const t = e.currentTarget
                                      t.style.height = 'auto'
                                      t.style.height = t.scrollHeight + 'px'
                                    }}
                                    rows={1}
                                    className="w-full px-2 py-1 rounded-lg border border-gray-200 text-xs text-gray-600 focus:outline-none focus:ring-2 focus:border-blue-400 resize-none overflow-hidden leading-relaxed"
                                  />
                                </td>
                                <td className="px-4 py-1.5">
                                  <div className="flex items-center justify-end gap-1">
                                    <span className="text-gray-400 text-xs">$</span>
                                    <input type="number" step="0.01" value={m.estimated_cost}
                                      onChange={e => updateMaterial(i, 'estimated_cost', e.target.value)}
                                      className="w-24 px-2 py-1 rounded-lg border border-gray-200 text-sm font-mono font-semibold text-right focus:outline-none focus:ring-2 focus:border-blue-400" />
                                  </div>
                                </td>
                              </>
                            ) : (
                              <>
                                <td className="px-4 py-2.5 font-medium text-gray-800 text-sm">{m.category}</td>
                                <td className="px-4 py-2.5 text-gray-600 text-xs">{m.notes}</td>
                                <td className="px-4 py-2.5 text-right font-mono text-sm font-semibold">${m.estimated_cost.toFixed(2)}</td>
                              </>
                            )}
                            <td className="px-4 py-1.5">
                              <div className="flex items-center justify-end gap-1">
                                <span className="text-gray-300 text-xs">$</span>
                                <input type="number" step="0.01" placeholder="—" value={m.quoted_cost ?? ''}
                                  onChange={e => updateMaterial(i, 'quoted_cost', e.target.value)}
                                  className="w-24 px-2 py-1 rounded-lg border border-gray-200 text-sm font-mono text-right text-blue-700 placeholder:text-gray-300 focus:outline-none focus:ring-2 focus:border-blue-400" />
                              </div>
                            </td>
                            <td className="px-4 py-1.5">
                              <div className="flex items-center justify-end gap-1">
                                <span className="text-gray-300 text-xs">$</span>
                                <input type="number" step="0.01" placeholder="—" value={m.actual_cost ?? ''}
                                  onChange={e => updateMaterial(i, 'actual_cost', e.target.value)}
                                  className="w-24 px-2 py-1 rounded-lg border border-gray-200 text-sm font-mono text-right text-emerald-700 placeholder:text-gray-300 focus:outline-none focus:ring-2 focus:border-emerald-400" />
                              </div>
                            </td>
                            {editingEstimate && (
                              <td className="px-1 text-center">
                                <button onClick={() => removeMaterial(i)} title="Remove line item" className="text-gray-300 hover:text-red-500 p-1"><Trash2 size={13} /></button>
                              </td>
                            )}
                          </tr>
                        )
                      })}
                      <tr className="border-t border-gray-100 bg-gray-50/40">
                        <td colSpan={2} className="px-4 py-1.5 text-right text-[11px] text-gray-400 uppercase tracking-wider font-semibold">
                          {section} subtotal
                        </td>
                        <td className="px-4 py-1.5 text-right font-mono text-sm font-bold text-gray-700">
                          ${subtotal.toFixed(2)}
                        </td>
                        <td colSpan={editingEstimate ? 3 : 2} />
                      </tr>
                      {editingEstimate && (
                        <tr>
                          <td colSpan={colSpan} className="px-4 py-1.5">
                            <button onClick={() => addMaterial(section)} className="flex items-center gap-1.5 text-[11px] font-semibold text-blue-600 hover:text-blue-800">
                              <Plus size={11} /> Add to {section}
                            </button>
                          </td>
                        </tr>
                      )}
                    </tbody>
                  )
                })
              })()}
              {editingEstimate && (
                <tbody>
                  <tr>
                    <td colSpan={6} className="px-4 py-2 border-t border-gray-100">
                      <button onClick={() => addMaterial()} className="flex items-center gap-1.5 text-xs font-semibold text-blue-600 hover:text-blue-800">
                        <Plus size={12} /> Add line item
                      </button>
                    </td>
                  </tr>
                </tbody>
              )}
              <tfoot>
                <tr className="bg-gray-50 font-bold border-t-2 border-gray-200">
                  <td colSpan={2} className="px-4 py-2.5 text-sm text-gray-700">Totals</td>
                  <td className="px-4 py-2.5 text-right font-mono text-sm">${estimate.estimated_total.toFixed(2)}</td>
                  <td className="px-4 py-2.5 text-right font-mono text-sm text-blue-700">{quotedSum != null ? `$${quotedSum.toFixed(2)}` : '—'}</td>
                  <td className="px-4 py-2.5 text-right font-mono text-sm text-emerald-700">{actualSum != null ? `$${actualSum.toFixed(2)}` : '—'}</td>
                  {editingEstimate && <td></td>}
                </tr>
              </tfoot>
            </table>
            </div>

            {(quotedSum != null || actualSum != null) && (
              <div className="px-5 py-3 border-t border-gray-100 flex flex-wrap gap-x-6 gap-y-1.5">
                {quotedSum != null && <BudgetDelta label="Quote vs. Estimate" from={estimate.estimated_total} to={quotedSum} />}
                {actualSum != null && <BudgetDelta label="Actual vs. Estimate" from={estimate.estimated_total} to={actualSum} />}
                {actualSum != null && quotedSum != null && <BudgetDelta label="Actual vs. Quote" from={quotedSum} to={actualSum} />}
              </div>
            )}

            {/* Quote / final-invoice attachments */}
            <div className="px-5 py-3 border-t border-gray-100">
              <div className="flex items-center justify-between mb-2">
                <span className="text-[11px] font-bold uppercase tracking-wider text-gray-400">Quotes & Final Invoices</span>
                <button type="button" onClick={() => actualDocsRef.current?.click()}
                  className="flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1.5 rounded-lg border border-gray-200 hover:bg-gray-50">
                  <Upload size={11} /> Attach file
                </button>
                <input ref={actualDocsRef} type="file" multiple accept="image/*,application/pdf" className="hidden"
                  onChange={e => e.target.files && addActualDocuments(e.target.files)} />
              </div>
              {(estimate.actual_documents || []).length === 0 ? (
                <p className="text-[11px] text-gray-400">Attach the contractor's quote or the final invoice once it's in hand — keep the paper trail with the numbers.</p>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {(estimate.actual_documents || []).map(doc => (
                    <div key={doc.path} className="flex items-center gap-1.5 border border-gray-200 rounded-lg pl-2.5 pr-1 py-1.5 bg-white text-xs">
                      <FileText size={12} className="text-gray-400 flex-shrink-0" />
                      {doc.signed_url ? (
                        <a href={doc.signed_url} target="_blank" rel="noreferrer" className="text-blue-600 hover:underline truncate max-w-[160px]">{doc.name}</a>
                      ) : <span className="truncate max-w-[160px] text-gray-600">{doc.name}</span>}
                      <button onClick={() => removeActualDocument(doc)} className="text-gray-300 hover:text-red-500 p-0.5"><X size={12} /></button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </Section>

          <Section title={`Process — ${estimate.process_steps.length} steps`} icon={ClipboardList}>
            <div className="divide-y divide-gray-100">
              {estimate.process_steps.map((s, i) => (
                <div key={s.step} className="px-5 py-3 flex items-start gap-3">
                  <div className="flex-shrink-0 w-7 h-7 rounded-full flex items-center justify-center text-white text-xs font-bold" style={{ background: '#b8895a' }}>{s.step}</div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-baseline justify-between gap-3">
                      <h3 className="font-semibold text-gray-900 text-sm">{s.title}</h3>
                      {editingEstimate ? (
                        <div className="flex items-center gap-1 whitespace-nowrap">
                          <input type="number" min={0} step="0.5" value={s.estimated_days}
                            onChange={e => updateStepDays(i, e.target.value)}
                            className="w-14 px-1.5 py-0.5 rounded-lg border border-gray-200 text-xs font-mono text-right focus:outline-none focus:ring-2 focus:border-blue-400" />
                          <span className="text-[11px] text-gray-500">day{s.estimated_days !== 1 ? 's' : ''}</span>
                        </div>
                      ) : (
                        <span className="text-[11px] text-gray-500 whitespace-nowrap">{s.estimated_days} day{s.estimated_days !== 1 ? 's' : ''}</span>
                      )}
                    </div>
                    <p className="text-xs text-gray-600 mt-0.5">{s.description}</p>
                  </div>
                </div>
              ))}
            </div>
            {editingEstimate && (
              <div className="px-5 py-2.5 text-[11px] text-gray-400 border-t border-gray-100">
                Total: {estimate.duration_business_days} day{estimate.duration_business_days !== 1 ? 's' : ''} — the "Duration" stat above updates automatically as you adjust step days.
              </div>
            )}
          </Section>

          {/* ── Permit Requirements ─────────────────────────── */}
          <Section title="Permit Requirements" icon={ClipboardList}>
            <div className="px-5 py-4">
              {!permitCheck && !permitCheckLoading && !permitResearching && (
                <div className="flex items-center justify-between">
                  <p className="text-sm text-gray-500">
                    {worksiteId
                      ? `Check whether this scope of work requires permits in ${worksiteOptions.find(w => w.id === worksiteId)?.city || 'this municipality'}.`
                      : 'Link a worksite above to enable municipality-specific permit checking.'}
                  </p>
                  <button
                    onClick={checkPermits}
                    disabled={!estimate?.materials_breakdown?.length}
                    className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold text-white disabled:opacity-40 transition-colors flex-shrink-0 ml-4"
                    style={{ background: '#185FA5' }}
                  >
                    <Sparkles size={14} /> Check Permit Requirements
                  </button>
                </div>
              )}

              {(permitResearching || permitCheckLoading) && (
                <div className="flex items-center gap-3 py-4 text-gray-500 text-sm">
                  <Loader2 size={18} className="animate-spin text-blue-500" />
                  {permitResearching
                    ? `Researching ${worksiteOptions.find(w => w.id === worksiteId)?.city || 'municipality'} permit rules…`
                    : `Analyzing scope against ${worksiteOptions.find(w => w.id === worksiteId)?.city || 'municipality'} building codes…`
                  }
                </div>
              )}

              {permitCheck && (
                <div className="space-y-4">
                  {/* Header row */}
                  <div className="flex items-start justify-between gap-4">
                    <p className="text-sm text-gray-700">{permitCheck.summary}</p>
                    <button
                      onClick={checkPermits}
                      disabled={permitCheckLoading || permitResearching}
                      className="flex items-center gap-1.5 text-[11px] font-semibold text-gray-400 hover:text-blue-600 flex-shrink-0 transition-colors"
                    >
                      <RotateCcw size={11} /> Recheck
                    </button>
                  </div>

                  {/* Data source badge + research button */}
                  <div className="flex items-center gap-2 flex-wrap">
                    {permitCheck.jurisdictionSource === 'database' && permitCheck.hasDetailedRules ? (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-green-50 text-green-700 border border-green-200">
                        <MapPin size={10} /> {permitCheck.jurisdiction?.name || permitCheck.city} – municipality-specific rules
                      </span>
                    ) : permitCheck.jurisdictionSource === 'database' ? (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-blue-50 text-blue-700 border border-blue-200">
                        <MapPin size={10} /> {permitCheck.jurisdiction?.name || permitCheck.city} – on file (gas/LP data only)
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-amber-50 text-amber-700 border border-amber-200">
                        <AlertTriangle size={10} /> General FL building code — no {permitCheck.city || 'city'} data on file
                      </span>
                    )}
                    {!permitCheck.hasDetailedRules && permitCheck.city && (
                      <button
                        onClick={researchMunicipalityPermits}
                        disabled={permitResearching || permitCheckLoading}
                        className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-white text-blue-600 border border-blue-200 hover:bg-blue-50 transition-colors disabled:opacity-50"
                      >
                        <Sparkles size={10} /> Research {permitCheck.city} rules →
                      </button>
                    )}
                  </div>

                  {/* Permit list */}
                  {permitCheck.permits.length === 0 ? (
                    <div className="flex items-center gap-2 p-3 bg-green-50 rounded-xl text-sm text-green-700 font-medium">
                      <Check size={16} /> No permits appear to be required for this scope of work.
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 gap-2">
                      {permitCheck.permits.map((p: any, i: number) => (
                        <div key={i} className={`flex items-start gap-3 p-3 rounded-xl border ${
                          p.required === 'yes' ? 'bg-red-50 border-red-100' :
                          p.required === 'maybe' ? 'bg-amber-50 border-amber-100' :
                          'bg-green-50 border-green-100'
                        }`}>
                          <div className={`mt-0.5 flex-shrink-0 text-xs font-bold px-2 py-0.5 rounded-full ${
                            p.required === 'yes' ? 'bg-red-600 text-white' :
                            p.required === 'maybe' ? 'bg-amber-500 text-white' :
                            'bg-green-600 text-white'
                          }`}>
                            {p.required === 'yes' ? 'REQUIRED' : p.required === 'maybe' ? 'MAYBE' : 'NOT REQ.'}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="font-semibold text-sm text-gray-900">{p.type}</div>
                            <div className="text-xs text-gray-600 mt-0.5">{p.reason}</div>
                            {p.triggeredBy?.length > 0 && (
                              <div className="flex flex-wrap gap-1 mt-1.5">
                                {p.triggeredBy.map((sec: string) => (
                                  <span key={sec} className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-white/70 text-gray-500 border border-gray-200">{sec}</span>
                                ))}
                              </div>
                            )}
                          </div>
                          <a
                            href={`/admin/permits?prefill=${encodeURIComponent(JSON.stringify({ permit_type: p.type.toLowerCase().replace(' permit',''), city: permitCheck.city }))}`}
                            className="flex-shrink-0 text-[11px] font-semibold text-blue-600 hover:underline whitespace-nowrap"
                          >
                            + Create Record
                          </a>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Jurisdiction info */}
                  {permitCheck.jurisdiction && (
                    <div className="p-3 bg-gray-50 rounded-xl text-xs text-gray-600 space-y-1 border border-gray-100">
                      <div className="font-semibold text-gray-800 text-sm">{permitCheck.jurisdiction.name}</div>
                      {permitCheck.jurisdiction.permit_office_phone && (
                        <div>📞 {permitCheck.jurisdiction.permit_office_phone}</div>
                      )}
                      {permitCheck.jurisdiction.typical_fee_range && (
                        <div>💰 Typical fees: {permitCheck.jurisdiction.typical_fee_range}</div>
                      )}
                      {permitCheck.jurisdiction.typical_processing_days && (
                        <div>⏱ Processing: ~{permitCheck.jurisdiction.typical_processing_days} business days</div>
                      )}
                      {permitCheck.jurisdiction.website_url && (
                        <a href={permitCheck.jurisdiction.website_url} target="_blank" rel="noopener noreferrer"
                          className="text-blue-600 underline block">🌐 {permitCheck.jurisdiction.website_url}</a>
                      )}
                    </div>
                  )}

                  {/* Disclaimer */}
                  <p className="text-[11px] text-gray-400 italic">{permitCheck.disclaimer}</p>
                </div>
              )}
            </div>
          </Section>

          <Section title="Design + PM Fee Rationale" icon={DollarSign}>
            <div className="px-5 py-4">
              <div className="flex items-baseline gap-3 mb-2">
                <span className="text-2xl font-extrabold" style={{ color: '#b8895a' }}>${estimate.design_pm_fee.toFixed(2)}</span>
                {editingEstimate ? (
                  <span className="text-sm text-gray-500 flex items-center gap-1.5">
                    (
                    <input type="number" min={0} step="0.1" value={estimate.design_pm_fee_percent}
                      onChange={e => updateField('design_pm_fee_percent', e.target.value)}
                      className="w-16 px-2 py-1 rounded-lg border border-gray-200 text-sm font-mono text-right focus:outline-none focus:ring-2 focus:border-blue-400" />
                    % of job cost)
                  </span>
                ) : (
                  <span className="text-sm text-gray-500">({estimate.design_pm_fee_percent}% of job cost)</span>
                )}
              </div>
              {editingEstimate ? (
                <textarea value={estimate.design_pm_fee_rationale} onChange={e => updateRationale(e.target.value)} rows={4}
                  placeholder="Why this percentage fits this job…"
                  className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm text-gray-700 leading-relaxed focus:outline-none focus:ring-2 focus:border-blue-400" />
              ) : (
                <p className="text-sm text-gray-700">{estimate.design_pm_fee_rationale}</p>
              )}
            </div>
          </Section>

          {estimate.similar_past_jobs.length > 0 && (
            <Section title="Anchored to These Past Jobs" icon={History}>
              <div className="divide-y divide-gray-100">
                {estimate.similar_past_jobs.map((j, i) => (
                  <div key={i} className="px-5 py-3 flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="text-xs text-gray-500">{j.service_date}</div>
                      <div className="text-sm text-gray-800">{j.description}</div>
                    </div>
                    <div className="font-mono font-semibold text-sm text-gray-900 whitespace-nowrap">${j.amount.toFixed(2)}</div>
                  </div>
                ))}
              </div>
            </Section>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <Section title="Assumptions" icon={ClipboardList}>
              <ul className="px-5 py-3 space-y-1.5 text-sm text-gray-700 list-disc list-inside">
                {estimate.assumptions.map((a, i) => <li key={i}>{a}</li>)}
              </ul>
            </Section>
            <Section title="Risks" icon={AlertTriangle}>
              <ul className="px-5 py-3 space-y-1.5 text-sm text-gray-700 list-disc list-inside">
                {estimate.risks.map((r, i) => <li key={i} className="text-amber-900">{r}</li>)}
              </ul>
            </Section>
          </div>

          {estimate.confidence_rationale && (
            <div className="text-xs text-gray-500 italic px-1">
              <strong>Why {estimate.confidence} confidence:</strong> {estimate.confidence_rationale}
            </div>
          )}
        </div>
      )}

      {previewing && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4" onClick={() => setPreviewing(null)}>
          <button className="absolute top-4 right-4 text-white bg-white/10 hover:bg-white/20 rounded-full p-2"><X size={20} /></button>
          <img src={previewing.signed_url || ''} alt={previewing.name} className="max-w-full max-h-full rounded-2xl shadow-2xl" />
        </div>
      )}

      <DesignStudio
        open={designStudioOpen}
        onClose={() => setDesignStudioOpen(false)}
        design={design}
        onChange={d => { setDesign(d); markDirty() }}
        attachments={attachments}
        sessionId={sessionId}
        description={description}
        measurements={measurements}
        onAddAttachments={atts => setAttachments(prev => [...prev, ...atts])}
        onOpenDrivePicker={() => { setDrivePickerMoodBoard(true); setDrivePickerOpen(true) }}
        onOpenDrivePickerForSketch={() => { setDrivePickerForSketch(true); setDrivePickerOpen(true) }}
        sketchDriveImageUrl={sketchDriveImageUrl}
        onSketchDriveImageConsumed={() => setSketchDriveImageUrl(null)}
      />

      {drivePickerOpen && (
        <DrivePickerLite
          onClose={() => { setDrivePickerOpen(false); setDrivePickerMoodBoard(false); setDrivePickerForSketch(false) }}
          onImport={async (files) => {
            setDrivePickerOpen(false)
            await importFromDrive(files)
          }}
        />
      )}
    </div>
  )
}

// Lightweight Google Drive picker for plan-job — supports image-only browsing,
// multi-select, and bulk import into the job-planning bucket.
function DrivePickerLite({ onClose, onImport }: { onClose: () => void; onImport: (files: Array<{ fileId: string; fileName: string; mimeType: string }>) => Promise<void> }) {
  const [folderId, setFolderId] = useState<string>('root')
  const [folderName, setFolderName] = useState<string>('My Drive')
  const [stack, setStack] = useState<Array<{ id: string; name: string }>>([])
  const [files, setFiles] = useState<any[]>([])
  const [loading, setLoading] = useState(false)
  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [importing, setImporting] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => { load('root', 'My Drive', true) }, [])

  async function load(id: string, name: string, resetStack = false, overrideSearch?: string) {
    setLoading(true); setError('')
    try {
      const q = overrideSearch !== undefined ? overrideSearch : search
      const params = new URLSearchParams({ action: 'list', folderId: id })
      if (q) params.set('q', q)
      const res = await fetch(`/api/google-drive?${params}`)
      const d = await res.json()
      if (!res.ok) throw new Error(d.error || 'Failed to load')
      setFiles(d.files || [])
      setFolderId(id)
      setFolderName(d.folderName || name)
      if (resetStack) setStack([])
    } catch (e: any) {
      setError(e.message)
    }
    setLoading(false)
  }

  function openFolder(f: any) {
    setStack(prev => [...prev, { id: folderId, name: folderName }])
    setSelected(new Set())
    setSearch('')                        // clear search so we list children of the folder
    load(f.id, f.name, false, '')         // explicitly pass empty search to avoid stale state
  }

  function goBack() {
    const prev = stack[stack.length - 1]
    if (!prev) return
    setStack(s => s.slice(0, -1))
    setSelected(new Set())
    load(prev.id, prev.name)
  }

  function toggle(id: string) {
    setSelected(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n })
  }

  function isFolder(f: any) { return f.mimeType === 'application/vnd.google-apps.folder' }
  // Videos can't be analyzed by Claude AND are usually huge — skip them from
  // Drive imports to avoid blowing past the ingress timeout (>60s).
  // Only images & PDFs are selectable here. Local uploads can still include videos.
  function isMedia(f: any) {
    return typeof f.mimeType === 'string' && (f.mimeType.startsWith('image/') || f.mimeType === 'application/pdf')
  }

  async function doImport() {
    if (selected.size === 0) return
    setImporting(true)
    const payload = files.filter(f => selected.has(f.id)).map(f => ({ fileId: f.id, fileName: f.name, mimeType: f.mimeType }))
    await onImport(payload)
    setImporting(false)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl max-h-[90vh] flex flex-col" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b" style={{ background: '#2f5a5e', color: 'white', borderRadius: '1rem 1rem 0 0' }}>
          <div className="flex items-center gap-2"><Cloud size={18} /><h2 className="font-bold">Import from Google Drive</h2></div>
          <button onClick={onClose} className="hover:bg-white/10 rounded p-1"><X size={18} /></button>
        </div>

        <div className="px-5 py-3 border-b bg-gray-50 flex flex-wrap items-center gap-3">
          {stack.length > 0 && (
            <button onClick={goBack} className="flex items-center gap-1 text-sm px-2 py-1 rounded hover:bg-gray-200"><ChevronLeft size={14} /> Back</button>
          )}
          <div className="flex-1 font-semibold text-gray-800 text-sm">
            {search ? <span>Search results for <em className="text-gray-500 font-normal">"{search}"</em></span> : folderName}
          </div>
          {search && (
            <button onClick={() => { setSearch(''); load(folderId, folderName, false, '') }}
              className="text-xs text-gray-500 hover:text-gray-800 px-2 py-1">Clear search</button>
          )}
          {(() => {
            const selectable = files.filter(f => !isFolder(f) && isMedia(f))
            const allSelected = selectable.length > 0 && selectable.every(f => selected.has(f.id))
            const someSelected = selectable.some(f => selected.has(f.id))
            return selectable.length > 0 ? (
              <button onClick={() => {
                setSelected(prev => {
                  if (allSelected) {
                    // Deselect everything visible
                    const n = new Set(prev)
                    for (const f of selectable) n.delete(f.id)
                    return n
                  } else {
                    // Select everything visible
                    const n = new Set(prev)
                    for (const f of selectable) n.add(f.id)
                    return n
                  }
                })
              }} className="text-xs font-semibold px-2 py-1 rounded border border-gray-200 hover:bg-gray-100 whitespace-nowrap">
                {allSelected ? `Deselect all (${selectable.length})` : someSelected ? `Select all ${selectable.length}` : `Select all ${selectable.length}`}
              </button>
            ) : null
          })()}
          <div className="relative">
            <Search size={12} className="absolute left-2 top-2 text-gray-400" />
            <input value={search} onChange={e => setSearch(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') load(folderId, folderName) }}
              placeholder="Search…"
              className="pl-7 pr-2 py-1 text-xs border rounded w-44" />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-2">
          {loading ? (
            <div className="flex items-center justify-center py-10 text-gray-500 text-sm"><Loader2 className="animate-spin mr-2" size={16} /> Loading…</div>
          ) : error ? (
            <div className="py-4 text-sm text-red-600">{error}</div>
          ) : files.length === 0 ? (
            <div className="text-gray-400 text-sm text-center py-10">Empty folder.</div>
          ) : (
            <ul className="divide-y">
              {files.map(f => {
                const folder = isFolder(f)
                const sel = selected.has(f.id)
                const selectable = !folder && isMedia(f)
                return (
                  <li key={f.id} className="flex items-center gap-3 py-2 hover:bg-gray-50">
                    {selectable ? (
                      <input type="checkbox" checked={sel} onChange={() => toggle(f.id)} className="ml-1" />
                    ) : <span className="ml-1 w-4 inline-block" />}
                    <button onClick={() => folder ? openFolder(f) : (selectable && toggle(f.id))}
                      className="flex items-center gap-2 flex-1 text-left text-sm">
                      {folder ? <Folder size={16} className="text-amber-500" /> :
                        f.mimeType?.startsWith('image/') ? <ImageIcon size={16} className="text-blue-500" /> :
                        f.mimeType?.startsWith('video/') ? <Film size={16} className="text-purple-500" /> :
                        <FileText size={16} className="text-gray-400" />}
                      <span className={folder ? 'font-medium text-gray-800' : selectable ? 'text-gray-700' : 'text-gray-400'}>{f.name}</span>
                      {f.size && <span className="text-[10px] text-gray-400 ml-auto">{Math.round(Number(f.size) / 1024)} KB</span>}
                    </button>
                  </li>
                )
              })}
            </ul>
          )}
        </div>

        <div className="border-t bg-gray-50 px-5 py-3 flex items-center gap-3">
          <span className="text-xs text-gray-500">Selectable: photos, videos, PDFs</span>
          <div className="flex-1" />
          <span className="text-sm text-gray-600">{selected.size} selected</span>
          <button onClick={doImport} disabled={selected.size === 0 || importing}
            className="px-4 py-2 rounded-xl text-white font-bold text-sm disabled:opacity-40 flex items-center gap-1.5" style={{ background: '#b8895a' }}>
            {importing ? <Loader2 size={13} className="animate-spin" /> : <Download size={13} />} Import
          </button>
        </div>
      </div>
    </div>
  )
}

function deriveTitle(d: string): string {
  if (!d) return ''
  const firstLine = d.split(/[\n.]/)[0].trim()
  return firstLine.slice(0, 80)
}

function Stat({ label, value, sublabel, accent, icon: Icon, big }: { label: string; value: string; sublabel?: string; accent?: string; icon: any; big?: boolean }) {
  return (
    <div className={`bg-white rounded-2xl shadow-sm border border-gray-100 p-4 ${big ? 'ring-2 ring-blue-100' : ''}`}>
      <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider font-bold text-gray-500">
        <Icon size={11} />{label}
      </div>
      <div className={`${big ? 'text-3xl' : 'text-2xl'} font-extrabold mt-1`} style={{ color: accent || '#111827' }}>{value}</div>
      {sublabel && <div className="text-xs text-gray-400 mt-0.5">{sublabel}</div>}
    </div>
  )
}

function BudgetDelta({ label, from, to }: { label: string; from: number; to: number }) {
  const diff = to - from
  const pct = from !== 0 ? (diff / from) * 100 : 0
  const over = diff > 0.005
  const under = diff < -0.005
  const color = over ? 'text-red-600' : under ? 'text-green-600' : 'text-gray-500'
  return (
    <span className="text-xs text-gray-500">
      {label}: <strong className={`font-mono ${color}`}>{diff >= 0 ? '+' : '−'}${Math.abs(diff).toFixed(2)} ({Math.abs(pct).toFixed(1)}%)</strong>
    </span>
  )
}

function Section({ title, icon: Icon, children }: { title: string; icon: any; children: React.ReactNode }) {
  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
      <div className="px-5 py-3 border-b border-gray-100 flex items-center gap-2">
        <Icon size={14} style={{ color: '#b8895a' }} />
        <h2 className="font-bold text-gray-900 text-sm">{title}</h2>
      </div>
      {children}
    </div>
  )
}
