'use client'
import { useEffect, useState } from 'react'
import { Plus, Trash2, Loader2, X, UserCog, Shield, FileText, BookOpen, User } from 'lucide-react'

interface UserRole {
  id: string
  user_id: string
  email: string
  display_name: string | null
  role: 'admin' | 'bookkeeper' | 'invoicing' | 'customer'
  assigned_account_id: string | null
  created_at: string
}

interface FinancialAccount {
  id: string
  name: string
  color: string
}

const ROLE_INFO: Record<string, { label: string; desc: string; color: string; bg: string; icon: any }> = {
  admin:      { label: 'Admin',      desc: 'Full access to everything',                          color: 'text-blue-700',   bg: 'bg-blue-100',   icon: Shield },
  bookkeeper: { label: 'Bookkeeper', desc: 'Full admin access (bookkeeping, reports, accounts)', color: 'text-green-700',  bg: 'bg-green-100',  icon: BookOpen },
  invoicing:  { label: 'Invoicing',  desc: 'Invoices, quotes, CRM only',                        color: 'text-orange-700', bg: 'bg-orange-100', icon: FileText },
  customer:   { label: 'Customer',   desc: 'View-only access to their assigned account',         color: 'text-purple-700', bg: 'bg-purple-100', icon: User },
}

export default function UsersPage() {
  const [users, setUsers] = useState<UserRole[]>([])
  const [accounts, setAccounts] = useState<FinancialAccount[]>([])
  const [loading, setLoading] = useState(true)
  const [adding, setAdding] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [selectedRole, setSelectedRole] = useState('invoicing')

  useEffect(() => { load() }, [])

  async function load() {
    setLoading(true)
    const [usersRes, acctRes] = await Promise.all([
      fetch('/api/user-roles'),
      fetch('/api/financial-accounts'),
    ])
    const usersData = await usersRes.json()
    const acctData = await acctRes.json()
    setUsers(Array.isArray(usersData) ? usersData : [])
    setAccounts(Array.isArray(acctData) ? acctData : [])
    setLoading(false)
  }

  async function addUser(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    setError('')
    const fd = new FormData(e.currentTarget as HTMLFormElement)
    const res = await fetch('/api/user-roles', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: fd.get('email'),
        // Auto-generated since users sign in via magic link; required by Supabase Auth API
        password: Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2).toUpperCase() + '!',
        display_name: fd.get('display_name'),
        role: fd.get('role'),
        assigned_account_id: fd.get('assigned_account_id') || null,
        send_welcome_email: fd.get('send_welcome_email') === 'on',
        welcome_message: fd.get('welcome_message') || null,
      }),
    })
    const d = await res.json()
    if (d.error) { setError(d.error); setSaving(false); return }
    setAdding(false)
    setSaving(false)
    setSelectedRole('invoicing')
    await load()
  }

  async function changeRole(id: string, role: string) {
    await fetch('/api/user-roles', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, role }),
    })
    await load()
  }

  async function changeAccount(id: string, assigned_account_id: string) {
    await fetch('/api/user-roles', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, assigned_account_id: assigned_account_id || null }),
    })
    await load()
  }

  async function deleteUser(id: string, email: string) {
    if (!confirm(`Delete user ${email}? This will remove their login and all access.`)) return
    await fetch(`/api/user-roles?id=${id}`, { method: 'DELETE' })
    await load()
  }

  function accountName(id: string | null) {
    if (!id) return null
    return accounts.find(a => a.id === id)?.name ?? null
  }

  const inputCls = 'w-full px-3 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:border-blue-400'

  return (
    <div className="p-6 md:p-8 pt-16 md:pt-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-extrabold text-gray-900">User Management</h1>
          <p className="text-gray-500 text-sm mt-0.5">Manage team and customer logins</p>
        </div>
        <button onClick={() => setAdding(true)}
          className="flex items-center gap-2 text-white font-semibold px-4 py-2.5 rounded-xl shadow-md" style={{ background: '#b8895a' }}>
          <Plus size={14} /> Add User
        </button>
      </div>

      {/* Role Legend */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        {Object.entries(ROLE_INFO).map(([key, { label, desc, color, bg, icon: Icon }]) => (
          <div key={key} className={`${bg} rounded-2xl p-4`}>
            <div className="flex items-center gap-2 mb-1">
              <Icon size={15} className={color} />
              <span className={`text-xs font-bold uppercase tracking-wider ${color}`}>{label}</span>
            </div>
            <p className="text-xs text-gray-600">{desc}</p>
          </div>
        ))}
      </div>

      {loading ? (
        <div className="flex justify-center py-20"><Loader2 size={28} className="animate-spin" style={{ color: '#b8895a' }} /></div>
      ) : users.length === 0 ? (
        <div className="text-center py-20 text-gray-400">
          <UserCog size={30} className="mx-auto mb-2 opacity-30" />
          <p className="text-sm">No users configured yet. Your current login has full admin access by default.</p>
        </div>
      ) : (
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
          <table className="w-full text-sm">
            <thead><tr className="bg-gray-50 border-b border-gray-100">
              {['User', 'Email', 'Role', 'Assigned Account', 'Actions'].map(h => (
                <th key={h} className="text-left px-5 py-3 text-xs font-semibold text-gray-600 uppercase tracking-wider">{h}</th>
              ))}
            </tr></thead>
            <tbody className="divide-y divide-gray-50">
              {users.map(u => {
                const ri = ROLE_INFO[u.role] || ROLE_INFO.invoicing
                return (
                  <tr key={u.id} className="hover:bg-gray-50">
                    <td className="px-5 py-3 font-medium text-gray-900">{u.display_name || u.email.split('@')[0]}</td>
                    <td className="px-5 py-3 text-gray-600">{u.email}</td>
                    <td className="px-5 py-3">
                      <select value={u.role} onChange={e => changeRole(u.id, e.target.value)}
                        className="text-xs font-semibold px-2 py-1 rounded-lg border border-gray-200 focus:outline-none">
                        <option value="admin">Admin</option>
                        <option value="bookkeeper">Bookkeeper</option>
                        <option value="invoicing">Invoicing</option>
                        <option value="customer">Customer</option>
                      </select>
                    </td>
                    <td className="px-5 py-3">
                      {u.role === 'customer' ? (
                        <select value={u.assigned_account_id || ''} onChange={e => changeAccount(u.id, e.target.value)}
                          className="text-xs px-2 py-1 rounded-lg border border-gray-200 focus:outline-none">
                          <option value="">— No account assigned —</option>
                          {accounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                        </select>
                      ) : (
                        <span className="text-xs text-gray-400 italic">—</span>
                      )}
                    </td>
                    <td className="px-5 py-3">
                      <button onClick={() => deleteUser(u.id, u.email)} className="text-gray-400 hover:text-red-600">
                        <Trash2 size={14} />
                      </button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {adding && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
            <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
              <h2 className="font-bold text-gray-900">Add User</h2>
              <button onClick={() => { setAdding(false); setError(''); setSelectedRole('invoicing') }}><X size={18} className="text-gray-400" /></button>
            </div>
            <form onSubmit={addUser} className="p-6 space-y-4">
              {error && <div className="bg-red-50 border border-red-100 text-red-700 text-sm px-4 py-3 rounded-xl">{error}</div>}
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1">Display Name</label>
                <input name="display_name" className={inputCls} placeholder="e.g. Jane Smith" />
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1">Email</label>
                <input name="email" type="email" required className={inputCls} placeholder="user@example.com" />
              </div>
              <div className="bg-blue-50 border border-blue-100 rounded-xl px-3 py-2 text-xs text-blue-800">
                🔑 New users sign in via emailed magic link — no password needed.
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1">Role</label>
                <select name="role" required className={inputCls} value={selectedRole} onChange={e => setSelectedRole(e.target.value)}>
                  <option value="invoicing">Invoicing — Invoices, quotes, CRM only</option>
                  <option value="bookkeeper">Bookkeeper — Full admin access</option>
                  <option value="admin">Admin — Full access + user management</option>
                  <option value="customer">Customer — View their assigned account only</option>
                </select>
              </div>
              {selectedRole === 'customer' && (
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1">Assigned Account</label>
                  <select name="assigned_account_id" className={inputCls}>
                    <option value="">— Select an account —</option>
                    {accounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                  </select>
                  {accounts.length === 0 && (
                    <p className="text-xs text-amber-600 mt-1">No accounts created yet. Add accounts in Bookkeeping first.</p>
                  )}
                </div>
              )}

              <div className="border-t border-gray-100 pt-4 mt-2">
                <label className="flex items-center gap-2 cursor-pointer mb-3">
                  <input type="checkbox" name="send_welcome_email" defaultChecked className="w-4 h-4 rounded border-gray-300" style={{ accentColor: '#b8895a' }} />
                  <span className="text-sm font-semibold text-gray-700">Send welcome email with login details</span>
                </label>
                <label className="block text-xs font-semibold text-gray-600 mb-1">Custom message (optional)</label>
                <textarea name="welcome_message" rows={3} className={inputCls}
                  placeholder="e.g. Welcome, Wendell! Here's access to your Causey Seascape 119 account where you can view invoices and statements." />
                <p className="text-xs text-gray-400 mt-1">Appears at the top of the welcome email. Leave blank for default message.</p>
              </div>

              <button type="submit" disabled={saving}
                className="w-full text-white font-bold py-3 rounded-xl flex items-center justify-center gap-2" style={{ background: '#b8895a' }}>
                {saving && <Loader2 size={14} className="animate-spin" />}
                Create User
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
