'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Sparkles, Loader2, RefreshCw, CheckCircle2, Circle, ArrowRight, AlertCircle, Calendar, FileText, BookOpen, Users } from 'lucide-react'

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

export default function TodoPage() {
  const router = useRouter()
  const [todos, setTodos] = useState<Todo[]>([])
  const [done, setDone] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState(false)
  const [context, setContext] = useState<Context | null>(null)
  const [generatedAt, setGeneratedAt] = useState<string | null>(null)
  const [error, setError] = useState('')

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
            <Sparkles size={22} style={{ color: '#185FA5' }} />
            <h1 className="text-2xl font-extrabold text-gray-900">AI Todo List</h1>
          </div>
          <p className="text-gray-500 text-sm">
            AI-generated action items based on your invoices, calendar, and bookkeeping
          </p>
        </div>
        <button
          onClick={refresh}
          disabled={loading}
          className="flex items-center gap-2 text-white font-semibold px-4 py-2.5 rounded-xl shadow-md disabled:opacity-60"
          style={{ background: '#185FA5' }}>
          {loading ? <Loader2 size={15} className="animate-spin" /> : <RefreshCw size={15} />}
          {loading ? 'Analyzing…' : 'Refresh'}
        </button>
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

      {/* Empty state */}
      {!loading && todos.length === 0 && !error && (
        <div className="text-center py-20 text-gray-400">
          <Sparkles size={32} className="mx-auto mb-3 opacity-30" />
          <p className="text-sm font-medium">No todos yet</p>
          <p className="text-xs mt-1 mb-5">Click "Refresh" to let AI analyze your business data</p>
          <button
            onClick={refresh}
            className="text-white font-semibold px-6 py-2.5 rounded-xl shadow-md"
            style={{ background: '#185FA5' }}>
            Generate Todos
          </button>
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
                          {todo.action_url && (
                            <button
                              onClick={() => router.push(todo.action_url!)}
                              className="flex-shrink-0 flex items-center gap-1 text-xs font-semibold px-3 py-1.5 rounded-lg border hover:bg-blue-50 transition-colors whitespace-nowrap"
                              style={{ borderColor: '#185FA5', color: '#185FA5' }}>
                              Go <ArrowRight size={11} />
                            </button>
                          )}
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
    </div>
  )
}
