'use client'
import { useRef, useState } from 'react'
import DocPages, { PageBox } from './DocPages'
import { PlacedField, FieldType, FIELD_LABEL, FIELD_DEFAULT_W, FIELD_DEFAULT_H } from './signatureTypes'

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v))

// Admin field-placement surface: renders the document and lets you click to drop
// signature / initials / date fields, each assigned to a recipient. Drag to move,
// ✕ to remove. Fields are optional — none placed = the signer just signs at the end.
export default function SignatureFieldPlacer({
  file, url, text, signers, fields, onChange,
}: {
  file?: File | null
  url?: string | null
  text?: string | null
  signers: { id: string; name: string; color: string }[]
  fields: PlacedField[]
  onChange: (f: PlacedField[]) => void
}) {
  const [activeSigner, setActiveSigner] = useState(signers[0]?.id || '')
  const [activeType, setActiveType] = useState<FieldType>('signature')
  const fieldsRef = useRef(fields); fieldsRef.current = fields
  const draggedRef = useRef(false)

  const signerId = signers.some(s => s.id === activeSigner) ? activeSigner : signers[0]?.id
  const update = (id: string, patch: Partial<PlacedField>) => onChange(fieldsRef.current.map(f => f.id === id ? { ...f, ...patch } : f))
  const remove = (id: string) => onChange(fieldsRef.current.filter(f => f.id !== id))

  function addAt(pb: PageBox, e: React.MouseEvent) {
    if (draggedRef.current) { draggedRef.current = false; return }
    if (!signerId) { alert('Add a recipient first.'); return }
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
    const fx = (e.clientX - rect.left) / rect.width
    const fy = (e.clientY - rect.top) / rect.height
    const w = FIELD_DEFAULT_W[activeType], h = FIELD_DEFAULT_H
    onChange([...fieldsRef.current, {
      id: `fld_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      signer_id: signerId, page: pb.index, type: activeType,
      x: clamp(fx - w / 2, 0, 1 - w), y: clamp(fy - h / 2, 0, 1 - h), w, h,
    }])
  }

  function onFieldPointerDown(e: React.PointerEvent, f: PlacedField, pb: PageBox) {
    e.stopPropagation()
    const el = e.currentTarget as HTMLElement
    el.setPointerCapture(e.pointerId)
    const startX = e.clientX, startY = e.clientY
    const orig = { x: f.x, y: f.y }
    let moved = false
    const move = (ev: PointerEvent) => {
      const dx = (ev.clientX - startX) / pb.width
      const dy = (ev.clientY - startY) / pb.height
      if (Math.abs(ev.clientX - startX) > 2 || Math.abs(ev.clientY - startY) > 2) moved = true
      update(f.id, { x: clamp(orig.x + dx, 0, 1 - f.w), y: clamp(orig.y + dy, 0, 1 - f.h) })
    }
    const up = () => {
      el.removeEventListener('pointermove', move)
      el.removeEventListener('pointerup', up)
      if (moved) draggedRef.current = true
    }
    el.addEventListener('pointermove', move)
    el.addEventListener('pointerup', up)
  }

  const overlay = (pb: PageBox) => (
    <div className="absolute inset-0 cursor-crosshair" onClick={e => addAt(pb, e)}>
      {fields.filter(f => f.page === pb.index).map(f => {
        const s = signers.find(x => x.id === f.signer_id)
        const color = s?.color || '#6b7280'
        return (
          <div key={f.id}
            onPointerDown={e => onFieldPointerDown(e, f, pb)}
            onClick={e => e.stopPropagation()}
            style={{ position: 'absolute', left: f.x * pb.width, top: f.y * pb.height, width: f.w * pb.width, height: f.h * pb.height, borderColor: color, background: `${color}1f` }}
            className="border-2 border-dashed rounded flex items-center justify-center text-[10px] font-bold cursor-move select-none group">
            <span style={{ color }} className="truncate px-1">{FIELD_LABEL[f.type]} · {(s?.name || '').split(' ')[0]}</span>
            <button type="button"
              onPointerDown={e => { e.stopPropagation(); e.preventDefault() }}
              onClick={e => { e.stopPropagation(); remove(f.id) }}
              className="absolute -top-2.5 -right-2.5 w-5 h-5 rounded-full bg-white border border-gray-300 shadow text-red-500 text-[11px] leading-none flex items-center justify-center opacity-100 sm:opacity-0 sm:group-hover:opacity-100 hover:bg-red-50">✕</button>
          </div>
        )
      })}
    </div>
  )

  return (
    <div className="space-y-3">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-3 rounded-xl border border-gray-200 bg-gray-50 p-2.5">
        <div className="flex items-center gap-1.5">
          <span className="text-[11px] font-semibold text-gray-500">For:</span>
          {signers.length === 0 ? <span className="text-[11px] text-amber-600">Add a recipient above</span> : signers.map(s => (
            <button key={s.id} type="button" onClick={() => setActiveSigner(s.id)}
              className={`text-[11px] font-bold px-2 py-1 rounded-lg border-2 ${signerId === s.id ? 'text-white' : 'bg-white'}`}
              style={signerId === s.id ? { background: s.color, borderColor: s.color } : { color: s.color, borderColor: s.color }}>
              {s.name.split(' ')[0] || 'Recipient'}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-1.5">
          <span className="text-[11px] font-semibold text-gray-500">Field:</span>
          {(['signature', 'name', 'initials', 'date'] as FieldType[]).map(t => (
            <button key={t} type="button" onClick={() => setActiveType(t)}
              className={`text-[11px] font-semibold px-2.5 py-1 rounded-lg border ${activeType === t ? 'bg-gray-800 text-white border-gray-800' : 'bg-white text-gray-600 border-gray-200'}`}>
              {FIELD_LABEL[t]}
            </button>
          ))}
        </div>
        <span className="text-[11px] text-gray-400 ml-auto">Click the document to drop a field · drag to move · {fields.length} placed</span>
      </div>

      <div className="max-h-[55vh] overflow-auto rounded-xl border border-gray-100 bg-gray-100 p-3">
        <DocPages file={file} url={url} text={text} overlay={overlay} />
      </div>
    </div>
  )
}
