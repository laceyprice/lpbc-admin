'use client'
import { useEffect, useMemo, useState } from 'react'
import { Plus, Trash2, Edit3, Loader2, X, Eye, EyeOff, Copy, Check, Search, Wand2, KeyRound, Repeat, ExternalLink, Filter } from 'lucide-react'

interface VaultAccount {
  id: string
  category: string
  name: string
  username: string | null
  password: string | null
  passkey: string | null
  url: string | null
  notes: string | null
  is_recurring: boolean
  amount: number | null
  frequency: 'weekly' | 'monthly' | 'quarterly' | 'annual' | 'one_time' | null
  next_due_date: string | null
  is_active: boolean
  matched_payee: string | null
}

interface Suggestion {
  payee_key: string
  payee_display: string
  avg_amount: number
  occurrences: number
  frequency: string
  last_date: string
}

const CATEGORIES = ['Email','Banking','Payment Processors','Utilities','Insurance','Social Media','Business','Entertainment','Other']
const FREQ_LABELS: Record<string, string> = { weekly: 'Weekly', monthly: 'Monthly', quarterly: 'Quarterly', annual: 'Annual', one_time: 'One-time' }

export default function VaultPage() {
  const [accounts, setAccounts] = useState<VaultAccount[]>([])
  const [suggestions, setSuggestions] = useState<Suggestion[]>([])
  const [loading, setLoading] = useState(true)
  const [showInactive, setShowInactive] = useState(false)
  const [query, setQuery] = useState('')
  const [categoryFilter, setCategoryFilter] = useState<string>('')
  const [recurringOnly, setRecurringOnly] = useState(false)
  const [editing, setEditing] = useState<Partial<VaultAccount> | null>(null)
  const [reveal, setReveal] = useState<Set<string>>(new Set())   // ids whose password is visible
  const [copied, setCopied] = useState<string | null>(null)       // "<id>:password" / "<id>:username" key

  useEffect(() => { load() }, [showInactive])

  async function load() {
    setLoading(true)
    try {
      const res = await fetch(`/api/vault-accounts${showInactive ? '?includeInactive=true' : ''}`)
      const d = await res.json()
      setAccounts(Array.isArray(d) ? d : [])
    } catch {}
    setLoading(false)
  }

  async function loadSuggestions() {
    try {
      const res = await fetch('/api/vault-accounts?action=suggest')
      const d = await res.json()
      setSuggestions(Array.isArray(d.suggestions) ? d.suggestions : [])
    } catch {}
  }

  async function save(form: Partial<VaultAccount>) {
    const method = form.id ? 'PATCH' : 'POST'
    const res = await fetch('/api/vault-accounts', {
      method, headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form),
    })
    const d = await res.json()
    if (d.error) { alert(d.error); return }
    setEditing(null)
    await load()
  }

  async function remove(id: string, name: string) {
    if (!confirm(`Delete "${name}" permanently?`)) return
    await fetch(`/api/vault-accounts?id=${id}`, { method: 'DELETE' })
    await load()
  }

  async function toggleActive(a: VaultAccount) {
    await fetch('/api/vault-accounts', {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: a.id, is_active: !a.is_active }),
    })
    await load()
  }

  function copy(text: string, key: string) {
    if (!text) return
    navigator.clipboard.writeText(text)
    setCopied(key)
    setTimeout(() => setCopied(c => c === key ? null : c), 1200)
  }

  function toggleReveal(id: string) {
    setReveal(s => {
      const n = new Set(s)
      n.has(id) ? n.delete(id) : n.add(id)
      return n
    })
  }

  const filtered = useMemo(() => {
    const q = query.toLowerCase().trim()
    return accounts.filter(a => {
      if (categoryFilter && a.category !== categoryFilter) return false
      if (recurringOnly && !a.is_recurring) return false
      if (!q) return true
      return [a.name, a.username, a.url, a.notes, a.matched_payee, a.category]
        .some(v => v && v.toLowerCase().includes(q))
    })
  }, [accounts, query, categoryFilter, recurringOnly])

  const grouped = useMemo(() => {
    const g: Record<string, VaultAccount[]> = {}
    for (const a of filtered) {
      if (!g[a.category]) g[a.category] = []
      g[a.category].push(a)
    }
    return g
  }, [filtered])

  // Estimated monthly cost from recurring entries (annual /12, weekly *4.33, quarterly /3)
  const monthlyCost = useMemo(() => {
    let total = 0
    for (const a of accounts) {
      if (!a.is_recurring || !a.is_active || !a.amount) continue
      const n = Number(a.amount)
      if (a.frequency === 'monthly') total += n
      else if (a.frequency === 'annual') total += n / 12
      else if (a.frequency === 'weekly') total += n * 4.33
      else if (a.frequency === 'quarterly') total += n / 3
    }
    return total
  }, [accounts])

  return (
    <div className="p-6 md:p-8 pt-16 md:pt-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-extrabold text-gray-900 flex items-center gap-2"><KeyRound size={22} style={{ color: '#b8895a' }} /> Account Vault</h1>
          <p className="text-gray-500 text-sm mt-0.5">Credentials, subscriptions, and recurring expenses</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => { loadSuggestions() }}
            className="flex items-center gap-1.5 text-xs font-semibold px-3 py-2 rounded-xl border border-gray-200 hover:bg-gray-50">
            <Wand2 size={13} /> Suggest from Bank
          </button>
          <button onClick={() => setEditing({ category: 'Other', is_active: true })}
            className="flex items-center gap-1.5 text-sm font-semibold px-4 py-2.5 rounded-xl text-white shadow-md"
            style={{ background: '#b8895a' }}>
            <Plus size={14} /> Add Account
          </button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <Stat label="Total Accounts" value={accounts.filter(a => a.is_active).length.toString()} />
        <Stat label="Recurring" value={accounts.filter(a => a.is_recurring && a.is_active).length.toString()} accent="#185FA5" />
        <Stat label="Est. Monthly Cost" value={`$${monthlyCost.toFixed(2)}`} accent="#b8895a" />
      </div>

      {/* Suggestions panel */}
      {suggestions.length > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 mb-5">
          <div className="flex items-center justify-between mb-2">
            <h2 className="font-bold text-amber-900 text-sm flex items-center gap-2"><Wand2 size={14} /> Suggested recurring payments</h2>
            <button onClick={() => setSuggestions([])} className="text-amber-600 hover:text-amber-800"><X size={15} /></button>
          </div>
          <p className="text-xs text-amber-800 mb-3">From your bank ledger — payees that appear at a regular cadence with stable amounts.</p>
          <div className="space-y-1.5">
            {suggestions.map(s => (
              <div key={s.payee_key} className="flex items-center gap-2 bg-white border border-amber-100 rounded-xl px-3 py-2">
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-semibold text-gray-900 truncate">{s.payee_display}</div>
                  <div className="text-[11px] text-gray-500">${s.avg_amount.toFixed(2)} · {FREQ_LABELS[s.frequency] || s.frequency} · {s.occurrences} occurrences · last {s.last_date}</div>
                </div>
                <button onClick={() => {
                  setEditing({
                    category: 'Utilities',
                    name: s.payee_display,
                    is_recurring: true,
                    amount: s.avg_amount,
                    frequency: s.frequency as any,
                    matched_payee: s.payee_display,
                    is_active: true,
                  })
                  setSuggestions(p => p.filter(x => x.payee_key !== s.payee_key))
                }}
                  className="text-xs font-semibold px-2.5 py-1 rounded-lg text-white" style={{ background: '#b8895a' }}>
                  + Add to vault
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Search & filters */}
      <div className="flex flex-wrap items-center gap-2 mb-5">
        <div className="relative flex-1 min-w-[200px]">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input value={query} onChange={e => setQuery(e.target.value)}
            placeholder="Search accounts, usernames, URLs…"
            className="w-full pl-9 pr-3 py-2 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:border-blue-400" />
        </div>
        <select value={categoryFilter} onChange={e => setCategoryFilter(e.target.value)}
          className="px-3 py-2 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:border-blue-400">
          <option value="">All categories</option>
          {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
        <label className="flex items-center gap-1.5 text-xs font-semibold text-gray-600 cursor-pointer px-3 py-2 rounded-xl border border-gray-200">
          <input type="checkbox" checked={recurringOnly} onChange={e => setRecurringOnly(e.target.checked)} />
          <Repeat size={12} /> Recurring only
        </label>
        <label className="flex items-center gap-1.5 text-xs font-semibold text-gray-600 cursor-pointer px-3 py-2 rounded-xl border border-gray-200">
          <input type="checkbox" checked={showInactive} onChange={e => setShowInactive(e.target.checked)} />
          Show inactive
        </label>
      </div>

      {/* Grouped list */}
      {loading ? (
        <div className="flex justify-center py-20"><Loader2 size={28} className="animate-spin" style={{ color: '#b8895a' }} /></div>
      ) : Object.keys(grouped).length === 0 ? (
        <div className="text-center py-20 text-gray-400">
          <KeyRound size={32} className="mx-auto mb-2 opacity-30" />
          <p className="text-sm">{accounts.length === 0 ? 'No accounts yet. Click "Add Account" to get started.' : 'Nothing matches your filters.'}</p>
        </div>
      ) : (
        <div className="space-y-6">
          {CATEGORIES.filter(c => grouped[c]).concat(Object.keys(grouped).filter(c => !CATEGORIES.includes(c))).map(cat => (
            <section key={cat}>
              <h2 className="text-xs font-bold uppercase tracking-wider text-gray-500 mb-2">{cat} · {grouped[cat].length}</h2>
              <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 border-b border-gray-100">
                    <tr>
                      <th className="text-left px-4 py-2.5 text-[11px] font-semibold text-gray-600 uppercase tracking-wider">Name</th>
                      <th className="text-left px-4 py-2.5 text-[11px] font-semibold text-gray-600 uppercase tracking-wider">Username</th>
                      <th className="text-left px-4 py-2.5 text-[11px] font-semibold text-gray-600 uppercase tracking-wider">Password</th>
                      <th className="text-left px-4 py-2.5 text-[11px] font-semibold text-gray-600 uppercase tracking-wider">Recurring</th>
                      <th className="text-right px-4 py-2.5 text-[11px] font-semibold text-gray-600 uppercase tracking-wider">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {grouped[cat].map(a => {
                      const isVisible = reveal.has(a.id)
                      return (
                        <tr key={a.id} className={`hover:bg-gray-50 ${!a.is_active ? 'opacity-50' : ''}`}>
                          <td className="px-4 py-2.5">
                            <div className="flex items-center gap-2">
                              <span className="font-medium text-gray-900">{a.name}</span>
                              {a.url && (
                                <a href={a.url.startsWith('http') ? a.url : `https://${a.url}`} target="_blank" rel="noreferrer"
                                  className="text-gray-300 hover:text-blue-600" title={a.url}>
                                  <ExternalLink size={11} />
                                </a>
                              )}
                              {!a.is_active && <span className="text-[9px] uppercase font-bold tracking-wider px-1.5 py-0.5 rounded bg-gray-200 text-gray-600">Archived</span>}
                            </div>
                            {a.notes && <div className="text-[11px] text-gray-400 truncate max-w-xs" title={a.notes}>{a.notes}</div>}
                          </td>
                          <td className="px-4 py-2.5 text-xs text-gray-600">
                            {a.username ? (
                              <div className="flex items-center gap-1.5">
                                <span className="truncate max-w-[180px]" title={a.username}>{a.username}</span>
                                <button onClick={() => copy(a.username!, `${a.id}:u`)} className="text-gray-300 hover:text-blue-600">
                                  {copied === `${a.id}:u` ? <Check size={11} className="text-green-600" /> : <Copy size={11} />}
                                </button>
                              </div>
                            ) : <span className="text-gray-300">—</span>}
                          </td>
                          <td className="px-4 py-2.5 text-xs text-gray-600">
                            {a.password ? (
                              <div className="flex items-center gap-1.5">
                                <span className="font-mono truncate max-w-[140px]">{isVisible ? a.password : '••••••••'}</span>
                                <button onClick={() => toggleReveal(a.id)} className="text-gray-300 hover:text-blue-600">
                                  {isVisible ? <EyeOff size={11} /> : <Eye size={11} />}
                                </button>
                                <button onClick={() => copy(a.password!, `${a.id}:p`)} className="text-gray-300 hover:text-blue-600">
                                  {copied === `${a.id}:p` ? <Check size={11} className="text-green-600" /> : <Copy size={11} />}
                                </button>
                              </div>
                            ) : <span className="text-gray-300">—</span>}
                          </td>
                          <td className="px-4 py-2.5">
                            {a.is_recurring ? (
                              <span className="inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full" style={{ background: 'rgba(184,137,90,0.12)', color: '#b8895a' }}>
                                <Repeat size={9} />
                                {a.amount != null && `$${Number(a.amount).toFixed(2)}`}
                                {a.frequency && ` / ${FREQ_LABELS[a.frequency] || a.frequency}`}
                              </span>
                            ) : <span className="text-gray-300 text-xs">—</span>}
                          </td>
                          <td className="px-4 py-2.5">
                            <div className="flex items-center justify-end gap-1">
                              <button onClick={() => toggleActive(a)}
                                title={a.is_active ? 'Mark inactive' : 'Mark active'}
                                className={`text-xs font-semibold px-2 py-1 rounded-lg ${a.is_active ? 'text-green-700 bg-green-50 hover:bg-green-100' : 'text-gray-500 bg-gray-100 hover:bg-gray-200'}`}>
                                {a.is_active ? 'Active' : 'Inactive'}
                              </button>
                              <button onClick={() => setEditing(a)} className="text-gray-300 hover:text-blue-600 p-1" title="Edit"><Edit3 size={13} /></button>
                              <button onClick={() => remove(a.id, a.name)} className="text-gray-300 hover:text-red-500 p-1" title="Delete"><Trash2 size={13} /></button>
                            </div>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </section>
          ))}
        </div>
      )}

      {/* Add / Edit modal */}
      {editing && <EditModal entry={editing} onClose={() => setEditing(null)} onSave={save} />}
    </div>
  )
}

function Stat({ label, value, accent }: { label: string; value: string; accent?: string }) {
  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4">
      <div className="text-[10px] uppercase tracking-wider font-bold text-gray-500">{label}</div>
      <div className="text-2xl font-extrabold mt-1" style={{ color: accent || '#111827' }}>{value}</div>
    </div>
  )
}

function EditModal({ entry, onClose, onSave }: { entry: Partial<VaultAccount>; onClose: () => void; onSave: (form: Partial<VaultAccount>) => Promise<void> }) {
  const [form, setForm] = useState<Partial<VaultAccount>>(entry)
  const [saving, setSaving] = useState(false)
  const inputCls = 'w-full px-3 py-2 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:border-blue-400'

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    try { await onSave(form) }
    finally { setSaving(false) }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between sticky top-0 bg-white">
          <h2 className="font-bold text-gray-900">{form.id ? 'Edit Account' : 'Add Account'}</h2>
          <button onClick={onClose}><X size={18} className="text-gray-400" /></button>
        </div>
        <form onSubmit={submit} className="p-6 space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1">Name *</label>
              <input required value={form.name || ''} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} className={inputCls} />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1">Category</label>
              <select value={form.category || 'Other'} onChange={e => setForm(f => ({ ...f, category: e.target.value }))} className={inputCls}>
                {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-700 mb-1">Username / Email</label>
            <input value={form.username || ''} onChange={e => setForm(f => ({ ...f, username: e.target.value }))} className={inputCls} />
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-700 mb-1">Password</label>
            <input type="text" value={form.password || ''} onChange={e => setForm(f => ({ ...f, password: e.target.value }))} className={`${inputCls} font-mono`} />
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-700 mb-1">Passkey / 2FA / Seed Phrase</label>
            <textarea rows={2} value={form.passkey || ''} onChange={e => setForm(f => ({ ...f, passkey: e.target.value }))} className={`${inputCls} font-mono`} />
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-700 mb-1">URL</label>
            <input value={form.url || ''} onChange={e => setForm(f => ({ ...f, url: e.target.value }))} className={inputCls} placeholder="https://…" />
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-700 mb-1">Notes</label>
            <textarea rows={2} value={form.notes || ''} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} className={inputCls} />
          </div>

          <div className="bg-amber-50 border border-amber-100 rounded-xl p-3 space-y-2">
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={!!form.is_recurring} onChange={e => setForm(f => ({ ...f, is_recurring: e.target.checked }))} />
              <span className="text-xs font-bold text-amber-900 flex items-center gap-1"><Repeat size={11} /> Recurring expense</span>
            </label>
            {form.is_recurring && (
              <div className="grid grid-cols-3 gap-2">
                <div>
                  <label className="block text-[10px] font-semibold text-amber-800 mb-1">Amount</label>
                  <input type="number" step="0.01" value={form.amount ?? ''} onChange={e => setForm(f => ({ ...f, amount: e.target.value === '' ? null : Number(e.target.value) }))}
                    className="w-full px-2 py-1.5 rounded-lg border border-amber-200 text-xs bg-white" placeholder="0.00" />
                </div>
                <div>
                  <label className="block text-[10px] font-semibold text-amber-800 mb-1">Frequency</label>
                  <select value={form.frequency || ''} onChange={e => setForm(f => ({ ...f, frequency: (e.target.value || null) as any }))}
                    className="w-full px-2 py-1.5 rounded-lg border border-amber-200 text-xs bg-white">
                    <option value="">—</option>
                    <option value="weekly">Weekly</option>
                    <option value="monthly">Monthly</option>
                    <option value="quarterly">Quarterly</option>
                    <option value="annual">Annual</option>
                    <option value="one_time">One-time</option>
                  </select>
                </div>
                <div>
                  <label className="block text-[10px] font-semibold text-amber-800 mb-1">Next Due</label>
                  <input type="date" value={form.next_due_date || ''} onChange={e => setForm(f => ({ ...f, next_due_date: e.target.value || null }))}
                    className="w-full px-2 py-1.5 rounded-lg border border-amber-200 text-xs bg-white" />
                </div>
                <div className="col-span-3">
                  <label className="block text-[10px] font-semibold text-amber-800 mb-1">Matched Bank Payee (optional — auto-fills from "Suggest")</label>
                  <input value={form.matched_payee || ''} onChange={e => setForm(f => ({ ...f, matched_payee: e.target.value }))}
                    className="w-full px-2 py-1.5 rounded-lg border border-amber-200 text-xs bg-white" />
                </div>
              </div>
            )}
          </div>

          <label className="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" checked={form.is_active !== false} onChange={e => setForm(f => ({ ...f, is_active: e.target.checked }))} />
            <span className="text-xs font-semibold text-gray-700">Active</span>
          </label>

          <button type="submit" disabled={saving}
            className="w-full py-3 rounded-xl text-white font-bold flex items-center justify-center gap-2 disabled:opacity-60"
            style={{ background: '#b8895a' }}>
            {saving && <Loader2 size={14} className="animate-spin" />}
            {form.id ? 'Save Changes' : 'Add Account'}
          </button>
        </form>
      </div>
    </div>
  )
}
