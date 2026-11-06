'use client'
import { useEffect, useState } from 'react'
import { X, Loader2, ListTodo, CalendarPlus, Package, FileCheck, Send, Plus, StickyNote } from 'lucide-react'
import VoiceButton from '@/components/admin/VoiceButton'
import { postJson } from '@/lib/offline-queue'

// "Send to…" for a Notepad entry: turns the note into a Todo, a Calendar
// appointment, Materials-list items, or a Permit using the existing admin APIs.
// The note is pre-filled into the destination's form so it can be tidied first.

type Dest = 'todo' | 'calendar' | 'materials' | 'permit' | 'note'
const PERMIT_TYPES = ['gas', 'lp', 'hvac', 'electrical', 'mechanical', 'plumbing', 'other']

const inp = 'w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:border-blue-400'
const lbl = 'block text-xs font-bold text-gray-600 uppercase tracking-wider mb-1'

const today = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}` }

// "2 x 3/4 elbows" / "- 5 ball valves" → { qty, name }; no leading number → qty 1.
function parseItemLine(line: string) {
  const s = line.replace(/^\s*(?:[-*•–]|\[[ x]?\])\s*/i, '').trim()
  const m = s.match(/^(\d+(?:\.\d+)?)\s*(?:x|×)?\s+(.+)$/i)
  return m ? { qty: Number(m[1]), name: m[2].trim() } : { qty: 1, name: s }
}

async function post(url: string, body: any) {
  const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
  const d = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(d.error || `Request failed (${res.status})`)
  return d
}

export default function SendNoteModal({ text, brand, onClose, onSent, quick = false, canNote = false, initialDest }: {
  text: string
  brand: string
  onClose: () => void
  onSent: (label: string, removeFromPad: boolean) => void
  quick?: boolean          // "Quick add" mode: blank form, no "remove from pad" option
  canNote?: boolean        // quick mode only: also offer a plain Notepad entry (admin-only API)
  initialDest?: Dest
}) {
  const lines = text.split('\n').map(l => l.trim()).filter(Boolean)
  const firstLine = (lines[0] || '').slice(0, 140)
  const rest = lines.slice(1).join('\n')

  const [dest, setDest] = useState<Dest>(initialDest || 'todo')
  const [noteText, setNoteText] = useState(text)
  const [removeAfter, setRemoveAfter] = useState(true)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  // todo
  const [todo, setTodo] = useState({ title: firstLine, description: rest, priority: 'medium', due_date: '' })
  // calendar
  const [cal, setCal] = useState({ title: firstLine, date: today(), time: '09:00', hours: '1', address: '', notes: rest })
  // materials
  const [lists, setLists] = useState<any[]>([])
  const [listId, setListId] = useState('new')
  const [newListName, setNewListName] = useState(firstLine)
  const [itemsText, setItemsText] = useState(text.trim())
  // permit
  const [permit, setPermit] = useState({ job_address: '', permit_type: 'gas', customer_name: '', notes: text.trim() })

  useEffect(() => {
    fetch('/api/materials-lists', { cache: 'no-store' }).then(r => r.json())
      .then(d => { if (Array.isArray(d)) setLists(d.filter((l: any) => !['completed', 'complete', 'done', 'archived'].includes(String(l.status || '').toLowerCase()))) })
      .catch(() => {})
  }, [])

  async function send() {
    setErr(''); setBusy(true)
    try {
      if (dest === 'todo') {
        if (!todo.title.trim()) throw new Error('Give the todo a title')
        const r = await postJson('/api/todos', { title: todo.title.trim(), description: todo.description.trim() || null, priority: todo.priority, due_date: todo.due_date || null, source: quick ? 'quick-add' : 'notepad' }, 'Todo')
        if (!r.ok) throw new Error(r.error || 'Could not save')
        onSent(r.queued ? 'Todo list (offline — will sync)' : 'Todo list', removeAfter)
      } else if (dest === 'calendar') {
        if (!cal.title.trim()) throw new Error('Give the appointment a name')
        if (!cal.date) throw new Error('Pick a date')
        const start = new Date(`${cal.date}T${cal.time || '09:00'}`)
        const end = new Date(start.getTime() + (Number(cal.hours) || 1) * 3600 * 1000)
        const r = await postJson('/api/appointments', {
          customer_name: cal.title.trim(), title: cal.title.trim(), service_address: cal.address.trim() || null,
          notes: cal.notes.trim() || null, start_time: start.toISOString(), end_time: end.toISOString(), status: 'scheduled', notify: false,
        }, 'Appointment')
        if (!r.ok) throw new Error(r.error || 'Could not save')
        onSent(r.queued ? 'Calendar (offline — will sync)' : 'Calendar', removeAfter)
      } else if (dest === 'materials') {
        const items = itemsText.split('\n').map(parseItemLine).filter(i => i.name)
        if (items.length === 0) throw new Error('Add at least one item')
        let id = listId
        if (id === 'new') {
          if (!newListName.trim()) throw new Error('Name the new list')
          const created = await post('/api/materials-lists', { name: newListName.trim(), status: 'draft' })
          id = created.id
        }
        for (const it of items) await post('/api/materials-lists?action=add-item', { list_id: id, item_name: it.name, quantity_needed: it.qty })
        onSent(`Materials list (${items.length} item${items.length === 1 ? '' : 's'})`, removeAfter)
      } else if (dest === 'note') {
        if (!noteText.trim()) throw new Error('Write something first')
        const r = await postJson('/api/notepad', { body: noteText.trim() }, 'Note')
        if (!r.ok) throw new Error(r.error || 'Could not save the note')
        onSent(r.queued ? 'Notepad (offline — will sync)' : 'Notepad', false)
      } else {
        if (!permit.job_address.trim()) throw new Error('A permit needs a job address')
        await post('/api/permits', {
          job_address: permit.job_address.trim(), permit_type: permit.permit_type, customer_name: permit.customer_name.trim() || null,
          notes: permit.notes.trim() || null, source: 'notepad',
        })
        onSent('Permits', removeAfter)
      }
    } catch (e: any) {
      setErr(e?.message || 'Could not send')
      setBusy(false)
    }
  }

  const tabs: { id: Dest; label: string; icon: any }[] = [
    { id: 'todo', label: 'Todo', icon: ListTodo },
    { id: 'calendar', label: 'Calendar', icon: CalendarPlus },
    { id: 'materials', label: 'Materials', icon: Package },
    { id: 'permit', label: 'Permit', icon: FileCheck },
    ...(quick && canNote ? [{ id: 'note' as Dest, label: 'Note', icon: StickyNote }] : []),
  ]

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-end sm:items-center justify-center p-0 sm:p-4" onClick={onClose}>
      <div className="bg-white w-full sm:max-w-lg rounded-t-2xl sm:rounded-2xl shadow-xl max-h-[92vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 sticky top-0 bg-white z-10">
          <h3 className="font-extrabold text-gray-900 flex items-center gap-2">{quick ? <Plus size={16} style={{ color: brand }} /> : <Send size={16} style={{ color: brand }} />} {quick ? 'Quick add' : 'Send this note to…'}</h3>
          <button onClick={onClose} className="p-1 text-gray-400 hover:text-gray-700"><X size={18} /></button>
        </div>

        <div className="px-5 pt-4">
          <div className={`grid ${tabs.length > 4 ? 'grid-cols-5' : 'grid-cols-4'} gap-1.5 bg-gray-100 rounded-xl p-1`}>
            {tabs.map(({ id, label, icon: Icon }) => (
              <button key={id} onClick={() => { setDest(id); setErr('') }}
                className={`flex flex-col items-center gap-1 py-2 rounded-lg text-[11px] font-bold ${dest === id ? 'bg-white shadow-sm text-gray-900' : 'text-gray-500'}`}>
                <Icon size={16} style={dest === id ? { color: brand } : undefined} /> {label}
              </button>
            ))}
          </div>
        </div>

        <div className="px-5 py-4 space-y-3">
          {dest === 'todo' && (<>
            <div><div className="flex items-center justify-between"><label className={lbl}>Title</label><VoiceButton brand={brand} onText={t => setTodo(p => ({ ...p, title: (p.title + ' ' + t).trim() }))} /></div><input className={inp} autoFocus={quick} placeholder={quick ? 'What needs doing?' : undefined} value={todo.title} onChange={e => setTodo({ ...todo, title: e.target.value })} onKeyDown={e => { if (quick && e.key === 'Enter') send() }} /></div>
            <div><div className="flex items-center justify-between"><label className={lbl}>Details</label><VoiceButton brand={brand} onText={t => setTodo(p => ({ ...p, description: (p.description + ' ' + t).trim() }))} /></div><textarea className={inp} rows={3} value={todo.description} onChange={e => setTodo({ ...todo, description: e.target.value })} /></div>
            <div className="grid grid-cols-2 gap-3">
              <div><label className={lbl}>Priority</label>
                <select className={inp} value={todo.priority} onChange={e => setTodo({ ...todo, priority: e.target.value })}>
                  <option value="high">High</option><option value="medium">Medium</option><option value="low">Low</option>
                </select></div>
              <div><label className={lbl}>Due date</label><input type="date" className={inp} value={todo.due_date} onChange={e => setTodo({ ...todo, due_date: e.target.value })} /></div>
            </div>
          </>)}

          {dest === 'calendar' && (<>
            <div><label className={lbl}>Appointment / customer *</label><input className={inp} placeholder={quick ? 'Customer / job' : undefined} value={cal.title} onChange={e => setCal({ ...cal, title: e.target.value })} /></div>
            <div className="grid grid-cols-3 gap-3">
              <div className="col-span-3 sm:col-span-1"><label className={lbl}>Date *</label><input type="date" className={inp} value={cal.date} onChange={e => setCal({ ...cal, date: e.target.value })} /></div>
              <div><label className={lbl}>Start</label><input type="time" className={inp} value={cal.time} onChange={e => setCal({ ...cal, time: e.target.value })} /></div>
              <div><label className={lbl}>Hours</label><input type="number" min="0.25" step="0.25" className={inp} value={cal.hours} onChange={e => setCal({ ...cal, hours: e.target.value })} /></div>
            </div>
            <div><label className={lbl}>Address</label><input className={inp} value={cal.address} onChange={e => setCal({ ...cal, address: e.target.value })} placeholder="Optional" /></div>
            <div><label className={lbl}>Notes</label><textarea className={inp} rows={3} value={cal.notes} onChange={e => setCal({ ...cal, notes: e.target.value })} /></div>
            <p className="text-xs text-gray-400">No customer is notified — this just lands on your calendar.</p>
          </>)}

          {dest === 'materials' && (<>
            <div><label className={lbl}>Add to list</label>
              <select className={inp} value={listId} onChange={e => setListId(e.target.value)}>
                <option value="new">+ Create a new list</option>
                {lists.map(l => <option key={l.id} value={l.id}>{l.name}{l.property_address ? ` — ${l.property_address}` : ''}</option>)}
              </select></div>
            {listId === 'new' && <div><label className={lbl}>New list name</label><input className={inp} value={newListName} onChange={e => setNewListName(e.target.value)} /></div>}
            <div><div className="flex items-center justify-between"><label className={lbl}>Items — one per line</label><VoiceButton brand={brand} onText={t => setItemsText(p => (p.trim() + '\n' + t).trim())} /></div>
              <textarea className={`${inp} font-mono`} rows={6} value={itemsText} onChange={e => setItemsText(e.target.value)} />
              <p className="text-xs text-gray-400 mt-1">A leading number is the quantity, e.g. “4 ball valves”. No number = 1.</p></div>
          </>)}

          {dest === 'note' && (
            <div><div className="flex items-center justify-between"><label className={lbl}>Note</label><VoiceButton brand={brand} onText={t => setNoteText(p => (p + ' ' + t).trim())} /></div><textarea className={inp} rows={6} autoFocus value={noteText} onChange={e => setNoteText(e.target.value)} placeholder="Jot it down — you can turn it into a todo or appointment later from the Notepad." /></div>
          )}

          {dest === 'permit' && (<>
            <div><label className={lbl}>Job address *</label><input className={inp} value={permit.job_address} onChange={e => setPermit({ ...permit, job_address: e.target.value })} placeholder="123 Main St, Baton Rouge, LA" /></div>
            <div className="grid grid-cols-2 gap-3">
              <div><label className={lbl}>Type</label>
                <select className={inp} value={permit.permit_type} onChange={e => setPermit({ ...permit, permit_type: e.target.value })}>
                  {PERMIT_TYPES.map(t => <option key={t} value={t}>{t.toUpperCase()}</option>)}
                </select></div>
              <div><label className={lbl}>Customer</label><input className={inp} value={permit.customer_name} onChange={e => setPermit({ ...permit, customer_name: e.target.value })} placeholder="Optional" /></div>
            </div>
            <div><label className={lbl}>Notes</label><textarea className={inp} rows={4} value={permit.notes} onChange={e => setPermit({ ...permit, notes: e.target.value })} /></div>
          </>)}

          {!quick && (
            <label className="flex items-center gap-2 text-sm text-gray-600 pt-1 cursor-pointer">
              <input type="checkbox" checked={removeAfter} onChange={e => setRemoveAfter(e.target.checked)} />
              Remove from the pad once it’s sent
            </label>
          )}
          {err && <div className="bg-red-50 border border-red-100 text-red-700 text-sm px-3 py-2 rounded-lg">{err}</div>}
        </div>

        <div className="px-5 py-4 border-t border-gray-100 flex justify-end gap-2 sticky bottom-0 bg-white">
          <button onClick={onClose} className="px-4 py-2 rounded-xl text-sm font-semibold text-gray-500 hover:bg-gray-100">Cancel</button>
          <button onClick={send} disabled={busy} className="flex items-center gap-2 text-white text-sm font-bold px-5 py-2 rounded-xl disabled:opacity-50" style={{ background: brand }}>
            {busy ? <Loader2 size={14} className="animate-spin" /> : quick ? <Plus size={14} /> : <Send size={14} />} {quick ? 'Add' : 'Send'}
          </button>
        </div>
      </div>
    </div>
  )
}
