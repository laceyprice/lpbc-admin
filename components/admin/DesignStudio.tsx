'use client'
import { useEffect, useRef, useState } from 'react'
import {
  X, Palette, PenTool, Images, Sparkles, Loader2, Plus, Trash2, Save,
  Square, Minus, Type, Eraser, Undo2, RotateCcw, Wand2, Check, DollarSign,
} from 'lucide-react'

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
  { key: 'sketch', label: 'Sketch Canvas', icon: PenTool },
  { key: 'compare', label: 'Before / After', icon: Images },
  { key: 'ai', label: 'AI Suggestions', icon: Sparkles },
] as const
type TabKey = typeof TABS[number]['key']

function newId(prefix: string) { return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 7)}` }

export default function DesignStudio({
  open, onClose, design, onChange,
  attachments, sessionId, description, measurements,
}: {
  open: boolean
  onClose: () => void
  design: DesignData
  onChange: (next: DesignData) => void
  attachments: AttachmentLike[]
  sessionId: string
  description: string
  measurements: string
}) {
  const [tab, setTab] = useState<TabKey>('board')
  if (!open) return null

  const board = design.board || []
  const sketches = design.sketches || []
  const comparisons = design.comparisons || []
  const suggestions = design.ai_suggestions || []

  function patch(p: Partial<DesignData>) { onChange({ ...design, ...p }) }

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-stretch sm:items-center justify-center p-0 sm:p-6">
      <div className="bg-white w-full sm:max-w-5xl sm:rounded-2xl shadow-xl flex flex-col h-full sm:h-[88vh] overflow-hidden">
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
            const count = t.key === 'board' ? board.length : t.key === 'sketch' ? sketches.length : t.key === 'compare' ? comparisons.length : suggestions.length
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
              onAdd={items => patch({ board: [...board, ...items] })}
              onUpdate={(i, item) => patch({ board: board.map((b, idx) => idx === i ? item : b) })}
              onRemove={i => patch({ board: board.filter((_, idx) => idx !== i) })}
            />
          )}
          {tab === 'sketch' && (
            <SketchTab sketches={sketches} sessionId={sessionId}
              onAdd={s => patch({ sketches: [...sketches, s] })}
              onRemove={i => patch({ sketches: sketches.filter((_, idx) => idx !== i) })}
            />
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
                const items: BoardItem[] = (s.key_materials || []).slice(0, 6).map(m => ({
                  id: newId('board'), path: '', signed_url: null, name: s.style_name,
                  room: 'Other', label: m, notes: `From AI direction "${s.style_name}": ${s.why_it_fits || ''}`, price: 0,
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
function MoodBoardTab({ board, attachments, onAdd, onUpdate, onRemove }: {
  board: BoardItem[]
  attachments: AttachmentLike[]
  onAdd: (items: BoardItem[]) => void
  onUpdate: (i: number, item: BoardItem) => void
  onRemove: (i: number) => void
}) {
  const [picking, setPicking] = useState(false)
  const usedPaths = new Set(board.map(b => b.path).filter(Boolean))
  const images = attachments.filter(a => a.type.startsWith('image/'))
  const pickable = images.filter(a => !usedPaths.has(a.path))

  function addFromAttachment(att: AttachmentLike) {
    onAdd([{ id: newId('board'), path: att.path, signed_url: att.signed_url, name: att.name, room: 'Other', label: att.name.replace(/\.[^.]+$/, ''), notes: '', price: 0 }])
    setPicking(false)
  }
  function addBlank() {
    onAdd([{ id: newId('board'), path: '', signed_url: null, name: 'New item', room: 'Other', label: 'New selection', notes: '', price: 0 }])
  }

  // group by room for display
  const byRoom = new Map<string, number[]>()
  board.forEach((b, i) => {
    const k = b.room || 'Other'
    if (!byRoom.has(k)) byRoom.set(k, [])
    byRoom.get(k)!.push(i)
  })

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <p className="text-xs text-gray-500">Pull in project photos as material/finish selections, group by room, add notes and rough pricing.</p>
        <div className="flex items-center gap-2">
          <button onClick={() => setPicking(v => !v)} className="flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg border border-gray-200 hover:bg-gray-50">
            <Images size={12} /> Add from photos {pickable.length > 0 ? `(${pickable.length})` : ''}
          </button>
          <button onClick={addBlank} className="flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg border border-gray-200 hover:bg-gray-50">
            <Plus size={12} /> Blank selection
          </button>
        </div>
      </div>

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
                  return (
                    <div key={b.id} className="border border-gray-200 rounded-xl overflow-hidden bg-white group relative">
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

function SketchTab({ sketches, sessionId, onAdd, onRemove }: {
  sketches: SketchItem[]
  sessionId: string
  onAdd: (s: SketchItem) => void
  onRemove: (i: number) => void
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [tool, setTool] = useState<StrokeTool>('pen')
  const [color, setColor] = useState(COLORS[0])
  const [width, setWidth] = useState(3)
  const [strokes, setStrokes] = useState<Stroke[]>([])
  const drawing = useRef(false)
  const current = useRef<Stroke | null>(null)
  const [name, setName] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  function redraw(list: Stroke[]) {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, canvas.width, canvas.height)
    // light grid for sketching reference
    ctx.strokeStyle = '#f1f5f9'
    ctx.lineWidth = 1
    for (let x = 0; x < canvas.width; x += 24) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, canvas.height); ctx.stroke() }
    for (let y = 0; y < canvas.height; y += 24) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(canvas.width, y); ctx.stroke() }

    for (const s of list) {
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
  }

  useEffect(() => { redraw(strokes) }, [strokes])
  useEffect(() => {
    // size canvas to its container on mount
    const canvas = canvasRef.current
    if (canvas) { canvas.width = Math.min(900, canvas.parentElement?.clientWidth || 800); canvas.height = 480 }
    redraw(strokes)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function pos(e: React.MouseEvent | React.TouchEvent): { x: number; y: number } {
    const canvas = canvasRef.current!
    const rect = canvas.getBoundingClientRect()
    const point = 'touches' in e ? e.touches[0] : (e as React.MouseEvent)
    return { x: point.clientX - rect.left, y: point.clientY - rect.top }
  }

  function start(e: React.MouseEvent | React.TouchEvent) {
    e.preventDefault()
    const p = pos(e)
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
    if (current.current.points) current.current.points = [...current.current.points, p]
    else current.current.end = p
    redraw([...strokes, current.current])
  }
  function end() {
    if (!drawing.current || !current.current) return
    drawing.current = false
    setStrokes(prev => [...prev, current.current!])
    current.current = null
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

  const ToolBtn = ({ t, icon: Icon, title }: { t: StrokeTool; icon: any; title: string }) => (
    <button title={title} onClick={() => setTool(t)}
      className={`p-2 rounded-lg border transition-colors ${tool === t ? 'border-amber-300 bg-amber-50 text-amber-700' : 'border-gray-200 text-gray-500 hover:bg-gray-50'}`}>
      <Icon size={14} />
    </button>
  )

  return (
    <div className="space-y-4">
      <p className="text-xs text-gray-500">Sketch a rough room layout, place fixtures, and annotate measurements right on the canvas — then save it as part of this plan.</p>

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
        <button onClick={clearAll} disabled={!strokes.length} title="Clear" className="p-2 rounded-lg border border-gray-200 text-gray-500 hover:bg-gray-50 disabled:opacity-30"><RotateCcw size={14} /></button>
      </div>

      <div className="border border-gray-200 rounded-xl overflow-hidden bg-white">
        <canvas ref={canvasRef}
          className="w-full touch-none cursor-crosshair block"
          onMouseDown={start} onMouseMove={move} onMouseUp={end} onMouseLeave={end}
          onTouchStart={start} onTouchMove={move} onTouchEnd={end}
        />
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
  const images = attachments.filter(a => a.type.startsWith('image/'))

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
  const images = attachments.filter(a => a.type.startsWith('image/'))

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
                <h4 className="font-extrabold text-gray-900 text-sm leading-snug">{s.style_name}</h4>
                <button onClick={() => onToggleSelect(i)} title={s.selected ? 'Unselect' : 'Select this direction'}
                  className={`flex-shrink-0 p-1.5 rounded-full border ${s.selected ? 'bg-amber-400 border-amber-400 text-white' : 'border-gray-200 text-gray-300 hover:text-gray-500'}`}>
                  <Check size={12} />
                </button>
              </div>
              {s.estimated_cost_impact && (
                <span className={`self-start text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full border ${impactColor(s.estimated_cost_impact)}`}>
                  {s.estimated_cost_impact} cost impact
                </span>
              )}
              <p className="text-xs text-gray-600 leading-relaxed">{s.description}</p>
              {s.color_palette && s.color_palette.length > 0 && (
                <div className="flex flex-wrap gap-1">
                  {s.color_palette.map((c, ci) => <span key={ci} className="text-[10px] px-1.5 py-0.5 rounded bg-gray-100 text-gray-600">{c}</span>)}
                </div>
              )}
              {s.key_materials && s.key_materials.length > 0 && (
                <ul className="text-[11px] text-gray-500 list-disc list-inside space-y-0.5">
                  {s.key_materials.slice(0, 5).map((m, mi) => <li key={mi}>{m}</li>)}
                </ul>
              )}
              {s.why_it_fits && <p className="text-[11px] text-gray-400 italic border-t border-gray-100 pt-1.5 mt-auto">{s.why_it_fits}</p>}
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
