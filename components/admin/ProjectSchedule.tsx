'use client'
import { useCallback, useEffect, useState } from 'react'
import {
  CalendarDays, List, Plus, ChevronLeft, ChevronRight,
  Loader2, X, Trash2, User, Clock, AlertCircle, CheckCircle2,
  Hourglass, Flag, Truck, ClipboardCheck, FileCheck, HardHat,
  Circle,
} from 'lucide-react'

// ── Types ───────────────────────────────────────────────────────────────────
export interface PlanTask {
  id: string
  plan_id: string
  title: string
  description: string
  task_type: string
  status: string
  assigned_to: string
  start_date: string | null
  end_date: string | null
  color: string
  sort_order: number
  created_at?: string
}

// ── Constants ───────────────────────────────────────────────────────────────
const TASK_TYPES = [
  { value: 'task',          label: 'General Task',      color: '#2f5a5e', Icon: Clock },
  { value: 'milestone',     label: 'Milestone',         color: '#7c3aed', Icon: Flag },
  { value: 'delivery',      label: 'Material Delivery', color: '#b8895a', Icon: Truck },
  { value: 'inspection',    label: 'Inspection',        color: '#dc2626', Icon: ClipboardCheck },
  { value: 'permit',        label: 'Permit / Approval', color: '#0891b2', Icon: FileCheck },
  { value: 'subcontractor', label: 'Sub / Contractor',  color: '#16a34a', Icon: HardHat },
]

const TASK_STATUSES = [
  { value: 'pending',     label: 'Pending',     cls: 'bg-gray-100 text-gray-600',   Icon: Hourglass },
  { value: 'in_progress', label: 'In Progress', cls: 'bg-blue-100 text-blue-700',   Icon: Clock },
  { value: 'completed',   label: 'Completed',   cls: 'bg-green-100 text-green-700', Icon: CheckCircle2 },
  { value: 'blocked',     label: 'Blocked',     cls: 'bg-red-100 text-red-700',     Icon: AlertCircle },
]

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

function todayISO() {
  return new Date().toISOString().split('T')[0]
}

function typeFor(v: string) {
  return TASK_TYPES.find(t => t.value === v) ?? TASK_TYPES[0]
}

function statusFor(v: string) {
  return TASK_STATUSES.find(s => s.value === v) ?? TASK_STATUSES[0]
}

function fmtDate(d: string | null | undefined) {
  if (!d) return ''
  try { return new Date(d + 'T12:00:00').toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) }
  catch { return d }
}

// ── Task Modal ───────────────────────────────────────────────────────────────
function TaskModal({
  task, planId, defaultDate,
  onSave, onDelete, onClose,
}: {
  task: PlanTask | null
  planId: string
  defaultDate?: string
  onSave: (t: PlanTask) => void
  onDelete?: (id: string) => void
  onClose: () => void
}) {
  const isNew = !task
  const [title,      setTitle]      = useState(task?.title       ?? '')
  const [desc,       setDesc]       = useState(task?.description ?? '')
  const [taskType,   setTaskType]   = useState(task?.task_type   ?? 'task')
  const [statusVal,  setStatusVal]  = useState(task?.status      ?? 'pending')
  const [assignedTo, setAssignedTo] = useState(task?.assigned_to ?? '')
  const [startDate,  setStartDate]  = useState(task?.start_date  ?? defaultDate ?? '')
  const [endDate,    setEndDate]    = useState(task?.end_date     ?? defaultDate ?? '')
  const [saving,    setSaving]    = useState(false)
  const [deleting,  setDeleting]  = useState(false)

  const typeColor = typeFor(taskType).color

  async function handleSave() {
    if (!title.trim()) return
    setSaving(true)
    try {
      const payload = {
        plan_id:     planId,
        title:       title.trim(),
        description: desc,
        task_type:   taskType,
        status:      statusVal,
        assigned_to: assignedTo,
        start_date:  startDate || null,
        end_date:    endDate   || null,
        color:       typeFor(taskType).color,
      }
      const method = isNew ? 'POST' : 'PATCH'
      const body   = isNew ? payload : { id: task!.id, ...payload }
      const res = await fetch('/api/job-plan-tasks', {
        method, headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const d = await res.json()
      if (res.ok && d.task) onSave(d.task)
      else alert(d.error ?? 'Save failed')
    } finally { setSaving(false) }
  }

  async function handleDelete() {
    if (!task || !confirm(`Delete "${task.title}"?`)) return
    setDeleting(true)
    try {
      const res = await fetch(`/api/job-plan-tasks?id=${task.id}`, { method: 'DELETE' })
      if (res.ok && onDelete) onDelete(task.id)
      else { const d = await res.json(); alert(d.error ?? 'Delete failed') }
    } finally { setDeleting(false) }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>

        {/* Color stripe + header */}
        <div className="h-1.5 rounded-t-2xl" style={{ background: typeColor }} />
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <h3 className="font-bold text-gray-900 text-sm">{isNew ? 'Add Schedule Item' : 'Edit Schedule Item'}</h3>
          <button onClick={onClose}><X size={16} className="text-gray-400 hover:text-gray-600" /></button>
        </div>

        <div className="p-5 space-y-4">
          {/* Title */}
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1">Title *</label>
            <input value={title} onChange={e => setTitle(e.target.value)}
              placeholder="e.g. Electrical rough-in complete"
              className="w-full px-3 py-2 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-teal-300 focus:border-teal-400"
              autoFocus
            />
          </div>

          {/* Type + Status */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1">Type</label>
              <select value={taskType} onChange={e => setTaskType(e.target.value)}
                className="w-full px-3 py-2 rounded-xl border border-gray-200 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-teal-300">
                {TASK_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1">Status</label>
              <select value={statusVal} onChange={e => setStatusVal(e.target.value)}
                className="w-full px-3 py-2 rounded-xl border border-gray-200 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-teal-300">
                {TASK_STATUSES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
              </select>
            </div>
          </div>

          {/* Dates */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1">Start Date</label>
              <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)}
                className="w-full px-3 py-2 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-teal-300" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1">End Date</label>
              <input type="date" value={endDate}
                min={startDate || undefined}
                onChange={e => setEndDate(e.target.value)}
                className="w-full px-3 py-2 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-teal-300" />
            </div>
          </div>

          {/* Assigned to */}
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1 flex items-center gap-1"><User size={11} /> Assigned To</label>
            <input value={assignedTo} onChange={e => setAssignedTo(e.target.value)}
              placeholder="e.g. Mike's Electric, John (plumber), Self"
              className="w-full px-3 py-2 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-teal-300" />
          </div>

          {/* Notes */}
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1">Notes</label>
            <textarea value={desc} onChange={e => setDesc(e.target.value)}
              rows={2} placeholder="Additional details, requirements, or dependencies"
              className="w-full px-3 py-2 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-teal-300" />
          </div>
        </div>

        {/* Footer */}
        <div className="px-5 pb-5 flex items-center gap-2 border-t border-gray-100 pt-4">
          {!isNew && (
            <button onClick={handleDelete} disabled={deleting}
              className="flex items-center gap-1.5 text-xs font-semibold px-3 py-2 rounded-xl border border-red-100 text-red-600 hover:bg-red-50 disabled:opacity-50">
              {deleting ? <Loader2 size={11} className="animate-spin" /> : <Trash2 size={11} />} Delete
            </button>
          )}
          <div className="flex-1" />
          <button onClick={onClose} className="text-xs font-semibold px-4 py-2 rounded-xl border border-gray-200 hover:bg-gray-50">
            Cancel
          </button>
          <button onClick={handleSave} disabled={!title.trim() || saving}
            className="flex items-center gap-1.5 text-xs font-bold px-4 py-2 rounded-xl text-white disabled:opacity-50 transition-colors"
            style={{ background: '#2f5a5e' }}>
            {saving && <Loader2 size={11} className="animate-spin" />}
            {isNew ? 'Add Item' : 'Save Changes'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Calendar View ────────────────────────────────────────────────────────────
function CalendarView({ tasks, onTaskClick, onDateClick }: {
  tasks: PlanTask[]
  onTaskClick: (t: PlanTask) => void
  onDateClick: (date: string) => void
}) {
  const [viewDate, setViewDate] = useState(() => {
    const first = tasks.map(t => t.start_date).filter(Boolean).sort()[0]
    return first ? new Date(first + 'T12:00:00') : new Date()
  })

  const year  = viewDate.getFullYear()
  const month = viewDate.getMonth()
  const today = todayISO()

  const firstDayOfWeek = new Date(year, month, 1).getDay()
  const daysInMonth    = new Date(year, month + 1, 0).getDate()

  // Build 6-week grid
  const cells: Array<number | null> = []
  for (let i = 0; i < firstDayOfWeek; i++) cells.push(null)
  for (let d = 1; d <= daysInMonth; d++) cells.push(d)
  while (cells.length % 7 !== 0) cells.push(null)

  function ds(day: number) {
    return `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
  }

  function tasksFor(day: number): PlanTask[] {
    const d = ds(day)
    return tasks.filter(t => {
      if (!t.start_date) return false
      const end = t.end_date || t.start_date
      return d >= t.start_date && d <= end
    })
  }

  const monthLabel = viewDate.toLocaleString('default', { month: 'long', year: 'numeric' })

  return (
    <div>
      {/* Nav */}
      <div className="flex items-center justify-between mb-3">
        <button onClick={() => setViewDate(new Date(year, month - 1, 1))}
          className="p-1.5 rounded-lg border border-gray-200 hover:bg-gray-50">
          <ChevronLeft size={14} />
        </button>
        <div className="flex items-center gap-2">
          <span className="font-bold text-gray-900 text-sm">{monthLabel}</span>
          <button onClick={() => setViewDate(new Date())}
            className="text-[11px] px-2 py-0.5 rounded-lg bg-gray-100 hover:bg-gray-200 text-gray-600 font-semibold">
            Today
          </button>
        </div>
        <button onClick={() => setViewDate(new Date(year, month + 1, 1))}
          className="p-1.5 rounded-lg border border-gray-200 hover:bg-gray-50">
          <ChevronRight size={14} />
        </button>
      </div>

      {/* Grid */}
      <div className="border border-gray-200 rounded-xl overflow-hidden">
        {/* Day headers */}
        <div className="grid grid-cols-7 bg-gray-50 border-b border-gray-200">
          {DAY_NAMES.map(d => (
            <div key={d} className="text-center text-[10px] font-bold text-gray-400 uppercase py-2 tracking-wide">
              {d}
            </div>
          ))}
        </div>

        {/* Day cells */}
        <div className="grid grid-cols-7">
          {cells.map((day, i) => {
            if (!day) return (
              <div key={i} className="min-h-[80px] bg-gray-50/50 border-r border-b border-gray-100 last:border-r-0" />
            )
            const dateStr   = ds(day)
            const isToday   = dateStr === today
            const isPast    = dateStr < today
            const dayTasks  = tasksFor(day)

            return (
              <div key={i}
                className={`min-h-[80px] p-1 cursor-pointer border-r border-b border-gray-100 last:border-r-0 transition-colors ${
                  isToday ? 'bg-blue-50' : isPast ? 'bg-gray-50/40' : 'bg-white hover:bg-blue-50/30'
                }`}
                onClick={() => onDateClick(dateStr)}
              >
                <div className={`w-5 h-5 flex items-center justify-center rounded-full text-[11px] font-bold mb-0.5 transition-colors ${
                  isToday ? 'bg-blue-600 text-white' : isPast ? 'text-gray-400' : 'text-gray-700 hover:bg-blue-100'
                }`}>{day}</div>

                <div className="space-y-0.5">
                  {dayTasks.slice(0, 3).map(t => (
                    <div key={t.id}
                      onClick={e => { e.stopPropagation(); onTaskClick(t) }}
                      title={`${t.title}${t.assigned_to ? ` — ${t.assigned_to}` : ''}`}
                      className="text-[10px] font-medium px-1 py-0.5 rounded truncate leading-tight hover:opacity-80 cursor-pointer"
                      style={{ background: t.color + '20', color: t.color, borderLeft: `2px solid ${t.color}` }}
                    >
                      {t.status === 'completed' ? '✓ ' : ''}{t.title}
                    </div>
                  ))}
                  {dayTasks.length > 3 && (
                    <div className="text-[10px] text-gray-400 pl-1 font-medium">+{dayTasks.length - 3} more</div>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* Legend */}
      <div className="flex flex-wrap items-center gap-3 mt-3">
        {TASK_TYPES.map(t => (
          <div key={t.value} className="flex items-center gap-1">
            <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: t.color }} />
            <span className="text-[10px] text-gray-500">{t.label}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

// ── List View ────────────────────────────────────────────────────────────────
function ListView({ tasks, onTaskClick }: {
  tasks: PlanTask[]
  onTaskClick: (t: PlanTask) => void
}) {
  const today   = todayISO()
  const weekOut = new Date(Date.now() + 7  * 86400000).toISOString().split('T')[0]
  const twoWeek = new Date(Date.now() + 14 * 86400000).toISOString().split('T')[0]

  // Sort by start_date asc, nulls last
  const sorted = [...tasks].sort((a, b) => {
    if (!a.start_date && !b.start_date) return 0
    if (!a.start_date) return 1
    if (!b.start_date) return -1
    return a.start_date.localeCompare(b.start_date)
  })

  const isOverdue = (t: PlanTask) => t.status !== 'completed' && !!t.end_date && t.end_date < today

  const groups = [
    {
      key: 'overdue',
      label: 'Overdue',
      headerClass: 'text-red-600',
      items: sorted.filter(t => isOverdue(t)),
    },
    {
      key: 'blocked',
      label: 'Blocked',
      headerClass: 'text-orange-600',
      items: sorted.filter(t => t.status === 'blocked' && !isOverdue(t)),
    },
    {
      key: 'this_week',
      label: 'This Week',
      headerClass: 'text-gray-600',
      items: sorted.filter(t =>
        t.status !== 'completed' && t.status !== 'blocked' && !isOverdue(t) &&
        !!t.start_date && t.start_date <= weekOut
      ),
    },
    {
      key: 'next_week',
      label: 'Next 2 Weeks',
      headerClass: 'text-gray-500',
      items: sorted.filter(t =>
        t.status !== 'completed' && t.status !== 'blocked' && !isOverdue(t) &&
        !!t.start_date && t.start_date > weekOut && t.start_date <= twoWeek
      ),
    },
    {
      key: 'upcoming',
      label: 'Upcoming',
      headerClass: 'text-gray-400',
      items: sorted.filter(t =>
        t.status !== 'completed' && t.status !== 'blocked' && !isOverdue(t) &&
        (!t.start_date || t.start_date > twoWeek)
      ),
    },
    {
      key: 'completed',
      label: 'Completed',
      headerClass: 'text-green-600',
      items: sorted.filter(t => t.status === 'completed'),
    },
  ].filter(g => g.items.length > 0)

  if (sorted.length === 0) {
    return (
      <div className="text-center py-10 text-gray-400 text-sm">
        No schedule items yet — use the button below to add your first task or milestone.
      </div>
    )
  }

  return (
    <div className="space-y-5">
      {groups.map(group => (
        <div key={group.key}>
          <div className={`text-[11px] font-bold uppercase tracking-wider mb-2 flex items-center gap-1.5 ${group.headerClass}`}>
            {group.key === 'overdue' && <AlertCircle size={11} />}
            {group.key === 'blocked' && <AlertCircle size={11} />}
            {group.label}
            <span className="font-normal opacity-60">({group.items.length})</span>
          </div>
          <div className="space-y-1.5">
            {group.items.map(t => {
              const type   = typeFor(t.task_type)
              const status = statusFor(t.status)
              const TypeIcon = type.Icon
              return (
                <div key={t.id}
                  onClick={() => onTaskClick(t)}
                  className="flex items-center gap-3 p-3 bg-white border border-gray-100 rounded-xl cursor-pointer hover:shadow-sm hover:border-gray-200 transition-all"
                >
                  {/* Color bar */}
                  <div className="w-1 self-stretch rounded-full flex-shrink-0" style={{ background: t.color }} />
                  <TypeIcon size={14} style={{ color: t.color }} className="flex-shrink-0" />

                  <div className="flex-1 min-w-0">
                    <div className={`text-sm font-semibold ${t.status === 'completed' ? 'text-gray-400 line-through' : 'text-gray-900'}`}>
                      {t.title}
                    </div>
                    <div className="flex items-center flex-wrap gap-2 mt-0.5">
                      {t.assigned_to && (
                        <span className="text-[11px] text-gray-400 flex items-center gap-0.5">
                          <User size={9} />{t.assigned_to}
                        </span>
                      )}
                      {(t.start_date || t.end_date) && (
                        <span className="text-[11px] text-gray-400">
                          {fmtDate(t.start_date)}
                          {t.end_date && t.end_date !== t.start_date && ` → ${fmtDate(t.end_date)}`}
                        </span>
                      )}
                      {t.description && (
                        <span className="text-[11px] text-gray-400 truncate max-w-[200px]">{t.description}</span>
                      )}
                    </div>
                  </div>

                  <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full flex-shrink-0 ${status.cls}`}>
                    {status.label}
                  </span>
                </div>
              )
            })}
          </div>
        </div>
      ))}
    </div>
  )
}

// ── Main Export ──────────────────────────────────────────────────────────────
export default function ProjectSchedule({ planId }: { planId: string }) {
  const [tasks,          setTasks]          = useState<PlanTask[]>([])
  const [loading,        setLoading]        = useState(true)
  const [view,           setView]           = useState<'list' | 'calendar'>('list')
  const [modal,          setModal]          = useState<{ task: PlanTask | null; defaultDate?: string } | null>(null)
  const [needsMigration, setNeedsMigration] = useState(false)

  const loadTasks = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/job-plan-tasks?plan_id=${planId}`)
      const d   = await res.json()
      if (d.needsMigration) { setNeedsMigration(true); return }
      setTasks(d.tasks ?? [])
    } catch {}
    setLoading(false)
  }, [planId])

  useEffect(() => { loadTasks() }, [loadTasks])

  function onSave(saved: PlanTask) {
    setTasks(prev => {
      const idx = prev.findIndex(t => t.id === saved.id)
      return idx >= 0 ? prev.map((t, i) => i === idx ? saved : t) : [...prev, saved]
    })
    setModal(null)
    setLoading(false)
  }

  function onDelete(id: string) {
    setTasks(prev => prev.filter(t => t.id !== id))
    setModal(null)
  }

  // ── Stats ──
  const today     = todayISO()
  const completed = tasks.filter(t => t.status === 'completed').length
  const blocked   = tasks.filter(t => t.status === 'blocked').length
  const overdue   = tasks.filter(t => t.status !== 'completed' && !!t.end_date && t.end_date < today).length
  const inProg    = tasks.filter(t => t.status === 'in_progress').length

  if (needsMigration) {
    return (
      <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-sm text-amber-800">
        <strong>Migration needed:</strong> The <code className="bg-amber-100 px-1 rounded">job_plan_tasks</code> table doesn't
        exist yet. Run the SQL migration in Supabase SQL Editor (see instructions in the deployment notes).
      </div>
    )
  }

  return (
    <div className="space-y-4">

      {/* Top bar: stats + view toggle + add button */}
      <div className="flex flex-wrap items-center gap-2">
        {tasks.length > 0 && (
          <div className="flex items-center gap-2 text-xs flex-wrap">
            <span className="text-gray-500">{tasks.length} item{tasks.length !== 1 ? 's' : ''}</span>
            {inProg  > 0 && <span className="px-2 py-0.5 rounded-full bg-blue-100  text-blue-700  font-semibold">{inProg} in progress</span>}
            {overdue > 0 && <span className="px-2 py-0.5 rounded-full bg-red-100   text-red-700   font-semibold">{overdue} overdue</span>}
            {blocked > 0 && <span className="px-2 py-0.5 rounded-full bg-orange-100 text-orange-700 font-semibold">{blocked} blocked</span>}
            {completed > 0 && <span className="px-2 py-0.5 rounded-full bg-green-100 text-green-700 font-semibold">{completed} done</span>}
          </div>
        )}
        <div className="flex-1" />

        {/* View toggle */}
        <div className="flex items-center gap-0.5 rounded-xl border border-gray-200 bg-gray-50 p-0.5">
          <button onClick={() => setView('list')}
            className={`px-2.5 py-1 rounded-lg text-xs font-semibold flex items-center gap-1 transition-colors ${view === 'list' ? 'bg-white shadow-sm text-gray-900' : 'text-gray-500 hover:text-gray-700'}`}>
            <List size={11} /> List
          </button>
          <button onClick={() => setView('calendar')}
            className={`px-2.5 py-1 rounded-lg text-xs font-semibold flex items-center gap-1 transition-colors ${view === 'calendar' ? 'bg-white shadow-sm text-gray-900' : 'text-gray-500 hover:text-gray-700'}`}>
            <CalendarDays size={11} /> Calendar
          </button>
        </div>

        <button onClick={() => setModal({ task: null })}
          className="flex items-center gap-1.5 text-xs font-bold px-3 py-2 rounded-xl text-white shadow-sm hover:opacity-90 transition-opacity"
          style={{ background: '#2f5a5e' }}>
          <Plus size={12} /> Add Item
        </button>
      </div>

      {/* Content */}
      {loading ? (
        <div className="flex items-center justify-center py-8 text-gray-400 text-sm gap-2">
          <Loader2 size={14} className="animate-spin" /> Loading schedule…
        </div>
      ) : view === 'calendar' ? (
        <CalendarView
          tasks={tasks}
          onTaskClick={t => setModal({ task: t })}
          onDateClick={date => setModal({ task: null, defaultDate: date })}
        />
      ) : (
        <ListView tasks={tasks} onTaskClick={t => setModal({ task: t })} />
      )}

      {/* Add more — subtle dashed row */}
      {!loading && tasks.length > 0 && (
        <button onClick={() => setModal({ task: null })}
          className="w-full flex items-center justify-center gap-1.5 py-2.5 text-xs text-gray-400 font-semibold border-2 border-dashed border-gray-200 rounded-xl hover:border-teal-300 hover:text-teal-700 hover:bg-teal-50 transition-colors">
          <Plus size={12} /> Add another item
        </button>
      )}

      {/* Modal */}
      {modal && (
        <TaskModal
          task={modal.task}
          planId={planId}
          defaultDate={modal.defaultDate}
          onSave={onSave}
          onDelete={onDelete}
          onClose={() => setModal(null)}
        />
      )}
    </div>
  )
}
