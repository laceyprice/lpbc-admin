'use client'
import { useEffect, useState } from 'react'
import { Plus, Trash2, Loader2, X, Edit3, FolderOpen } from 'lucide-react'
import { formatCurrency } from '@/lib/utils'

interface Account {
  id: string
  name: string
  account_type: string
  report_group: string | null
  sort_order: number
  is_active: boolean
}

const TYPES = ['asset', 'liability', 'equity', 'revenue', 'expense', 'distribution']

export default function AccountsPage() {
  const [accounts, setAccounts] = useState<Account[]>([])
  const [loading, setLoading] = useState(true)
  const [showInactive, setShowInactive] = useState(false)
  const [editing, setEditing] = useState<Account | null>(null)
  const [adding, setAdding] = useState(false)
  const [saving, setSaving] = useState(false)

  useEffect(() => { load() }, [showInactive])

  async function load() {
    setLoading(true)
    const params = showInactive ? '?includeInactive=true' : ''
    const res = await fetch(`/api/chart-of-accounts${params}`)
    const d = await res.json()
    setAccounts(Array.isArray(d) ? d : [])
    setLoading(false)
  }

  async function save(data: Partial<Account> & { name: string; account_type: string }) {
    setSaving(true)
    try {
      if (editing?.id) {
        await fetch('/api/chart-of-accounts', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: editing.id, ...data }),
        })
      } else {
        await fetch('/api/chart-of-accounts', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(data),
        })
      }
      setEditing(null)
      setAdding(false)
      await load()
    } catch { alert('Failed to save') }
    finally { setSaving(false) }
  }

  async function deactivate(id: string) {
    if (!confirm('Deactivate this account? It will be hidden from dropdowns but historical transactions keep their reference.')) return
    await fetch(`/api/chart-of-accounts?id=${id}`, { method: 'DELETE' })
    await load()
  }

  async function reactivate(id: string) {
    await fetch('/api/chart-of-accounts', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, is_active: true }),
    })
    await load()
  }

  async function hardDelete(id: string) {
    if (!confirm('Permanently delete this account? This will fail if any transactions reference it.')) return
    const res = await fetch(`/api/chart-of-accounts?id=${id}&hard=true`, { method: 'DELETE' })
    const d = await res.json()
    if (d.error) alert(`Cannot delete: ${d.error}`)
    else await load()
  }

  // Group by report_group
  const grouped = accounts.reduce((acc, a) => {
    const key = a.report_group || a.account_type.toUpperCase()
    if (!acc[key]) acc[key] = []
    acc[key].push(a)
    return acc
  }, {} as Record<string, Account[]>)

  const inputCls = 'w-full px-3 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:border-blue-400'

  return (
    <div className="p-6 md:p-8 pt-16 md:pt-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-extrabold text-gray-900">Chart of Accounts</h1>
          <p className="text-gray-500 text-sm mt-0.5">Manage categories for bookkeeping &amp; reports</p>
        </div>
        <div className="flex items-center gap-3">
          <label className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer">
            <input type="checkbox" checked={showInactive} onChange={e => setShowInactive(e.target.checked)} className="rounded" />
            Show inactive
          </label>
          <button onClick={() => { setAdding(true); setEditing({ id: '', name: '', account_type: 'expense', report_group: 'PURCHASES', sort_order: 100, is_active: true }) }}
            className="flex items-center gap-2 text-white font-semibold px-4 py-2.5 rounded-xl shadow-md" style={{ background: '#b8895a' }}>
            <Plus size={14} /> Add Account
          </button>
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-20"><Loader2 size={28} className="animate-spin" style={{ color: '#b8895a' }} /></div>
      ) : Object.keys(grouped).length === 0 ? (
        <div className="text-center py-20 text-gray-400">
          <FolderOpen size={30} className="mx-auto mb-2 opacity-30" />
          <p className="text-sm">No accounts yet</p>
        </div>
      ) : (
        <div className="space-y-6">
          {Object.entries(grouped).map(([group, items]) => (
            <div key={group} className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
              <div className="px-5 py-4 border-b border-gray-100 bg-gray-50">
                <h3 className="text-xs font-bold text-gray-600 uppercase tracking-wider">{group}</h3>
              </div>
              <div className="divide-y divide-gray-50">
                {items.map(acct => (
                  <div key={acct.id} className={`flex items-center justify-between px-5 py-3 hover:bg-gray-50 transition-colors ${!acct.is_active ? 'opacity-50' : ''}`}>
                    <div className="flex items-center gap-3">
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium capitalize ${
                        acct.account_type === 'revenue' ? 'bg-green-100 text-green-700' :
                        acct.account_type === 'expense' ? 'bg-red-100 text-red-700' :
                        acct.account_type === 'asset' ? 'bg-blue-100 text-blue-700' :
                        acct.account_type === 'liability' ? 'bg-orange-100 text-orange-700' :
                        acct.account_type === 'distribution' ? 'bg-purple-100 text-purple-700' :
                        'bg-gray-100 text-gray-700'
                      }`}>{acct.account_type}</span>
                      <span className="text-sm font-medium text-gray-900">{acct.name}</span>
                      {!acct.is_active && <span className="text-xs text-red-500 italic">inactive</span>}
                    </div>
                    <div className="flex items-center gap-2">
                      <button onClick={() => { setEditing(acct); setAdding(false) }} className="text-gray-400 hover:text-blue-600 p-1"><Edit3 size={14} /></button>
                      {acct.is_active ? (
                        <button onClick={() => deactivate(acct.id)} className="text-gray-400 hover:text-red-600 p-1"><Trash2 size={14} /></button>
                      ) : (
                        <div className="flex gap-1">
                          <button onClick={() => reactivate(acct.id)} className="text-xs text-blue-600 hover:underline">Reactivate</button>
                          <button onClick={() => hardDelete(acct.id)} className="text-gray-400 hover:text-red-600 p-1"><Trash2 size={14} /></button>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Add/Edit Modal */}
      {(editing || adding) && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
            <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
              <h2 className="font-bold text-gray-900">{editing?.id ? 'Edit Account' : 'Add Account'}</h2>
              <button onClick={() => { setEditing(null); setAdding(false) }}><X size={18} className="text-gray-400" /></button>
            </div>
            <form onSubmit={e => {
              e.preventDefault()
              const fd = new FormData(e.currentTarget)
              save({
                name: fd.get('name') as string,
                account_type: fd.get('account_type') as string,
                report_group: (fd.get('report_group') as string) || null,
                sort_order: parseInt(fd.get('sort_order') as string) || 100,
              })
            }} className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1">Account Name</label>
                <input name="name" defaultValue={editing?.name || ''} required className={inputCls} placeholder="e.g. Vehicle Expenses" />
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1">Account Type</label>
                <select name="account_type" defaultValue={editing?.account_type || 'expense'} className={inputCls}>
                  {TYPES.map(t => <option key={t} value={t} className="capitalize">{t.charAt(0).toUpperCase() + t.slice(1)}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1">Report Group</label>
                <input name="report_group" defaultValue={editing?.report_group || ''} className={inputCls} placeholder="e.g. PURCHASES, SALES, ASSETS" />
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1">Sort Order</label>
                <input name="sort_order" type="number" defaultValue={editing?.sort_order || 100} className={inputCls} />
              </div>
              <button type="submit" disabled={saving}
                className="w-full text-white font-bold py-3 rounded-xl flex items-center justify-center gap-2" style={{ background: '#b8895a' }}>
                {saving && <Loader2 size={14} className="animate-spin" />}
                {editing?.id ? 'Save Changes' : 'Add Account'}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
