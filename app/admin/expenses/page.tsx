'use client'
import { useEffect, useMemo, useState } from 'react'
import { Wallet, Plus, Search, X, Edit3, Trash2, Loader2, Sparkles, Briefcase, Home } from 'lucide-react'
import { adminFetch } from '@/lib/admin-fetch'
import { formatCurrency, monthlyEquivalent } from '@/lib/utils'
import { EXPENSE_CATEGORIES, EXPENSE_FREQUENCIES } from '@/lib/constants'

const BRAND = '#b8895a'

type Scope = 'business' | 'personal'
type Expense = {
  id: string; scope: Scope; name: string; category: string | null; amount: number; frequency: string
  next_due_date: string | null; vendor: string | null; matched_payee: string | null; notes: string | null; is_active: boolean
}
type Suggestion = { payee_key: string; payee_display: string; avg_amount: number; occurrences: number; frequency: string; last_date: string }

const freqLabel = (f: string) => EXPENSE_FREQUENCIES.find(x => x.value === f)?.label || f
const inputCls = 'w-full px-3 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:border-blue-400'

export default function ExpensesPage() {
  const [scope, setScope] = useState<Scope>('business')
  const [items, setItems] = useState<Expense[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [search, setSearch] = useState('')
  const [showInactive, setShowInactive] = useState(false)
  const [editing, setEditing] = useState<Partial<Expense> | null>(null)
  const [saving, setSaving] = useState(false)
  const [suggestions, setSuggestions] = useState<Suggestion[] | null>(null)
  const [suggesting, setSuggesting] = useState(false)

  async function load() {
    setLoading(true); setError('')
    try {
      const res = await adminFetch(`/api/expenses?scope=${scope}&includeInactive=true`)
      const d = await res.json()
      if (!res.ok) { setError(d.error || 'Failed to load'); setItems([]) }
      else setItems(Array.isArray(d) ? d : [])
    } catch { setError('Failed to load'); setItems([]) }
    setLoading(false)
  }
  useEffect(() => { setSuggestions(null); load() /* eslint-disable-next-line */ }, [scope])

  async function save(form: Partial<Expense>) {
    setSaving(true)
    const res = await adminFetch('/api/expenses', {
      method: form.id ? 'PATCH' : 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...form, scope: form.scope || scope }),
    })
    const d = await res.json().catch(() => ({}))
    setSaving(false)
    if (!res.ok) { alert(d.error || 'Save failed'); return }
    setEditing(null)
    await load()
  }

  async function remove(it: Expense) {
    if (!confirm(`Delete "${it.name}"?`)) return
    await adminFetch(`/api/expenses?id=${it.id}`, { method: 'DELETE' })
    await load()
  }

  async function toggleActive(it: Expense) {
    await adminFetch('/api/expenses', {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: it.id, is_active: !it.is_active }),
    })
    await load()
  }

  async function loadSuggestions() {
    setSuggesting(true)
    try {
      const res = await adminFetch('/api/expenses?action=suggest')
      const d = await res.json()
      if (!res.ok) alert(d.error || 'Could not scan bank transactions')
      else setSuggestions(d.suggestions || [])
    } catch { alert('Could not scan bank transactions') }
    setSuggesting(false)
  }

  async function importVault() {
    if (!confirm('Copy the recurring payments from the Account Vault into this list? (Passwords and logins are never copied.)')) return
    const res = await adminFetch('/api/expenses?action=import-vault', { method: 'POST' })
    const d = await res.json().catch(() => ({}))
    if (!res.ok) { alert(d.error || 'Import failed'); return }
    alert(`Imported ${d.imported} item${d.imported === 1 ? '' : 's'}${d.skipped ? ` (${d.skipped} already on your list)` : ''}.`)
    await load()
  }

  async function addSuggestion(s: Suggestion) {
    const res = await adminFetch('/api/expenses', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        scope: 'business', name: s.payee_display, amount: s.avg_amount, frequency: s.frequency,
        matched_payee: s.payee_key, notes: `Detected from bank transactions (${s.occurrences} charges, last ${s.last_date})`,
      }),
    })
    if (res.ok) {
      setSuggestions(prev => (prev || []).filter(x => x.payee_key !== s.payee_key))
      await load()
    }
  }

  const visible = useMemo(() => items.filter(i =>
    (showInactive || i.is_active) &&
    (!search || `${i.name} ${i.vendor || ''} ${i.category || ''}`.toLowerCase().includes(search.toLowerCase()))
  ), [items, search, showInactive])

  const active = items.filter(i => i.is_active)
  const monthly = active.reduce((s, i) => s + monthlyEquivalent(i.amount, i.frequency), 0)
  const oneTime = active.filter(i => i.frequency === 'one_time').reduce((s, i) => s + Number(i.amount), 0)

  const byCategory = useMemo(() => {
    const m = new Map<string, Expense[]>()
    visible.forEach(i => { const k = i.category || 'Uncategorized'; m.set(k, [...(m.get(k) || []), i]) })
    return Array.from(m.entries()).map(([cat, rows]) => ({
      cat, rows, monthly: rows.filter(r => r.is_active).reduce((s, r) => s + monthlyEquivalent(r.amount, r.frequency), 0),
    })).sort((a, b) => b.monthly - a.monthly)
  }, [visible])
  const topCat = byCategory[0]
  const maxCat = Math.max(1, ...byCategory.map(c => c.monthly))

  return (
    <div className="p-6 md:p-8 pt-16 md:pt-8">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
        <div>
          <h1 className="text-2xl font-extrabold text-gray-900 flex items-center gap-2"><Wallet size={24} style={{ color: BRAND }} /> Expenses</h1>
          <p className="text-gray-500 text-sm mt-0.5">Everything that goes out every month — what it costs to keep things running.</p>
        </div>
        <div className="flex items-center gap-2">
          {scope === 'business' && (
            <button onClick={importVault}
              className="flex items-center gap-2 text-sm font-semibold px-4 py-2.5 rounded-xl border border-gray-200 text-gray-700 hover:bg-gray-50">
              Import from Vault
            </button>
          )}
          {scope === 'business' && (
            <button onClick={loadSuggestions} disabled={suggesting}
              className="flex items-center gap-2 text-sm font-semibold px-4 py-2.5 rounded-xl border border-gray-200 text-gray-700 hover:bg-gray-50 disabled:opacity-60">
              {suggesting ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />} Suggest from Bank
            </button>
          )}
          <button onClick={() => setEditing({ scope, frequency: 'monthly', amount: 0 })}
            className="flex items-center gap-2 text-white font-semibold px-4 py-2.5 rounded-xl shadow-md" style={{ background: BRAND }}>
            <Plus size={15} /> Add Expense
          </button>
        </div>
      </div>

      <div className="flex gap-1 bg-gray-100 rounded-xl p-1 w-fit mb-6">
        {([['business', 'Operating Expenses', Briefcase], ['personal', 'Personal', Home]] as const).map(([k, label, Icon]) => (
          <button key={k} onClick={() => setScope(k)}
            className={`px-5 py-2.5 rounded-lg text-sm font-semibold transition-all flex items-center gap-2 ${scope === k ? 'bg-white shadow-sm text-gray-900' : 'text-gray-500'}`}>
            <Icon size={15} /> {label}
          </button>
        ))}
      </div>

      {error && <div className="mb-4 bg-red-50 border border-red-100 text-red-700 text-sm px-4 py-3 rounded-xl">{error}</div>}

      {suggestions && (
        <div className="mb-6 bg-white rounded-2xl shadow-sm border border-amber-200 overflow-hidden">
          <div className="px-5 py-3 border-b border-amber-100 bg-amber-50 flex items-center justify-between">
            <span className="text-xs font-bold text-amber-800 uppercase tracking-wider">Repeating charges found in your bank transactions</span>
            <button onClick={() => setSuggestions(null)} className="text-amber-700 hover:text-amber-900"><X size={14} /></button>
          </div>
          {suggestions.length === 0 ? (
            <p className="px-5 py-4 text-sm text-gray-500">Nothing new found — everything that repeats is already on your list.</p>
          ) : (
            <div className="divide-y divide-gray-50 max-h-72 overflow-y-auto">
              {suggestions.map(s => (
                <div key={s.payee_key} className="px-5 py-2.5 flex items-center gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-semibold text-gray-900 truncate">{s.payee_display}</div>
                    <div className="text-xs text-gray-500">{freqLabel(s.frequency)} · {s.occurrences} charges · last {s.last_date}</div>
                  </div>
                  <div className="text-sm font-bold text-gray-800">{formatCurrency(s.avg_amount)}</div>
                  <button onClick={() => addSuggestion(s)} className="text-xs font-bold px-3 py-1.5 rounded-lg text-white" style={{ background: BRAND }}>+ Add</button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <Stat label="Per month" value={formatCurrency(monthly)} accent={BRAND} />
        <Stat label="Per year" value={formatCurrency(monthly * 12)} accent="#1D6F42" />
        <Stat label="Active items" value={String(active.length)} accent="#6b7280" />
        <Stat label="Biggest category" value={topCat ? topCat.cat : '—'} sub={topCat ? `${formatCurrency(topCat.monthly)}/mo` : undefined} accent="#b45309" />
      </div>
      {oneTime > 0 && <p className="text-xs text-gray-400 -mt-3 mb-5">One-time items ({formatCurrency(oneTime)}) are listed but not counted in the monthly/yearly totals.</p>}

      <div className="flex flex-wrap items-center gap-3 mb-4">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search…" className={`${inputCls} pl-9 py-2`} />
        </div>
        <label className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer">
          <input type="checkbox" checked={showInactive} onChange={e => setShowInactive(e.target.checked)} /> Show inactive
        </label>
      </div>

      {loading ? (
        <div className="flex justify-center py-16"><Loader2 size={26} className="animate-spin" style={{ color: BRAND }} /></div>
      ) : visible.length === 0 ? (
        <div className="text-center py-16 text-gray-400">
          <Wallet size={30} className="mx-auto mb-2 opacity-30" />
          <p className="text-sm">{items.length === 0 ? `No ${scope === 'business' ? 'operating' : 'personal'} expenses yet` : 'Nothing matches your search'}</p>
          {items.length === 0 && <p className="text-xs mt-1">Click "Add Expense" to start your list{scope === 'business' ? ', or "Suggest from Bank"' : ''}.</p>}
        </div>
      ) : (
        <div className="space-y-5">
          {byCategory.map(({ cat, rows, monthly: catMonthly }) => (
            <div key={cat} className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
              <div className="px-5 py-3 border-b bg-gray-50 flex items-center gap-3">
                <span className="text-xs font-bold text-gray-600 uppercase tracking-wider flex-1">{cat}</span>
                <div className="hidden sm:block w-32 h-1.5 rounded-full bg-gray-200 overflow-hidden">
                  <div className="h-full rounded-full" style={{ width: `${(catMonthly / maxCat) * 100}%`, background: BRAND }} />
                </div>
                <span className="text-sm font-bold text-gray-800 w-28 text-right">{formatCurrency(catMonthly)}/mo</span>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-[11px] text-gray-500 uppercase tracking-wider">
                      <th className="text-left px-5 py-2 font-semibold">Name</th>
                      <th className="text-left px-3 py-2 font-semibold">Repeats</th>
                      <th className="text-right px-3 py-2 font-semibold">Amount</th>
                      <th className="text-right px-3 py-2 font-semibold">Per month</th>
                      <th className="text-left px-3 py-2 font-semibold">Next due</th>
                      <th className="px-3 py-2" />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {rows.map(it => (
                      <tr key={it.id} className={`hover:bg-gray-50 ${it.is_active ? '' : 'opacity-50'}`}>
                        <td className="px-5 py-2.5">
                          <div className="font-semibold text-gray-900">{it.name}</div>
                          {(it.vendor || it.notes) && <div className="text-xs text-gray-400 truncate max-w-xs">{[it.vendor, it.notes].filter(Boolean).join(' · ')}</div>}
                        </td>
                        <td className="px-3 py-2.5 text-gray-600 whitespace-nowrap">{freqLabel(it.frequency)}</td>
                        <td className="px-3 py-2.5 text-right font-mono">{formatCurrency(Number(it.amount))}</td>
                        <td className="px-3 py-2.5 text-right font-mono font-bold text-gray-800">{it.frequency === 'one_time' ? '—' : formatCurrency(monthlyEquivalent(it.amount, it.frequency))}</td>
                        <td className="px-3 py-2.5 text-gray-500 whitespace-nowrap">{it.next_due_date || '—'}</td>
                        <td className="px-3 py-2.5">
                          <div className="flex items-center justify-end gap-1">
                            <button onClick={() => toggleActive(it)} className="text-[11px] font-semibold text-gray-400 hover:text-gray-700 px-1.5">{it.is_active ? 'Pause' : 'Resume'}</button>
                            <button onClick={() => setEditing(it)} className="p-1.5 text-gray-400 hover:text-blue-600"><Edit3 size={14} /></button>
                            <button onClick={() => remove(it)} className="p-1.5 text-gray-400 hover:text-red-600"><Trash2 size={14} /></button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ))}
        </div>
      )}

      {editing && <EditModal item={editing} saving={saving} onClose={() => setEditing(null)} onSave={save} />}
    </div>
  )
}

function Stat({ label, value, sub, accent }: { label: string; value: string; sub?: string; accent: string }) {
  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4">
      <div className="text-[10px] uppercase tracking-wider font-bold text-gray-500">{label}</div>
      <div className="text-2xl font-extrabold mt-1 truncate" style={{ color: accent }}>{value}</div>
      {sub && <div className="text-xs text-gray-400 mt-0.5">{sub}</div>}
    </div>
  )
}

function EditModal({ item, saving, onClose, onSave }: { item: Partial<Expense>; saving: boolean; onClose: () => void; onSave: (f: Partial<Expense>) => void }) {
  const [f, setF] = useState<Partial<Expense>>(item)
  const scope = (f.scope || 'business') as Scope
  const set = (p: Partial<Expense>) => setF(prev => ({ ...prev, ...p }))
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-6 py-4 border-b">
          <h3 className="text-lg font-extrabold text-gray-900">{f.id ? 'Edit Expense' : 'Add Expense'}</h3>
          <button onClick={onClose}><X size={18} className="text-gray-400" /></button>
        </div>
        <form onSubmit={e => { e.preventDefault(); onSave(f) }} className="p-6 grid grid-cols-2 gap-3">
          <div className="col-span-2">
            <label className="block text-sm font-semibold text-gray-700 mb-1">Name *</label>
            <input required value={f.name || ''} onChange={e => set({ name: e.target.value })} className={inputCls}
              placeholder={scope === 'business' ? 'e.g. QuickBooks, shop rent, liability insurance' : 'e.g. Mortgage, Spotify, car payment'} />
          </div>
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1">Amount *</label>
            <input required type="number" min="0" step="0.01" value={f.amount ?? ''} onChange={e => set({ amount: e.target.value as any })} className={inputCls} />
          </div>
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1">Repeats</label>
            <select value={f.frequency || 'monthly'} onChange={e => set({ frequency: e.target.value })} className={`${inputCls} bg-white`}>
              {EXPENSE_FREQUENCIES.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1">Category</label>
            <input list="expense-cats" value={f.category || ''} onChange={e => set({ category: e.target.value })} className={inputCls} placeholder="Pick or type" />
            <datalist id="expense-cats">{EXPENSE_CATEGORIES[scope].map(c => <option key={c} value={c} />)}</datalist>
          </div>
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1">Next due</label>
            <input type="date" value={f.next_due_date || ''} onChange={e => set({ next_due_date: e.target.value })} className={inputCls} />
          </div>
          <div className="col-span-2">
            <label className="block text-sm font-semibold text-gray-700 mb-1">Vendor / paid to</label>
            <input value={f.vendor || ''} onChange={e => set({ vendor: e.target.value })} className={inputCls} />
          </div>
          <div className="col-span-2">
            <label className="block text-sm font-semibold text-gray-700 mb-1">Notes</label>
            <textarea rows={2} value={f.notes || ''} onChange={e => set({ notes: e.target.value })} className={inputCls} />
          </div>
          <div className="col-span-2 flex justify-end gap-2 pt-2">
            <button type="button" onClick={onClose} className="px-4 py-2 rounded-xl text-sm font-semibold text-gray-600 hover:bg-gray-100">Cancel</button>
            <button type="submit" disabled={saving} className="px-5 py-2 rounded-xl text-white text-sm font-bold disabled:opacity-60 flex items-center gap-2" style={{ background: BRAND }}>
              {saving && <Loader2 size={14} className="animate-spin" />} {f.id ? 'Save Changes' : 'Add Expense'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
