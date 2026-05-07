'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Sparkles, Loader2, RefreshCw, CheckCircle2, Circle, ArrowRight, AlertCircle, Calendar, FileText, BookOpen, Users, Plus, X, Trash2 } from 'lucide-react'

interface Todo {
  id: string
  priority: 'high' | 'medium' | 'low'
  category: 'invoicing' | 'scheduling' | 'bookkeeping' | 'follow-up'
  title: string
  description: string
  action_url?: string
}

interface Context {
  overdue_invoices: number
  draft_invoices: number
  upcoming_appointments: number
  uncategorized_transactions: number
}

const PRIORITY_STYLES = {
  high:   { dot: 'bg-red-500',    badge: 'bg-red-50 text-red-700 border-red-200',    label: 'High' },
  medium: { dot: 'bg-amber-400',  badge: 'bg-amber-50 text-amber-700 border-amber-200', label: 'Medium' },
  low:    { dot: 'bg-gray-300',   badge: 'bg-gray-50 text-gray-600 border-gray-200', label: 'Low' },
}

const CATEGORY_STYLES: Record<string, { icon: any; color: string; bg: string }> = {
  invoicing:   { icon: FileText,  color: 'text-blue-600',  bg: 'bg-blue-50' },
  scheduling:  { icon: Calendar,  color: 'text-purple-600', bg: 'bg-purple-50' },
  bookkeeping: { icon: BookOpen,  color: 'text-green-600', bg: 'bg-green-50' },
  'follow-up': { icon: Users,     color: 'text-orange-600', bg: 'bg-orange-50' },
}

interface MyTodo {
  id: string
  title: string
  description: string | null
  priority: string
  category: string
  action_url: string | null
  status: string
  source: string
  source_ref: string | null
  due_date: string | null
  assigned_to_user_id: string | null
  assigned_to_name: string | null
}

interface TeamMember {
  user_id: string
  email: string
  display_name: string | null
  role: string
}

export default function TodoPage() {
  const router = useRouter()
  const [todos, setTodos] = useState<Todo[]>([])
  const [done, setDone] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState(false)
  const [context, setContext] = useState<Context | null>(null)
  const [generatedAt, setGeneratedAt] = useState<string | null>(null)
  const [error, setError] = useState('')

  // Persistent todos from DB
  const [myTodos, setMyTodos] = useState<MyTodo[]>([])
  const [showAdd, setShowAdd] = useState(false)
  const [addForm, setAddForm] = useState({ title: '', description: '', priority: 'medium', category: 'general', due_date: '', assigned_to_user_id: '' })
  const [savingTodo, setSavingTodo] = useState(false)
  const [addedRefs, setAddedRefs] = useState<Set<string>>(new Set())
  const [team, setTeam] = useState<TeamMember[]>([])

  // Filter state
  const [statusFilter, setStatusFilter] = useState<'pending' | 'all' | 'done'>('pending')
  const [categoryFilter, setCategoryFilter] = useState('all')
  const [priorityFilter, setPriorityFilter] = useState('all')

  async function loadTeam() {
    try {
      const res = await fetch('/api/user-roles')
      if (res.ok) {
        const d = await res.json()
        setTeam(Array.isArray(d) ? d : [])
      }
    } catch {}
  }

  async function loadMyTodos() {
    try {
      const res = await fetch('/api/todos')
      if (!res.ok) return
      const d = await res.json()
      setMyTodos(Array.isArray(d) ? d : [])
      setAddedRefs(new Set((Array.isArray(d) ? d : []).map((t: MyTodo) => t.source_ref).filter(Boolean) as string[]))
    } catch {}
  }

  useEffect(() => { loadMyTodos(); loadTeam() }, [])

  async function addAITodoToList(t: Todo) {
    const res = await fetch('/api/todos', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: t.title,
        description: t.description,
        priority: t.priority,
        category: t.category,
        action_url: t.action_url,
        source: 'ai',
        source_ref: t.id,
      }),
    })
    if (res.ok) {
      setAddedRefs(prev => new Set(prev).add(t.id))
      await loadMyTodos()
    }
  }

  async function createManualTodo() {
    if (!addForm.title) return
    setSavingTodo(true)
    try {
      const member = team.find(m => m.user_id === addForm.assigned_to_user_id)
      await fetch('/api/todos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...addForm,
          due_date: addForm.due_date || null,
          source: 'manual',
          assigned_to_user_id: addForm.assigned_to_user_id || null,
          assigned_to_name: member?.display_name || member?.email || null,
        }),
      })
      await loadMyTodos()
      setShowAdd(false)
      setAddForm({ title: '', description: '', priority: 'medium', category: 'general', due_date: '', assigned_to_user_id: '' })
    } finally { setSavingTodo(false) }
  }

  async function reassignTodo(todoId: string, userId: string) {
    const member = team.find(m => m.user_id === userId)
    await fetch('/api/todos', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: todoId,
        assigned_to_user_id: userId || null,
        assigned_to_name: member?.display_name || member?.email || null,
      }),
    })
    setMyTodos(prev => prev.map(x => x.id === todoId ? { ...x, assigned_to_user_id: userId || null, assigned_to_name: member?.display_name || member?.email || null } : x))
  }

  async function toggleMyTodo(t: MyTodo) {
    const newStatus = t.status === 'done' ? 'open' : 'done'
    await fetch('/api/todos', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: t.id, status: newStatus }),
    })
    setMyTodos(prev => prev.map(x => x.id === t.id ? { ...x, status: newStatus } : x))
  }

  async function deleteMyTodo(id: string) {
    if (!confirm('Delete this todo?')) return
    await fetch(`/api/todos?id=${id}`, { method: 'DELETE' })
    setMyTodos(prev => prev.filter(x => x.id !== id))
  }

  // Load cached todos from localStorage on mount
  useEffect(() => {
    try {
      const cached = localStorage.getItem('ai_todos_cache')
      const cachedDone = localStorage.getItem('ai_todos_done')
      if (cached) {
        const { todos: t, context: c, generated_at } = JSON.parse(cached)
        setTodos(t || [])
        setContext(c || null)
        setGeneratedAt(generated_at || null)
      }
      if (cachedDone) setDone(new Set(JSON.parse(cachedDone)))
    } catch {}
  }, [])

  async function refresh() {
    setLoading(true)
    setError('')
    try {
      const res = await fetch('/api/ai-todo')
      if (!res.ok) throw new Error('Failed to generate todos')
      const data = await res.json()
      setTodos(data.todos || [])
      setContext(data.context || null)
      setGeneratedAt(data.generated_at || new Date().toISOString())
      // Cache in localStorage
      localStorage.setItem('ai_todos_cache', JSON.stringify({
        todos: data.todos,
        context: data.context,
        generated_at: data.generated_at,
      }))
      // Clear done state on refresh
      setDone(new Set())
      localStorage.removeItem('ai_todos_done')
    } catch (e: any) {
      setError(e.message || 'Failed to generate todos')
    } finally {
      setLoading(false)
    }
  }

  function toggleDone(id: string) {
    setDone(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      localStorage.setItem('ai_todos_done', JSON.stringify(Array.from(next)))
      return next
    })
  }

  const active = todos.filter(t => !done.has(t.id))
  const completed = todos.filter(t => done.has(t.id))

  const highCount = active.filter(t => t.priority === 'high').length
  const medCount  = active.filter(t => t.priority === 'medium').length
  const lowCount  = active.filter(t => t.priority === 'low').length

  return (
    <div className="p-6 md:p-8 pt-16 md:pt-8 max-w-3xl">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Sparkles size={22} style={{ color: '#b8895a' }} />
            <h1 className="text-2xl font-extrabold text-gray-900">Todo List</h1>
          </div>
          <p className="text-gray-500 text-sm">
            Your tasks plus AI-generated action items based on invoices, calendar, and bookkeeping
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => { setAddForm({ title: '', description: '', priority: 'medium', category: 'general', due_date: '', assigned_to_user_id: '' }); setShowAdd(true) }}
            className="flex items-center gap-2 border border-gray-200 text-gray-700 font-semibold px-3 py-2.5 rounded-xl hover:bg-gray-50">
            <Plus size={15} /> Add Todo
          </button>
          <button
            onClick={refresh}
            disabled={loading}
            className="flex items-center gap-2 text-white font-semibold px-4 py-2.5 rounded-xl shadow-md disabled:opacity-60"
            style={{ background: '#b8895a' }}>
            {loading ? <Loader2 size={15} className="animate-spin" /> : <RefreshCw size={15} />}
            {loading ? 'Analyzing…' : 'Refresh'}
          </button>
        </div>
      </div>

      {/* Context summary */}
      {context && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
          {[
            { label: 'Overdue Invoices', value: context.overdue_invoices, color: context.overdue_invoices > 0 ? 'text-red-600' : 'text-gray-500', bg: context.overdue_invoices > 0 ? 'bg-red-50 border-red-100' : 'bg-gray-50 border-gray-100' },
            { label: 'Draft Invoices', value: context.draft_invoices, color: 'text-amber-600', bg: 'bg-amber-50 border-amber-100' },
            { label: 'Upcoming Appts', value: context.upcoming_appointments, color: 'text-purple-600', bg: 'bg-purple-50 border-purple-100' },
            { label: 'Uncategorized Txns', value: context.uncategorized_transactions, color: context.uncategorized_transactions > 0 ? 'text-orange-600' : 'text-gray-500', bg: 'bg-orange-50 border-orange-100' },
          ].map(({ label, value, color, bg }) => (
            <div key={label} className={`rounded-xl border p-3 ${bg}`}>
              <div className={`text-xl font-extrabold ${color}`}>{value}</div>
              <div className="text-xs text-gray-500 mt-0.5">{label}</div>
            </div>
          ))}
        </div>
      )}

      {/* Generated at */}
      {generatedAt && (
        <p className="text-xs text-gray-400 mb-4">
          Last analyzed: {new Date(generatedAt).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}
          {active.length > 0 && <> · <span className="font-semibold">{highCount > 0 && `${highCount} high`}{medCount > 0 && `${highCount > 0 ? ', ' : ''}${medCount} medium`}{lowCount > 0 && `${(highCount > 0 || medCount > 0) ? ', ' : ''}${lowCount} low`} priority remaining</span></>}
        </p>
      )}

      {/* Error */}
      {error && (
        <div className="flex items-center gap-2 text-sm text-red-600 bg-red-50 border border-red-100 rounded-xl px-4 py-3 mb-4">
          <AlertCircle size={15} />
          {error}
        </div>
      )}

      {/* Filter pills */}
      {myTodos.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 mb-4">
          <div className="flex gap-1 bg-gray-100 rounded-xl p-1">
            {(['pending', 'all', 'done'] as const).map(s => (
              <button key={s} onClick={() => setStatusFilter(s)}
                className={`px-3 py-1.5 text-xs font-semibold rounded-lg capitalize ${statusFilter === s ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>
                {s}
              </button>
            ))}
          </div>
          <select value={categoryFilter} onChange={e => setCategoryFilter(e.target.value)}
            className="px-3 py-1.5 text-xs rounded-lg border border-gray-200 focus:outline-none">
            <option value="all">All categories</option>
            <option value="general">General</option>
            <option value="invoicing">Invoicing</option>
            <option value="scheduling">Scheduling</option>
            <option value="bookkeeping">Bookkeeping</option>
            <option value="follow-up">Follow-up</option>
          </select>
          <select value={priorityFilter} onChange={e => setPriorityFilter(e.target.value)}
            className="px-3 py-1.5 text-xs rounded-lg border border-gray-200 focus:outline-none">
            <option value="all">All priorities</option>
            <option value="high">High</option>
            <option value="medium">Medium</option>
            <option value="low">Low</option>
          </select>
        </div>
      )}

      {/* My Todos (persistent) */}
      {myTodos.length > 0 && (() => {
        const filtered = myTodos.filter(t => {
          if (statusFilter === 'pending' && t.status !== 'open') return false
          if (statusFilter === 'done' && t.status !== 'done') return false
          if (categoryFilter !== 'all' && t.category !== categoryFilter) return false
          if (priorityFilter !== 'all' && t.priority !== priorityFilter) return false
          return true
        })
        return (
        <div className="mb-6">
          <div className="flex items-center justify-between mb-2">
            <h2 className="text-sm font-bold text-gray-700 uppercase tracking-wider">My Todos ({filtered.length})</h2>
          </div>
          {filtered.length === 0 ? (
            <div className="bg-white rounded-2xl border border-gray-100 p-8 text-center">
              <CheckCircle2 size={28} className="mx-auto mb-2 text-green-500" />
              <p className="text-sm font-semibold text-gray-700">No tasks here</p>
              <p className="text-xs text-gray-500">Adjust filters or add a new task.</p>
            </div>
          ) : (
          <div className="space-y-2">
            {filtered.map(t => {
              const cat = CATEGORY_STYLES[t.category] || CATEGORY_STYLES.invoicing
              const ps = PRIORITY_STYLES[t.priority as keyof typeof PRIORITY_STYLES] || PRIORITY_STYLES.medium
              const isDone = t.status === 'done'
              return (
                <div key={t.id} className={`bg-white border border-gray-100 rounded-2xl p-3.5 shadow-sm flex items-start gap-3 ${isDone ? 'opacity-60' : ''}`}>
                  <button onClick={() => toggleMyTodo(t)} className={`mt-0.5 flex-shrink-0 transition-colors ${isDone ? 'text-green-500' : 'text-gray-300 hover:text-green-500'}`}>
                    {isDone ? <CheckCircle2 size={20} /> : <Circle size={20} />}
                  </button>
                  <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2 mb-0.5">
                      <span className={`text-xs font-semibold px-2 py-0.5 rounded-full border ${ps.badge}`}>{ps.label}</span>
                      <span className={`text-xs font-medium ${cat.color} flex items-center gap-1`}>{t.category}</span>
                      {t.source === 'ai' && <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-purple-50 text-purple-600 font-bold">AI</span>}
                      {t.due_date && <span className="text-[10px] text-gray-500">Due {new Date(t.due_date + 'T00:00:00').toLocaleDateString()}</span>}
                      {team.length > 0 && (
                        <select value={t.assigned_to_user_id || ''} onChange={e => reassignTodo(t.id, e.target.value)}
                          onClick={e => e.stopPropagation()}
                          className="text-[10px] px-1.5 py-0.5 rounded-full bg-blue-50 text-blue-700 border border-blue-100 focus:outline-none">
                          <option value="">Unassigned</option>
                          {team.map(m => (
                            <option key={m.user_id} value={m.user_id}>{m.display_name || m.email}</option>
                          ))}
                        </select>
                      )}
                    </div>
                    <h3 className={`text-sm font-bold text-gray-900 ${isDone ? 'line-through' : ''}`}>{t.title}</h3>
                    {t.description && <p className="text-xs text-gray-600 mt-0.5">{t.description}</p>}
                  </div>
                  <div className="flex items-center gap-1 flex-shrink-0">
                    {t.action_url && !isDone && (
                      <button onClick={() => router.push(t.action_url!)} className="px-2 py-1 rounded-lg bg-blue-50 text-blue-600 text-xs font-bold hover:bg-blue-100 flex items-center gap-1">
                        Go <ArrowRight size={11} />
                      </button>
                    )}
                    <button onClick={() => deleteMyTodo(t.id)} className="p-1.5 text-gray-400 hover:text-red-600 rounded-lg hover:bg-red-50">
                      <Trash2 size={13} />
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
          )}
        </div>
        )
      })()}

      {todos.length > 0 && (
        <div className="flex items-center gap-2 mb-2 mt-2">
          <Sparkles size={14} className="text-purple-600" />
          <h2 className="text-sm font-bold text-gray-700 uppercase tracking-wider">AI Suggestions</h2>
        </div>
      )}

      {/* Empty state */}
      {!loading && todos.length === 0 && !error && myTodos.length === 0 && (
        <div className="text-center py-20 text-gray-400">
          <Sparkles size={32} className="mx-auto mb-3 opacity-30" />
          <p className="text-sm font-medium">No todos yet</p>
          <p className="text-xs mt-1 mb-5">Add a task manually or let AI analyze your business data</p>
          <div className="flex gap-2 justify-center">
            <button
              onClick={() => { setAddForm({ title: '', description: '', priority: 'medium', category: 'general', due_date: '', assigned_to_user_id: '' }); setShowAdd(true) }}
              className="border border-gray-200 text-gray-700 font-semibold px-5 py-2.5 rounded-xl hover:bg-gray-50 flex items-center gap-2">
              <Plus size={15} />Add Todo
            </button>
            <button
              onClick={refresh}
              className="text-white font-semibold px-5 py-2.5 rounded-xl shadow-md flex items-center gap-2"
              style={{ background: '#b8895a' }}>
              <Sparkles size={15} />Generate AI Todos
            </button>
          </div>
        </div>
      )}

      {/* Active todos */}
      {active.length > 0 && (
        <div className="space-y-3 mb-6">
          {['high', 'medium', 'low'].map(priority => {
            const items = active.filter(t => t.priority === priority)
            if (items.length === 0) return null
            const ps = PRIORITY_STYLES[priority as keyof typeof PRIORITY_STYLES]
            return (
              <div key={priority}>
                <div className="flex items-center gap-2 mb-2">
                  <div className={`w-2 h-2 rounded-full ${ps.dot}`} />
                  <span className="text-xs font-bold text-gray-500 uppercase tracking-wider">{ps.label} Priority</span>
                </div>
                <div className="space-y-2">
                  {items.map(todo => {
                    const cat = CATEGORY_STYLES[todo.category] || CATEGORY_STYLES.invoicing
                    const CatIcon = cat.icon
                    return (
                      <div key={todo.id} className="bg-white border border-gray-100 rounded-2xl p-4 shadow-sm hover:shadow-md transition-shadow">
                        <div className="flex items-start gap-3">
                          <button
                            onClick={() => toggleDone(todo.id)}
                            className="mt-0.5 flex-shrink-0 text-gray-300 hover:text-green-500 transition-colors">
                            <Circle size={20} />
                          </button>
                          <div className="flex-1 min-w-0">
                            <div className="flex flex-wrap items-center gap-2 mb-1">
                              <span className={`text-xs px-2 py-0.5 rounded-full border font-semibold ${ps.badge}`}>{ps.label}</span>
                              <span className={`flex items-center gap-1 text-xs px-2 py-0.5 rounded-full font-medium ${cat.bg} ${cat.color}`}>
                                <CatIcon size={10} />
                                {todo.category}
                              </span>
                            </div>
                            <p className="font-semibold text-gray-900 text-sm">{todo.title}</p>
                            <p className="text-xs text-gray-500 mt-0.5 leading-relaxed">{todo.description}</p>
                          </div>
                          <div className="flex flex-col gap-1.5 flex-shrink-0">
                            {addedRefs.has(todo.id) ? (
                              <span className="flex items-center gap-1 text-xs px-2.5 py-1 rounded-lg bg-green-50 text-green-700 font-bold whitespace-nowrap">
                                <CheckCircle2 size={11} />Added
                              </span>
                            ) : (
                              <button
                                onClick={() => addAITodoToList(todo)}
                                className="flex items-center gap-1 text-xs font-bold px-2.5 py-1.5 rounded-lg bg-blue-50 text-blue-700 hover:bg-blue-100 whitespace-nowrap"
                                title="Add to my todo list">
                                <Plus size={11} />Add
                              </button>
                            )}
                            {todo.action_url && (
                              <button
                                onClick={() => router.push(todo.action_url!)}
                                className="flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded-lg border hover:bg-gray-50 whitespace-nowrap"
                                style={{ borderColor: '#b8895a', color: '#b8895a' }}>
                                Go <ArrowRight size={11} />
                              </button>
                            )}
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Completed todos */}
      {completed.length > 0 && (
        <div>
          <div className="flex items-center gap-2 mb-2">
            <CheckCircle2 size={14} className="text-green-500" />
            <span className="text-xs font-bold text-gray-400 uppercase tracking-wider">Completed ({completed.length})</span>
          </div>
          <div className="space-y-2">
            {completed.map(todo => (
              <div key={todo.id} className="bg-gray-50 border border-gray-100 rounded-2xl p-4 opacity-60">
                <div className="flex items-center gap-3">
                  <button
                    onClick={() => toggleDone(todo.id)}
                    className="flex-shrink-0 text-green-500 hover:text-gray-300 transition-colors">
                    <CheckCircle2 size={20} />
                  </button>
                  <p className="text-sm text-gray-500 line-through">{todo.title}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Add Todo modal */}
      {showAdd && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
              <h3 className="text-base font-extrabold text-gray-900">Add Todo</h3>
              <button onClick={() => setShowAdd(false)}><X size={18} className="text-gray-400" /></button>
            </div>
            <div className="p-5 space-y-3">
              <div>
                <label className="text-xs font-semibold text-gray-600 mb-1 block">Title *</label>
                <input value={addForm.title} onChange={e => setAddForm(p => ({ ...p, title: e.target.value }))}
                  autoFocus className="w-full px-3 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:border-blue-400" />
              </div>
              <div>
                <label className="text-xs font-semibold text-gray-600 mb-1 block">Description</label>
                <textarea value={addForm.description} onChange={e => setAddForm(p => ({ ...p, description: e.target.value }))}
                  rows={3} className="w-full px-3 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:border-blue-400" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold text-gray-600 mb-1 block">Priority</label>
                  <select value={addForm.priority} onChange={e => setAddForm(p => ({ ...p, priority: e.target.value }))}
                    className="w-full px-3 py-2.5 rounded-xl border border-gray-200 text-sm">
                    <option value="high">High</option>
                    <option value="medium">Medium</option>
                    <option value="low">Low</option>
                  </select>
                </div>
                <div>
                  <label className="text-xs font-semibold text-gray-600 mb-1 block">Category</label>
                  <select value={addForm.category} onChange={e => setAddForm(p => ({ ...p, category: e.target.value }))}
                    className="w-full px-3 py-2.5 rounded-xl border border-gray-200 text-sm">
                    <option value="general">General</option>
                    <option value="invoicing">Invoicing</option>
                    <option value="scheduling">Scheduling</option>
                    <option value="bookkeeping">Bookkeeping</option>
                    <option value="follow-up">Follow-up</option>
                  </select>
                </div>
              </div>
              <div>
                <label className="text-xs font-semibold text-gray-600 mb-1 block">Due Date (optional)</label>
                <input type="date" value={addForm.due_date} onChange={e => setAddForm(p => ({ ...p, due_date: e.target.value }))}
                  className="w-full px-3 py-2.5 rounded-xl border border-gray-200 text-sm" />
              </div>
              <div>
                <label className="text-xs font-semibold text-gray-600 mb-1 block">Assign To</label>
                <select value={addForm.assigned_to_user_id} onChange={e => setAddForm(p => ({ ...p, assigned_to_user_id: e.target.value }))}
                  className="w-full px-3 py-2.5 rounded-xl border border-gray-200 text-sm">
                  <option value="">Unassigned</option>
                  {team.map(m => (
                    <option key={m.user_id} value={m.user_id}>{m.display_name || m.email}{m.role !== 'admin' ? ` (${m.role})` : ''}</option>
                  ))}
                </select>
                {team.length === 0 && (
                  <p className="text-xs text-gray-400 mt-1">No team members loaded — add users in User Management first.</p>
                )}
              </div>
            </div>
            <div className="flex justify-end gap-2 px-5 py-3 border-t border-gray-100">
              <button onClick={() => setShowAdd(false)} className="px-4 py-2 rounded-xl text-sm font-semibold text-gray-600 hover:bg-gray-100">Cancel</button>
              <button onClick={createManualTodo} disabled={savingTodo || !addForm.title}
                className="px-5 py-2 rounded-xl text-white text-sm font-bold disabled:opacity-50" style={{ background:'#b8895a' }}>
                {savingTodo ? 'Adding…' : 'Add Todo'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
