'use client'
import { Component, useEffect, useRef, useState } from 'react'
import type { ErrorInfo, ReactNode } from 'react'
import {
  X, Palette, PenTool, Images, Sparkles, Loader2, Plus, Trash2, Save,
  Square, Minus, Type, Eraser, Undo2, RotateCcw, Wand2, Check, DollarSign,
  Camera, Upload, Cloud, ZoomIn, ZoomOut, ScanLine, AlertCircle, CheckCircle2, PencilRuler,
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
export interface DesignData {
  board?: BoardItem[]
  sketches?: SketchItem[]
  comparisons?: ComparisonItem[]
  ai_suggestions?: DesignSuggestion[]
  notes?: string
  floorplan?: PlanDoc
}
interface AttachmentLike {
  path: string
  name: string
  type: string
  size: number
  signed_url: string | null
}

const ROOMS = ['Kitchen', 'Primary Bath', 'Bathroom', 'Living Room', 'Bedroom', 'Exterior', 'Outdoor / Patio', 'Laundry', 'Office', 'Other']
const TABS = [
  { key: 'board', label: 'Mood Board', icon: Palette },
  { key: 'sketch', label: 'Floor Plan', icon: PencilRuler },
  { key: 'compare', label: 'Before / After', icon: Images },
  { key: 'ai', label: 'AI Suggestions', icon: Sparkles },
] as const
type TabKey = typeof TABS[number]['key']

function newId(prefix: string) { return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 7)}` }

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
  onOpenDrivePickerForSketch?: () => void
  sketchDriveImageUrl?: string | null
  onSketchDriveImageConsumed?: () => void
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
  onOpenDrivePickerForSketch, sketchDriveImageUrl, onSketchDriveImageConsumed,
}: DesignStudioProps) {
  const [tab, setTab] = useState<TabKey>('board')

  // Reset to board tab each time the studio opens so stale sketch-tab state
  // (which persists because we use `if (!open) return null` not unmounting)
  // doesn't trigger SketchTab's canvas effects with potentially stale data.
  const prevOpenRef = useRef(false)
  if (open && !prevOpenRef.current) { prevOpenRef.current = true; if (tab !== 'board') setTab('board') }
  if (!open) { prevOpenRef.current = false; return null }

  const board = design.board || []
  const sketches = design.sketches || []
  const comparisons = design.comparisons || []
  const suggestions = design.ai_suggestions || []

  function patch(p: Partial<DesignData>) { onChange({ ...design, ...p }) }

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
            const count = t.key === 'board' ? board.length : t.key === 'sketch' ? 0 : t.key === 'compare' ? comparisons.length : suggestions.length
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
            <FloorPlanner value={design.floorplan} onChange={fp => patch({ floorplan: fp })} />
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
      {uploadError && <div className="text-xs text-red-600 bg-red-50 px-3 py-2 rounded-lg border border-red-100">{uploadError}</div>}

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
                      {b.signed_url ? <img src={b.signed_url} alt={b.label} className="w-full h-28 object-cover" /> : <div className="w-full h-28 bg-gray-50 flex items-center justify-center text-gray-300"><Palette size={20} /></div>}
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

// ── Sketch Canvas ──────────────────────────────────────────────────────────
type StrokeTool = 'pen' | 'line' | 'rect' | 'text' | 'eraser'
interface Stroke {
  tool: StrokeTool
  color: string
  width: number
  points?: { x: number; y: number }[]   // pen / eraser
  start?: { x: number; y: number }      // line / rect / text
  end?: { x: number; y: number }        // line / rect
  text?: string                         // text
}
const COLORS = ['#1f2937', '#dc2626', '#2563eb', '#16a34a', '#b8895a', '#9333ea']

const ZOOM_STEPS = [0.5, 0.75, 1.0, 1.25, 1.5, 2.0]

function SketchTab({ sketches, sessionId, onAdd, onRemove, onOpenDrivePicker, driveImageUrl, onDriveImageConsumed }: {
  sketches: SketchItem[]
  sessionId: string
  onAdd: (s: SketchItem) => void
  onRemove: (i: number) => void
  onOpenDrivePicker?: () => void
  driveImageUrl?: string | null
  onDriveImageConsumed?: () => void
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [tool, setTool] = useState<StrokeTool>('pen')
  const [color, setColor] = useState(COLORS[0])
  const [width, setWidth] = useState(3)
  const [strokes, setStrokes] = useState<Stroke[]>([])
  const [zoom, setZoom] = useState(1)
  const [blockFt, setBlockFt] = useState(1)
  const [blockFtInput, setBlockFtInput] = useState('1')
  // Grid pitch + phase. Defaults to the canvas's native 24px grid for manual
  // sketches; a photo trace overrides these so the canvas graph paper matches
  // the original's squares exactly (1 sketch square === 1 canvas square).
  const [gridBlockPx, setGridBlockPx] = useState(24)
  const [gridOrigin, setGridOrigin] = useState({ x: 0, y: 0 })
  const drawing = useRef(false)
  const current = useRef<Stroke | null>(null)
  const [name, setName] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  // Photo-import state
  const photoInputRef = useRef<HTMLInputElement>(null)
  const cameraInputRef = useRef<HTMLInputElement>(null)
  const [tracing, setTracing] = useState(false)
  const [traceResult, setTraceResult] = useState<{ count: number } | null>(null)
  const [traceError, setTraceError] = useState<string | null>(null)
  const [showImportMenu, setShowImportMenu] = useState(false)

  // When the parent signals a Drive image URL, fetch it and trace
  useEffect(() => {
    if (!driveImageUrl) return
    onDriveImageConsumed?.()
    setShowImportMenu(false)
    fetch(driveImageUrl)
      .then(r => r.blob())
      .then(blob => {
        const file = new File([blob], 'drive-image.jpg', { type: blob.type || 'image/jpeg' })
        traceFromPhoto(file)
      })
      .catch(e => setTraceError(String(e?.message || 'Failed to load Drive image')))
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [driveImageUrl])

  // redraw accepts explicit zoom/scale/grid so event-handler closures always render correctly
  function redraw(list: Stroke[], z = zoom, bft = blockFt, gp = gridBlockPx, origin = gridOrigin) {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    // Reset to screen space and clear
    ctx.setTransform(1, 0, 0, 1, 0, 0)
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, canvas.width, canvas.height)

    // Apply zoom transform — all content below is in logical (unzoomed) coordinates
    ctx.setTransform(z, 0, 0, z, 0, 0)
    const logW = canvas.width / z
    const logH = canvas.height / z

    // Grid — keep lines exactly 1 screen pixel regardless of zoom. Drawn at the
    // current pitch (gp) and phased to the trace origin so a traced plan lands
    // square-for-square on the canvas graph paper.
    const step = gp > 0 ? gp : 24
    ctx.strokeStyle = '#f1f5f9'
    ctx.lineWidth = 1 / z
    const startX = ((origin.x % step) + step) % step
    const startY = ((origin.y % step) + step) % step
    for (let x = startX; x <= logW; x += step) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, logH); ctx.stroke() }
    for (let y = startY; y <= logH; y += step) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(logW, y); ctx.stroke() }

    // Strokes (all in logical coordinates)
    for (const s of list) {
      if (!s) continue   // guard against null strokes
      ctx.strokeStyle = s.tool === 'eraser' ? '#ffffff' : s.color
      ctx.fillStyle = s.color
      ctx.lineWidth = s.width
      ctx.lineCap = 'round'
      ctx.lineJoin = 'round'
      if ((s.tool === 'pen' || s.tool === 'eraser') && s.points && s.points.length > 1) {
        ctx.beginPath()
        ctx.moveTo(s.points[0].x, s.points[0].y)
        for (const p of s.points.slice(1)) ctx.lineTo(p.x, p.y)
        ctx.stroke()
      } else if (s.tool === 'line' && s.start && s.end) {
        ctx.beginPath(); ctx.moveTo(s.start.x, s.start.y); ctx.lineTo(s.end.x, s.end.y); ctx.stroke()
      } else if (s.tool === 'rect' && s.start && s.end) {
        ctx.strokeRect(s.start.x, s.start.y, s.end.x - s.start.x, s.end.y - s.start.y)
      } else if (s.tool === 'text' && s.start && s.text) {
        ctx.font = `${Math.max(12, s.width * 6)}px sans-serif`
        ctx.fillText(s.text, s.start.x, s.start.y)
      }
    }

    // ── Scale bar — drawn in SCREEN space so it stays fixed size ──────────
    ctx.setTransform(1, 0, 0, 1, 0, 0)
    const barPx = (gp > 0 ? gp : 24) * z   // 1 grid block = this many screen pixels at current zoom
    const barX = 14
    const barY = canvas.height - 14
    ctx.strokeStyle = '#374151'
    ctx.fillStyle = '#374151'
    ctx.lineWidth = 1.5
    // horizontal rule with end caps
    ctx.beginPath()
    ctx.moveTo(barX, barY)
    ctx.lineTo(barX + barPx, barY)
    ctx.moveTo(barX, barY - 4)
    ctx.lineTo(barX, barY + 2)
    ctx.moveTo(barX + barPx, barY - 4)
    ctx.lineTo(barX + barPx, barY + 2)
    ctx.stroke()
    ctx.font = 'bold 10px system-ui, sans-serif'
    ctx.fillText(`${bft} ft`, barX + barPx + 6, barY + 3)
    // Zoom level badge (top-right corner, only when not 100%)
    if (z !== 1) {
      ctx.font = '10px system-ui, sans-serif'
      ctx.fillStyle = '#6b7280'
      const label = `${Math.round(z * 100)}%`
      const lw = ctx.measureText(label).width
      ctx.fillText(label, canvas.width - lw - 8, 14)
    }
  }

  // Redraw whenever strokes, zoom, scale, or grid pitch/phase changes
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { redraw(strokes, zoom, blockFt, gridBlockPx, gridOrigin) }, [strokes, zoom, blockFt, gridBlockPx, gridOrigin])

  useEffect(() => {
    const canvas = canvasRef.current
    if (canvas) { canvas.width = Math.min(900, canvas.parentElement?.clientWidth || 800); canvas.height = 700 }
    redraw(strokes, zoom, blockFt)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Map screen coordinates → logical canvas coordinates (accounts for CSS scaling + zoom)
  function pos(e: React.MouseEvent | React.TouchEvent): { x: number; y: number } | null {
    const canvas = canvasRef.current
    if (!canvas) return null
    const rect = canvas.getBoundingClientRect()
    const cssToPixelX = canvas.width / rect.width
    const cssToPixelY = canvas.height / rect.height
    const point = 'touches' in e && e.touches && e.touches.length ? e.touches[0] : ('clientX' in e ? e : null)
    if (!point) return null
    return {
      x: (point.clientX - rect.left) * cssToPixelX / zoom,
      y: (point.clientY - rect.top) * cssToPixelY / zoom,
    }
  }

  function zoomIn() {
    setZoom(z => {
      const next = ZOOM_STEPS.find(s => s > z) ?? ZOOM_STEPS[ZOOM_STEPS.length - 1]
      return next
    })
  }
  function zoomOut() {
    setZoom(z => {
      const prev = [...ZOOM_STEPS].reverse().find(s => s < z) ?? ZOOM_STEPS[0]
      return prev
    })
  }
  function resetZoom() { setZoom(1) }

  function start(e: React.MouseEvent | React.TouchEvent) {
    e.preventDefault()
    const p = pos(e)
    if (!p) return
    if (tool === 'text') {
      const text = window.prompt('Annotation text:')
      if (text && text.trim()) setStrokes(prev => [...prev, { tool: 'text', color, width, start: p, text: text.trim() }])
      return
    }
    drawing.current = true
    if (tool === 'pen' || tool === 'eraser') current.current = { tool, color, width: tool === 'eraser' ? Math.max(width, 12) : width, points: [p] }
    else current.current = { tool, color, width, start: p, end: p }
  }
  function move(e: React.MouseEvent | React.TouchEvent) {
    if (!drawing.current || !current.current) return
    e.preventDefault()
    const p = pos(e)
    if (!p) return
    if (current.current.points) current.current.points = [...current.current.points, p]
    else current.current.end = p
    redraw([...strokes, current.current], zoom, blockFt)
  }
  function end() {
    if (!drawing.current || !current.current) return
    drawing.current = false
    // Capture stroke BEFORE nulling the ref — React 18 batches state updates so
    // the updater fn runs after current.current is already null if we don't do this.
    const stroke = current.current
    current.current = null
    setStrokes(prev => [...prev, stroke])
  }
  function undo() { setStrokes(prev => prev.slice(0, -1)) }
  function clearAll() { if (confirm('Clear the canvas?')) setStrokes([]) }

  async function saveSketch() {
    const canvas = canvasRef.current
    if (!canvas) return
    setSaving(true); setError('')
    try {
      const blob: Blob | null = await new Promise(res => canvas.toBlob(b => res(b), 'image/png'))
      if (!blob) { setError('Could not export sketch'); setSaving(false); return }
      const fileName = `${(name.trim() || 'sketch').replace(/[^a-z0-9 _-]/gi, '').slice(0, 40) || 'sketch'}-${Date.now()}.png`
      const file = new File([blob], fileName, { type: 'image/png' })
      const fd = new FormData()
      fd.append('session_id', sessionId)
      fd.append('file', file)
      const res = await fetch('/api/job-planning', { method: 'POST', body: fd })
      const d = await res.json()
      if (!res.ok) { setError(d.error || 'Upload failed'); setSaving(false); return }
      const uploaded = (d.uploaded || [])[0]
      if (uploaded) {
        onAdd({ id: newId('sketch'), path: uploaded.path, signed_url: uploaded.signed_url, name: name.trim() || 'Untitled sketch', created_at: new Date().toISOString() })
        setName(''); setStrokes([])
      }
    } catch (e: any) {
      setError(e?.message || 'Save failed')
    }
    setSaving(false)
  }

  async function traceFromPhoto(file: File) {
    setShowImportMenu(false)
    setTracing(true)
    setTraceError(null)
    setTraceResult(null)
    try {
      // Downscale large images to max 1400px before sending — prevents nginx timeout on 3000+ px photos
      const MAX_PX = 1400
      let sendFile = file
      const img = await new Promise<HTMLImageElement>((res, rej) => {
        const i = new Image()
        i.onload = () => res(i)
        i.onerror = rej
        i.src = URL.createObjectURL(file)
      })
      if (img.width > MAX_PX || img.height > MAX_PX) {
        const scale = MAX_PX / Math.max(img.width, img.height)
        const w = Math.round(img.width * scale)
        const h = Math.round(img.height * scale)
        const cvs = document.createElement('canvas')
        cvs.width = w; cvs.height = h
        cvs.getContext('2d')!.drawImage(img, 0, 0, w, h)
        const blob = await new Promise<Blob | null>(r => cvs.toBlob(r, 'image/jpeg', 0.88))
        if (blob) sendFile = new File([blob], 'sketch.jpg', { type: 'image/jpeg' })
      }
      URL.revokeObjectURL(img.src)
      const fd = new FormData()
      fd.append('image', sendFile)
      const res = await fetch('/api/sketch-trace', { method: 'POST', body: fd })
      // The endpoint streams keep-alive whitespace while Claude works, then writes
      // the final JSON last. res.text() waits for the full stream; JSON.parse skips
      // the leading whitespace. A non-JSON body means a proxy returned an error page.
      const bodyText = await res.text()
      let d: any
      try {
        d = JSON.parse(bodyText.trim())
      } catch {
        setTraceError('The server couldn’t complete the trace (it may be busy). Please try again — your photo is fine.')
        return
      }
      // Real status is carried in the body (HTTP is always 200 once streaming starts).
      const ok = res.ok && (d._status === undefined || d._status === 200) && !d.error
      if (!ok) { setTraceError(d.error || 'Tracing failed — please try again.'); return }
      if (!Array.isArray(d.strokes) || d.strokes.length === 0) {
        setTraceError('No floor-plan lines were found in this image.'); return
      }
      // Replace canvas strokes with the traced ones, and adopt the detected grid
      // pitch/origin so the plan lines up square-for-square on the canvas paper.
      setStrokes(d.strokes)
      if (d.grid && typeof d.grid.blockPx === 'number' && d.grid.blockPx > 0) {
        setGridBlockPx(d.grid.blockPx)
        setGridOrigin({ x: Number(d.grid.originX) || 0, y: Number(d.grid.originY) || 0 })
      } else {
        setGridBlockPx(24); setGridOrigin({ x: 0, y: 0 })
      }
      setTraceResult({ count: d.count })
      // Auto-dismiss success message after 4 s
      setTimeout(() => setTraceResult(null), 4000)
    } catch (e: any) {
      setTraceError(e.message || 'Tracing failed')
    } finally {
      setTracing(false)
      // Reset file inputs so same file can be re-selected
      if (photoInputRef.current) photoInputRef.current.value = ''
      if (cameraInputRef.current) cameraInputRef.current.value = ''
    }
  }

  const ToolBtn = ({ t, icon: Icon, title }: { t: StrokeTool; icon: any; title: string }) => (
    <button title={title} onClick={() => setTool(t)}
      className={`p-2 rounded-lg border transition-colors ${tool === t ? 'border-amber-300 bg-amber-50 text-amber-700' : 'border-gray-200 text-gray-500 hover:bg-gray-50'}`}>
      <Icon size={14} />
    </button>
  )

  return (
    <div className="space-y-3">
      <p className="text-xs text-gray-500">Sketch a rough room layout, place fixtures, and annotate measurements. Use the scale and zoom controls to match real-world dimensions.</p>

      {/* ── Photo import banners ── */}
      {traceError && (
        <div className="flex items-start gap-2 bg-red-50 border border-red-200 rounded-xl px-3 py-2.5">
          <AlertCircle size={14} className="text-red-500 flex-shrink-0 mt-0.5" />
          <p className="text-xs text-red-700 flex-1">{traceError}</p>
          <button onClick={() => setTraceError(null)} className="text-red-400 hover:text-red-600"><X size={13} /></button>
        </div>
      )}
      {traceResult && (
        <div className="flex items-center gap-2 bg-green-50 border border-green-200 rounded-xl px-3 py-2.5">
          <CheckCircle2 size={14} className="text-green-600 flex-shrink-0" />
          <p className="text-xs text-green-800 font-medium">Traced! {traceResult.count} elements imported — edit them freely below.</p>
        </div>
      )}

      {/* ── Hidden file inputs ── */}
      <input ref={photoInputRef} type="file" accept="image/*" className="hidden"
        onChange={e => { const f = e.target.files?.[0]; if (f) traceFromPhoto(f) }} />
      <input ref={cameraInputRef} type="file" accept="image/*" capture="environment" className="hidden"
        onChange={e => { const f = e.target.files?.[0]; if (f) traceFromPhoto(f) }} />

      {/* ── Drawing tools ── */}
      <div className="flex flex-wrap items-center gap-2 bg-gray-50 border border-gray-200 rounded-xl px-3 py-2">
        <ToolBtn t="pen" icon={PenTool} title="Pen" />
        <ToolBtn t="line" icon={Minus} title="Straight line / measurement" />
        <ToolBtn t="rect" icon={Square} title="Rectangle (room / object outline)" />
        <ToolBtn t="text" icon={Type} title="Text annotation" />
        <ToolBtn t="eraser" icon={Eraser} title="Eraser" />
        <div className="w-px h-6 bg-gray-200 mx-1" />
        {COLORS.map(c => (
          <button key={c} onClick={() => setColor(c)} className={`w-6 h-6 rounded-full border-2 ${color === c ? 'border-gray-700' : 'border-transparent'}`} style={{ background: c }} />
        ))}
        <div className="w-px h-6 bg-gray-200 mx-1" />
        <input type="range" min={1} max={14} value={width} onChange={e => setWidth(Number(e.target.value))} className="w-20" />
        <div className="flex-1" />
        <button onClick={undo} disabled={!strokes.length} title="Undo" className="p-2 rounded-lg border border-gray-200 text-gray-500 hover:bg-gray-50 disabled:opacity-30"><Undo2 size={14} /></button>
        <button onClick={clearAll} disabled={!strokes.length} title="Clear all strokes" className="p-2 rounded-lg border border-gray-200 text-gray-500 hover:bg-gray-50 disabled:opacity-30"><RotateCcw size={14} /></button>
        <div className="w-px h-6 bg-gray-200 mx-1" />
        {/* Photo import dropdown */}
        <div className="relative">
          <button
            onClick={() => setShowImportMenu(m => !m)}
            disabled={tracing}
            title="Import from photo — AI traces your hand-drawn floor plan"
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-teal-300 bg-teal-50 text-teal-700 text-xs font-semibold hover:bg-teal-100 disabled:opacity-50 transition-colors">
            {tracing ? <Loader2 size={13} className="animate-spin" /> : <ScanLine size={13} />}
            {tracing ? 'Tracing…' : 'Import Photo'}
          </button>
          {showImportMenu && !tracing && (
            <div className="absolute right-0 top-full mt-1 z-50 bg-white border border-gray-200 rounded-xl shadow-xl w-52 overflow-hidden">
              <button
                onClick={() => cameraInputRef.current?.click()}
                className="w-full flex items-center gap-2.5 px-4 py-3 text-sm font-medium text-gray-800 hover:bg-teal-50 hover:text-teal-800 transition-colors">
                <Camera size={15} className="text-teal-600" />
                Take Photo
                <span className="ml-auto text-[10px] text-gray-400">Camera</span>
              </button>
              <div className="h-px bg-gray-100" />
              <button
                onClick={() => photoInputRef.current?.click()}
                className="w-full flex items-center gap-2.5 px-4 py-3 text-sm font-medium text-gray-800 hover:bg-teal-50 hover:text-teal-800 transition-colors">
                <Upload size={15} className="text-teal-600" />
                Choose File
                <span className="ml-auto text-[10px] text-gray-400">Gallery</span>
              </button>
              {onOpenDrivePicker && <>
                <div className="h-px bg-gray-100" />
                <button
                  onClick={() => { setShowImportMenu(false); onOpenDrivePicker() }}
                  className="w-full flex items-center gap-2.5 px-4 py-3 text-sm font-medium text-gray-800 hover:bg-teal-50 hover:text-teal-800 transition-colors">
                  <Cloud size={15} className="text-teal-600" />
                  From Drive
                  <span className="ml-auto text-[10px] text-gray-400">Google</span>
                </button>
              </>}
              <div className="bg-teal-50 px-4 py-2.5">
                <p className="text-[10px] text-teal-700 leading-snug">AI will trace walls, rooms, and labels from your hand-drawn sketch.</p>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ── Scale + Zoom controls ── */}
      <div className="flex flex-wrap items-center gap-3 bg-blue-50 border border-blue-100 rounded-xl px-3 py-2 text-xs">
        {/* Scale */}
        <div className="flex items-center gap-1.5">
          <span className="text-gray-500 font-medium">Scale:</span>
          <span className="text-gray-500">1 block =</span>
          <input
            type="number" min={0.25} max={200} step={0.25}
            value={blockFtInput}
            onChange={e => {
              setBlockFtInput(e.target.value)
              const v = parseFloat(e.target.value)
              if (!isNaN(v) && v > 0) setBlockFt(v)
            }}
            className="w-14 border border-blue-200 rounded-lg px-1.5 py-0.5 text-center text-xs bg-white focus:outline-none focus:ring-1 focus:ring-blue-400"
          />
          <span className="text-gray-500">ft</span>
        </div>
        <div className="w-px h-5 bg-blue-200" />
        {/* Zoom */}
        <div className="flex items-center gap-1">
          <span className="text-gray-500 font-medium">Zoom:</span>
          <button onClick={zoomOut} disabled={zoom <= ZOOM_STEPS[0]} title="Zoom out"
            className="p-1 rounded border border-blue-200 bg-white text-gray-600 hover:bg-blue-100 disabled:opacity-30 transition-colors">
            <ZoomOut size={13} />
          </button>
          <button onClick={resetZoom}
            className="px-2 py-0.5 rounded border border-blue-200 bg-white text-gray-700 hover:bg-blue-100 font-semibold tabular-nums min-w-[44px] text-center transition-colors"
            title="Reset to 100%">
            {Math.round(zoom * 100)}%
          </button>
          <button onClick={zoomIn} disabled={zoom >= ZOOM_STEPS[ZOOM_STEPS.length - 1]} title="Zoom in"
            className="p-1 rounded border border-blue-200 bg-white text-gray-600 hover:bg-blue-100 disabled:opacity-30 transition-colors">
            <ZoomIn size={13} />
          </button>
        </div>
        <span className="text-blue-400 text-[10px]">Scale bar shown on canvas ↙</span>
      </div>

      {/* ── Canvas ── */}
      <div className="relative border border-gray-200 rounded-xl overflow-hidden bg-white"
        onClick={() => showImportMenu && setShowImportMenu(false)}>
        <canvas ref={canvasRef}
          className="w-full touch-none cursor-crosshair block"
          onMouseDown={start} onMouseMove={move} onMouseUp={end} onMouseLeave={end}
          onTouchStart={start} onTouchMove={move} onTouchEnd={end}
        />
        {/* Tracing overlay */}
        {tracing && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-white/80 backdrop-blur-sm gap-3">
            <div className="flex items-center gap-3 bg-white rounded-2xl border border-teal-200 shadow-lg px-6 py-4">
              <Loader2 size={22} className="animate-spin text-teal-600" />
              <div>
                <p className="text-sm font-bold text-gray-900">Tracing your floor plan…</p>
                <p className="text-xs text-gray-500 mt-0.5">Claude AI is analyzing walls, rooms, and labels</p>
              </div>
            </div>
          </div>
        )}
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        <input value={name} onChange={e => setName(e.target.value)} placeholder="Name this sketch (e.g. Kitchen layout v1)"
          className="flex-1 min-w-[200px] px-3 py-2 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:border-blue-400" />
        <button onClick={saveSketch} disabled={saving || strokes.length === 0}
          className="flex items-center gap-1.5 text-sm font-bold px-4 py-2 rounded-xl text-white shadow-sm disabled:opacity-50" style={{ background: '#b8895a' }}>
          {saving ? <Loader2 size={13} className="animate-spin" /> : <Save size={13} />} Save Sketch
        </button>
      </div>
      {error && <div className="bg-red-50 border border-red-100 text-red-700 text-xs px-3 py-2 rounded-lg">{error}</div>}

      {sketches.length > 0 && (
        <div>
          <h3 className="text-[11px] font-bold uppercase tracking-wider text-gray-400 mb-2">Saved sketches</h3>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {sketches.map((s, i) => (
              <div key={s.id} className="border border-gray-200 rounded-xl overflow-hidden bg-white group relative">
                {s.signed_url ? <img src={s.signed_url} alt={s.name} className="w-full h-28 object-cover bg-white" /> : <div className="w-full h-28 bg-gray-50" />}
                <button onClick={() => onRemove(i)} className="absolute top-1.5 right-1.5 bg-white/90 hover:bg-red-100 rounded-full p-1 shadow opacity-0 group-hover:opacity-100 transition-opacity">
                  <Trash2 size={11} className="text-red-600" />
                </button>
                <div className="px-2 py-1.5 text-[11px] font-semibold text-gray-700 truncate">{s.name}</div>
              </div>
            ))}
          </div>
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
