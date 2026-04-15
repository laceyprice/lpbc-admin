'use client'
import { useEffect, useState, useRef } from 'react'
import { Upload, Search, Download, TrendingUp, TrendingDown, DollarSign, FileText, Loader2, X, Paperclip, Receipt, FileImage, Trash2, Plus, File, Camera, Image as ImageIcon, Link2, RefreshCw, Unplug, Edit3, FolderOpen } from 'lucide-react'
import { formatCurrency, formatDateShort } from '@/lib/utils'
import Script from 'next/script'

const ACCT_TYPES = ['asset', 'liability', 'equity', 'revenue', 'expense', 'distribution']

function AccountsTab() {
  const [accounts, setAccounts] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [showInactive, setShowInactive] = useState(false)
  const [editing, setEditing] = useState<any | null>(null)
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

  async function save(data: any) {
    setSaving(true)
    try {
      if (editing?.id) {
        await fetch('/api/chart-of-accounts', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: editing.id, ...data }) })
      } else {
        await fetch('/api/chart-of-accounts', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) })
      }
      setEditing(null); setAdding(false); await load()
    } catch { alert('Failed to save') }
    finally { setSaving(false) }
  }

  async function deactivate(id: string) {
    if (!confirm('Deactivate this account?')) return
    await fetch(`/api/chart-of-accounts?id=${id}`, { method: 'DELETE' })
    await load()
  }

  async function reactivate(id: string) {
    await fetch('/api/chart-of-accounts', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id, is_active: true }) })
    await load()
  }

  async function hardDelete(id: string) {
    if (!confirm('Permanently delete this account?')) return
    const res = await fetch(`/api/chart-of-accounts?id=${id}&hard=true`, { method: 'DELETE' })
    const d = await res.json()
    if (d.error) alert(`Cannot delete: ${d.error}`)
    else await load()
  }

  const grouped = accounts.reduce((acc: any, a: any) => {
    const key = a.report_group || a.account_type.toUpperCase()
    if (!acc[key]) acc[key] = []
    acc[key].push(a)
    return acc
  }, {} as Record<string, any[]>)

  const inputCls = 'w-full px-3 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:border-blue-400'

  return (
    <div>
      <div className="flex items-center justify-between mb-5">
        <label className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer">
          <input type="checkbox" checked={showInactive} onChange={e => setShowInactive(e.target.checked)} className="rounded" />
          Show inactive
        </label>
        <button onClick={() => { setAdding(true); setEditing({ id: '', name: '', account_type: 'expense', report_group: 'PURCHASES', sort_order: 100, is_active: true }) }}
          className="flex items-center gap-2 text-white font-semibold px-4 py-2.5 rounded-xl shadow-md" style={{ background: '#185FA5' }}>
          <Plus size={14} /> Add Account
        </button>
      </div>

      {loading ? (
        <div className="flex justify-center py-20"><Loader2 size={28} className="animate-spin" style={{ color: '#185FA5' }} /></div>
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
                {(items as any[]).map((acct: any) => (
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
              save({ name: fd.get('name'), account_type: fd.get('account_type'), report_group: fd.get('report_group') || null, sort_order: parseInt(fd.get('sort_order') as string) || 100 })
            }} className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1">Account Name</label>
                <input name="name" defaultValue={editing?.name || ''} required className={inputCls} placeholder="e.g. Vehicle Expenses" />
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1">Account Type</label>
                <select name="account_type" defaultValue={editing?.account_type || 'expense'} className={inputCls}>
                  {ACCT_TYPES.map(t => <option key={t} value={t}>{t.charAt(0).toUpperCase() + t.slice(1)}</option>)}
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
                className="w-full text-white font-bold py-3 rounded-xl flex items-center justify-center gap-2" style={{ background: '#185FA5' }}>
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

interface AttachedImage {
  id: string
  file_url: string
  file_name: string | null
  image_type: 'receipt' | 'check'
  created_at?: string
}

interface Tx {
  id: string
  transaction_date: string
  description: string
  amount: number
  payee: string
  category: string
  notes: string
  source: string
  account_id: string | null
  check_number: string | null
  receipt_image_id: string | null
  check_image_id: string | null
  receipt_image: AttachedImage | null
  check_image: AttachedImage | null
}

interface Account {
  id: string
  name: string
  account_type: 'asset' | 'liability' | 'equity' | 'revenue' | 'expense' | 'distribution'
  report_group: string | null
  sort_order: number
  is_active: boolean
}

interface BankStatement {
  id: string
  file_name: string
  file_url: string
  label: string
  statement_date: string | null
  created_at: string
}

export default function BookkeepingPage() {
  const [tab, setTab] = useState<'bank'|'accounting'|'statements'|'uploads'|'accounts'>('bank')
  const [txs, setTxs] = useState<Tx[]>([])
  const [accounts, setAccounts] = useState<Account[]>([])
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState(false)
  const [search, setSearch] = useState('')
  const [editing, setEditing] = useState<Tx | null>(null)
  const [imgUploading, setImgUploading] = useState<null | 'receipt' | 'check'>(null)
  const [showAddAccount, setShowAddAccount] = useState(false)
  const [addingSaving, setAddingSaving] = useState(false)
  const [statements, setStatements] = useState<BankStatement[]>([])
  const [stmtUploading, setStmtUploading] = useState(false)
  const [uploads, setUploads] = useState<AttachedImage[]>([])
  const [docUploading, setDocUploading] = useState(false)
  const [docType, setDocType] = useState<'receipt'|'check'>('receipt')
  const [bankConnections, setBankConnections] = useState<any[]>([])
  const [syncing, setSyncing] = useState(false)
  const [connecting, setConnecting] = useState(false)
  const docRef = useRef<HTMLInputElement>(null)
  const stmtRef = useRef<HTMLInputElement>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const receiptRef = useRef<HTMLInputElement>(null)
  const checkRef = useRef<HTMLInputElement>(null)

  useEffect(() => { loadAccounts(); loadBankConnections() }, [])
  useEffect(() => { load() }, [tab])

  async function loadAccounts() {
    try {
      const res = await fetch('/api/chart-of-accounts')
      const d = await res.json()
      setAccounts(Array.isArray(d) ? d : [])
    } catch {}
  }

  async function load() {
    setLoading(true)
    if (tab === 'statements') {
      const res = await fetch('/api/bank-statements')
      const d = await res.json()
      setStatements(Array.isArray(d) ? d : [])
    } else if (tab === 'uploads') {
      const res = await fetch('/api/transaction-images')
      const d = await res.json()
      setUploads(Array.isArray(d) ? d : [])
    } else {
      const table = tab === 'bank' ? 'bank_transactions' : 'accounting_entries'
      const res = await fetch(`/api/bookkeeping?table=${table}`)
      const d = await res.json()
      setTxs(Array.isArray(d) ? d : [])
    }
    setLoading(false)
  }

  async function handleCSV(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]; if (!file) return
    setUploading(true)
    try {
      const text = await file.text()
      const { default: Papa } = await import('papaparse')
      const result = Papa.parse(text, { header:true, skipEmptyLines:true })
      const res = await fetch('/api/bookkeeping?action=csv-import', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({ transactions:result.data, importBatchId:`csv_${Date.now()}` }) })
      const d = await res.json()
      alert(`✅ Imported ${d.imported||0} transactions (duplicates skipped)`)
      await load()
    } catch { alert('Failed to import CSV. Check the file format.') }
    finally { setUploading(false); if (fileRef.current) fileRef.current.value = '' }
  }

  async function updateTx(id: string, updates: Partial<Tx>) {
    const table = tab === 'bank' ? 'bank_transactions' : 'accounting_entries'
    const res = await fetch('/api/bookkeeping', { method:'PATCH', headers:{'Content-Type':'application/json'}, body:JSON.stringify({id, table, ...updates}) })
    if (!res.ok) { alert('Failed to save'); return }
    await load()
    setEditing(null)
  }

  async function uploadImage(kind: 'receipt' | 'check', file: File) {
    if (!editing) return
    setImgUploading(kind)
    try {
      // 1. Upload the file
      const fd = new FormData()
      fd.append('file', file)
      fd.append('image_type', kind)
      if (kind === 'check' && editing.check_number) fd.append('check_number', editing.check_number)
      if (kind === 'receipt') {
        if (editing.payee) fd.append('vendor', editing.payee)
        if (editing.amount) fd.append('amount', String(Math.abs(editing.amount)))
        if (editing.transaction_date) fd.append('receipt_date', editing.transaction_date)
      }
      const upRes = await fetch('/api/transaction-images?action=upload', { method:'POST', body: fd })
      if (!upRes.ok) { alert('Upload failed'); return }
      const img = await upRes.json()

      // 2. Match to the current transaction (auto-match may have already linked
      //    a check by check_number, but we want it on THIS transaction).
      if (img.auto_matched_bank_transaction_id !== editing.id) {
        await fetch('/api/transaction-images?action=match', {
          method:'POST',
          headers:{'Content-Type':'application/json'},
          body: JSON.stringify({ id: img.id, bank_transaction_id: editing.id }),
        })
      }

      // 3. Reload everything so the modal sees the new join
      await load()
      const fresh = await (await fetch(`/api/bookkeeping?table=bank_transactions`)).json()
      const updated = Array.isArray(fresh) ? fresh.find((t: Tx) => t.id === editing.id) : null
      if (updated) setEditing(updated)
    } catch {
      alert('Upload failed')
    } finally {
      setImgUploading(null)
      if (receiptRef.current) receiptRef.current.value = ''
      if (checkRef.current) checkRef.current.value = ''
    }
  }

  async function detachImage(imageId: string) {
    if (!confirm('Remove this attachment?')) return
    await fetch(`/api/transaction-images?id=${imageId}`, { method:'DELETE' })
    await load()
    if (editing) {
      const fresh = await (await fetch(`/api/bookkeeping?table=bank_transactions`)).json()
      const updated = Array.isArray(fresh) ? fresh.find((t: Tx) => t.id === editing.id) : null
      if (updated) setEditing(updated)
    }
  }

  async function addNewAccount(e: React.FormEvent) {
    e.preventDefault()
    setAddingSaving(true)
    const fd = new FormData(e.currentTarget as HTMLFormElement)
    const name = fd.get('new_acct_name') as string
    const account_type = fd.get('new_acct_type') as string
    const report_group = fd.get('new_acct_group') as string
    if (!name || !account_type || !report_group) { setAddingSaving(false); return }
    try {
      const res = await fetch('/api/chart-of-accounts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, account_type, report_group }),
      })
      const d = await res.json()
      if (d.error) { alert(d.error); setAddingSaving(false); return }
      await loadAccounts()
      // Auto-select the new account in the dropdown
      setTimeout(() => {
        const sel = document.getElementById('account_id') as HTMLSelectElement
        if (sel && d.id) sel.value = d.id
      }, 100)
      setShowAddAccount(false)
    } catch { alert('Failed to create account') }
    finally { setAddingSaving(false) }
  }

  async function uploadStatement(file: File) {
    setStmtUploading(true)
    try {
      const fd = new FormData()
      fd.append('file', file)
      const res = await fetch('/api/bank-statements', { method: 'POST', body: fd })
      if (!res.ok) { alert('Upload failed'); return }
      await load()
    } catch { alert('Upload failed') }
    finally { setStmtUploading(false); if (stmtRef.current) stmtRef.current.value = '' }
  }

  async function uploadDocument(file: File) {
    setDocUploading(true)
    try {
      const fd = new FormData()
      fd.append('file', file)
      fd.append('image_type', docType)
      const res = await fetch('/api/transaction-images?action=upload', { method: 'POST', body: fd })
      if (!res.ok) { alert('Upload failed'); return }
      await load()
    } catch { alert('Upload failed') }
    finally { setDocUploading(false); if (docRef.current) docRef.current.value = '' }
  }

  async function deleteUpload(id: string) {
    if (!confirm('Delete this file?')) return
    await fetch(`/api/transaction-images?id=${id}`, { method: 'DELETE' })
    await load()
  }

  async function deleteStatement(id: string, name: string) {
    if (!confirm(`Delete statement "${name}"?`)) return
    await fetch(`/api/bank-statements?id=${id}`, { method: 'DELETE' })
    await load()
  }

  async function loadBankConnections() {
    try {
      const res = await fetch('/api/plaid')
      const d = await res.json()
      setBankConnections(Array.isArray(d) ? d : [])
    } catch {}
  }

  async function connectBank() {
    setConnecting(true)
    try {
      const res = await fetch('/api/plaid?action=create-link-token', { method: 'POST' })
      const { link_token, error } = await res.json()
      if (error) { alert(`Error: ${error}`); setConnecting(false); return }

      const handler = (window as any).Plaid.create({
        token: link_token,
        onSuccess: async (public_token: string, metadata: any) => {
          const exRes = await fetch('/api/plaid?action=exchange-token', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              public_token,
              institution: metadata.institution,
            }),
          })
          const d = await exRes.json()
          if (d.error) { alert(`Error: ${d.error}`) }
          else { alert('✅ Bank connected! Click "Sync Now" to import transactions.'); await loadBankConnections() }
          setConnecting(false)
        },
        onExit: () => { setConnecting(false) },
      })
      handler.open()
    } catch (err) {
      alert('Failed to initialize bank connection')
      setConnecting(false)
    }
  }

  async function syncTransactions() {
    setSyncing(true)
    try {
      const res = await fetch('/api/plaid?action=sync', { method: 'POST' })
      const d = await res.json()
      if (d.error) { alert(`Sync error: ${d.error}`) }
      else { alert(`✅ Synced! ${d.imported} new transactions imported, ${d.skipped} skipped.`); await load(); await loadBankConnections() }
    } catch { alert('Sync failed') }
    finally { setSyncing(false) }
  }

  async function disconnectBank(id: string, name: string) {
    if (!confirm(`Disconnect ${name}? This won't delete imported transactions.`)) return
    await fetch(`/api/plaid?id=${id}`, { method: 'DELETE' })
    await loadBankConnections()
  }

  function exportCSV() {
    const rows = filtered.map(t => [
      t.transaction_date,
      `"${t.description}"`,
      t.amount,
      t.payee||'',
      accountName(t.account_id) || t.category || '',
      t.check_number||'',
      t.notes||'',
    ].join(','))
    const csv = ['Date,Description,Amount,Payee,Account,Check #,Notes', ...rows].join('\n')
    const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(new Blob([csv],{type:'text/csv'})), download:`bookkeeping_${tab}_${new Date().toISOString().split('T')[0]}.csv` })
    a.click()
  }

  function accountName(id: string | null | undefined): string | null {
    if (!id) return null
    const a = accounts.find(x => x.id === id)
    return a ? a.name : null
  }

  // Group accounts by report_group for the dropdown
  const groupedAccounts = accounts.reduce((acc, a) => {
    const key = a.report_group || a.account_type.toUpperCase()
    if (!acc[key]) acc[key] = []
    acc[key].push(a)
    return acc
  }, {} as Record<string, Account[]>)

  const filtered = txs.filter(t => {
    if (!search) return true
    const accName = accountName(t.account_id) || ''
    return `${t.description} ${t.payee} ${t.category} ${accName} ${t.check_number||''}`.toLowerCase().includes(search.toLowerCase())
  })
  const income = filtered.filter(t => t.amount > 0).reduce((s,t) => s+t.amount, 0)
  const expenses = filtered.filter(t => t.amount < 0).reduce((s,t) => s+Math.abs(t.amount), 0)
  const net = income - expenses

  const inputCls = 'w-full px-3 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:border-blue-400'

  return (
    <div className="p-6 md:p-8 pt-16 md:pt-8">
      <Script src="https://cdn.plaid.com/link/v2/stable/link-initialize.js" strategy="lazyOnload" />
      <div className="flex items-center justify-between mb-6">
        <div><h1 className="text-2xl font-extrabold text-gray-900">Bookkeeping</h1>
          <p className="text-gray-500 text-sm mt-0.5">Import bank CSV · categorize transactions · attach receipts &amp; checks</p></div>
        <div className="flex gap-3">
          {tab !== 'statements' && tab !== 'uploads' && tab !== 'accounts' && (
          <>
            <button onClick={exportCSV} className="flex items-center gap-2 border border-gray-200 text-gray-600 font-semibold px-4 py-2.5 rounded-xl hover:bg-gray-50"><Download size={14} />Export</button>
            <label className={`flex items-center gap-2 text-white font-semibold px-4 py-2.5 rounded-xl cursor-pointer shadow-md ${uploading?'opacity-60 cursor-not-allowed':''}`} style={{ background:'#185FA5' }}>
              {uploading ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />}{uploading?'Importing...':'Import CSV'}
              <input ref={fileRef} type="file" accept=".csv" className="hidden" onChange={handleCSV} disabled={uploading} />
            </label>
          </>
          )}
          {bankConnections.length > 0 && (
            <button onClick={syncTransactions} disabled={syncing} className="flex items-center gap-2 text-white font-semibold px-4 py-2.5 rounded-xl shadow-md disabled:opacity-60" style={{ background: '#16a34a' }}>
              {syncing ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}{syncing ? 'Syncing...' : 'Sync Bank'}
            </button>
          )}
          <button onClick={connectBank} disabled={connecting} className="flex items-center gap-2 border-2 font-semibold px-4 py-2.5 rounded-xl hover:bg-blue-50 disabled:opacity-60" style={{ borderColor: '#185FA5', color: '#185FA5' }}>
            {connecting ? <Loader2 size={14} className="animate-spin" /> : <Link2 size={14} />}{connecting ? 'Connecting...' : bankConnections.length > 0 ? 'Add Bank' : 'Connect Bank'}
          </button>
        </div>
      </div>

      {/* Connected Banks */}
      {bankConnections.length > 0 && (
        <div className="flex flex-wrap gap-3 mb-4">
          {bankConnections.map(c => (
            <div key={c.id} className="flex items-center gap-2 px-3 py-2 rounded-xl bg-green-50 border border-green-200 text-sm">
              <div className="w-2 h-2 rounded-full bg-green-500" />
              <span className="font-semibold text-green-800">{c.institution_name}</span>
              {c.last_synced_at && <span className="text-xs text-green-600">· Last synced {formatDateShort(c.last_synced_at)}</span>}
              <button onClick={() => disconnectBank(c.id, c.institution_name)} className="text-green-400 hover:text-red-500 ml-1" title="Disconnect">
                <Unplug size={13} />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Summary */}
      {tab !== 'statements' && tab !== 'uploads' && tab !== 'accounts' && (
        <div className="grid grid-cols-3 gap-4 mb-6">
          <div className="bg-green-50 border border-green-100 rounded-2xl p-4"><div className="flex items-center gap-2 mb-2"><TrendingUp size={15} className="text-green-600" /><span className="text-xs font-bold text-green-700 uppercase tracking-wider">Income</span></div><div className="text-2xl font-extrabold text-green-700">{formatCurrency(income)}</div></div>
          <div className="bg-red-50 border border-red-100 rounded-2xl p-4"><div className="flex items-center gap-2 mb-2"><TrendingDown size={15} className="text-red-600" /><span className="text-xs font-bold text-red-700 uppercase tracking-wider">Expenses</span></div><div className="text-2xl font-extrabold text-red-700">{formatCurrency(expenses)}</div></div>
          <div className={`${net>=0?'bg-blue-50 border-blue-100':'bg-orange-50 border-orange-100'} border rounded-2xl p-4`}><div className="flex items-center gap-2 mb-2"><DollarSign size={15} className={net>=0?'text-blue-600':'text-orange-600'} /><span className={`text-xs font-bold uppercase tracking-wider ${net>=0?'text-blue-700':'text-orange-700'}`}>Net</span></div><div className={`text-2xl font-extrabold ${net>=0?'text-blue-700':'text-orange-700'}`}>{formatCurrency(Math.abs(net))}</div></div>
        </div>
      )}

      <div className="flex gap-1 bg-gray-100 rounded-xl p-1 w-fit mb-5">
        {[{k:'bank',l:'Bank Ledger'},{k:'accounting',l:'Accounting Ledger'},{k:'statements',l:'Bank Statements'},{k:'uploads',l:'Checks & Receipts'},{k:'accounts',l:'Chart of Accounts'}].map(({k,l}) => (
          <button key={k} onClick={() => setTab(k as any)} className={`px-4 py-2 rounded-lg text-sm font-semibold transition-all ${tab===k?'bg-white shadow-sm':'text-gray-500'}`} style={{ color: tab===k?'#185FA5':undefined }}>{l}</button>
        ))}
      </div>

      {tab === 'uploads' ? (
        <div>
          {/* Upload area */}
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 mb-6">
            <h3 className="font-bold text-gray-900 mb-4">Upload Check or Receipt</h3>
            <div className="mb-4">
              <label className="block text-sm font-semibold text-gray-700 mb-1">Document Type</label>
              <select value={docType} onChange={e => setDocType(e.target.value as 'receipt' | 'check')}
                className="w-full max-w-xs px-3 py-2.5 rounded-xl border border-gray-200 text-sm font-semibold focus:outline-none focus:ring-2 focus:border-blue-400">
                <option value="receipt">Receipt</option>
                <option value="check">Check</option>
              </select>
            </div>
            <div className="flex gap-3">
              <label className={`flex-1 flex flex-col items-center justify-center gap-2 border-2 border-dashed border-gray-300 rounded-xl px-4 py-8 cursor-pointer hover:bg-gray-50 hover:border-blue-300 transition-all ${docUploading ? 'opacity-60 cursor-not-allowed' : ''}`}>
                {docUploading ? (
                  <Loader2 size={24} className="animate-spin" style={{ color: '#185FA5' }} />
                ) : (
                  <Camera size={24} className="text-gray-400" />
                )}
                <span className="text-sm font-semibold text-gray-600">{docUploading ? 'Uploading...' : 'Take Photo'}</span>
                <span className="text-xs text-gray-400">Camera capture</span>
                <input ref={docRef} type="file" accept="image/*" capture="environment" className="hidden" disabled={docUploading}
                  onChange={e => { const f = e.target.files?.[0]; if (f) uploadDocument(f) }} />
              </label>
              <label className={`flex-1 flex flex-col items-center justify-center gap-2 border-2 border-dashed border-gray-300 rounded-xl px-4 py-8 cursor-pointer hover:bg-gray-50 hover:border-blue-300 transition-all ${docUploading ? 'opacity-60 cursor-not-allowed' : ''}`}>
                {docUploading ? (
                  <Loader2 size={24} className="animate-spin" style={{ color: '#185FA5' }} />
                ) : (
                  <Upload size={24} className="text-gray-400" />
                )}
                <span className="text-sm font-semibold text-gray-600">{docUploading ? 'Uploading...' : 'Upload File'}</span>
                <span className="text-xs text-gray-400">Image or PDF</span>
                <input type="file" accept="image/*,.pdf" className="hidden" disabled={docUploading}
                  onChange={e => { const f = e.target.files?.[0]; if (f) uploadDocument(f) }} />
              </label>
            </div>
          </div>

          {/* Uploaded files list */}
          {loading ? (
            <div className="flex justify-center py-20"><Loader2 size={22} className="animate-spin" style={{ color: '#185FA5' }} /></div>
          ) : uploads.length === 0 ? (
            <div className="text-center py-20 text-gray-400">
              <ImageIcon size={30} className="mx-auto mb-2 opacity-30" />
              <p className="text-sm">No checks or receipts uploaded yet</p>
            </div>
          ) : (
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
              <table className="w-full text-sm">
                <thead><tr className="bg-gray-50 border-b border-gray-100">
                  {['Type', 'File', 'Date Uploaded', 'Actions'].map(h => (
                    <th key={h} className="text-left px-5 py-3 text-xs font-semibold text-gray-600 uppercase tracking-wider">{h}</th>
                  ))}
                </tr></thead>
                <tbody className="divide-y divide-gray-50">
                  {uploads.map(u => (
                    <tr key={u.id} className="hover:bg-gray-50">
                      <td className="px-5 py-3">
                        <span className={`text-xs px-2.5 py-1 rounded-full font-semibold ${u.image_type === 'receipt' ? 'bg-emerald-100 text-emerald-700' : 'bg-blue-100 text-blue-700'}`}>
                          {u.image_type === 'receipt' ? 'Receipt' : 'Check'}
                        </span>
                      </td>
                      <td className="px-5 py-3">
                        <a href={u.file_url} target="_blank" rel="noreferrer" className="flex items-center gap-2 font-medium hover:underline" style={{ color: '#185FA5' }}>
                          {u.image_type === 'receipt' ? <Receipt size={15} /> : <FileImage size={15} />}
                          {u.file_name || (u.image_type === 'receipt' ? 'Receipt' : 'Check')}
                        </a>
                      </td>
                      <td className="px-5 py-3 text-gray-500 text-xs">{u.created_at ? formatDateShort(u.created_at) : '—'}</td>
                      <td className="px-5 py-3">
                        <button onClick={() => deleteUpload(u.id)} className="text-gray-400 hover:text-red-600">
                          <Trash2 size={14} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      ) : tab === 'accounts' ? (
        <AccountsTab />
      ) : tab === 'statements' ? (
        <div>
          <div className="flex items-center gap-3 mb-5">
            <label className={`flex items-center gap-2 text-white font-semibold px-4 py-2.5 rounded-xl cursor-pointer shadow-md ${stmtUploading?'opacity-60 cursor-not-allowed':''}`} style={{ background:'#185FA5' }}>
              {stmtUploading ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />}
              {stmtUploading ? 'Uploading...' : 'Upload Statement'}
              <input ref={stmtRef} type="file" accept=".pdf" className="hidden" disabled={stmtUploading} onChange={e => { const f = e.target.files?.[0]; if (f) uploadStatement(f) }} />
            </label>
            <p className="text-xs text-gray-400">PDF bank statements</p>
          </div>
          {loading ? (
            <div className="flex justify-center py-20"><Loader2 size={22} className="animate-spin" style={{ color:'#185FA5' }} /></div>
          ) : statements.length === 0 ? (
            <div className="text-center py-20 text-gray-400">
              <File size={30} className="mx-auto mb-2 opacity-30" />
              <p className="text-sm">No statements uploaded yet</p>
            </div>
          ) : (
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
              <table className="w-full text-sm">
                <thead><tr className="bg-gray-50 border-b border-gray-100">
                  {['File','Date Uploaded','Actions'].map(h => (
                    <th key={h} className="text-left px-5 py-3 text-xs font-semibold text-gray-600 uppercase tracking-wider">{h}</th>
                  ))}
                </tr></thead>
                <tbody className="divide-y divide-gray-50">
                  {statements.map(s => (
                    <tr key={s.id} className="hover:bg-gray-50">
                      <td className="px-5 py-3">
                        <a href={s.file_url} target="_blank" rel="noreferrer" className="flex items-center gap-2 font-medium hover:underline" style={{ color:'#185FA5' }}>
                          <FileText size={15} />
                          {s.label || s.file_name}
                        </a>
                      </td>
                      <td className="px-5 py-3 text-gray-500 text-xs">{formatDateShort(s.created_at)}</td>
                      <td className="px-5 py-3">
                        <button onClick={() => deleteStatement(s.id, s.file_name)} className="text-gray-400 hover:text-red-600">
                          <Trash2 size={14} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      ) : (
      <>
      <div className="relative mb-4">
        <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search transactions..." className="w-full max-w-sm pl-9 pr-3 py-2 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:border-blue-400" />
      </div>

      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr className="bg-gray-50 border-b border-gray-100">
              {['Date','Description','Payee','Amount','Account','Check #','Files'].map(h => (
                <th key={h} className="text-left px-5 py-3 text-xs font-semibold text-gray-600 uppercase tracking-wider">{h}</th>
              ))}
            </tr></thead>
            <tbody className="divide-y divide-gray-50">
              {loading ? <tr><td colSpan={7} className="text-center py-12"><Loader2 size={22} className="animate-spin mx-auto" style={{ color:'#185FA5' }} /></td></tr>
                : filtered.length === 0 ? <tr><td colSpan={7} className="text-center py-12 text-gray-400 text-sm"><FileText size={30} className="mx-auto mb-2 opacity-30" />No transactions · Import a CSV to get started</td></tr>
                : filtered.map(tx => {
                    const accName = accountName(tx.account_id)
                    const hasReceipt = !!tx.receipt_image
                    const hasCheck = !!tx.check_image
                    return (
                  <tr key={tx.id} onClick={() => setEditing(tx)} className="hover:bg-gray-50 cursor-pointer transition-colors">
                    <td className="px-5 py-3 text-gray-600 text-xs whitespace-nowrap">{formatDateShort(tx.transaction_date)}</td>
                    <td className="px-5 py-3"><div className="text-gray-900 font-medium text-xs truncate max-w-48">{tx.description}</div></td>
                    <td className="px-5 py-3 text-gray-600 text-xs">{tx.payee||'—'}</td>
                    <td className={`px-5 py-3 font-bold text-sm ${tx.amount>=0?'text-green-700':'text-red-600'}`}>{tx.amount>=0?'+':''}{formatCurrency(tx.amount)}</td>
                    <td className="px-5 py-3">{accName || tx.category ? <span className="text-xs px-2 py-0.5 rounded-full font-medium" style={{ background:'rgba(74,173,224,0.1)', color:'#185FA5' }}>{accName || tx.category}</span> : <span className="text-xs text-gray-400 italic">Uncategorized</span>}</td>
                    <td className="px-5 py-3 text-gray-600 text-xs">{tx.check_number||'—'}</td>
                    <td className="px-5 py-3">
                      <div className="flex gap-1.5">
                        {hasReceipt && <Receipt size={14} className="text-emerald-600" />}
                        {hasCheck && <FileImage size={14} className="text-blue-600" />}
                        {!hasReceipt && !hasCheck && <span className="text-xs text-gray-300">—</span>}
                      </div>
                    </td>
                  </tr>
                    )
                  })}
            </tbody>
          </table>
        </div>
      </div>
      </>
      )}

      {editing && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between sticky top-0 bg-white z-10">
              <h2 className="font-bold text-gray-900">Categorize Transaction</h2>
              <button onClick={() => setEditing(null)}><X size={18} className="text-gray-400" /></button>
            </div>
            <div className="p-6 space-y-4">
              <div className="bg-gray-50 rounded-xl p-4 text-sm">
                <div className="font-semibold text-gray-900">{editing.description}</div>
                <div className={`text-xl font-extrabold mt-1 ${editing.amount>=0?'text-green-700':'text-red-600'}`}>{editing.amount>=0?'+':''}{formatCurrency(editing.amount)}</div>
                <div className="text-gray-500 mt-1">{formatDateShort(editing.transaction_date)}</div>
              </div>

              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1">Payee</label>
                <input defaultValue={editing.payee||''} id="payee" className={inputCls} />
              </div>

              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1">Account</label>
                <select defaultValue={editing.account_id || ''} id="account_id" className={inputCls}>
                  <option value="">Select account...</option>
                  {Object.entries(groupedAccounts).map(([group, items]) => (
                    <optgroup key={group} label={group}>
                      {items.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                    </optgroup>
                  ))}
                </select>
                <button type="button" onClick={() => setShowAddAccount(!showAddAccount)}
                  className="flex items-center gap-1 text-xs font-semibold mt-1.5 hover:underline" style={{ color: '#185FA5' }}>
                  <Plus size={12} /> {showAddAccount ? 'Cancel' : 'Add New Category'}
                </button>
                {showAddAccount && (
                  <form onSubmit={addNewAccount} className="mt-2 p-3 bg-blue-50 border border-blue-100 rounded-xl space-y-2">
                    <input name="new_acct_name" placeholder="Category name" required className={inputCls + ' !text-xs !py-2'} />
                    <select name="new_acct_type" required className={inputCls + ' !text-xs !py-2'}>
                      <option value="">Account type...</option>
                      <option value="expense">Expense</option>
                      <option value="revenue">Revenue</option>
                      <option value="asset">Asset</option>
                      <option value="liability">Liability</option>
                      <option value="equity">Equity</option>
                      <option value="distribution">Distribution</option>
                    </select>
                    <select name="new_acct_group" required className={inputCls + ' !text-xs !py-2'}>
                      <option value="">Main category (report group)...</option>
                      {Array.from(new Set([
                        ...accounts.map(a => a.report_group).filter(Boolean) as string[],
                        'PURCHASES', 'SALES', 'ASSETS', 'LIABILITIES', 'OWNER DISTRIBUTIONS'
                      ])).sort().map(g => (
                        <option key={g} value={g}>{g}</option>
                      ))}
                    </select>
                    <button type="submit" disabled={addingSaving}
                      className="w-full text-white font-semibold py-2 rounded-lg text-xs flex items-center justify-center gap-1" style={{ background: '#185FA5' }}>
                      {addingSaving && <Loader2 size={12} className="animate-spin" />}
                      {addingSaving ? 'Creating...' : 'Create Category'}
                    </button>
                  </form>
                )}
              </div>

              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1">Check Number</label>
                <input defaultValue={editing.check_number||''} id="check_number" placeholder="e.g. 1042" className={inputCls} />
              </div>

              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1">Notes</label>
                <input defaultValue={editing.notes||''} id="notes" className={inputCls} />
              </div>

              {/* Attachments */}
              <div className="border-t border-gray-100 pt-4">
                <div className="flex items-center gap-2 mb-3">
                  <Paperclip size={14} className="text-gray-500" />
                  <span className="text-sm font-semibold text-gray-700">Attachments</span>
                </div>

                {/* Existing receipt */}
                {editing.receipt_image && (
                  <div className="flex items-center gap-3 p-3 mb-2 bg-emerald-50 border border-emerald-100 rounded-xl">
                    <Receipt size={16} className="text-emerald-600 flex-shrink-0" />
                    <a href={editing.receipt_image.file_url} target="_blank" rel="noreferrer" className="text-xs font-medium text-emerald-700 hover:underline truncate flex-1">
                      {editing.receipt_image.file_name || 'Receipt'}
                    </a>
                    <button onClick={() => detachImage(editing.receipt_image!.id)} className="text-emerald-600 hover:text-red-600">
                      <Trash2 size={13} />
                    </button>
                  </div>
                )}

                {/* Existing check */}
                {editing.check_image && (
                  <div className="flex items-center gap-3 p-3 mb-2 bg-blue-50 border border-blue-100 rounded-xl">
                    <FileImage size={16} className="text-blue-600 flex-shrink-0" />
                    <a href={editing.check_image.file_url} target="_blank" rel="noreferrer" className="text-xs font-medium text-blue-700 hover:underline truncate flex-1">
                      {editing.check_image.file_name || 'Check'}
                    </a>
                    <button onClick={() => detachImage(editing.check_image!.id)} className="text-blue-600 hover:text-red-600">
                      <Trash2 size={13} />
                    </button>
                  </div>
                )}

                <div className="flex gap-2">
                  {!editing.receipt_image && (
                    <label className={`flex-1 flex items-center justify-center gap-2 border border-dashed border-gray-300 rounded-xl px-3 py-2.5 text-xs font-semibold text-gray-600 cursor-pointer hover:bg-gray-50 ${imgUploading==='receipt'?'opacity-60 cursor-not-allowed':''}`}>
                      {imgUploading === 'receipt' ? <Loader2 size={13} className="animate-spin" /> : <Receipt size={13} />}
                      {imgUploading === 'receipt' ? 'Uploading...' : 'Add Receipt'}
                      <input ref={receiptRef} type="file" accept="image/*,.pdf" className="hidden" disabled={!!imgUploading} onChange={e => { const f = e.target.files?.[0]; if (f) uploadImage('receipt', f) }} />
                    </label>
                  )}
                  {!editing.check_image && (
                    <label className={`flex-1 flex items-center justify-center gap-2 border border-dashed border-gray-300 rounded-xl px-3 py-2.5 text-xs font-semibold text-gray-600 cursor-pointer hover:bg-gray-50 ${imgUploading==='check'?'opacity-60 cursor-not-allowed':''}`}>
                      {imgUploading === 'check' ? <Loader2 size={13} className="animate-spin" /> : <FileImage size={13} />}
                      {imgUploading === 'check' ? 'Uploading...' : 'Add Check'}
                      <input ref={checkRef} type="file" accept="image/*,.pdf" className="hidden" disabled={!!imgUploading} onChange={e => { const f = e.target.files?.[0]; if (f) uploadImage('check', f) }} />
                    </label>
                  )}
                </div>
              </div>

              <button onClick={() => {
                const payee = (document.getElementById('payee') as HTMLInputElement)?.value
                const notes = (document.getElementById('notes') as HTMLInputElement)?.value
                const account_id = (document.getElementById('account_id') as HTMLSelectElement)?.value || null
                const check_number = (document.getElementById('check_number') as HTMLInputElement)?.value || null
                const updates: Partial<Tx> = { payee, notes, account_id, check_number }
                // Keep legacy `category` text in sync with the selected account name
                // so the existing accounting_entries display stays meaningful.
                const accName = accountName(account_id)
                if (accName) (updates as any).category = accName
                updateTx(editing.id, updates)
              }} className="w-full text-white font-bold py-3 rounded-xl" style={{ background:'#185FA5' }}>Save Changes</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
