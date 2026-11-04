'use client'
import { useEffect, useMemo, useRef, useState } from 'react'
import { PenLine, Eraser, Undo2, Trash2, Loader2, Search, Copy, Edit3, Check, X, ScanText, Plus } from 'lucide-react'
import { adminFetch } from '@/lib/admin-fetch'

const BRAND = '#b8895a'
const CANVAS_H = 320
const INK = '#111827'

type Pt = { x: number; y: number }
type Stroke = { pts: Pt[]; w: number; erase: boolean }
type Entry = { id: string; body: string; created_at: string; updated_at: string }

// Draw strokes onto a context. `scale` maps stroke coordinates to pixels; `minW`
// keeps lines bold enough for OCR when exporting.
function drawStrokes(ctx: CanvasRenderingContext2D, strokes: Stroke[], scale: number, minW = 0, offX = 0, offY = 0) {
  ctx.lineCap = 'round'; ctx.lineJoin = 'round'
  for (const s of strokes) {
    ctx.globalCompositeOperation = s.erase ? 'destination-out' : 'source-over'
    ctx.strokeStyle = INK; ctx.fillStyle = INK
    ctx.lineWidth = Math.max(minW, s.w * scale)
    const px = (p: Pt) => (p.x - offX) * scale
    const py = (p: Pt) => (p.y - offY) * scale
    const pts = s.pts
    if (pts.length === 1) {
      ctx.beginPath(); ctx.arc(px(pts[0]), py(pts[0]), ctx.lineWidth / 2, 0, Math.PI * 2); ctx.fill()
      continue
    }
    ctx.beginPath(); ctx.moveTo(px(pts[0]), py(pts[0]))
    for (let i = 1; i < pts.length - 1; i++) {
      ctx.quadraticCurveTo(px(pts[i]), py(pts[i]), (px(pts[i]) + px(pts[i + 1])) / 2, (py(pts[i]) + py(pts[i + 1])) / 2)
    }
    ctx.lineTo(px(pts[pts.length - 1]), py(pts[pts.length - 1]))
    ctx.stroke()
  }
  ctx.globalCompositeOperation = 'source-over'
}

export default function NotepadPage() {
  // ── ink canvas ─────────────────────────────────────────────
  const wrapRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const strokes = useRef<Stroke[]>([])
  const current = useRef<Stroke | null>(null)
  const penSeen = useRef(false)
  const [tool, setTool] = useState<'pen' | 'eraser'>('pen')
  const [penW, setPenW] = useState(3)
  const [inkCount, setInkCount] = useState(0)

  function redraw() {
    const c = canvasRef.current; if (!c) return
    const ctx = c.getContext('2d'); if (!ctx) return
    const dpr = window.devicePixelRatio || 1
    ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, c.width, c.height)
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    drawStrokes(ctx, strokes.current, 1)
  }

  useEffect(() => {
    const wrap = wrapRef.current, c = canvasRef.current; if (!wrap || !c) return
    const fit = () => {
      const dpr = window.devicePixelRatio || 1
      const w = wrap.clientWidth
      c.width = Math.floor(w * dpr); c.height = Math.floor(CANVAS_H * dpr)
      c.style.width = `${w}px`; c.style.height = `${CANVAS_H}px`
      redraw()
    }
    fit()
    const ro = new ResizeObserver(fit); ro.observe(wrap)
    return () => ro.disconnect()
  }, [])

  const pos = (e: React.PointerEvent) => {
    const r = canvasRef.current!.getBoundingClientRect()
    return { x: e.clientX - r.left, y: e.clientY - r.top }
  }
  function onDown(e: React.PointerEvent<HTMLCanvasElement>) {
    if (e.pointerType === 'pen') penSeen.current = true
    if (e.pointerType === 'touch' && penSeen.current) return   // palm rejection once a stylus has been used
    e.preventDefault()
    e.currentTarget.setPointerCapture(e.pointerId)
    current.current = { pts: [pos(e)], w: tool === 'eraser' ? penW * 5 : penW, erase: tool === 'eraser' }
  }
  function onMove(e: React.PointerEvent<HTMLCanvasElement>) {
    const s = current.current; if (!s) return
    const p = pos(e), last = s.pts[s.pts.length - 1]
    if (Math.hypot(p.x - last.x, p.y - last.y) < 1.2) return
    s.pts.push(p)
    const ctx = canvasRef.current!.getContext('2d')!
    ctx.setTransform(window.devicePixelRatio || 1, 0, 0, window.devicePixelRatio || 1, 0, 0)
    ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.lineWidth = s.w; ctx.strokeStyle = INK
    ctx.globalCompositeOperation = s.erase ? 'destination-out' : 'source-over'
    ctx.beginPath(); ctx.moveTo(last.x, last.y); ctx.lineTo(p.x, p.y); ctx.stroke()
    ctx.globalCompositeOperation = 'source-over'
  }
  function onUp() {
    const s = current.current; current.current = null
    if (!s) return
    strokes.current.push(s); setInkCount(strokes.current.length)
    redraw()
  }
  function undo() { strokes.current.pop(); setInkCount(strokes.current.length); redraw() }
  function clearInk() { strokes.current = []; setInkCount(0); redraw() }

  // ── free in-browser OCR (tesseract.js) ─────────────────────
  const [draft, setDraft] = useState('')
  const [ocrBusy, setOcrBusy] = useState(false)
  const [ocrStatus, setOcrStatus] = useState('')

  function exportInk(): HTMLCanvasElement | null {
    const ink = strokes.current.filter(s => !s.erase)
    if (ink.length === 0) return null
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity
    ink.forEach(s => s.pts.forEach(p => { x0 = Math.min(x0, p.x); y0 = Math.min(y0, p.y); x1 = Math.max(x1, p.x); y1 = Math.max(y1, p.y) }))
    const pad = 24, scale = 1.6
    const w = Math.ceil((x1 - x0 + pad * 2) * scale), h = Math.ceil((y1 - y0 + pad * 2) * scale)
    const layer = document.createElement('canvas'); layer.width = w; layer.height = h
    drawStrokes(layer.getContext('2d')!, strokes.current, scale, 3, x0 - pad, y0 - pad)   // eraser strokes cut into this layer
    const out = document.createElement('canvas'); out.width = w; out.height = h
    const octx = out.getContext('2d')!
    octx.fillStyle = '#ffffff'; octx.fillRect(0, 0, w, h); octx.drawImage(layer, 0, 0)    // black ink on white — what OCR expects
    return out
  }

  async function transcribe() {
    const img = exportInk()
    if (!img) return
    setOcrBusy(true); setOcrStatus('Loading the reader (first time takes a few seconds)…')
    try {
      const { createWorker } = await import('tesseract.js')
      const worker = await createWorker('eng', 1, {
        logger: (m: any) => {
          if (m.status === 'recognizing text') setOcrStatus(`Reading your writing… ${Math.round((m.progress || 0) * 100)}%`)
          else if (m.status) setOcrStatus(String(m.status).replace(/^./, c => c.toUpperCase()) + '…')
        },
      })
      await worker.setParameters({ tessedit_pageseg_mode: '6', preserve_interword_spaces: '1' } as any)
      const { data } = await worker.recognize(img)
      await worker.terminate()
      const text = (data.text || '').split('\n').map(l => l.trim()).filter(Boolean).join('\n')
      if (!text) alert('Couldn\'t read anything from that. Try writing a little larger and in neat print, one line per row.')
      else setDraft(prev => (prev.trim() ? prev.replace(/\s+$/, '') + '\n' : '') + text)
    } catch {
      alert('The handwriting reader couldn\'t load (it needs an internet connection the first time). You can still type the note below.')
    }
    setOcrBusy(false); setOcrStatus('')
  }

  // ── the running pad ────────────────────────────────────────
  const [entries, setEntries] = useState<Entry[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [search, setSearch] = useState('')
  const [saving, setSaving] = useState(false)
  const [editId, setEditId] = useState<string | null>(null)
  const [editText, setEditText] = useState('')

  async function load(q = search) {
    setError('')
    try {
      const res = await adminFetch(`/api/notepad${q.trim() ? `?q=${encodeURIComponent(q.trim())}` : ''}`)
      const d = await res.json()
      if (!res.ok) { setError(d.error || 'Failed to load'); setEntries([]) } else setEntries(Array.isArray(d) ? d : [])
    } catch { setError('Failed to load') }
    setLoading(false)
  }
  useEffect(() => { load('') /* eslint-disable-next-line */ }, [])
  useEffect(() => { const t = setTimeout(() => load(search), 250); return () => clearTimeout(t) /* eslint-disable-next-line */ }, [search])

  async function addToPad() {
    if (!draft.trim()) return
    setSaving(true)
    const res = await adminFetch('/api/notepad', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ body: draft }) })
    const d = await res.json().catch(() => ({}))
    setSaving(false)
    if (!res.ok) { alert(d.error || 'Could not save'); return }
    setDraft(''); clearInk(); await load()
  }
  async function saveEdit(id: string) {
    const res = await adminFetch('/api/notepad', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id, body: editText }) })
    const d = await res.json().catch(() => ({}))
    if (!res.ok) { alert(d.error || 'Could not save'); return }
    setEditId(null); await load()
  }
  async function remove(id: string) {
    if (!confirm('Delete this note?')) return
    await adminFetch(`/api/notepad?id=${id}`, { method: 'DELETE' })
    await load()
  }

  const days = useMemo(() => {
    const m = new Map<string, Entry[]>()
    entries.forEach(e => {
      const k = new Date(e.created_at).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })
      m.set(k, [...(m.get(k) || []), e])
    })
    return Array.from(m.entries())
  }, [entries])

  return (
    <div className="p-6 md:p-8 pt-16 md:pt-8 max-w-4xl">
      <div className="mb-6">
        <h1 className="text-2xl font-extrabold text-gray-900 flex items-center gap-2"><PenLine size={24} style={{ color: BRAND }} /> Notepad</h1>
        <p className="text-gray-500 text-sm mt-0.5">Write with a stylus or your finger, turn it into text, and keep a running pad.</p>
      </div>

      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden mb-5">
        <div className="px-4 py-2.5 border-b border-gray-100 bg-gray-50 flex flex-wrap items-center gap-2">
          <div className="flex gap-1 bg-gray-100 rounded-lg p-0.5">
            <button onClick={() => setTool('pen')} className={`px-3 py-1.5 rounded-md text-xs font-semibold flex items-center gap-1.5 ${tool === 'pen' ? 'bg-white shadow-sm text-gray-900' : 'text-gray-500'}`}><PenLine size={13} /> Pen</button>
            <button onClick={() => setTool('eraser')} className={`px-3 py-1.5 rounded-md text-xs font-semibold flex items-center gap-1.5 ${tool === 'eraser' ? 'bg-white shadow-sm text-gray-900' : 'text-gray-500'}`}><Eraser size={13} /> Eraser</button>
          </div>
          <label className="flex items-center gap-2 text-xs text-gray-500">
            Thickness <input type="range" min={2} max={8} value={penW} onChange={e => setPenW(Number(e.target.value))} className="w-24" />
          </label>
          <button onClick={undo} disabled={inkCount === 0} className="p-1.5 rounded-lg border border-gray-200 text-gray-500 hover:bg-white disabled:opacity-30" title="Undo last stroke"><Undo2 size={14} /></button>
          <button onClick={clearInk} disabled={inkCount === 0} className="p-1.5 rounded-lg border border-gray-200 text-gray-500 hover:bg-white disabled:opacity-30" title="Clear the page"><Trash2 size={14} /></button>
          <div className="flex-1" />
          <button onClick={transcribe} disabled={inkCount === 0 || ocrBusy}
            className="flex items-center gap-2 text-white text-sm font-bold px-4 py-2 rounded-xl shadow-sm disabled:opacity-50" style={{ background: BRAND }}>
            {ocrBusy ? <Loader2 size={14} className="animate-spin" /> : <ScanText size={14} />} Turn into text
          </button>
        </div>
        <div ref={wrapRef} className="relative w-full"
          style={{ height: CANVAS_H, backgroundImage: 'repeating-linear-gradient(to bottom, transparent 0, transparent 39px, #e5e7eb 39px, #e5e7eb 40px)' }}>
          <canvas ref={canvasRef} onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp} onPointerLeave={onUp}
            style={{ touchAction: 'none', display: 'block', cursor: tool === 'eraser' ? 'cell' : 'crosshair' }} />
          {inkCount === 0 && <div className="absolute inset-0 flex items-center justify-center pointer-events-none text-gray-300 text-sm">Write here — neat print, one line per row reads best</div>}
        </div>
        {ocrBusy && <div className="px-4 py-2 text-xs text-gray-500 border-t border-gray-100 flex items-center gap-2"><Loader2 size={12} className="animate-spin" /> {ocrStatus}</div>}
      </div>

      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4 mb-8">
        <label className="block text-xs font-bold text-gray-600 uppercase tracking-wider mb-1.5">Text to add to the pad <span className="font-normal normal-case text-gray-400">— check it over, fix any misreads, or just type a note here</span></label>
        <textarea value={draft} onChange={e => setDraft(e.target.value)} rows={4} placeholder="Handwriting turns into text here…"
          className="w-full px-3 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:border-blue-400" />
        <div className="flex justify-end gap-2 mt-2">
          {draft && <button onClick={() => setDraft('')} className="px-3 py-2 rounded-xl text-sm font-semibold text-gray-500 hover:bg-gray-100">Discard</button>}
          <button onClick={addToPad} disabled={!draft.trim() || saving}
            className="flex items-center gap-2 text-white text-sm font-bold px-5 py-2 rounded-xl disabled:opacity-50" style={{ background: BRAND }}>
            {saving ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />} Add to Pad
          </button>
        </div>
      </div>

      <div className="flex items-center justify-between gap-3 mb-4">
        <h2 className="text-lg font-extrabold text-gray-900">Running Pad</h2>
        <div className="relative w-full max-w-xs">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search notes…"
            className="w-full pl-9 pr-3 py-2 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:border-blue-400" />
        </div>
      </div>

      {error && <div className="mb-4 bg-red-50 border border-red-100 text-red-700 text-sm px-4 py-3 rounded-xl">{error}</div>}
      {loading ? (
        <div className="flex justify-center py-12"><Loader2 size={24} className="animate-spin" style={{ color: BRAND }} /></div>
      ) : entries.length === 0 ? (
        <div className="text-center py-12 text-gray-400 text-sm">{search ? 'No notes match that search.' : 'Nothing on the pad yet — write something above.'}</div>
      ) : (
        <div className="space-y-6">
          {days.map(([day, list]) => (
            <div key={day}>
              <div className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">{day}</div>
              <div className="space-y-2">
                {list.map(en => (
                  <div key={en.id} className="bg-white rounded-xl border border-gray-100 shadow-sm px-4 py-3 group">
                    {editId === en.id ? (
                      <>
                        <textarea value={editText} onChange={e => setEditText(e.target.value)} rows={Math.min(10, editText.split('\n').length + 1)}
                          className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:border-blue-400" />
                        <div className="flex justify-end gap-2 mt-2">
                          <button onClick={() => setEditId(null)} className="px-3 py-1.5 rounded-lg text-xs font-semibold text-gray-500 hover:bg-gray-100 flex items-center gap-1"><X size={12} /> Cancel</button>
                          <button onClick={() => saveEdit(en.id)} className="px-3 py-1.5 rounded-lg text-xs font-bold text-white flex items-center gap-1" style={{ background: BRAND }}><Check size={12} /> Save</button>
                        </div>
                      </>
                    ) : (
                      <div className="flex gap-3">
                        <div className="flex-1 min-w-0">
                          <div className="text-[11px] text-gray-400 mb-0.5">{new Date(en.created_at).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}{en.updated_at !== en.created_at && ' · edited'}</div>
                          <div className="text-sm text-gray-800 whitespace-pre-wrap break-words">{en.body}</div>
                        </div>
                        <div className="flex items-start gap-0.5 opacity-60 group-hover:opacity-100">
                          <button onClick={() => navigator.clipboard?.writeText(en.body)} className="p-1.5 text-gray-400 hover:text-gray-700" title="Copy"><Copy size={14} /></button>
                          <button onClick={() => { setEditId(en.id); setEditText(en.body) }} className="p-1.5 text-gray-400 hover:text-blue-600" title="Edit"><Edit3 size={14} /></button>
                          <button onClick={() => remove(en.id)} className="p-1.5 text-gray-400 hover:text-red-600" title="Delete"><Trash2 size={14} /></button>
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
