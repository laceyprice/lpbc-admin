'use client'
import { Component, useEffect, useRef, useState } from 'react'
import type { ErrorInfo, ReactNode } from 'react'
import {
  X, Palette, PenTool, Images, Sparkles, Loader2, Plus, Trash2, Save,
  Square, Minus, Type, Eraser, Undo2, RotateCcw, Wand2, Check, DollarSign,
  Camera, Upload, Cloud, ZoomIn, ZoomOut, ScanLine, AlertCircle, CheckCircle2, PencilRuler,
  Pencil, Copy, ShoppingBag, ExternalLink, Image as ImageIcon,
} from 'lucide-react'
import FloorPlanner, { type PlanDoc } from './FloorPlanner'

// ── Types ──────────────────────────────────────────────────────────────────
export interface BoardItem {
  id: string
  path: string
  signed_url?: string | null
  name: string
  room: string
  label: string
  notes: string
  price: number
  link?: string   // source product/page link (when added "From link")
}
export interface SketchItem {
  id: string
  path: string
  signed_url?: string | null
  name: string
  created_at: string
}
export interface ComparisonItem {
  id: string
  before_path: string | null
  after_path: string | null
  before_signed_url?: string | null
  after_signed_url?: string | null
  note: string
}
export interface DesignSuggestion {
  id: string
  style_name: string
  description: string
  key_materials?: string[]
  color_palette?: string[]
  estimated_cost_impact?: 'lower' | 'typical' | 'higher' | string
  why_it_fits?: string
  selected?: boolean
}
// A sourced finish/product the owner wants for the job — a link (vanity, fan,
// sink, lights, appliance…) with optional price, room and notes.
export interface FinishLink {
  id: string
  category: string
  label: string
  url: string
  price: number
  room: string
  notes: string
  image_path?: string        // preview image pulled from the link (storage path)
  image_url?: string | null   // signed URL for display
}
// A project can hold several floor-plan sheets (e.g. Architectural, Electrical,
// Renovation) that the user flips between — all inside the ONE project/plan.
export interface FloorPlanSheet { id: string; name: string; doc: PlanDoc }
export interface ProjectMessage { id: string; role: 'admin' | 'customer'; name: string; body: string; created_at: string }
export interface DesignData {
  board?: BoardItem[]
  sketches?: SketchItem[]
  comparisons?: ComparisonItem[]
  ai_suggestions?: DesignSuggestion[]
  finish_links?: FinishLink[]
  messages?: ProjectMessage[]
  notes?: string
  // `floorplan` is the LEGACY single plan + a live mirror of the active sheet
  // (kept in sync so older readers — 3D cost, copy-to, estimate — keep working).
  floorplan?: PlanDoc
  floorplans?: FloorPlanSheet[]   // the real list of sheets in this project
  activeFloorplan?: string        // id of the sheet currently being edited
}
interface AttachmentLike {
  path: string
  name: string
  type: string
  size: number
  signed_url: string | null
}

const ROOMS = ['Kitchen', 'Primary Bath', 'Bathroom', 'Living Room', 'Bedroom', 'Exterior', 'Outdoor / Patio', 'Laundry', 'Office', 'Other']
const FINISH_CATEGORIES = ['Vanity', 'Faucet', 'Sink', 'Toilet', 'Tub / Shower', 'Tile', 'Countertop', 'Cabinet', 'Lighting', 'Ceiling Fan', 'Appliance', 'Hardware', 'Mirror', 'Flooring', 'Paint', 'Plumbing Fixture', 'Door / Window', 'Other']
const TABS = [
  { key: 'board', label: 'Mood Board', icon: Palette },
  { key: 'sketch', label: 'Floor Plan', icon: PencilRuler },
  { key: 'compare', label: 'Before / After', icon: Images },
  { key: 'ai', label: 'AI Suggestions', icon: Sparkles },
] as const
type TabKey = typeof TABS[number]['key']

function newId(prefix: string) { return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 7)}` }

function planHasContent(doc?: PlanDoc): boolean {
  if (!doc) return false
  return !!(doc.walls?.length || doc.fixtures?.length || doc.rooms?.length || doc.openings?.length || doc.dims?.length || doc.wires?.length || doc.labels?.length)
}
// Derive the project's floor-plan sheets, migrating a legacy single `floorplan`
// into a one-sheet list. Always returns at least one sheet.
function getSheets(design: DesignData): FloorPlanSheet[] {
  if (Array.isArray(design.floorplans) && design.floorplans.length) {
    return design.floorplans.map((s, i) => ({ id: s.id || `fp_${i}`, name: s.name || `Floor Plan ${i + 1}`, doc: s.doc || {} }))
  }
  return [{ id: 'fp_1', name: 'Floor Plan 1', doc: design.floorplan || {} }]
}

type DesignStudioProps = {
  open: boolean
  onClose: () => void
  design: DesignData
  onChange: (next: DesignData) => void
  attachments: AttachmentLike[]
  sessionId: string
  description: string
  measurements: string
  onAddAttachments?: (atts: AttachmentLike[]) => void
  onOpenDrivePicker?: () => void
}

// Wrap the actual studio in an error boundary — the modal deals with a lot of
// loosely-typed AI- and DB-sourced data (design JSONB, AI suggestion shapes,
// attachment metadata), and a single bad value anywhere inside it must never
// be able to crash the *entire* plan-job page out from under the owner.
class DesignStudioBoundary extends Component<{ open: boolean; onClose: () => void; children: ReactNode }, { error: Error | null }> {
  constructor(props: { open: boolean; onClose: () => void; children: ReactNode }) {
    super(props)
    this.state = { error: null }
  }
  static getDerivedStateFromError(error: Error) {
    return { error }
  }
  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('DesignStudio crashed:', error, info?.componentStack)
  }
  componentDidUpdate(prevProps: { open: boolean }) {
    // Reopening the modal gives the inner component a fresh mount/state —
    // clear any prior crash so the feature isn't permanently bricked.
    if (this.state.error && this.props.open && !prevProps.open) {
      this.setState({ error: null })
    }
  }
  render() {
    if (this.state.error) {
      if (!this.props.open) return null
      return (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-6">
          <div className="bg-white max-w-md w-full rounded-2xl shadow-xl p-6 text-center space-y-3">
            <h2 className="font-extrabold text-gray-900 text-base">Design Studio hit a snag</h2>
            <p className="text-sm text-gray-500">
              Something inside the Design Studio didn't load correctly — your plan, estimate, and budget
              breakdown are safe and unaffected. Closing and reopening usually clears it.
            </p>
            <p className="text-[11px] font-mono text-gray-400 break-words">{this.state.error.message}</p>
            <button onClick={this.props.onClose}
              className="text-sm font-bold px-4 py-2 rounded-xl text-white shadow-sm" style={{ background: '#b8895a' }}>
              Close
            </button>
          </div>
        </div>
      )
    }
    return this.props.children as any
  }
}

export default function DesignStudio(props: DesignStudioProps) {
  return (
    <DesignStudioBoundary open={props.open} onClose={props.onClose}>
      <DesignStudioInner {...props} />
    </DesignStudioBoundary>
  )
}

function DesignStudioInner({
  open, onClose, design, onChange,
  attachments, sessionId, description, measurements,
  onAddAttachments, onOpenDrivePicker,
}: DesignStudioProps) {
  const [tab, setTab] = useState<TabKey>('board')

  // Reset to the board tab each time the studio opens so a previously-active
  // tab's state doesn't linger (we use `if (!open) return null`, not unmount).
  const prevOpenRef = useRef(false)
  if (open && !prevOpenRef.current) { prevOpenRef.current = true; if (tab !== 'board') setTab('board') }
  if (!open) { prevOpenRef.current = false; return null }

  const board = design.board || []
  const sketches = design.sketches || []
  const comparisons = design.comparisons || []
  const suggestions = design.ai_suggestions || []

  function patch(p: Partial<DesignData>) { onChange({ ...design, ...p }) }

  // ── Floor-plan sheets (multiple plans within this one project) ─────────────
  const sheets = getSheets(design)
  const activeId = (design.activeFloorplan && sheets.some(s => s.id === design.activeFloorplan)) ? design.activeFloorplan : sheets[0].id
  const activeSheet = sheets.find(s => s.id === activeId) || sheets[0]
  // Persist the sheet list + which one is active, and mirror the active sheet
  // into `floorplan` so existing readers (3D cost, copy-to, estimate) still work.
  function writeSheets(next: FloorPlanSheet[], active?: string) {
    const list = next.length ? next : [{ id: 'fp_1', name: 'Floor Plan 1', doc: {} }]
    const act = (active && list.some(s => s.id === active)) ? active : list[0].id
    const cur = list.find(s => s.id === act) || list[0]
    patch({ floorplans: list, activeFloorplan: cur.id, floorplan: cur.doc })
  }
  const onActiveDocChange = (doc: PlanDoc) => writeSheets(sheets.map(s => s.id === activeId ? { ...s, doc } : s), activeId)
  const switchSheet = (id: string) => { if (id !== activeId) writeSheets(sheets, id) }
  const addSheet = () => { const id = newId('fp'); writeSheets([...sheets, { id, name: `Floor Plan ${sheets.length + 1}`, doc: {} }], id) }
  const duplicateSheet = () => {
    const id = newId('fp')
    let clone: PlanDoc = {}
    try { clone = JSON.parse(JSON.stringify(activeSheet.doc || {})) } catch { clone = { ...(activeSheet.doc || {}) } }
    writeSheets([...sheets, { id, name: `${activeSheet.name} copy`, doc: clone }], id)
  }
  const renameSheet = (id: string) => {
    const cur = sheets.find(s => s.id === id)
    const name = window.prompt('Rename this floor plan:', cur?.name || '')
    if (name == null) return
    writeSheets(sheets.map(s => s.id === id ? { ...s, name: name.trim() || cur?.name || 'Floor Plan' } : s), activeId)
  }
  const deleteSheet = (id: string) => {
    if (sheets.length <= 1) { alert('A project needs at least one floor plan.'); return }
    const s = sheets.find(x => x.id === id)
    if (!confirm(`Delete floor plan "${s?.name}"? This can't be undone.`)) return
    const next = sheets.filter(x => x.id !== id)
    writeSheets(next, id === activeId ? next[0].id : activeId)
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-stretch justify-center p-0 sm:p-4">
      <div className="bg-white w-full sm:max-w-none sm:rounded-2xl shadow-xl flex flex-col h-full overflow-hidden">
        {/* Header */}
        <div className="px-5 py-3.5 border-b border-gray-100 flex items-center justify-between flex-shrink-0">
          <h2 className="font-extrabold text-gray-900 text-base flex items-center gap-2">
            <Wand2 size={18} style={{ color: '#b8895a' }} /> Design Studio
          </h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 p-1"><X size={18} /></button>
        </div>

        {/* Tabs */}
        <div className="px-5 pt-3 flex items-center gap-1.5 border-b border-gray-100 flex-shrink-0 overflow-x-auto">
          {TABS.map(t => {
            const Icon = t.icon
            const active = tab === t.key
            const count = t.key === 'board' ? board.length : t.key === 'sketch' ? sheets.length : t.key === 'compare' ? comparisons.length : suggestions.length
            return (
              <button key={t.key} onClick={() => setTab(t.key)}
                className={`flex items-center gap-1.5 text-xs font-bold px-3.5 py-2 rounded-t-xl border-b-2 transition-colors whitespace-nowrap ${active ? 'border-current text-gray-900' : 'border-transparent text-gray-400 hover:text-gray-600'}`}
                style={active ? { color: '#b8895a', borderColor: '#b8895a' } : {}}>
                <Icon size={13} /> {t.label}{count > 0 && <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${active ? 'bg-amber-100 text-amber-800' : 'bg-gray-100 text-gray-500'}`}>{count}</span>}
              </button>
            )
          })}
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-5">
          {tab === 'board' && (
            <MoodBoardTab board={board} attachments={attachments}
              sessionId={sessionId}
              onAddAttachments={onAddAttachments}
              onOpenDrivePicker={onOpenDrivePicker}
              onAdd={items => patch({ board: [...board, ...items] })}
              onUpdate={(i, item) => patch({ board: board.map((b, idx) => idx === i ? item : b) })}
              onRemove={i => patch({ board: board.filter((_, idx) => idx !== i) })}
            />
          )}
          {tab === 'sketch' && (
            <div className="space-y-3">
              {/* Sheet switcher — multiple floor plans inside THIS project */}
              <div className="flex items-center gap-1.5 flex-wrap pb-2 border-b border-gray-100">
                <span className="text-[11px] font-bold uppercase tracking-wider text-gray-400 mr-1">Plans in this project:</span>
                {sheets.map(s => {
                  const act = s.id === activeId
                  return (
                    <div key={s.id} className={`flex items-center rounded-lg border ${act ? 'border-amber-300 bg-amber-50' : 'border-gray-200 bg-white hover:bg-gray-50'}`}>
                      <button onClick={() => switchSheet(s.id)} className={`px-2.5 py-1.5 text-xs font-semibold ${act ? 'text-amber-700' : 'text-gray-600'}`}>{s.name}</button>
                      {act && (
                        <>
                          <button onClick={() => renameSheet(s.id)} title="Rename this plan" className="px-1 py-1.5 text-amber-500 hover:text-amber-800"><Pencil size={11} /></button>
                          {sheets.length > 1 && (
                            <button onClick={() => deleteSheet(s.id)} title="Delete this plan" className="px-1.5 py-1.5 text-amber-300 hover:text-red-600"><Trash2 size={11} /></button>
                          )}
                        </>
                      )}
                    </div>
                  )
                })}
                <button onClick={addSheet} title="Add a blank floor plan to this project"
                  className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-gray-200 text-xs font-semibold text-gray-600 hover:bg-gray-50">
                  <Plus size={12} /> New plan
                </button>
                <button onClick={duplicateSheet} title="Copy the current plan into a new sheet in this project (for an electrical / renovation version)"
                  className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-violet-200 bg-violet-50 text-xs font-semibold text-violet-700 hover:bg-violet-100">
                  <Copy size={12} /> Duplicate this plan
                </button>
              </div>
              {/* key forces a fresh mount when switching sheets so the canvas reseeds */}
              <FloorPlanner key={activeId} value={activeSheet.doc} onChange={onActiveDocChange} />
            </div>
          )}
          {tab === 'compare' && (
            <CompareTab comparisons={comparisons} attachments={attachments}
              onAdd={c => patch({ comparisons: [...comparisons, c] })}
              onUpdate={(i, c) => patch({ comparisons: comparisons.map((x, idx) => idx === i ? c : x) })}
              onRemove={i => patch({ comparisons: comparisons.filter((_, idx) => idx !== i) })}
            />
          )}
          {tab === 'ai' && (
            <AiSuggestionsTab suggestions={suggestions} attachments={attachments}
              description={description} measurements={measurements}
              notes={design.notes || ''}
              onNotesChange={n => patch({ notes: n })}
              onSet={list => patch({ ai_suggestions: list })}
              onToggleSelect={(i) => patch({ ai_suggestions: suggestions.map((s, idx) => idx === i ? { ...s, selected: !s.selected } : s) })}
              onAddToBoard={(s) => {
                const materials = Array.isArray(s.key_materials) ? s.key_materials : []
                const styleName = String(s.style_name ?? 'Untitled direction')
                const items: BoardItem[] = materials.slice(0, 6).map(m => ({
                  id: newId('board'), path: '', signed_url: null, name: styleName,
                  room: 'Other', label: String(m ?? ''), notes: `From AI direction "${styleName}": ${s.why_it_fits ? String(s.why_it_fits) : ''}`, price: 0,
                }))
                if (items.length) patch({ board: [...board, ...items] })
              }}
            />
          )}
        </div>

        <div className="px-5 py-2.5 border-t border-gray-100 text-[11px] text-gray-400 flex-shrink-0">
          Changes save with the plan — click <strong>Save Changes</strong> on the main page to keep them.
        </div>
      </div>
    </div>
  )
}

// A mood-board thumbnail that heals itself: if the stored signed URL has expired
// (Supabase signed URLs are time-limited → a stale one loads as a broken image),
// it re-requests a fresh URL for the file's path and retries once. Only falls
// back to the placeholder if the file is genuinely missing.
function BoardThumb({ item, freshUrl }: { item: BoardItem; freshUrl?: string | null }) {
  const [src, setSrc] = useState<string>(freshUrl || item.signed_url || '')
  const [failed, setFailed] = useState(false)
  const triedRef = useRef(false)
  // Adopt a fresher URL handed down from the parent (e.g. attachment re-sign).
  useEffect(() => {
    if (freshUrl && freshUrl !== src) { setSrc(freshUrl); setFailed(false); triedRef.current = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [freshUrl])

  async function handleError() {
    if (triedRef.current || !item.path) { setFailed(true); return }
    triedRef.current = true
    try {
      const res = await fetch(`/api/job-planning?path=${encodeURIComponent(item.path)}`)
      const d = await res.json()
      if (res.ok && d?.url) { setSrc(d.url + (d.url.includes('?') ? '&' : '?') + 'r=' + Date.now()); return }
    } catch {}
    setFailed(true)
  }

  if (!src || failed) {
    return <div className="w-full h-28 bg-gray-50 flex items-center justify-center text-gray-300"><Palette size={20} /></div>
  }
  return <img src={src} alt={item.label} className="w-full h-28 object-cover" onError={handleError} />
}

// ── Mood Board ─────────────────────────────────────────────────────────────
function MoodBoardTab({ board, attachments, sessionId, onAddAttachments, onOpenDrivePicker, onAdd, onUpdate, onRemove }: {
  board: BoardItem[]
  attachments: AttachmentLike[]
  sessionId: string
  onAddAttachments?: (atts: AttachmentLike[]) => void
  onOpenDrivePicker?: () => void
  onAdd: (items: BoardItem[]) => void
  onUpdate: (i: number, item: BoardItem) => void
  onRemove: (i: number) => void
}) {
  const [picking, setPicking] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [uploadError, setUploadError] = useState('')
  const fileInputRef = useRef<HTMLInputElement>(null)

  const usedPaths = new Set(board.map(b => b.path).filter(Boolean))
  const images = attachments.filter(a => typeof a?.type === 'string' && a.type.startsWith('image/'))
  const pickable = images.filter(a => !usedPaths.has(a.path))

  async function uploadFiles(files: FileList | File[]) {
    const list = Array.from(files).filter(f => f.type.startsWith('image/'))
    if (!list.length) { setUploadError('Please select image files only.'); return }
    setUploading(true); setUploadError('')
    try {
      const fd = new FormData()
      fd.append('session_id', sessionId)
      for (const f of list) fd.append('file', f)
      const res = await fetch('/api/job-planning', { method: 'POST', body: fd })
      const d = await res.json()
      if (!res.ok) { setUploadError(d.error || 'Upload failed'); return }
      const uploaded: AttachmentLike[] = d.uploaded || []
      // Add to mood board
      onAdd(uploaded.map(att => ({
        id: newId('board'), path: att.path, signed_url: att.signed_url,
        name: att.name, room: 'Other', label: att.name.replace(/\.[^.]+$/, ''), notes: '', price: 0,
      })))
      // Also surface in main attachments list so they're accessible plan-wide
      if (onAddAttachments) onAddAttachments(uploaded)
    } catch (e: any) {
      setUploadError(e?.message || 'Upload failed')
    }
    setUploading(false)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  // ── Google Photos (Picker API) ─────────────────────────────────────────────
  // Google deprecated broad library access — the user picks photos in Google's
  // own UI (new tab), then we poll for the selection and import them.
  const [photosImporting, setPhotosImporting] = useState(false)
  const [photosMsg, setPhotosMsg] = useState('')
  async function importFromGooglePhotos() {
    setUploadError(''); setPhotosImporting(true); setPhotosMsg('Opening Google Photos…')
    try {
      const cs = await fetch('/api/google-photos?action=create-session', { method: 'POST' })
      const csd = await cs.json()
      if (!cs.ok || !csd.pickerUri) {
        setUploadError(csd?.needsAuth
          ? "Google Photos isn't authorized yet — re-connect Google at /admin/google-connect (it now includes Photos), then try again."
          : (csd?.error || 'Could not open Google Photos.'))
        setPhotosImporting(false); return
      }
      window.open(csd.pickerUri, '_blank', 'noopener')
      setPhotosMsg('Pick photos in the Google Photos tab, then return here — importing automatically…')
      const start = Date.now()
      const poll = async () => {
        if (Date.now() - start > 5 * 60 * 1000) { setUploadError('Timed out waiting for your Google Photos selection.'); setPhotosImporting(false); return }
        try {
          const r = await fetch('/api/google-photos?action=import', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ sessionId: csd.sessionId, session_id: sessionId }) })
          const d = await r.json()
          if (!r.ok) { setUploadError(d?.error || 'Google Photos import failed'); setPhotosImporting(false); return }
          if (d.pending) { setTimeout(poll, 3000); return }
          const uploaded: AttachmentLike[] = d.uploaded || []
          if (uploaded.length) {
            onAdd(uploaded.map(att => ({ id: newId('board'), path: att.path, signed_url: att.signed_url, name: att.name, room: 'Other', label: att.name.replace(/\.[^.]+$/, ''), notes: '', price: 0 })))
            if (onAddAttachments) onAddAttachments(uploaded)
          } else setUploadError('No photos were imported.')
          setPhotosImporting(false)
        } catch (e: any) { setUploadError(e?.message || 'Google Photos import failed'); setPhotosImporting(false) }
      }
      setTimeout(poll, 4000)
    } catch (e: any) { setUploadError(e?.message || 'Google Photos import failed'); setPhotosImporting(false) }
  }

  // ── Add from a link (pulls the preview image) ──────────────────────────────
  const [linkUrl, setLinkUrl] = useState('')
  const [linkLoading, setLinkLoading] = useState(false)
  async function addFromLink() {
    const u = linkUrl.trim()
    if (!u) return
    setLinkLoading(true); setUploadError('')
    try {
      const res = await fetch('/api/link-preview', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ url: u, session_id: sessionId }) })
      const d = await res.json()
      if (!res.ok) { setUploadError(d?.error || 'Could not pull an image from that link.'); setLinkLoading(false); return }
      const att = d.uploaded
      onAdd([{ id: newId('board'), path: att.path, signed_url: att.signed_url, name: att.name, room: 'Other', label: (d.title || att.name || '').slice(0, 80), notes: '', price: 0, link: d.sourceUrl }])
      if (onAddAttachments) onAddAttachments(att)
      setLinkUrl('')
    } catch (e: any) { setUploadError(e?.message || 'Could not pull an image from that link.') }
    setLinkLoading(false)
  }

  function addFromAttachment(att: AttachmentLike) {
    onAdd([{ id: newId('board'), path: att.path, signed_url: att.signed_url, name: att.name, room: 'Other', label: att.name.replace(/\.[^.]+$/, ''), notes: '', price: 0 }])
    setPicking(false)
  }
  function addBlank() {
    onAdd([{ id: newId('board'), path: '', signed_url: null, name: 'New item', room: 'Other', label: 'New selection', notes: '', price: 0 }])
  }

  // group by room for display — guard against null/malformed DB entries
  const byRoom = new Map<string, number[]>()
  board.forEach((b, i) => {
    if (!b) return
    const k = b.room || 'Other'
    if (!byRoom.has(k)) byRoom.set(k, [])
    byRoom.get(k)!.push(i)
  })

  return (
    <div className="space-y-4">
      {/* Hidden file input — triggered by the Camera/File button */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={e => { if (e.target.files?.length) uploadFiles(e.target.files) }}
      />

      <div className="flex items-center justify-between flex-wrap gap-2">
        <p className="text-xs text-gray-500">Pull in project photos as material/finish selections, group by room, add notes and rough pricing.</p>
        <div className="flex items-center gap-2 flex-wrap">
          {/* Upload from camera or local files */}
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
            className="flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg border border-gray-200 hover:bg-gray-50 disabled:opacity-50"
          >
            {uploading ? <Loader2 size={12} className="animate-spin" /> : <Camera size={12} />}
            {uploading ? 'Uploading…' : 'Camera / File'}
          </button>
          {/* Import from Google Drive */}
          {onOpenDrivePicker && (
            <button
              onClick={onOpenDrivePicker}
              className="flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg border border-gray-200 hover:bg-gray-50"
            >
              <Cloud size={12} /> From Drive
            </button>
          )}
          {/* Google Photos picker */}
          <button onClick={importFromGooglePhotos} disabled={photosImporting}
            className="flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg border border-gray-200 hover:bg-gray-50 disabled:opacity-50">
            {photosImporting ? <Loader2 size={12} className="animate-spin" /> : <ImageIcon size={12} />} Google Photos
          </button>
          {/* Add from already-uploaded plan photos */}
          {pickable.length > 0 && (
            <button onClick={() => setPicking(v => !v)} className="flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg border border-gray-200 hover:bg-gray-50">
              <Images size={12} /> Plan photos ({pickable.length})
            </button>
          )}
          <button onClick={addBlank} className="flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg border border-gray-200 hover:bg-gray-50">
            <Plus size={12} /> Blank
          </button>
        </div>
      </div>

      {/* Add from a link — pulls the preview image off the page */}
      <div className="flex items-center gap-2">
        <input value={linkUrl} onChange={e => setLinkUrl(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addFromLink() } }}
          placeholder="Paste a product or image link — we'll pull the photo…"
          className="flex-1 px-3 py-2 rounded-lg border border-gray-200 text-xs focus:outline-none focus:ring-2 focus:border-blue-400" />
        <button onClick={addFromLink} disabled={linkLoading || !linkUrl.trim()}
          className="flex items-center gap-1.5 text-xs font-semibold px-3 py-2 rounded-lg border border-gray-200 hover:bg-gray-50 disabled:opacity-50 flex-shrink-0">
          {linkLoading ? <Loader2 size={12} className="animate-spin" /> : <Plus size={12} />} Add link
        </button>
      </div>

      {uploadError && <div className="text-xs text-red-600 bg-red-50 px-3 py-2 rounded-lg border border-red-100">{uploadError}</div>}
      {photosImporting && (
        <div className="text-xs text-blue-700 bg-blue-50 px-3 py-2 rounded-lg border border-blue-100 flex items-center gap-2">
          <Loader2 size={12} className="animate-spin flex-shrink-0" /> {photosMsg}
        </div>
      )}

      {picking && (
        <div className="border border-gray-200 rounded-xl p-3 bg-gray-50">
          {pickable.length === 0 ? (
            <p className="text-xs text-gray-400 text-center py-3">All uploaded photos are already on the board (or none uploaded yet — add photos in the Plan section above).</p>
          ) : (
            <div className="grid grid-cols-3 sm:grid-cols-5 gap-2">
              {pickable.map(att => (
                <button key={att.path} onClick={() => addFromAttachment(att)} className="border border-gray-200 rounded-lg overflow-hidden bg-white hover:ring-2 hover:ring-amber-300 transition-shadow">
                  {att.signed_url ? <img src={att.signed_url} alt={att.name} className="w-full h-20 object-cover" /> : <div className="w-full h-20 bg-gray-100" />}
                  <div className="px-1.5 py-1 text-[10px] text-gray-500 truncate">{att.name}</div>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {board.length === 0 ? (
        <div className="text-center py-10 text-gray-400 text-sm border-2 border-dashed border-gray-200 rounded-xl">No selections yet — add a photo or a blank entry to start your board.</div>
      ) : (
        <div className="space-y-5">
          {Array.from(byRoom.entries()).map(([room, idxs]) => (
            <div key={room}>
              <h3 className="text-[11px] font-bold uppercase tracking-wider text-gray-400 mb-2">{room} <span className="text-gray-300 font-normal">({idxs.length})</span></h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {idxs.map(i => {
                  const b = board[i]
                  if (!b) return null
                  return (
                    <div key={b.id ?? i} className="border border-gray-200 rounded-xl overflow-hidden bg-white group relative">
                      <BoardThumb item={b} freshUrl={b.path ? attachments.find(a => a.path === b.path)?.signed_url : null} />
                      <button onClick={() => onRemove(i)} className="absolute top-1.5 right-1.5 bg-white/90 hover:bg-red-100 rounded-full p-1 shadow opacity-0 group-hover:opacity-100 transition-opacity">
                        <Trash2 size={11} className="text-red-600" />
                      </button>
                      <div className="p-2.5 space-y-1.5">
                        <input value={b.label} onChange={e => onUpdate(i, { ...b, label: e.target.value })} placeholder="Label (e.g. Quartz countertop)"
                          className="w-full px-2 py-1 rounded-lg border border-gray-200 text-xs font-semibold focus:outline-none focus:ring-2 focus:border-blue-400" />
                        <select value={b.room} onChange={e => onUpdate(i, { ...b, room: e.target.value })}
                          className="w-full px-2 py-1 rounded-lg border border-gray-200 text-[11px] bg-white focus:outline-none focus:ring-2 focus:border-blue-400">
                          {ROOMS.map(r => <option key={r} value={r}>{r}</option>)}
                        </select>
                        <textarea value={b.notes} onChange={e => onUpdate(i, { ...b, notes: e.target.value })} placeholder="Notes…" rows={2}
                          className="w-full px-2 py-1 rounded-lg border border-gray-200 text-[11px] focus:outline-none focus:ring-2 focus:border-blue-400" />
                        <div className="flex items-center gap-1">
                          <DollarSign size={11} className="text-gray-400" />
                          <input type="number" min={0} step={0.01} value={b.price || ''} onChange={e => onUpdate(i, { ...b, price: Number(e.target.value) || 0 })} placeholder="0.00"
                            className="w-full px-2 py-1 rounded-lg border border-gray-200 text-[11px] focus:outline-none focus:ring-2 focus:border-blue-400" />
                        </div>
                        {b.link && (
                          <a href={/^https?:\/\//i.test(b.link) ? b.link : `https://${b.link}`} target="_blank" rel="noopener noreferrer"
                            className="flex items-center gap-1 text-[11px] font-semibold text-blue-600 hover:text-blue-800 truncate">
                            <ExternalLink size={11} className="flex-shrink-0" /> View source
                          </a>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}


// ── Finishes & Links ────────────────────────────────────────────────────────
// A sourcing list of product links (vanities, fans, sinks, lights, appliances…)
// grouped by category, each with a price/room/notes.
// Self-healing finish thumbnail — re-signs an expired image URL from its path.
function FinishThumb({ item }: { item: FinishLink }) {
  const [src, setSrc] = useState<string>(item.image_url || '')
  const triedRef = useRef(false)
  useEffect(() => { setSrc(item.image_url || ''); triedRef.current = false }, [item.image_url])
  async function onError() {
    if (triedRef.current || !item.image_path) { setSrc(''); return }
    triedRef.current = true
    try {
      const r = await fetch(`/api/job-planning?path=${encodeURIComponent(item.image_path)}`)
      const d = await r.json()
      if (r.ok && d?.url) { setSrc(d.url + (d.url.includes('?') ? '&' : '?') + 'r=' + Date.now()); return }
    } catch {}
    setSrc('')
  }
  if (!src) return <div className="w-14 h-14 rounded-lg bg-gray-100 flex items-center justify-center text-gray-300 flex-shrink-0"><ShoppingBag size={16} /></div>
  return <img src={src} alt={item.label} onError={onError} className="w-14 h-14 rounded-lg object-cover border border-gray-200 flex-shrink-0" />
}

const linkHref = (u: string) => /^https?:\/\//i.test(u) ? u : `https://${u}`
export function FinishesTab({ items, onSet, sessionId, onSave, saving }: { items: FinishLink[]; onSet: (list: FinishLink[]) => void; sessionId: string; onSave?: (list: FinishLink[]) => void | Promise<void>; saving?: boolean }) {
  const [pulling, setPulling] = useState<string | null>(null) // item id currently pulling an image
  const [editUrlId, setEditUrlId] = useState<string | null>(null) // item whose link is being edited
  const [savingFin, setSavingFin] = useState(false)
  const add = () => { const id = newId('fin'); onSet([...items, { id, category: 'Appliance', label: '', url: '', price: 0, room: 'Kitchen', notes: '' }]); setEditUrlId(id) }
  const update = (i: number, patch: Partial<FinishLink>) => onSet(items.map((it, idx) => idx === i ? { ...it, ...patch } : it))
  const remove = (i: number) => onSet(items.filter((_, idx) => idx !== i))
  const total = items.reduce((s, it) => s + (Number(it.price) || 0), 0)
  // Pull the product image (and price, if the item has none yet) from its link.
  // silent = no alert on failure (for auto-pull on blur).
  async function pullImage(i: number, silent = false) {
    const it = items[i]; const u = (it?.url || '').trim()
    if (!u) return
    setPulling(it.id)
    try {
      const res = await fetch('/api/link-preview', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ url: u, session_id: sessionId }) })
      const d = await res.json()
      if (res.ok && d.uploaded) {
        const patch: Partial<FinishLink> = { image_path: d.uploaded.path, image_url: d.uploaded.signed_url, label: it.label || (d.title || '').slice(0, 80) }
        if (!Number(it.price) && Number(d.price)) patch.price = Number(d.price)
        update(i, patch)
      } else if (!silent) alert(d?.error || 'Could not pull an image from that link.')
    } catch { if (!silent) alert('Could not pull an image from that link.') }
    setPulling(null)
  }
  // Save: backfill any missing prices (and missing images) from each link, then
  // persist. Prices already entered by hand are left untouched.
  async function handleSave() {
    setSavingFin(true)
    const list = items.map(it => ({ ...it }))
    for (let i = 0; i < list.length; i++) {
      const it = list[i]; const u = (it.url || '').trim()
      if (!u) continue
      const needImage = !it.image_path
      const needPrice = !Number(it.price)
      if (!needImage && !needPrice) continue
      try {
        const res = await fetch('/api/link-preview', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ url: u, session_id: sessionId, priceOnly: !needImage }) })
        const d = await res.json().catch(() => ({}))
        if (needImage && res.ok && d.uploaded) {
          it.image_path = d.uploaded.path; it.image_url = d.uploaded.signed_url
          if (!it.label && d.title) it.label = String(d.title).slice(0, 80)
        }
        if (needPrice && Number(d.price)) it.price = Number(d.price)
      } catch {}
    }
    onSet(list)
    try { await onSave?.(list) } finally { setSavingFin(false) }
  }
  const busy = savingFin || !!saving
  // group by category for a shopping-list feel
  const byCat = new Map<string, number[]>()
  items.forEach((it, i) => { const k = it?.category || 'Other'; if (!byCat.has(k)) byCat.set(k, []); byCat.get(k)!.push(i) })

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <p className="text-xs text-gray-500">Collect product links for finishes &amp; fixtures — vanities, faucets, sinks, lights, fans, appliances. Paste a link and we'll pull the product photo.</p>
        <div className="flex items-center gap-3">
          {total > 0 && <span className="text-sm font-bold text-gray-900">Total: ${total.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>}
          <button onClick={add} className="flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg border border-gray-200 hover:bg-gray-50"><Plus size={12} /> Add link</button>
          {onSave && (
            <button onClick={handleSave} disabled={busy}
              className="flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 rounded-lg text-white disabled:opacity-50" style={{ background: '#b8895a' }}
              title="Pull prices from links & save">
              {busy ? <Loader2 size={12} className="animate-spin" /> : <Save size={12} />} Save finishes
            </button>
          )}
        </div>
      </div>

      {items.length === 0 ? (
        <div className="text-center py-10 text-gray-400 text-sm border-2 border-dashed border-gray-200 rounded-xl">
          No finish links yet — click <strong>Add link</strong> to start your sourcing list.
        </div>
      ) : (
        <div className="space-y-5">
          {Array.from(byCat.entries()).map(([cat, idxs]) => (
            <div key={cat}>
              <h3 className="text-[11px] font-bold uppercase tracking-wider text-gray-400 mb-2">{cat} <span className="text-gray-300 font-normal">({idxs.length})</span></h3>
              <div className="space-y-2.5">
                {idxs.map(i => {
                  const it = items[i]
                  if (!it) return null
                  return (
                    <div key={it.id ?? i} className="border border-gray-200 rounded-xl p-3">
                      <div className="flex gap-3">
                        <FinishThumb item={it} />
                        <div className="flex-1 min-w-0 space-y-2">
                          <div className="flex items-center gap-2">
                            <select value={it.category} onChange={e => update(i, { category: e.target.value })}
                              className="px-2 py-1.5 rounded-lg border border-gray-200 text-xs bg-white focus:outline-none focus:ring-2 focus:border-blue-400">
                              {FINISH_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                            </select>
                            <input value={it.label} onChange={e => update(i, { label: e.target.value })} placeholder={'Label (e.g. Master vanity 48")'}
                              className="flex-1 min-w-0 px-2.5 py-1.5 rounded-lg border border-gray-200 text-sm font-semibold focus:outline-none focus:ring-2 focus:border-blue-400" />
                            <button onClick={() => remove(i)} className="text-gray-300 hover:text-red-500 p-1 flex-shrink-0"><Trash2 size={14} /></button>
                          </div>
                          <div className="flex items-center gap-2">
                            {(!it.url || editUrlId === it.id) ? (
                              <input autoFocus={editUrlId === it.id} value={it.url} onChange={e => update(i, { url: e.target.value })}
                                onBlur={() => { setEditUrlId(null); if (it.url?.trim() && !it.image_path) pullImage(i, true) }}
                                placeholder="https://…  (product link)"
                                className="flex-1 min-w-0 px-2.5 py-1.5 rounded-lg border border-gray-200 text-xs focus:outline-none focus:ring-2 focus:border-blue-400" />
                            ) : (
                              <a href={linkHref(it.url)} target="_blank" rel="noopener noreferrer"
                                className="flex-1 min-w-0 truncate text-xs font-medium text-blue-600 hover:text-blue-800 underline">{it.url}</a>
                            )}
                            {it.url && editUrlId !== it.id && (
                              <button onClick={() => setEditUrlId(it.id)} title="Edit link" className="text-gray-400 hover:text-gray-700 p-1 flex-shrink-0"><Pencil size={13} /></button>
                            )}
                            <button onClick={() => pullImage(i)} disabled={!it.url?.trim() || pulling === it.id} title="Pull the product image from this link"
                              className="flex items-center gap-1 text-xs font-semibold px-2.5 py-1.5 rounded-lg border border-teal-200 bg-teal-50 text-teal-700 hover:bg-teal-100 disabled:opacity-40 flex-shrink-0">
                              {pulling === it.id ? <Loader2 size={13} className="animate-spin" /> : <ImageIcon size={13} />} Image
                            </button>
                          </div>
                          <div className="flex items-center gap-2">
                            <div className="flex items-center gap-1 flex-1">
                              <DollarSign size={13} className="text-gray-400" />
                              <input type="number" min={0} step={0.01} value={it.price || ''} onChange={e => update(i, { price: Number(e.target.value) || 0 })} placeholder="0.00"
                                className="w-full px-2 py-1.5 rounded-lg border border-gray-200 text-xs focus:outline-none focus:ring-2 focus:border-blue-400" />
                            </div>
                            <select value={it.room} onChange={e => update(i, { room: e.target.value })}
                              className="flex-1 px-2 py-1.5 rounded-lg border border-gray-200 text-xs bg-white focus:outline-none focus:ring-2 focus:border-blue-400">
                              {ROOMS.map(r => <option key={r} value={r}>{r}</option>)}
                            </select>
                          </div>
                          <input value={it.notes} onChange={e => update(i, { notes: e.target.value })} placeholder="Notes (model #, color, qty…)"
                            className="w-full px-2.5 py-1.5 rounded-lg border border-gray-200 text-xs focus:outline-none focus:ring-2 focus:border-blue-400" />
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Before / After ─────────────────────────────────────────────────────────
function CompareTab({ comparisons, attachments, onAdd, onUpdate, onRemove }: {
  comparisons: ComparisonItem[]
  attachments: AttachmentLike[]
  onAdd: (c: ComparisonItem) => void
  onUpdate: (i: number, c: ComparisonItem) => void
  onRemove: (i: number) => void
}) {
  const images = attachments.filter(a => typeof a?.type === 'string' && a.type.startsWith('image/'))

  function addPair() {
    onAdd({ id: newId('cmp'), before_path: null, after_path: null, note: '' })
  }

  function PhotoPicker({ value, onPick, label }: { value: string | null; onPick: (path: string | null) => void; label: string }) {
    const current = images.find(a => a.path === value)
    return (
      <div className="flex-1 min-w-[140px]">
        <div className="text-[10px] font-bold uppercase tracking-wider text-gray-400 mb-1">{label}</div>
        <select value={value || ''} onChange={e => onPick(e.target.value || null)}
          className="w-full px-2 py-1.5 rounded-lg border border-gray-200 text-xs bg-white focus:outline-none focus:ring-2 focus:border-blue-400 mb-1.5">
          <option value="">— Choose a photo —</option>
          {images.map(a => <option key={a.path} value={a.path}>{a.name}</option>)}
        </select>
        <div className="border border-gray-200 rounded-lg overflow-hidden bg-gray-50 h-36 flex items-center justify-center">
          {current?.signed_url ? <img src={current.signed_url} alt={current.name} className="w-full h-full object-cover" /> : <Images size={20} className="text-gray-300" />}
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-xs text-gray-500">Pair an "existing condition" photo with an inspiration / after-rendering image to show the planned transformation.</p>
        <button onClick={addPair} disabled={images.length === 0} className="flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg border border-gray-200 hover:bg-gray-50 disabled:opacity-40">
          <Plus size={12} /> Add comparison
        </button>
      </div>
      {images.length === 0 && (
        <div className="text-center py-6 text-gray-400 text-xs border-2 border-dashed border-gray-200 rounded-xl">Upload photos in the plan above first — then pair them here as before/after.</div>
      )}
      {comparisons.length === 0 && images.length > 0 ? (
        <div className="text-center py-10 text-gray-400 text-sm border-2 border-dashed border-gray-200 rounded-xl">No comparisons yet — click "Add comparison" to pair your first before/after.</div>
      ) : (
        <div className="space-y-4">
          {comparisons.map((c, i) => (
            <div key={c.id} className="border border-gray-200 rounded-xl p-3 relative">
              <button onClick={() => onRemove(i)} className="absolute top-2 right-2 text-gray-300 hover:text-red-500 p-1"><Trash2 size={13} /></button>
              <div className="flex flex-col sm:flex-row gap-3 pr-6">
                <PhotoPicker value={c.before_path} onPick={p => onUpdate(i, { ...c, before_path: p })} label="Before / Existing" />
                <div className="flex items-center justify-center text-gray-300 font-bold text-sm px-1 self-center">→</div>
                <PhotoPicker value={c.after_path} onPick={p => onUpdate(i, { ...c, after_path: p })} label="After / Inspiration" />
              </div>
              <textarea value={c.note} onChange={e => onUpdate(i, { ...c, note: e.target.value })} rows={2} placeholder="What's changing and why…"
                className="mt-2 w-full px-3 py-2 rounded-lg border border-gray-200 text-xs focus:outline-none focus:ring-2 focus:border-blue-400" />
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ── AI Suggestions ─────────────────────────────────────────────────────────
function AiSuggestionsTab({ suggestions, attachments, description, measurements, notes, onNotesChange, onSet, onToggleSelect, onAddToBoard }: {
  suggestions: DesignSuggestion[]
  attachments: AttachmentLike[]
  description: string
  measurements: string
  notes: string
  onNotesChange: (n: string) => void
  onSet: (list: DesignSuggestion[]) => void
  onToggleSelect: (i: number) => void
  onAddToBoard: (s: DesignSuggestion) => void
}) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const images = attachments.filter(a => typeof a?.type === 'string' && a.type.startsWith('image/'))

  async function generate() {
    if (!description || description.trim().length < 10) { setError('Add a job description in the plan above first.'); return }
    setLoading(true); setError('')
    try {
      const res = await fetch('/api/design-suggestions', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          description, measurements, notes,
          attachments: images.map(a => ({ path: a.path, name: a.name, type: a.type, size: a.size })),
        }),
      })
      const d = await res.json()
      if (!res.ok) { setError(d.error || 'Could not generate suggestions'); setLoading(false); return }
      onSet(d.suggestions || [])
    } catch (e: any) {
      setError(e?.message || 'Could not generate suggestions')
    }
    setLoading(false)
  }

  const impactColor = (v?: string) => v === 'lower' ? 'bg-green-50 text-green-700 border-green-200'
    : v === 'higher' ? 'bg-amber-50 text-amber-700 border-amber-200'
    : 'bg-blue-50 text-blue-700 border-blue-200'

  return (
    <div className="space-y-4">
      <p className="text-xs text-gray-500">Claude reviews the project description (and any photos) and proposes a few distinct design directions — pick the ones that resonate and pull their materials onto your mood board.</p>

      <div className="flex items-end gap-2 flex-wrap">
        <div className="flex-1 min-w-[220px]">
          <label className="block text-[11px] font-semibold text-gray-500 uppercase tracking-wider mb-1">Style notes / preferences (optional)</label>
          <input value={notes} onChange={e => onNotesChange(e.target.value)} placeholder="e.g. likes warm neutrals, wants something low-maintenance, hates ornate details…"
            className="w-full px-3 py-2 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:border-blue-400" />
        </div>
        <button onClick={generate} disabled={loading}
          className="flex items-center gap-2 text-sm font-bold px-4 py-2.5 rounded-xl text-white shadow-sm disabled:opacity-50" style={{ background: '#b8895a' }}>
          {loading ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
          {loading ? 'Thinking…' : suggestions.length ? 'Regenerate' : 'Generate Directions'}
        </button>
      </div>
      {error && <div className="bg-red-50 border border-red-100 text-red-700 text-xs px-3 py-2 rounded-lg">{error}</div>}

      {suggestions.length === 0 ? (
        <div className="text-center py-10 text-gray-400 text-sm border-2 border-dashed border-gray-200 rounded-xl">No directions generated yet.</div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {suggestions.map((s, i) => (
            <div key={s.id} className={`border rounded-xl p-3.5 flex flex-col gap-2 transition-colors ${s.selected ? 'border-amber-300 bg-amber-50/50 ring-1 ring-amber-200' : 'border-gray-200 bg-white'}`}>
              <div className="flex items-start justify-between gap-2">
                <h4 className="font-extrabold text-gray-900 text-sm leading-snug">{String(s.style_name ?? 'Untitled direction')}</h4>
                <button onClick={() => onToggleSelect(i)} title={s.selected ? 'Unselect' : 'Select this direction'}
                  className={`flex-shrink-0 p-1.5 rounded-full border ${s.selected ? 'bg-amber-400 border-amber-400 text-white' : 'border-gray-200 text-gray-300 hover:text-gray-500'}`}>
                  <Check size={12} />
                </button>
              </div>
              {s.estimated_cost_impact && typeof s.estimated_cost_impact === 'string' && (
                <span className={`self-start text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full border ${impactColor(s.estimated_cost_impact)}`}>
                  {s.estimated_cost_impact} cost impact
                </span>
              )}
              {s.description && <p className="text-xs text-gray-600 leading-relaxed">{String(s.description)}</p>}
              {Array.isArray(s.color_palette) && s.color_palette.length > 0 && (
                <div className="flex flex-wrap gap-1">
                  {s.color_palette.map((c, ci) => <span key={ci} className="text-[10px] px-1.5 py-0.5 rounded bg-gray-100 text-gray-600">{String(c ?? '')}</span>)}
                </div>
              )}
              {Array.isArray(s.key_materials) && s.key_materials.length > 0 && (
                <ul className="text-[11px] text-gray-500 list-disc list-inside space-y-0.5">
                  {s.key_materials.slice(0, 5).map((m, mi) => <li key={mi}>{String(m ?? '')}</li>)}
                </ul>
              )}
              {s.why_it_fits && <p className="text-[11px] text-gray-400 italic border-t border-gray-100 pt-1.5 mt-auto">{String(s.why_it_fits)}</p>}
              <button onClick={() => onAddToBoard(s)} className="mt-1 flex items-center justify-center gap-1.5 text-[11px] font-bold px-3 py-1.5 rounded-lg border border-gray-200 hover:bg-gray-50 text-gray-700">
                <Palette size={11} /> Send materials to mood board
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
