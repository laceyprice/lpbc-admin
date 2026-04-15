'use client'
import { useEffect, useState } from 'react'
import { Plus, Trash2, Loader2, X, UserCog, Shield, FileText, BookOpen } from 'lucide-react'

interface UserRole {
  id: string
  user_id: string
  email: string
  display_name: string | null
  role: 'admin' | 'bookkeeper' | 'invoicing'
  created_at: string
}

const ROLE_INFO: Record<string, { label: string; desc: string; color: string; bg: string; icon: any }> = {
  admin:       { label: 'Admin',       desc: 'Full access to everything',                        color: 'text-blue-700',   bg: 'bg-blue-100',   icon: Shield },
  bookkeeper:  { label: 'Bookkeeper',  desc: 'Full admin access (bookkeeping, reports, accounts)', color: 'text-green-700',  bg: 'bg-green-100',  icon: BookOpen },
  invoicing:   { label: 'Invoicing',   desc: 'Invoices, quotes, CRM only',                       color: 'text-orange-700', bg: 'bg-orange-100', icon: FileText },
}

export default function UsersPage() {
  const [users, setUsers] = useState<UserRole[]>([])
  const [loading, setLoading] = useState(true)
  const [adding, setAdding] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => { load() }, [])

  async function load() {
    setLoading(true)
    const res = await fetch('/api/user-roles')
    const d = await res.json()
    setUsers(Array.isArray(d) ? d : [])
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
        password: fd.get('password'),
        display_name: fd.get('display_name'),
        role: fd.get('role'),
      }),
    })
    const d = await res.json()
    if (d.error) { setError(d.error); setSaving(false); return }
    setAdding(false)
    setSaving(false)
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

  async function deleteUser(id: string, email: string) {
    if (!confirm(`Delete user ${email}? This will remove their login and all access.`)) return
    await fetch(`/api/user-roles?id=${id}`, { method: 'DELETE' })
    await load()
  }

  const inputCls = 'w-full px-3 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:border-blue-400'

  return (
    <div className="p-6 md:p-8 pt-16 md:pt-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-extrabold text-gray-900">User Management</h1>
          <p className="text-gray-500 text-sm mt-0.5">Add bookkeeper and invoicing logins</p>
        </div>
        <button onClick={() => setAdding(true)}
          className="flex items-center gap-2 text-white font-semibold px-4 py-2.5 rounded-xl shadow-md" style={{ background: '#185FA5' }}>
          <Plus size={14} /> Add User
        </button>
      </div>

      {/* Role Legend */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        {Object.entries(ROLE_INFO).map(([key, { label, desc, color, bg, icon: Icon }]) => (
          <div key={key} className={`${bg} rounded-2xl p-4 border border-opacity-20`}>
            <div className="flex items-center gap-2 mb-1">
              <Icon size={15} className={color} />
              <span className={`text-xs font-bold uppercase tracking-wider ${color}`}>{label}</span>
            </div>
            <p className="text-xs text-gray-600">{desc}</p>
          </div>
        ))}
      </div>

      {loading ? (
        <div className="flex justify-center py-20"><Loader2 size={28} className="animate-spin" style={{ color: '#185FA5' }} /></div>
      ) : users.length === 0 ? (
        <div className="text-center py-20 text-gray-400">
          <UserCog size={30} className="mx-auto mb-2 opacity-30" />
          <p className="text-sm">No users configured yet. Your current login has full admin access by default.</p>
        </div>
      ) : (
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
          <table className="w-full text-sm">
            <thead><tr className="bg-gray-50 border-b border-gray-100">
              {['User', 'Email', 'Role', 'Actions'].map(h => (
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
                      </select>
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
              <button onClick={() => { setAdding(false); setError('') }}><X size={18} className="text-gray-400" /></button>
            </div>
            <form onSubmit={addUser} className="p-6 space-y-4">
              {error && <div className="bg-red-50 border border-red-100 text-red-700 text-sm px-4 py-3 rounded-xl">{error}</div>}
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1">Display Name</label>
                <input name="display_name" className={inputCls} placeholder="e.g. Jane Smith" />
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1">Email</label>
                <input name="email" type="email" required className={inputCls} placeholder="jane@thegasologist.com" />
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1">Password</label>
                <input name="password" type="password" required minLength={8} className={inputCls} placeholder="Min 8 characters" />
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1">Role</label>
                <select name="role" required className={inputCls}>
                  <option value="invoicing">Invoicing — Invoices, quotes, CRM only</option>
                  <option value="bookkeeper">Bookkeeper — Full admin access</option>
                  <option value="admin">Admin — Full access + user management</option>
                </select>
              </div>
              <button type="submit" disabled={saving}
                className="w-full text-white font-bold py-3 rounded-xl flex items-center justify-center gap-2" style={{ background: '#185FA5' }}>
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
