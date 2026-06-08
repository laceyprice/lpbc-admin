'use client'
import { useEffect, useRef, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { Sparkles, Loader2, ClipboardList, DollarSign, Clock, AlertTriangle, ListChecks, TrendingUp, History, Hammer, Upload, X, Image as ImageIcon, Film, FileText, Ruler, Save, FolderOpen, Plus, Trash2, Archive, Cloud, Folder, ChevronLeft, Search, Download, MapPin, Users2, Pencil, Check, RotateCcw, Wand2 } from 'lucide-react'
import DesignStudio, { DesignData } from '@/components/admin/DesignStudio'

interface BudgetLine {
  category: string
  estimated_cost: number
  notes: string
  // Filled in later as the project moves from estimate → quote → completed job,
  // so the owner can see the spread between what was estimated, quoted, and billed.
  quoted_cost?: number | null
  actual_cost?: number | null
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
    ? raw.materials_breakdown.map((m: any) => ({
        category: m?.category || '',
        estimated_cost: Number(m?.estimated_cost) || 0,
        notes: m?.notes || '',
        quoted_cost: m?.quoted_cost ?? null,
        actual_cost: m?.actual_cost ?? null,
      }))
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
  const [progressTokens, setProgressTokens] = useState(0)
  const fileRef = useRef<HTMLInputElement>(null)

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
      setAttachments(prev => [...prev, ...(d.uploaded || [])])
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

  async function loadPlansList() {
    try {
      const res = await fetch(`/api/job-plans${showArchived ? '?archived=true' : ''}`)
      const d = await res.json()
      setSavedPlans(Array.isArray(d) ? d : [])
    } catch {}
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
  }

  async function loadPlan(id: string) {
    setError('')
    try {
      const res = await fetch(`/api/job-plans?id=${id}`)
      const d = await res.json()
      if (!res.ok) { setError(d.error || 'Failed to load plan'); return }
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
    } catch (e: any) {
      setError(e?.message || 'Failed to load plan')
    }
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
      }
      const url = '/api/job-plans'
      const method = planId ? 'PATCH' : 'POST'
      if (planId) body.id = planId
      const res = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      const d = await res.json()
      if (!res.ok) { setError(d.error || 'Save failed'); setSaving(false); return }
      if (!planId) setPlanId(d.id)
      setSavedAt(new Date())
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
  }
  function updateMaterial(i: number, field: 'category' | 'notes' | 'estimated_cost' | 'quoted_cost' | 'actual_cost', value: string) {
    patchEstimate(e => ({
      ...e,
      materials_breakdown: e.materials_breakdown.map((m, idx) => idx !== i ? m : {
        ...m,
        [field]: (field === 'category' || field === 'notes')
          ? value
          : (value.trim() === '' ? null : (Number(value) || 0)),
      }),
    }))
  }
  function removeMaterial(i: number) {
    patchEstimate(e => ({ ...e, materials_breakdown: e.materials_breakdown.filter((_, idx) => idx !== i) }))
  }
  function addMaterial() {
    patchEstimate(e => ({ ...e, materials_breakdown: [...e.materials_breakdown, { category: 'New line item', estimated_cost: 0, notes: '', quoted_cost: null, actual_cost: null }] }))
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
          <button onClick={() => setDesignStudioOpen(true)}
            className="flex items-center gap-1.5 text-xs font-bold px-3 py-2 rounded-xl border transition-colors"
            style={{ borderColor: '#e8d9c8', background: '#fbf3ec', color: '#9a6a3c' }}>
            <Wand2 size={13} /> Design Studio
            {(() => {
              const c = (design.board?.length || 0) + (design.sketches?.length || 0) + (design.comparisons?.length || 0) + (design.ai_suggestions?.length || 0)
              return c > 0 ? <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-amber-200 text-amber-800">{c}</span> : null
            })()}
          </button>
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
        <input value={title} onChange={e => setTitle(e.target.value)}
          placeholder="Plan title (auto-generated from description if blank)"
          className="flex-1 min-w-[200px] px-3 py-2 rounded-xl border border-gray-200 text-sm font-semibold focus:outline-none focus:ring-2 focus:border-blue-400" />
        <div className="text-[11px] text-gray-500 flex items-center gap-2">
          {planId ? (
            <span className="text-blue-600 font-semibold">Editing saved plan</span>
          ) : (
            <span className="text-amber-700 font-semibold">Unsaved draft</span>
          )}
          {savedAt && <span>· Saved {savedAt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>}
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
          <select value={worksiteId || ''} onChange={e => setWorksiteId(e.target.value || null)}
            className="w-full px-3 py-2 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:border-blue-400 bg-white">
            <option value="">— Not linked —</option>
            {worksiteOptions.map(w => <option key={w.id} value={w.id}>{w.address}{w.city ? `, ${w.city}` : ''}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-[11px] font-semibold text-gray-500 uppercase tracking-wider mb-1">Project Status</label>
          <select value={status} onChange={e => setStatus(e.target.value)}
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
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5 mb-6 space-y-4">
        <div>
          <label className="block text-sm font-semibold text-gray-700 mb-2">Job description</label>
          <textarea
            value={description}
            onChange={e => setDescription(e.target.value)}
            rows={4}
            placeholder="e.g. Full master bathroom remodel — tear out existing tub/shower/vanity/tile, walk-in shower with custom tile, double vanity, new toilet, paint, lighting. Approx 12x10 ft."
            className="w-full px-4 py-3 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:border-blue-400"
          />
        </div>

        <div>
          <label className="block text-sm font-semibold text-gray-700 mb-2 flex items-center gap-1.5"><Ruler size={13} /> Measurements & scope notes (optional)</label>
          <textarea
            value={measurements}
            onChange={e => setMeasurements(e.target.value)}
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
            <div className="px-5 pt-3 pb-1 text-[11px] text-gray-400">
              Materials, labor, and subcontractor costs all live here as one unified budget. Fill in <span className="text-blue-600 font-semibold">Quoted</span> once a real quote comes in, and <span className="text-emerald-600 font-semibold">Actual Billed</span> once the job wraps — the spread shows automatically.
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
              <tbody className="divide-y divide-gray-50">
                {estimate.materials_breakdown.map((m, i) => (
                  <tr key={i}>
                    {editingEstimate ? (
                      <>
                        <td className="px-4 py-1.5">
                          <input value={m.category} onChange={e => updateMaterial(i, 'category', e.target.value)}
                            className="w-full px-2 py-1 rounded-lg border border-gray-200 text-sm font-medium focus:outline-none focus:ring-2 focus:border-blue-400" />
                        </td>
                        <td className="px-4 py-1.5">
                          <input value={m.notes} onChange={e => updateMaterial(i, 'notes', e.target.value)}
                            className="w-full px-2 py-1 rounded-lg border border-gray-200 text-xs text-gray-600 focus:outline-none focus:ring-2 focus:border-blue-400" />
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
                ))}
                {editingEstimate && (
                  <tr>
                    <td colSpan={6} className="px-4 py-2">
                      <button onClick={addMaterial} className="flex items-center gap-1.5 text-xs font-semibold text-blue-600 hover:text-blue-800">
                        <Plus size={12} /> Add line item
                      </button>
                    </td>
                  </tr>
                )}
              </tbody>
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
        onChange={setDesign}
        attachments={attachments}
        sessionId={sessionId}
        description={description}
        measurements={measurements}
      />

      {drivePickerOpen && (
        <DrivePickerLite
          onClose={() => setDrivePickerOpen(false)}
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
