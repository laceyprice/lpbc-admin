'use client'
import { useEffect, useState, useRef } from 'react'
import { Upload, Search, Download, TrendingUp, TrendingDown, DollarSign, FileText, Loader2, X, Paperclip, Receipt, FileImage, Trash2, Plus, File, Camera, Image as ImageIcon, Link2, RefreshCw, Unplug, Edit3, FolderOpen, Sparkles, CheckCircle2, AlertCircle, Scale, CheckSquare, Square, Wand2, CheckCheck } from 'lucide-react'
import { formatCurrency, formatDateShort } from '@/lib/utils'
import Script from 'next/script'
import DrivePicker from '@/components/admin/DrivePicker'

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
          className="flex items-center gap-2 text-white font-semibold px-4 py-2.5 rounded-xl shadow-md" style={{ background: '#b8895a' }}>
          <Plus size={14} /> Add Account
        </button>
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

interface AttachedImage {
  id: string
  file_url: string
  file_name: string | null
  image_type: 'receipt' | 'check'
  created_at?: string
  // OCR-populated fields
  vendor?: string | null
  amount?: number | null
  receipt_date?: string | null
  check_number?: string | null
  notes?: string | null
  matched_bank_transaction_id?: string | null
  matched_tx?: {
    id: string
    transaction_date: string
    description: string
    amount: number
    check_number: string | null
  } | null
}

interface OcrResult {
  vendor?: string | null
  amount?: number | null
  date?: string | null
  check_number?: string | null
  memo?: string | null
  category?: string | null
  confidence?: 'high' | 'medium' | 'low'
  matched_transactions?: Array<{
    id: string
    transaction_date: string
    description: string
    amount: number
    payee?: string | null
    category?: string | null
  }>
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

interface FinancialAccount {
  id: string
  name: string
  color: string
  description: string | null
  account_number: string | null
  is_active: boolean
}

export default function BookkeepingPage() {
  const [tab, setTab] = useState<'bank'|'accounting'|'reconciliation'|'statements'|'uploads'|'accounts'>('bank')
  const [txs, setTxs] = useState<Tx[]>([])
  const [accounts, setAccounts] = useState<Account[]>([])
  const [financialAccounts, setFinancialAccounts] = useState<FinancialAccount[]>([])
  const [selectedAccountId, setSelectedAccountId] = useState<string | null>(null)
  const [showManageAccounts, setShowManageAccounts] = useState(false)
  const [addingAccount, setAddingAccount] = useState(false)
  const [editingAccountId, setEditingAccountId] = useState<string | null>(null)
  const [showArchivedAccounts, setShowArchivedAccounts] = useState(false)

  // Date range for summary cards
  const [dateMode, setDateMode] = useState<'month' | 'ytd' | 'custom'>('month')
  const [customFrom, setCustomFrom] = useState('')
  const [customTo, setCustomTo] = useState('')

  // Bank ledger: track which transactions have been posted to accounting ledger
  const [postedIds, setPostedIds] = useState<Set<string>>(new Set())
  const [accepting, setAccepting] = useState<Set<string>>(new Set())

  // Bank ledger: multi-select + bulk-update
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [bulkPayee, setBulkPayee] = useState('')
  const [bulkAccountId, setBulkAccountId] = useState('')
  const [bulkSaving, setBulkSaving] = useState(false)

  // Plaid accounts (one bank login may expose multiple accounts; each one
  // needs to be mapped to a financial_account so transactions land in the right place).
  const [plaidAccounts, setPlaidAccounts] = useState<any[]>([])
  const [showPlaidAccounts, setShowPlaidAccounts] = useState(false)

  async function loadPlaidAccounts() {
    try {
      const res = await fetch('/api/plaid?action=accounts', { method: 'POST' })
      const d = await res.json()
      setPlaidAccounts(Array.isArray(d) ? d : [])
    } catch { setPlaidAccounts([]) }
  }

  async function mapPlaidAccount(plaidAccountId: string, financialAccountId: string | null) {
    await fetch('/api/plaid?action=map-account', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ plaid_account_id: plaidAccountId, financial_account_id: financialAccountId }),
    })
    await loadPlaidAccounts()
    await load() // refresh ledger so transactions move to the right account
  }
  const [accountSaving, setAccountSaving] = useState(false)
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState(false)
  const [search, setSearch] = useState('')
  const [sortCol, setSortCol] = useState<string>('date')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc')
  function toggleSort(col: string) {
    if (sortCol === col) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortCol(col); setSortDir('desc') }
  }
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
  const [ocrAnalyzing, setOcrAnalyzing] = useState<Record<string, boolean>>({})
  const [editingUpload, setEditingUpload] = useState<any | null>(null)
  const [savingUploadEdit, setSavingUploadEdit] = useState(false)
  // Multi-select state for the Checks & Receipts table
  const [selectedUploads, setSelectedUploads] = useState<Set<string>>(new Set())
  const [bulkUploadAccountId, setBulkUploadAccountId] = useState('')
  const [showDrivePicker, setShowDrivePicker] = useState(false)
  const [showAddTx, setShowAddTx] = useState(false)
  const [addTxSaving, setAddTxSaving] = useState(false)
  const [addTxForm, setAddTxForm] = useState({
    transaction_date: new Date().toISOString().split('T')[0],
    description: '',
    payee: '',
    amount: '',
    financial_account_id: '',
    account_id: '',
    check_number: '',
  })

  async function saveAddTx() {
    if (!addTxForm.description || !addTxForm.amount || !addTxForm.transaction_date) {
      alert('Date, description, and amount are required')
      return
    }
    setAddTxSaving(true)
    try {
      const res = await fetch('/api/bookkeeping', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          table: 'bank_transactions',
          transaction_date: addTxForm.transaction_date,
          description: addTxForm.description,
          payee: addTxForm.payee || null,
          amount: parseFloat(addTxForm.amount),
          financial_account_id: addTxForm.financial_account_id || selectedAccountId || null,
          account_id: addTxForm.account_id || null,
          check_number: addTxForm.check_number || null,
          source: 'manual',
        }),
      })
      if (!res.ok) {
        const j = await res.json().catch(() => ({}))
        alert('Failed to save: ' + (j.error || 'Unknown error'))
        return
      }
      setShowAddTx(false)
      setAddTxForm({
        transaction_date: new Date().toISOString().split('T')[0],
        description: '', payee: '', amount: '',
        financial_account_id: '', account_id: '', check_number: '',
      })
      await load()
    } finally { setAddTxSaving(false) }
  }
  const [bulkUploadSaving, setBulkUploadSaving] = useState(false)
  const [ocrResults, setOcrResults] = useState<Record<string, OcrResult>>({})
  const [modalOcr, setModalOcr] = useState<{ imageId: string; data: OcrResult } | null>(null)
  const docRef = useRef<HTMLInputElement>(null)
  const stmtRef = useRef<HTMLInputElement>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const receiptRef = useRef<HTMLInputElement>(null)
  const checkRef = useRef<HTMLInputElement>(null)

  useEffect(() => { loadAccounts(); loadBankConnections(); loadFinancialAccounts(); loadPlaidAccounts() }, [])
  useEffect(() => { load() }, [tab, selectedAccountId])

  async function loadAccounts() {
    try {
      const res = await fetch('/api/chart-of-accounts')
      const d = await res.json()
      setAccounts(Array.isArray(d) ? d : [])
    } catch {}
  }

  async function loadFinancialAccounts() {
    try {
      const res = await fetch('/api/financial-accounts')
      const d = await res.json()
      setFinancialAccounts(Array.isArray(d) ? d : [])
    } catch {}
  }

  async function addFinancialAccount(e: React.FormEvent) {
    e.preventDefault()
    setAccountSaving(true)
    const fd = new FormData(e.currentTarget as HTMLFormElement)
    try {
      const res = await fetch('/api/financial-accounts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: fd.get('acct_name'),
          description: fd.get('acct_desc'),
          account_number: fd.get('acct_number'),
        }),
      })
      const d = await res.json()
      if (d.error) { alert(d.error); return }
      await loadFinancialAccounts()
      setAddingAccount(false)
    } catch { alert('Failed to create account') }
    finally { setAccountSaving(false) }
  }

  async function saveFinancialAccountEdit(e: React.FormEvent, id: string) {
    e.preventDefault()
    setAccountSaving(true)
    const fd = new FormData(e.currentTarget as HTMLFormElement)
    try {
      const res = await fetch('/api/financial-accounts', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id,
          name: fd.get('edit_name'),
          description: fd.get('edit_desc'),
          account_number: fd.get('edit_number'),
        }),
      })
      const d = await res.json()
      if (d.error) { alert(d.error); return }
      await loadFinancialAccounts()
      setEditingAccountId(null)
    } catch { alert('Failed to update account') }
    finally { setAccountSaving(false) }
  }

  async function deleteFinancialAccount(id: string, name: string) {
    if (!confirm(`Archive account "${name}"?\n\nIt will be hidden from your active list but kept for reference. You can unarchive it later from "Show Archived".`)) return
    await fetch(`/api/financial-accounts?id=${id}`, { method: 'DELETE' })
    if (selectedAccountId === id) setSelectedAccountId(null)
    await loadFinancialAccounts()
  }

  async function unarchiveFinancialAccount(id: string) {
    await fetch('/api/financial-accounts', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, is_active: true }),
    })
    await loadFinancialAccounts()
  }

  // Toggle selection of a single transaction
  function toggleSelect(id: string) {
    setSelected(prev => {
      const n = new Set(prev)
      if (n.has(id)) n.delete(id); else n.add(id)
      return n
    })
  }

  // Select all visible transactions (or clear if all are already selected)
  function selectAll() {
    if (selected.size === filtered.length) setSelected(new Set())
    else setSelected(new Set(filtered.map(t => t.id)))
  }

  // Apply payee and/or account to all selected transactions at once
  async function bulkUpdate() {
    if (selected.size === 0) return
    if (!bulkPayee && !bulkAccountId) { alert('Enter a payee or pick an account first'); return }
    setBulkSaving(true)
    try {
      const body: any = { ids: Array.from(selected) }
      if (bulkPayee) body.payee = bulkPayee
      if (bulkAccountId) body.account_id = bulkAccountId
      const res = await fetch('/api/bookkeeping?action=bulk-update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (!res.ok) { const e = await res.json(); alert(e.error || 'Failed to update'); return }
      setBulkPayee(''); setBulkAccountId('')
      await load()
    } finally { setBulkSaving(false) }
  }

  // Permanently delete all selected transactions (and any linked accounting entries)
  async function bulkDelete() {
    if (selected.size === 0) return
    if (!confirm(`Permanently delete ${selected.size} transaction${selected.size === 1 ? '' : 's'}?\n\nLinked accounting entries will also be removed. This cannot be undone.`)) return
    setBulkSaving(true)
    try {
      const res = await fetch('/api/bookkeeping?action=bulk-delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: Array.from(selected) }),
      })
      if (!res.ok) { const e = await res.json(); alert(e.error || 'Delete failed'); return }
      setSelected(new Set())
      await load()
    } finally { setBulkSaving(false) }
  }

  // Auto-select probable duplicates (same date + description + amount).
  // Keeps the first occurrence in each group and selects every subsequent copy
  // so the user can review and bulk-delete them.
  function findDuplicates() {
    const seen = new Map<string, string>() // key → first id seen
    const dupIds = new Set<string>()
    // Sort by created_at asc so the OLDEST in each group is kept
    const sorted = [...filtered].sort((a, b) => (a.created_at || '').localeCompare(b.created_at || ''))
    for (const t of sorted) {
      const key = `${t.transaction_date}|${(t.description || '').trim().toLowerCase()}|${Number(t.amount).toFixed(2)}`
      if (seen.has(key)) {
        dupIds.add(t.id)
      } else {
        seen.set(key, t.id)
      }
    }
    if (dupIds.size === 0) {
      alert('No duplicates found in the current view.\n\nA duplicate = same date + description + amount.')
      return
    }
    setSelected(dupIds)
  }

  // Post all selected (categorized) transactions to the accounting ledger
  async function bulkAccept() {
    if (selected.size === 0) return
    setBulkSaving(true)
    try {
      const ids = Array.from(selected)
      await Promise.all(ids.map(id => {
        const tx = txs.find(t => t.id === id)
        if (tx && tx.account_id) {
          return fetch('/api/bookkeeping?action=accept', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id }),
          })
        }
        return Promise.resolve()
      }))
      setSelected(new Set())
      await load()
    } finally { setBulkSaving(false) }
  }

  // Quick-accept: post a bank transaction to the accounting ledger
  async function acceptTx(tx: Tx) {
    if (!tx.account_id) {
      alert('Categorize this transaction first (assign an account) before posting.')
      return
    }
    setAccepting(prev => new Set(prev).add(tx.id))
    try {
      const res = await fetch('/api/bookkeeping?action=accept', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: tx.id }),
      })
      if (!res.ok) {
        const e = await res.json()
        alert(e.error || 'Failed to post transaction')
        return
      }
      setPostedIds(prev => new Set(prev).add(tx.id))
      await load()
    } finally {
      setAccepting(prev => { const n = new Set(prev); n.delete(tx.id); return n })
    }
  }

  async function load() {
    setLoading(true)
    if (tab === 'statements') {
      const res = await fetch(`/api/bank-statements${selectedAccountId ? `?account_id=${selectedAccountId}` : ''}`)
      const d = await res.json()
      setStatements(Array.isArray(d) ? d : [])
    } else if (tab === 'uploads') {
      const res = await fetch(`/api/transaction-images${selectedAccountId ? `?account_id=${selectedAccountId}` : ''}`)
      const d = await res.json()
      setUploads(Array.isArray(d) ? d : [])
    } else {
      const table = tab === 'bank' ? 'bank_transactions' : 'accounting_entries'
      const params = new URLSearchParams({ table })
      if (selectedAccountId) params.append('account_id', selectedAccountId)
      const res = await fetch(`/api/bookkeeping?${params}`)
      const d = await res.json()
      const rows = Array.isArray(d) ? d : []
      setTxs(rows)
      if (tab === 'bank') {
        // Collect posted IDs from the _posted flag returned by the API
        const posted = new Set(rows.filter((r: any) => r._posted).map((r: any) => r.id as string))
        setPostedIds(posted)
      }
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
      const res = await fetch('/api/bookkeeping?action=csv-import', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({ transactions:result.data, importBatchId:`csv_${Date.now()}`, financial_account_id: selectedAccountId }) })
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
    setModalOcr(null)
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

      // 4. Run OCR and show suggestions in modal
      try {
        const ocrRes = await fetch('/api/parse-receipt', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ image_id: img.id }),
        })
        if (ocrRes.ok) {
          const ocrData: OcrResult = await ocrRes.json()
          if (ocrData.vendor || ocrData.amount || ocrData.check_number) {
            setModalOcr({ imageId: img.id, data: ocrData })
          }
        }
      } catch { /* OCR is best-effort, don't block */ }
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

  async function uploadStatement(files: File | File[]) {
    const list = Array.isArray(files) ? files : [files]
    if (list.length === 0) return
    setStmtUploading(true)
    let okCount = 0
    let failCount = 0
    try {
      // Upload sequentially so we don't blast Supabase storage; small files anyway
      for (const file of list) {
        const fd = new FormData()
        fd.append('file', file)
        if (selectedAccountId) fd.append('financial_account_id', selectedAccountId)
        const res = await fetch('/api/bank-statements', { method: 'POST', body: fd })
        if (res.ok) okCount++
        else failCount++
      }
      await load()
      if (list.length > 1) {
        alert(`Uploaded ${okCount} of ${list.length} statements${failCount ? ` (${failCount} failed)` : ''}`)
      } else if (failCount > 0) {
        alert('Upload failed')
      }
    } catch { alert('Upload failed') }
    finally { setStmtUploading(false); if (stmtRef.current) stmtRef.current.value = '' }
  }

  async function uploadDocument(fileOrFiles: File | File[]) {
    const list = Array.isArray(fileOrFiles) ? fileOrFiles : [fileOrFiles]
    if (list.length === 0) return
    setDocUploading(true)
    try {
      // For multi-file uploads, upload all then run OCR on each
      const uploaded: any[] = []
      for (const file of list) {
        const fd = new FormData()
        fd.append('file', file)
        fd.append('image_type', docType)
        const res = await fetch('/api/transaction-images?action=upload', { method: 'POST', body: fd })
        if (!res.ok) continue
        uploaded.push(await res.json())
      }
      if (uploaded.length === 0) { alert('Upload failed'); return }
      await load()
      // For single-file path, keep the original OCR flow. For multi, queue OCR.
      const img = uploaded[0]
      // Run OCR on remaining files in background (fire-and-forget per file)
      for (const extra of uploaded.slice(1)) {
        setOcrAnalyzing(prev => ({ ...prev, [extra.id]: true }))
        fetch('/api/parse-receipt', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ image_id: extra.id }),
        }).then(async r => {
          if (r.ok) {
            const ocrData: OcrResult = await r.json()
            setOcrResults(prev => ({ ...prev, [extra.id]: ocrData }))
          }
        }).finally(() => {
          setOcrAnalyzing(prev => { const n = { ...prev }; delete n[extra.id]; return n })
        })
      }

      // Run OCR — show live "Analyzing..." state in the table
      setOcrAnalyzing(prev => ({ ...prev, [img.id]: true }))
      try {
        const ocrRes = await fetch('/api/parse-receipt', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ image_id: img.id }),
        })
        if (ocrRes.ok) {
          const ocrData: OcrResult = await ocrRes.json()
          setOcrResults(prev => ({ ...prev, [img.id]: ocrData }))
          await load() // refresh so DB-updated vendor/amount/date show in the table
        }
      } finally {
        setOcrAnalyzing(prev => { const n = { ...prev }; delete n[img.id]; return n })
      }
    } catch { alert('Upload failed') }
    finally { setDocUploading(false); if (docRef.current) docRef.current.value = '' }
  }

  async function deleteUpload(id: string) {
    if (!confirm('Delete this file?')) return
    await fetch(`/api/transaction-images?id=${id}`, { method: 'DELETE' })
    await load()
  }

  // Re-run AI OCR on an existing upload (vendor/amount/date extraction)
  async function rescanOcr(id: string) {
    setOcrAnalyzing(prev => ({ ...prev, [id]: true }))
    try {
      await fetch('/api/parse-receipt', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ image_id: id }),
      })
      await load()
    } finally {
      setOcrAnalyzing(prev => { const n = { ...prev }; delete n[id]; return n })
    }
  }

  // Multi-select toggle for receipts/checks
  function toggleUploadSelect(id: string) {
    setSelectedUploads(prev => {
      const n = new Set(prev)
      if (n.has(id)) n.delete(id); else n.add(id)
      return n
    })
  }

  // Select all visible receipts/checks in the current view
  function selectAllUploads() {
    if (selectedUploads.size === uploads.length) setSelectedUploads(new Set())
    else setSelectedUploads(new Set(uploads.map(u => u.id)))
  }

  // Bulk-assign all selected uploads to the chosen financial account
  async function bulkAssignUploads() {
    if (selectedUploads.size === 0) return
    if (!bulkUploadAccountId && bulkUploadAccountId !== '') {
      // Allow empty string to mean "set to None" — fall through
    }
    setBulkUploadSaving(true)
    try {
      const ids = Array.from(selectedUploads)
      // Apply in parallel — small batch sizes here so this is fine
      await Promise.all(ids.map(id =>
        fetch('/api/transaction-images', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            id,
            financial_account_id: bulkUploadAccountId || null,
          }),
        })
      ))
      setSelectedUploads(new Set())
      setBulkUploadAccountId('')
      await load()
    } finally { setBulkUploadSaving(false) }
  }

  // Bulk-delete selected uploads
  async function bulkDeleteUploads() {
    if (selectedUploads.size === 0) return
    if (!confirm(`Permanently delete ${selectedUploads.size} receipt${selectedUploads.size === 1 ? '' : 's'}/check${selectedUploads.size === 1 ? '' : 's'}?`)) return
    setBulkUploadSaving(true)
    try {
      const ids = Array.from(selectedUploads)
      await Promise.all(ids.map(id =>
        fetch(`/api/transaction-images?id=${id}`, { method: 'DELETE' })
      ))
      setSelectedUploads(new Set())
      await load()
    } finally { setBulkUploadSaving(false) }
  }

  // Patch a single upload field — used by the inline Account dropdown on each row
  async function saveUploadField(id: string, updates: Record<string, any>) {
    const res = await fetch('/api/transaction-images', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, ...updates }),
    })
    if (!res.ok) { alert('Save failed'); return }
    await load()
  }

  // Save edits from the upload edit modal (vendor, amount, date, account, etc.)
  async function saveUploadEdit(updates: Record<string, any>) {
    if (!editingUpload) return
    setSavingUploadEdit(true)
    try {
      const res = await fetch('/api/transaction-images', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: editingUpload.id, ...updates }),
      })
      if (!res.ok) { alert('Save failed'); return }
      setEditingUpload(null)
      await load()
    } finally { setSavingUploadEdit(false) }
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

  // Compute date range bounds (applied to BOTH summary and table)
  const today = new Date()
  const summaryFrom = dateMode === 'ytd'
    ? new Date(today.getFullYear(), 0, 1).toISOString().split('T')[0]
    : dateMode === 'month'
    ? new Date(today.getFullYear(), today.getMonth(), 1).toISOString().split('T')[0]
    : customFrom
  const summaryTo = dateMode === 'custom' ? customTo : today.toISOString().split('T')[0]

  // Apply date range + search in one pass so the table, summary, CSV export, and select-all all match
  const filtered = txs.filter(t => {
    // Date range filter
    if (summaryFrom || summaryTo) {
      const d = t.transaction_date
      if (summaryFrom && d < summaryFrom) return false
      if (summaryTo && d > summaryTo) return false
    }
    // Search filter
    if (!search) return true
    const accName = accountName(t.account_id) || ''
    return `${t.description} ${t.payee} ${t.category} ${accName} ${t.check_number||''}`.toLowerCase().includes(search.toLowerCase())
  })

  // ── Sorting ──────────────────────────────────────────────
  const sortedFiltered = [...filtered].sort((a, b) => {
    const dir = sortDir === 'asc' ? 1 : -1
    let av: any, bv: any
    switch (sortCol) {
      case 'date': av = a.transaction_date || ''; bv = b.transaction_date || ''; break
      case 'description': av = (a.description || '').toLowerCase(); bv = (b.description || '').toLowerCase(); break
      case 'payee': av = (a.payee || '').toLowerCase(); bv = (b.payee || '').toLowerCase(); break
      case 'amount': av = Number(a.amount) || 0; bv = Number(b.amount) || 0; break
      case 'account': av = accountName(a.account_id) || ''; bv = accountName(b.account_id) || ''; break
      case 'check': av = a.check_number || ''; bv = b.check_number || ''; break
      default: av = a.transaction_date || ''; bv = b.transaction_date || ''
    }
    if (av < bv) return -1 * dir
    if (av > bv) return 1 * dir
    return 0
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
            <label className={`flex items-center gap-2 text-white font-semibold px-4 py-2.5 rounded-xl cursor-pointer shadow-md ${uploading?'opacity-60 cursor-not-allowed':''}`} style={{ background:'#b8895a' }}>
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
          <button onClick={() => setShowAddTx(true)} className="flex items-center gap-2 border-2 font-semibold px-4 py-2.5 rounded-xl hover:bg-blue-50" style={{ borderColor: '#b8895a', color: '#b8895a' }}>
            <Plus size={14} />Add Transaction
          </button>
          <button onClick={connectBank} disabled={connecting} className="flex items-center gap-2 border-2 font-semibold px-4 py-2.5 rounded-xl hover:bg-blue-50 disabled:opacity-60" style={{ borderColor: '#b8895a', color: '#b8895a' }}>
            {connecting ? <Loader2 size={14} className="animate-spin" /> : <Link2 size={14} />}{connecting ? 'Connecting...' : bankConnections.length > 0 ? 'Add Bank' : 'Connect Bank'}
          </button>
        </div>
      </div>

      {showAddTx && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={() => setShowAddTx(false)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6" onClick={e => e.stopPropagation()}>
            <h3 className="font-bold text-lg mb-4" style={{ color: '#2f5a5e' }}>Add Manual Transaction</h3>
            <div className="space-y-3">
              <div>
                <label className="text-xs font-semibold text-gray-700">Date</label>
                <input type="date" value={addTxForm.transaction_date} onChange={e => setAddTxForm({ ...addTxForm, transaction_date: e.target.value })} className={inputCls} />
              </div>
              <div>
                <label className="text-xs font-semibold text-gray-700">Description</label>
                <input type="text" value={addTxForm.description} onChange={e => setAddTxForm({ ...addTxForm, description: e.target.value })} className={inputCls} placeholder="e.g. Lowes purchase" />
              </div>
              <div>
                <label className="text-xs font-semibold text-gray-700">Payee</label>
                <input type="text" value={addTxForm.payee} onChange={e => setAddTxForm({ ...addTxForm, payee: e.target.value })} className={inputCls} placeholder="e.g. Lowes" />
              </div>
              <div>
                <label className="text-xs font-semibold text-gray-700">Amount (negative for expense)</label>
                <input type="number" step="0.01" value={addTxForm.amount} onChange={e => setAddTxForm({ ...addTxForm, amount: e.target.value })} className={inputCls} placeholder="-50.00" />
              </div>
              <div>
                <label className="text-xs font-semibold text-gray-700">Account</label>
                <select value={addTxForm.financial_account_id} onChange={e => setAddTxForm({ ...addTxForm, financial_account_id: e.target.value })} className={inputCls}>
                  <option value="">— Select bank account —</option>
                  {financialAccounts.filter(a => a.is_active).map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs font-semibold text-gray-700">Category (optional)</label>
                <select value={addTxForm.account_id} onChange={e => setAddTxForm({ ...addTxForm, account_id: e.target.value })} className={inputCls}>
                  <option value="">— Uncategorized —</option>
                  {accounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs font-semibold text-gray-700">Check # (optional)</label>
                <input type="text" value={addTxForm.check_number} onChange={e => setAddTxForm({ ...addTxForm, check_number: e.target.value })} className={inputCls} />
              </div>
            </div>
            <div className="flex gap-2 mt-5">
              <button onClick={() => setShowAddTx(false)} className="flex-1 py-2.5 rounded-xl border border-gray-300 text-sm font-semibold text-gray-700 hover:bg-gray-50">Cancel</button>
              <button onClick={saveAddTx} disabled={addTxSaving} className="flex-1 py-2.5 rounded-xl text-white text-sm font-semibold disabled:opacity-50" style={{ background: '#b8895a' }}>
                {addTxSaving ? 'Saving...' : 'Save Transaction'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Account Selector */}
      <div className="flex items-center gap-2 mb-4 flex-wrap">
        <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider mr-1">Account:</span>
        <button
          onClick={() => setSelectedAccountId(null)}
          className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all border ${!selectedAccountId ? 'text-white shadow-sm' : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-50'}`}
          style={!selectedAccountId ? { background: '#b8895a', borderColor: '#b8895a' } : {}}>
          All Accounts
        </button>
        {financialAccounts.filter(a => a.is_active).map(a => (
          <button
            key={a.id}
            onClick={() => setSelectedAccountId(a.id)}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all border ${selectedAccountId === a.id ? 'text-white shadow-sm' : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-50'}`}
            style={selectedAccountId === a.id ? { background: a.color || '#b8895a', borderColor: a.color || '#b8895a' } : {}}>
            {a.name}
          </button>
        ))}
        <button
          onClick={() => setShowManageAccounts(!showManageAccounts)}
          className="px-3 py-1.5 rounded-lg text-xs font-semibold border border-dashed border-gray-300 text-gray-400 hover:border-gray-400 hover:text-gray-600 transition-all">
          + Manage Accounts
        </button>
      </div>

      {/* Manage Accounts Panel */}
      {showManageAccounts && (
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5 mb-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-bold text-gray-900 text-sm">Financial Accounts</h3>
            <div className="flex items-center gap-2">
              <label className="flex items-center gap-1.5 text-xs text-gray-500 cursor-pointer">
                <input type="checkbox" checked={showArchivedAccounts} onChange={e => setShowArchivedAccounts(e.target.checked)} />
                Show archived ({financialAccounts.filter(a => !a.is_active).length})
              </label>
              <button onClick={() => setAddingAccount(!addingAccount)}
                className="text-xs font-semibold px-3 py-1.5 rounded-lg text-white" style={{ background: '#b8895a' }}>
                + New Account
              </button>
            </div>
          </div>
          {addingAccount && (
            <form onSubmit={addFinancialAccount} className="grid grid-cols-12 gap-2 mb-3">
              <input name="acct_name" required placeholder="Account name (e.g. Chase Checking)" className="col-span-4 px-3 py-2 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:border-blue-400" />
              <input name="acct_desc" placeholder="Description (optional)" className="col-span-4 px-3 py-2 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:border-blue-400" />
              <input name="acct_number" placeholder="Account # (optional)" className="col-span-2 px-3 py-2 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:border-blue-400" />
              <button type="submit" disabled={accountSaving} className="col-span-1 px-3 py-2 rounded-xl text-white text-sm font-semibold" style={{ background: '#b8895a' }}>
                {accountSaving ? <Loader2 size={14} className="animate-spin" /> : 'Add'}
              </button>
              <button type="button" onClick={() => setAddingAccount(false)} className="col-span-1 px-3 py-2 rounded-xl border border-gray-200 text-sm text-gray-500">Cancel</button>
            </form>
          )}
          {(() => {
            const visible = financialAccounts.filter(a => showArchivedAccounts ? true : a.is_active)
            return visible.length === 0 ? (
              <p className="text-xs text-gray-400 italic">
                {financialAccounts.length === 0
                  ? 'No accounts yet. Create one to start organizing transactions.'
                  : 'No active accounts. Toggle "Show archived" to see archived ones.'}
              </p>
            ) : (
            <div className="divide-y divide-gray-50">
              {visible.map(a => editingAccountId === a.id ? (
                <form key={a.id} onSubmit={(e) => saveFinancialAccountEdit(e, a.id)} className="grid grid-cols-12 gap-2 py-2">
                  <input name="edit_name" defaultValue={a.name} required placeholder="Account name" className="col-span-4 px-3 py-2 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:border-blue-400" />
                  <input name="edit_desc" defaultValue={a.description || ''} placeholder="Description" className="col-span-4 px-3 py-2 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:border-blue-400" />
                  <input name="edit_number" defaultValue={a.account_number || ''} placeholder="Account #" className="col-span-2 px-3 py-2 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:border-blue-400" />
                  <button type="submit" disabled={accountSaving} className="col-span-1 px-3 py-2 rounded-xl text-white text-sm font-semibold" style={{ background: '#b8895a' }}>
                    {accountSaving ? <Loader2 size={14} className="animate-spin" /> : 'Save'}
                  </button>
                  <button type="button" onClick={() => setEditingAccountId(null)} className="col-span-1 px-3 py-2 rounded-xl border border-gray-200 text-sm text-gray-500">Cancel</button>
                </form>
              ) : (
                <div key={a.id} className={`flex items-center gap-3 py-2 ${!a.is_active ? 'opacity-50' : ''}`}>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-baseline gap-2 flex-wrap">
                      <span className="text-sm font-medium text-gray-800">{a.name}</span>
                      {a.account_number && <span className="text-xs text-gray-500 font-mono">#{a.account_number}</span>}
                      {!a.is_active && <span className="text-[10px] uppercase font-bold tracking-wider px-1.5 py-0.5 rounded bg-gray-200 text-gray-600">Archived</span>}
                    </div>
                    {a.description && <div className="text-xs text-gray-400">{a.description}</div>}
                  </div>
                  <button onClick={() => setEditingAccountId(a.id)} className="text-gray-300 hover:text-blue-600" title="Edit">
                    <Edit3 size={13} />
                  </button>
                  {a.is_active ? (
                    <button onClick={() => deleteFinancialAccount(a.id, a.name)} className="text-gray-300 hover:text-red-500" title="Archive">
                      <Trash2 size={13} />
                    </button>
                  ) : (
                    <button onClick={() => unarchiveFinancialAccount(a.id)} className="text-xs font-semibold text-green-600 hover:text-green-700" title="Unarchive">
                      Unarchive
                    </button>
                  )}
                </div>
              ))}
            </div>
            )
          })()}
        </div>
      )}

      {/* Connected Banks */}
      {bankConnections.length > 0 && (
        <div className="flex flex-wrap gap-3 mb-4 items-center">
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
          {plaidAccounts.length > 0 && (
            <button onClick={() => setShowPlaidAccounts(!showPlaidAccounts)}
              className="text-xs font-semibold px-3 py-2 rounded-xl border border-gray-200 hover:bg-gray-50">
              {showPlaidAccounts ? 'Hide' : 'Map'} Bank Accounts ({plaidAccounts.length})
              {plaidAccounts.some(a => !a.financial_account_id) && <span className="ml-1 text-amber-600">·  unmapped</span>}
            </button>
          )}
        </div>
      )}

      {/* Plaid → Financial Account mapping */}
      {showPlaidAccounts && plaidAccounts.length > 0 && (
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4 mb-4">
          <h3 className="font-bold text-gray-900 text-sm mb-1">Bank Account → Financial Account</h3>
          <p className="text-xs text-gray-500 mb-3">
            Each row below is a bank account discovered through your bank login. Map each one to one of your financial accounts (LPBC, Causey, Hawks Seascape, etc.) so transactions land under the right account.
          </p>
          <div className="space-y-2">
            {plaidAccounts.map((pa: any) => (
              <div key={pa.id} className="flex flex-wrap items-center gap-3 px-3 py-2 rounded-lg bg-gray-50 border border-gray-100">
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-semibold text-gray-900">
                    {pa.name || pa.official_name || pa.plaid_account_id}
                    {pa.mask && <span className="ml-2 text-xs text-gray-500 font-mono">···{pa.mask}</span>}
                  </div>
                  <div className="text-xs text-gray-500">
                    {pa.plaid_connection?.institution_name || 'Unknown bank'}
                    {pa.subtype && ` · ${pa.subtype}`}
                  </div>
                </div>
                <select
                  value={pa.financial_account_id || ''}
                  onChange={e => mapPlaidAccount(pa.plaid_account_id, e.target.value || null)}
                  className="px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:border-amber-400"
                  style={{ minWidth: '220px' }}>
                  <option value="">— Unmapped (skip) —</option>
                  {financialAccounts.filter(a => a.is_active).map(a => (
                    <option key={a.id} value={a.id}>{a.name}</option>
                  ))}
                </select>
                {pa.financial_account_id ? (
                  <span className="text-xs px-2 py-1 rounded-full bg-green-100 text-green-700 font-semibold">Mapped</span>
                ) : (
                  <span className="text-xs px-2 py-1 rounded-full bg-amber-100 text-amber-700 font-semibold">Unmapped</span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Summary with date range pills */}
      {tab !== 'statements' && tab !== 'uploads' && tab !== 'accounts' && tab !== 'reconciliation' && (
        <div className="mb-6">
          <div className="flex flex-wrap items-center gap-3 mb-3">
            <div className="flex gap-1 bg-gray-100 rounded-xl p-1">
              {([['month', 'This Month'], ['ytd', 'YTD'], ['custom', 'Custom']] as const).map(([k, l]) => (
                <button key={k} onClick={() => setDateMode(k)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${dateMode === k ? 'bg-white shadow-sm' : 'text-gray-500'}`}
                  style={{ color: dateMode === k ? '#b8895a' : undefined }}>{l}</button>
              ))}
            </div>
            {dateMode === 'custom' && (
              <>
                <input type="date" value={customFrom} onChange={e => setCustomFrom(e.target.value)}
                  className="px-3 py-1.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:border-blue-400" />
                <span className="text-xs text-gray-400 font-medium">to</span>
                <input type="date" value={customTo} onChange={e => setCustomTo(e.target.value)}
                  className="px-3 py-1.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:border-blue-400" />
              </>
            )}
            {dateMode !== 'custom' && (
              <span className="text-xs text-gray-400">
                {summaryFrom} → {summaryTo}
              </span>
            )}
          </div>
          <div className="grid grid-cols-3 gap-4">
            <div className="bg-green-50 border border-green-100 rounded-2xl p-4"><div className="flex items-center gap-2 mb-2"><TrendingUp size={15} className="text-green-600" /><span className="text-xs font-bold text-green-700 uppercase tracking-wider">Income</span></div><div className="text-2xl font-extrabold text-green-700">{formatCurrency(income)}</div></div>
            <div className="bg-red-50 border border-red-100 rounded-2xl p-4"><div className="flex items-center gap-2 mb-2"><TrendingDown size={15} className="text-red-600" /><span className="text-xs font-bold text-red-700 uppercase tracking-wider">Expenses</span></div><div className="text-2xl font-extrabold text-red-700">{formatCurrency(expenses)}</div></div>
            <div className={`${net>=0?'bg-blue-50 border-blue-100':'bg-orange-50 border-orange-100'} border rounded-2xl p-4`}><div className="flex items-center gap-2 mb-2"><DollarSign size={15} className={net>=0?'text-blue-600':'text-orange-600'} /><span className={`text-xs font-bold uppercase tracking-wider ${net>=0?'text-blue-700':'text-orange-700'}`}>Net</span></div><div className={`text-2xl font-extrabold ${net>=0?'text-blue-700':'text-orange-700'}`}>{formatCurrency(Math.abs(net))}</div></div>
          </div>
        </div>
      )}

      <div className="flex gap-1 bg-gray-100 rounded-xl p-1 w-fit mb-5">
        {[{k:'bank',l:'Bank Ledger'},{k:'accounting',l:'Accounting Ledger'},{k:'reconciliation',l:'Reconciliation'},{k:'statements',l:'Bank Statements'},{k:'uploads',l:'Checks & Receipts'},{k:'accounts',l:'Chart of Accounts'}].map(({k,l}) => (
          <button key={k} onClick={() => setTab(k as any)} className={`px-4 py-2 rounded-lg text-sm font-semibold transition-all ${tab===k?'bg-white shadow-sm':'text-gray-500'}`} style={{ color: tab===k?'#b8895a':undefined }}>{l}</button>
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
                  <Loader2 size={24} className="animate-spin" style={{ color: '#b8895a' }} />
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
                  <Loader2 size={24} className="animate-spin" style={{ color: '#b8895a' }} />
                ) : (
                  <Upload size={24} className="text-gray-400" />
                )}
                <span className="text-sm font-semibold text-gray-600">{docUploading ? 'Uploading...' : 'Upload File'}</span>
                <span className="text-xs text-gray-400">Image or PDF</span>
                <input type="file" accept="image/*,.pdf" multiple className="hidden" disabled={docUploading}
                  onChange={e => { const files = Array.from(e.target.files || []); if (files.length) uploadDocument(files) }} />
              </label>
              <button
                type="button"
                onClick={() => setShowDrivePicker(true)}
                className="flex-1 flex flex-col items-center justify-center gap-2 border-2 border-dashed border-gray-300 rounded-xl px-4 py-8 cursor-pointer hover:bg-gray-50 hover:border-blue-300 transition-all"
              >
                <FolderOpen size={24} className="text-gray-400" />
                <span className="text-sm font-semibold text-gray-600">Import from Google Drive</span>
                <span className="text-xs text-gray-400">Browse & pick files</span>
              </button>
            </div>
          </div>
          <DrivePicker
            open={showDrivePicker}
            onClose={() => setShowDrivePicker(false)}
            defaultTarget={docType}
            accounts={financialAccounts.filter(a => a.is_active).map(a => ({ id: a.id, name: a.name }))}
            onImported={() => { load() }}
          />

          {/* Uploaded files list */}
          {loading ? (
            <div className="flex justify-center py-20"><Loader2 size={22} className="animate-spin" style={{ color: '#b8895a' }} /></div>
          ) : uploads.length === 0 ? (
            <div className="text-center py-20 text-gray-400">
              <ImageIcon size={30} className="mx-auto mb-2 opacity-30" />
              <p className="text-sm">No checks or receipts uploaded yet</p>
            </div>
          ) : (
            <>
            {/* Bulk action bar — shown when receipt rows are selected */}
            {selectedUploads.size > 0 && (
              <div className="mb-4 flex flex-wrap items-center gap-3 px-4 py-3 rounded-2xl border-2" style={{ borderColor: '#b8895a', background: 'rgba(184,137,90,0.06)' }}>
                <span className="text-sm font-bold" style={{ color: '#b8895a' }}>{selectedUploads.size} selected</span>
                <div className="h-4 w-px bg-amber-200" />
                <select value={bulkUploadAccountId} onChange={e => setBulkUploadAccountId(e.target.value)}
                  className="px-3 py-1.5 rounded-lg border border-amber-200 bg-white text-sm focus:outline-none focus:ring-2 focus:border-amber-400">
                  <option value="">— Choose account —</option>
                  {financialAccounts.filter(a => a.is_active).map(a => (
                    <option key={a.id} value={a.id}>{a.name}</option>
                  ))}
                </select>
                <button onClick={bulkAssignUploads} disabled={bulkUploadSaving || !bulkUploadAccountId}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-white text-xs font-bold disabled:opacity-50"
                  style={{ background: '#b8895a' }}>
                  {bulkUploadSaving ? <Loader2 size={12} className="animate-spin" /> : <CheckCheck size={12} />}
                  Assign Account
                </button>
                <button onClick={bulkDeleteUploads} disabled={bulkUploadSaving}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-white text-xs font-bold bg-red-600 hover:bg-red-700 disabled:opacity-50">
                  {bulkUploadSaving ? <Loader2 size={12} className="animate-spin" /> : <Trash2 size={12} />}
                  Delete
                </button>
                <button onClick={() => setSelectedUploads(new Set())}
                  className="text-xs text-gray-500 hover:text-gray-700 font-semibold ml-auto">
                  Deselect
                </button>
              </div>
            )}
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
              <div className="overflow-x-auto" style={{ WebkitOverflowScrolling: 'touch' }}>
              <table className="w-full text-sm" style={{ minWidth: '900px' }}>
                <thead><tr className="bg-gray-50 border-b border-gray-100">
                  <th className="px-3 py-3 w-8">
                    <button onClick={selectAllUploads} className="flex items-center justify-center text-gray-400 hover:text-amber-600 transition-colors">
                      {selectedUploads.size > 0 && selectedUploads.size === uploads.length
                        ? <CheckSquare size={15} style={{ color: '#b8895a' }} />
                        : selectedUploads.size > 0
                        ? <div className="w-[15px] h-[15px] rounded-sm border-2 flex items-center justify-center" style={{ borderColor: '#b8895a', background: 'rgba(184,137,90,0.1)' }}><div className="w-1.5 h-0.5" style={{ background: '#b8895a' }} /></div>
                        : <Square size={15} />}
                    </button>
                  </th>
                  {['Type', 'File', 'Vendor / Payee', 'Amount', 'Date', 'Account', 'Matched To', 'Actions'].map(h => (
                    <th key={h} className="text-left px-4 py-3 text-xs font-semibold text-gray-600 uppercase tracking-wider whitespace-nowrap">{h}</th>
                  ))}
                </tr></thead>
                <tbody className="divide-y divide-gray-50">
                  {uploads.map(u => {
                    const analyzing = ocrAnalyzing[u.id]
                    const ocrLive = ocrResults[u.id]
                    const vendor = ocrLive?.vendor ?? u.vendor
                    const amount = ocrLive?.amount ?? u.amount
                    const date = ocrLive?.date ?? u.receipt_date
                    const matchedTx = u.matched_tx
                    const isSelU = selectedUploads.has(u.id)
                    return (
                    <tr key={u.id} className={`hover:bg-gray-50 ${isSelU ? 'bg-amber-50/50' : ''}`}>
                      <td className="px-3 py-3" onClick={e => e.stopPropagation()}>
                        <button onClick={() => toggleUploadSelect(u.id)} className="flex items-center justify-center text-gray-400 hover:text-amber-600 transition-colors">
                          {isSelU ? <CheckSquare size={15} style={{ color: '#b8895a' }} /> : <Square size={15} />}
                        </button>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`text-xs px-2.5 py-1 rounded-full font-semibold ${u.image_type === 'receipt' ? 'bg-emerald-100 text-emerald-700' : 'bg-blue-100 text-blue-700'}`}>
                          {u.image_type === 'receipt' ? 'Receipt' : 'Check'}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <a href={u.file_url} target="_blank" rel="noreferrer" className="flex items-center gap-2 font-medium hover:underline text-xs" style={{ color: '#b8895a' }}>
                          {u.image_type === 'receipt' ? <Receipt size={14} /> : <FileImage size={14} />}
                          <span className="truncate max-w-32">{u.file_name || (u.image_type === 'receipt' ? 'Receipt' : 'Check')}</span>
                        </a>
                      </td>
                      <td className="px-4 py-3">
                        {analyzing ? (
                          <span className="flex items-center gap-1.5 text-xs text-amber-600 font-medium">
                            <Sparkles size={11} className="animate-pulse" /> Analyzing…
                          </span>
                        ) : vendor ? (
                          <span className="text-xs font-semibold text-gray-800">{vendor}</span>
                        ) : (
                          <span className="text-xs text-gray-400">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        {analyzing ? <span className="text-xs text-gray-300">…</span>
                          : amount ? <span className="text-xs font-bold text-gray-800">{formatCurrency(amount)}</span>
                          : <span className="text-xs text-gray-400">—</span>}
                      </td>
                      <td className="px-4 py-3">
                        {analyzing ? <span className="text-xs text-gray-300">…</span>
                          : date ? <span className="text-xs text-gray-600">{formatDateShort(date)}</span>
                          : <span className="text-xs text-gray-400">—</span>}
                      </td>
                      <td className="px-4 py-3">
                        <select
                          value={u.financial_account_id || ''}
                          onChange={e => saveUploadField(u.id, { financial_account_id: e.target.value || null })}
                          onClick={e => e.stopPropagation()}
                          className="text-xs px-2 py-1 rounded-lg border border-gray-200 bg-white focus:outline-none focus:ring-2 focus:border-amber-400 max-w-32">
                          <option value="">— None —</option>
                          {financialAccounts.filter(a => a.is_active).map(a => (
                            <option key={a.id} value={a.id}>{a.name}</option>
                          ))}
                        </select>
                      </td>
                      <td className="px-4 py-3">
                        {matchedTx ? (
                          <div className="flex items-center gap-1">
                            <CheckCircle2 size={12} className="text-emerald-500 flex-shrink-0" />
                            <span className="text-xs text-emerald-700 truncate max-w-36 font-medium">{matchedTx.description}</span>
                          </div>
                        ) : (
                          <span className="text-xs text-gray-400 italic">Unmatched</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1.5">
                          <button onClick={() => setEditingUpload(u)} className="text-gray-400 hover:text-blue-600" title="Edit details">
                            <Edit3 size={14} />
                          </button>
                          <button onClick={() => rescanOcr(u.id)} disabled={analyzing} className="text-gray-400 hover:text-amber-600 disabled:opacity-40" title="Re-scan with AI">
                            {analyzing ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
                          </button>
                          <button onClick={() => deleteUpload(u.id)} className="text-gray-400 hover:text-red-600" title="Delete">
                            <Trash2 size={14} />
                          </button>
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
        </div>
      ) : tab === 'accounts' ? (
        <AccountsTab />
      ) : tab === 'reconciliation' ? (
        <ReconciliationTab
          accounts={financialAccounts.filter(a => a.is_active)}
          selectedAccountId={selectedAccountId}
          onSelectAccount={setSelectedAccountId}
        />
      ) : tab === 'statements' ? (
        <div>
          <div className="flex items-center gap-3 mb-5">
            <label className={`flex items-center gap-2 text-white font-semibold px-4 py-2.5 rounded-xl cursor-pointer shadow-md ${stmtUploading?'opacity-60 cursor-not-allowed':''}`} style={{ background:'#b8895a' }}>
              {stmtUploading ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />}
              {stmtUploading ? 'Uploading...' : 'Upload Statement'}
              <input ref={stmtRef} type="file" accept=".pdf" multiple className="hidden" disabled={stmtUploading} onChange={e => { const files = Array.from(e.target.files || []); if (files.length) uploadStatement(files) }} />
            </label>
            <p className="text-xs text-gray-400">PDF bank statements</p>
          </div>
          {loading ? (
            <div className="flex justify-center py-20"><Loader2 size={22} className="animate-spin" style={{ color:'#b8895a' }} /></div>
          ) : statements.length === 0 ? (
            <div className="text-center py-20 text-gray-400">
              <File size={30} className="mx-auto mb-2 opacity-30" />
              <p className="text-sm">No statements uploaded yet</p>
            </div>
          ) : (
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
              <div className="overflow-x-auto" style={{ WebkitOverflowScrolling: 'touch' }}>
              <table className="w-full text-sm" style={{ minWidth: '700px' }}>
                <thead><tr className="bg-gray-50 border-b border-gray-100">
                  {['File','Account','Date Uploaded','Actions'].map(h => (
                    <th key={h} className="text-left px-5 py-3 text-xs font-semibold text-gray-600 uppercase tracking-wider whitespace-nowrap">{h}</th>
                  ))}
                </tr></thead>
                <tbody className="divide-y divide-gray-50">
                  {statements.map(s => (
                    <tr key={s.id} className="hover:bg-gray-50">
                      <td className="px-5 py-3">
                        <a href={s.file_url} target="_blank" rel="noreferrer" className="flex items-center gap-2 font-medium hover:underline" style={{ color:'#b8895a' }}>
                          <FileText size={15} />
                          {s.label || s.file_name}
                        </a>
                      </td>
                      <td className="px-5 py-3">
                        <select
                          value={s.financial_account_id || ''}
                          onChange={async (e) => {
                            const newId = e.target.value || null
                            await fetch('/api/bank-statements', {
                              method: 'PATCH',
                              headers: { 'Content-Type': 'application/json' },
                              body: JSON.stringify({ id: s.id, financial_account_id: newId }),
                            })
                            await load()
                          }}
                          className="text-xs px-2 py-1 rounded border border-gray-200 bg-white"
                        >
                          <option value="">— Unassigned —</option>
                          {financialAccounts.filter(a => a.is_active).map(a => (
                            <option key={a.id} value={a.id}>{a.name}</option>
                          ))}
                        </select>
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
            </div>
          )}
        </div>
      ) : (
      <>
      <div className="flex items-center gap-3 mb-4">
        <div className="relative flex-1 max-w-sm">
          <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search transactions..." className="w-full pl-9 pr-3 py-2 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:border-blue-400" />
        </div>
        {tab === 'bank' && (
          <button onClick={findDuplicates}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-gray-200 hover:bg-gray-50 text-xs font-semibold text-gray-700"
            title="Auto-select rows that look like duplicates of an earlier row (same date + description + amount)">
            <Sparkles size={13} className="text-amber-600" />
            Find Duplicates
          </button>
        )}
      </div>

      {/* ── Bulk action bar — visible when bank rows are selected ── */}
      {tab === 'bank' && selected.size > 0 && (
        <div className="mb-4 flex flex-wrap items-center gap-3 px-4 py-3 rounded-2xl border-2" style={{ borderColor: '#b8895a', background: 'rgba(184,137,90,0.06)' }}>
          <span className="text-sm font-bold" style={{ color: '#b8895a' }}>{selected.size} selected</span>
          <div className="h-4 w-px bg-amber-200" />
          <input
            value={bulkPayee}
            onChange={e => setBulkPayee(e.target.value)}
            placeholder="Set payee…"
            className="px-3 py-1.5 rounded-lg border border-amber-200 bg-white text-sm focus:outline-none focus:ring-2 focus:border-amber-400 w-40"
          />
          <select
            value={bulkAccountId}
            onChange={e => setBulkAccountId(e.target.value)}
            className="px-3 py-1.5 rounded-lg border border-amber-200 bg-white text-sm focus:outline-none focus:ring-2 focus:border-amber-400">
            <option value="">Set account…</option>
            {accounts.filter(a => a.is_active !== false).map(a => (
              <option key={a.id} value={a.id}>{a.name}</option>
            ))}
          </select>
          <button onClick={bulkUpdate} disabled={bulkSaving || (!bulkPayee && !bulkAccountId)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-white text-xs font-bold disabled:opacity-50"
            style={{ background: '#b8895a' }}>
            {bulkSaving ? <Loader2 size={12} className="animate-spin" /> : <Wand2 size={12} />}
            Apply
          </button>
          <button onClick={bulkAccept} disabled={bulkSaving}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-white text-xs font-bold bg-green-600 hover:bg-green-700 disabled:opacity-50">
            {bulkSaving ? <Loader2 size={12} className="animate-spin" /> : <CheckCheck size={12} />}
            Post All to Books
          </button>
          <button onClick={bulkDelete} disabled={bulkSaving}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-white text-xs font-bold bg-red-600 hover:bg-red-700 disabled:opacity-50">
            {bulkSaving ? <Loader2 size={12} className="animate-spin" /> : <Trash2 size={12} />}
            Delete
          </button>
          <button onClick={() => setSelected(new Set())}
            className="text-xs text-gray-500 hover:text-gray-700 font-semibold ml-auto">
            Deselect
          </button>
        </div>
      )}

      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="overflow-x-auto" style={{ WebkitOverflowScrolling: 'touch' }}>
          <table className="w-full text-sm" style={{ minWidth: tab === 'bank' ? '1000px' : '900px' }}>
            <thead><tr className="bg-gray-50 border-b border-gray-100">
              {tab === 'bank' && (
                <th className="px-3 py-3 w-8">
                  <button onClick={selectAll} className="flex items-center justify-center text-gray-400 hover:text-amber-600 transition-colors">
                    {selected.size > 0 && selected.size === filtered.length
                      ? <CheckSquare size={15} style={{ color: '#b8895a' }} />
                      : selected.size > 0
                      ? <div className="w-[15px] h-[15px] rounded-sm border-2 flex items-center justify-center" style={{ borderColor: '#b8895a', background: 'rgba(184,137,90,0.1)' }}><div className="w-1.5 h-0.5" style={{ background: '#b8895a' }} /></div>
                      : <Square size={15} />}
                  </button>
                </th>
              )}
              {(tab === 'accounting'
                ? [['date','Date'],['description','Description'],['payee','Payee'],['amount','Amount'],['account','Category'],['check','Check #'],['files','Files']] as const
                : [['date','Date'],['description','Description'],['payee','Payee'],['amount','Amount'],['account','Account'],['check','Check #'],['status','Status']] as const
              ).map(([col, label]) => (
                <th key={col} className="text-left px-5 py-3 text-xs font-semibold text-gray-600 uppercase tracking-wider">
                  <button onClick={() => toggleSort(col)} className="flex items-center gap-1 hover:text-gray-900">
                    {label}
                    {sortCol === col ? <span style={{ color: '#b8895a' }}>{sortDir === 'asc' ? '↑' : '↓'}</span> : <span className="opacity-30">↕</span>}
                  </button>
                </th>
              ))}
              {tab === 'bank' && <th className="px-3 py-3 text-xs font-semibold text-gray-600 uppercase tracking-wider text-center">Post</th>}
            </tr></thead>
            <tbody className="divide-y divide-gray-50">
              {loading ? <tr><td colSpan={tab === 'bank' ? 9 : 7} className="text-center py-12"><Loader2 size={22} className="animate-spin mx-auto" style={{ color:'#b8895a' }} /></td></tr>
                : filtered.length === 0 ? <tr><td colSpan={tab === 'bank' ? 9 : 7} className="text-center py-12 text-gray-400 text-sm"><FileText size={30} className="mx-auto mb-2 opacity-30" />No transactions · Import a CSV to get started</td></tr>
                : sortedFiltered.map(tx => {
                    const accName = accountName(tx.account_id)
                    const hasReceipt = !!tx.receipt_image
                    const hasCheck = !!tx.check_image
                    const isSel = selected.has(tx.id)
                    const isPosted = postedIds.has(tx.id)
                    return (
                  <tr key={tx.id} onClick={() => setEditing(tx)} className={`hover:bg-gray-50 cursor-pointer transition-colors ${isSel ? 'bg-amber-50/50' : isPosted ? 'bg-green-50/30' : ''}`}>
                    {tab === 'bank' && (
                      <td className="px-3 py-3" onClick={e => { e.stopPropagation(); toggleSelect(tx.id) }}>
                        <button className="flex items-center justify-center text-gray-400 hover:text-amber-600 transition-colors">
                          {isSel ? <CheckSquare size={15} style={{ color: '#b8895a' }} /> : <Square size={15} />}
                        </button>
                      </td>
                    )}
                    <td className="px-5 py-3 text-gray-600 text-xs whitespace-nowrap">{formatDateShort(tx.transaction_date)}</td>
                    <td className="px-5 py-3"><div className="text-gray-900 font-medium text-xs truncate max-w-48" title={tx.description}>{tx.description}</div></td>
                    <td className="px-5 py-3 text-gray-600 text-xs" title={tx.payee || ''}>{tx.payee||'—'}</td>
                    <td className={`px-5 py-3 font-bold text-sm ${tx.amount>=0?'text-green-700':'text-red-600'}`}>{tx.amount>=0?'+':''}{formatCurrency(tx.amount)}</td>
                    <td className="px-5 py-3">{accName || tx.category ? <span className="text-xs px-2 py-0.5 rounded-full font-medium" style={{ background:'rgba(184,137,90,0.1)', color:'#b8895a' }}>{accName || tx.category}</span> : <span className="text-xs text-gray-400 italic">Uncategorized</span>}</td>
                    <td className="px-5 py-3 text-gray-600 text-xs">{tx.check_number||'—'}</td>
                    {tab === 'bank' ? (
                      <>
                        <td className="px-5 py-3">
                          <div className="flex items-center gap-1.5">
                            {isPosted && (
                              <span className="flex items-center gap-1 text-xs font-bold px-2 py-0.5 rounded-full bg-green-100 text-green-700">
                                <CheckCircle2 size={11} />Posted
                              </span>
                            )}
                            {hasReceipt && <Receipt size={14} className="text-emerald-600" />}
                            {hasCheck && <FileImage size={14} className="text-blue-600" />}
                            {!isPosted && !hasReceipt && !hasCheck && <span className="text-xs text-gray-300">—</span>}
                          </div>
                        </td>
                        <td className="px-3 py-3 text-center" onClick={e => e.stopPropagation()}>
                          {isPosted ? (
                            <button title="Already posted to accounting ledger" disabled
                              className="p-1.5 rounded-lg bg-green-100 text-green-600 cursor-default">
                              <CheckCircle2 size={14} />
                            </button>
                          ) : tx.account_id ? (
                            <button onClick={() => acceptTx(tx)} disabled={accepting.has(tx.id)}
                              title="Post this transaction to the accounting ledger"
                              className="p-1.5 rounded-lg bg-blue-50 text-blue-600 hover:bg-blue-100 disabled:opacity-50">
                              {accepting.has(tx.id) ? <Loader2 size={14} className="animate-spin" /> : <CheckSquare size={14} />}
                            </button>
                          ) : (
                            <button title="Categorize first (assign an account) before posting" disabled
                              className="p-1.5 rounded-lg bg-gray-50 text-gray-300 cursor-not-allowed">
                              <Square size={14} />
                            </button>
                          )}
                        </td>
                      </>
                    ) : (
                      <td className="px-5 py-3">
                        <div className="flex gap-1.5">
                          {hasReceipt && <Receipt size={14} className="text-emerald-600" />}
                          {hasCheck && <FileImage size={14} className="text-blue-600" />}
                          {!hasReceipt && !hasCheck && <span className="text-xs text-gray-300">—</span>}
                        </div>
                      </td>
                    )}
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
              <button onClick={() => { setEditing(null); setModalOcr(null) }}><X size={18} className="text-gray-400" /></button>
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
                  className="flex items-center gap-1 text-xs font-semibold mt-1.5 hover:underline" style={{ color: '#b8895a' }}>
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
                      className="w-full text-white font-semibold py-2 rounded-lg text-xs flex items-center justify-center gap-1" style={{ background: '#b8895a' }}>
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
                    <div className="flex-1 flex gap-1.5">
                      <label className={`flex-1 flex items-center justify-center gap-1.5 border border-dashed border-gray-300 rounded-xl px-2 py-2.5 text-xs font-semibold text-gray-600 cursor-pointer hover:bg-gray-50 ${imgUploading==='receipt'?'opacity-60 cursor-not-allowed':''}`}>
                        {imgUploading === 'receipt' ? <Loader2 size={12} className="animate-spin" /> : <Camera size={12} />}
                        {imgUploading === 'receipt' ? '…' : 'Photo'}
                        <input type="file" accept="image/*" capture="environment" className="hidden" disabled={!!imgUploading} onChange={e => { const f = e.target.files?.[0]; if (f) uploadImage('receipt', f) }} />
                      </label>
                      <label className={`flex-1 flex items-center justify-center gap-1.5 border border-dashed border-gray-300 rounded-xl px-2 py-2.5 text-xs font-semibold text-gray-600 cursor-pointer hover:bg-gray-50 ${imgUploading==='receipt'?'opacity-60 cursor-not-allowed':''}`}>
                        {imgUploading === 'receipt' ? <Loader2 size={12} className="animate-spin" /> : <Receipt size={12} />}
                        {imgUploading === 'receipt' ? 'Uploading…' : 'Add Receipt'}
                        <input ref={receiptRef} type="file" accept="image/*,.pdf" className="hidden" disabled={!!imgUploading} onChange={e => { const f = e.target.files?.[0]; if (f) uploadImage('receipt', f) }} />
                      </label>
                    </div>
                  )}
                  {!editing.check_image && (
                    <div className="flex-1 flex gap-1.5">
                      <label className={`flex-1 flex items-center justify-center gap-1.5 border border-dashed border-gray-300 rounded-xl px-2 py-2.5 text-xs font-semibold text-gray-600 cursor-pointer hover:bg-gray-50 ${imgUploading==='check'?'opacity-60 cursor-not-allowed':''}`}>
                        {imgUploading === 'check' ? <Loader2 size={12} className="animate-spin" /> : <Camera size={12} />}
                        {imgUploading === 'check' ? '…' : 'Photo'}
                        <input type="file" accept="image/*" capture="environment" className="hidden" disabled={!!imgUploading} onChange={e => { const f = e.target.files?.[0]; if (f) uploadImage('check', f) }} />
                      </label>
                      <label className={`flex-1 flex items-center justify-center gap-1.5 border border-dashed border-gray-300 rounded-xl px-2 py-2.5 text-xs font-semibold text-gray-600 cursor-pointer hover:bg-gray-50 ${imgUploading==='check'?'opacity-60 cursor-not-allowed':''}`}>
                        {imgUploading === 'check' ? <Loader2 size={12} className="animate-spin" /> : <FileImage size={12} />}
                        {imgUploading === 'check' ? 'Uploading…' : 'Add Check'}
                        <input ref={checkRef} type="file" accept="image/*,.pdf" className="hidden" disabled={!!imgUploading} onChange={e => { const f = e.target.files?.[0]; if (f) uploadImage('check', f) }} />
                      </label>
                    </div>
                  )}
                </div>
              </div>

              {/* AI OCR suggestions panel */}
              {modalOcr && (
                <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-xs space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5 font-bold text-amber-800">
                      <Sparkles size={13} className="text-amber-500" />
                      AI Detected
                      {modalOcr.data.confidence && (
                        <span className={`ml-1 px-1.5 py-0.5 rounded-full text-[10px] font-bold uppercase ${
                          modalOcr.data.confidence === 'high' ? 'bg-green-100 text-green-700' :
                          modalOcr.data.confidence === 'medium' ? 'bg-yellow-100 text-yellow-700' :
                          'bg-red-100 text-red-700'
                        }`}>{modalOcr.data.confidence}</span>
                      )}
                    </div>
                    <button onClick={() => setModalOcr(null)} className="text-amber-400 hover:text-amber-700">
                      <X size={14} />
                    </button>
                  </div>
                  <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-gray-700">
                    {modalOcr.data.vendor && <div><span className="text-gray-500">Vendor:</span> <strong>{modalOcr.data.vendor}</strong></div>}
                    {modalOcr.data.amount && <div><span className="text-gray-500">Amount:</span> <strong>{formatCurrency(modalOcr.data.amount)}</strong></div>}
                    {modalOcr.data.date && <div><span className="text-gray-500">Date:</span> <strong>{formatDateShort(modalOcr.data.date)}</strong></div>}
                    {modalOcr.data.check_number && <div><span className="text-gray-500">Check #:</span> <strong>{modalOcr.data.check_number}</strong></div>}
                    {modalOcr.data.category && <div className="col-span-2"><span className="text-gray-500">Category:</span> <strong>{modalOcr.data.category}</strong></div>}
                    {modalOcr.data.memo && <div className="col-span-2"><span className="text-gray-500">Memo:</span> <strong>{modalOcr.data.memo}</strong></div>}
                  </div>
                  {(modalOcr.data.vendor || modalOcr.data.check_number) && (
                    <button
                      type="button"
                      onClick={() => {
                        if (modalOcr.data.vendor) {
                          const el = document.getElementById('payee') as HTMLInputElement
                          if (el) el.value = modalOcr.data.vendor!
                        }
                        if (modalOcr.data.check_number) {
                          const el = document.getElementById('check_number') as HTMLInputElement
                          if (el) el.value = modalOcr.data.check_number!
                        }
                        setModalOcr(null)
                      }}
                      className="w-full py-2 rounded-lg font-semibold text-white text-xs flex items-center justify-center gap-1.5"
                      style={{ background: '#b8895a' }}>
                      <CheckCircle2 size={12} /> Apply AI Suggestions
                    </button>
                  )}
                  {modalOcr.data.matched_transactions && modalOcr.data.matched_transactions.length > 0 &&
                    modalOcr.data.matched_transactions.some(t => t.id !== editing.id) && (
                    <div className="border-t border-amber-200 pt-2">
                      <div className="font-semibold text-amber-800 mb-1.5 flex items-center gap-1">
                        <AlertCircle size={11} /> Other possible transaction matches:
                      </div>
                      <div className="space-y-1">
                        {modalOcr.data.matched_transactions.filter(t => t.id !== editing.id).slice(0, 3).map(tx => (
                          <div key={tx.id} className="flex items-center justify-between bg-white rounded-lg px-2.5 py-1.5 border border-amber-100">
                            <div>
                              <div className="font-medium text-gray-800 truncate max-w-52">{tx.description}</div>
                              <div className="text-gray-500 text-[10px]">{formatDateShort(tx.transaction_date)} · {formatCurrency(tx.amount)}</div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}

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
              }} className="w-full text-white font-bold py-3 rounded-xl" style={{ background:'#b8895a' }}>Save Changes</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Edit Receipt/Check modal ── */}
      {editingUpload && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => setEditingUpload(null)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between sticky top-0 bg-white z-10">
              <h2 className="font-bold text-gray-900">Edit {editingUpload.image_type === 'receipt' ? 'Receipt' : 'Check'} Details</h2>
              <button onClick={() => setEditingUpload(null)}><X size={18} className="text-gray-400" /></button>
            </div>
            <form onSubmit={e => {
              e.preventDefault()
              const fd = new FormData(e.currentTarget as HTMLFormElement)
              saveUploadEdit({
                vendor: fd.get('vendor') || null,
                amount: fd.get('amount') ? Number(fd.get('amount')) : null,
                receipt_date: fd.get('receipt_date') || null,
                check_number: fd.get('check_number') || null,
                financial_account_id: fd.get('financial_account_id') || null,
                image_type: fd.get('image_type') || editingUpload.image_type,
                notes: fd.get('notes') || null,
              })
            }} className="p-6 space-y-4">
              <div className="bg-gray-50 rounded-xl p-3 flex items-center justify-between">
                <a href={editingUpload.file_url} target="_blank" rel="noreferrer" className="flex items-center gap-2 text-sm font-medium hover:underline" style={{ color: '#b8895a' }}>
                  {editingUpload.image_type === 'receipt' ? <Receipt size={16} /> : <FileImage size={16} />}
                  {editingUpload.file_name || 'View Image'}
                </a>
                <button type="button" onClick={() => rescanOcr(editingUpload.id)} disabled={!!ocrAnalyzing[editingUpload.id]}
                  className="flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg bg-amber-100 text-amber-700 hover:bg-amber-200 disabled:opacity-50">
                  {ocrAnalyzing[editingUpload.id] ? <Loader2 size={12} className="animate-spin" /> : <Sparkles size={12} />}
                  Re-scan with AI
                </button>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1">Type</label>
                  <select name="image_type" defaultValue={editingUpload.image_type} className="w-full px-3 py-2 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:border-amber-400">
                    <option value="receipt">Receipt</option>
                    <option value="check">Check</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1">Account</label>
                  <select name="financial_account_id" defaultValue={editingUpload.financial_account_id || ''} className="w-full px-3 py-2 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:border-amber-400">
                    <option value="">— None —</option>
                    {financialAccounts.filter(a => a.is_active).map(a => (
                      <option key={a.id} value={a.id}>{a.name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1">Vendor / Payee</label>
                  <input name="vendor" defaultValue={editingUpload.vendor || ''} className="w-full px-3 py-2 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:border-amber-400" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1">Amount</label>
                  <input name="amount" type="number" step="0.01" defaultValue={editingUpload.amount || ''} className="w-full px-3 py-2 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:border-amber-400" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1">Date</label>
                  <input name="receipt_date" type="date" defaultValue={editingUpload.receipt_date || ''} className="w-full px-3 py-2 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:border-amber-400" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1">Check # (if check)</label>
                  <input name="check_number" defaultValue={editingUpload.check_number || ''} className="w-full px-3 py-2 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:border-amber-400" />
                </div>
                <div className="col-span-2">
                  <label className="block text-xs font-semibold text-gray-700 mb-1">Notes</label>
                  <textarea name="notes" defaultValue={editingUpload.notes || ''} rows={2} className="w-full px-3 py-2 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:border-amber-400" />
                </div>
              </div>
              <div className="flex justify-end gap-2 pt-2 border-t border-gray-100">
                <button type="button" onClick={() => setEditingUpload(null)} className="px-4 py-2 rounded-xl text-sm font-semibold text-gray-600 hover:bg-gray-100">Cancel</button>
                <button type="submit" disabled={savingUploadEdit} className="px-5 py-2 rounded-xl text-white text-sm font-bold disabled:opacity-50" style={{ background: '#b8895a' }}>
                  {savingUploadEdit ? <Loader2 size={14} className="animate-spin" /> : 'Save'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Reconciliation Tab ──────────────────────────────────────
function ReconciliationTab({ accounts, selectedAccountId, onSelectAccount }: {
  accounts: FinancialAccount[]
  selectedAccountId: string | null
  onSelectAccount: (id: string | null) => void
}) {
  const [data, setData] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [verifying, setVerifying] = useState<string | null>(null)

  useEffect(() => { loadData() }, [selectedAccountId])

  async function loadData() {
    setLoading(true)
    try {
      const url = selectedAccountId
        ? `/api/reconciliation?financial_account_id=${selectedAccountId}`
        : '/api/reconciliation'
      const res = await fetch(url)
      const d = await res.json()
      setData(Array.isArray(d) ? d : [])
    } catch { setData([]) }
    setLoading(false)
  }

  async function updateStatus(month: string, status: string) {
    setVerifying(month)
    try {
      await fetch('/api/reconciliation', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ month, status }),
      })
      await loadData()
    } finally { setVerifying(null) }
  }

  // Account selector — always show so user can switch between accounts
  const accountSelector = (
    <div className="flex flex-wrap items-center gap-2 mb-5">
      <span className="text-xs font-bold text-gray-500 uppercase tracking-wider">Reconcile account:</span>
      <button onClick={() => onSelectAccount(null)}
        className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all border ${!selectedAccountId ? 'text-white shadow-sm' : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-50'}`}
        style={!selectedAccountId ? { background: '#b8895a', borderColor: '#b8895a' } : {}}>
        All Accounts (combined)
      </button>
      {accounts.map(a => (
        <button key={a.id} onClick={() => onSelectAccount(a.id)}
          className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all border ${selectedAccountId === a.id ? 'text-white shadow-sm' : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-50'}`}
          style={selectedAccountId === a.id ? { background: a.color || '#b8895a', borderColor: a.color || '#b8895a' } : {}}>
          {a.name}
        </button>
      ))}
    </div>
  )

  if (loading) return (
    <>
      {accountSelector}
      <div className="flex justify-center py-20">
        <Loader2 size={28} className="animate-spin" style={{ color: '#b8895a' }} />
      </div>
    </>
  )

  if (data.length === 0) return (
    <>
      {accountSelector}
      <div className="text-center py-20 text-gray-400">
        <Scale size={30} className="mx-auto mb-2 opacity-30" />
        <p className="text-sm">No bank transactions yet{selectedAccountId ? ' for this account' : ''}</p>
        <p className="text-xs mt-1">Import bank data to see monthly reconciliation</p>
      </div>
    </>
  )

  const totalVerified = data.filter(r => r.status === 'verified').length
  const totalAuto = data.filter(r => r.status === 'auto_reconciled').length
  const totalUnrec = data.filter(r => r.status === 'not_reconciled').length

  return (
    <div className="space-y-5">
      {accountSelector}
      <div className="flex flex-wrap items-center gap-4">
        <div className="flex items-center gap-2"><div className="w-3 h-3 rounded-full bg-green-500" /><span className="text-xs text-gray-600 font-medium">Verified ({totalVerified})</span></div>
        <div className="flex items-center gap-2"><div className="w-3 h-3 rounded-full bg-orange-400" /><span className="text-xs text-gray-600 font-medium">Auto-Reconciled ({totalAuto})</span></div>
        <div className="flex items-center gap-2"><div className="w-3 h-3 rounded-full bg-red-500" /><span className="text-xs text-gray-600 font-medium">Not Reconciled ({totalUnrec})</span></div>
        <span className="text-xs text-gray-400 ml-2">Red = has uncategorized transactions · Orange = all categorized but not yet verified · Green = human verified</span>
      </div>

      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="overflow-x-auto" style={{ WebkitOverflowScrolling: 'touch' }}>
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-100">
                {['', 'Month', 'Beg. Balance', 'End Balance', 'Credits', 'Debits', 'Avg Balance', 'Avg Collected/Day', 'Low Balance', 'Txns', 'Uncat.', 'Action'].map(h => (
                  <th key={h} className="text-left px-4 py-3 text-xs font-semibold text-gray-600 uppercase tracking-wider whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {data.map(row => {
                const dotColor = row.status === 'verified' ? 'bg-green-500' : row.status === 'auto_reconciled' ? 'bg-orange-400' : 'bg-red-500'
                const rowBg = row.status === 'verified' ? '' : row.status === 'auto_reconciled' ? 'bg-orange-50/20' : 'bg-red-50/20'
                return (
                  <tr key={row.month} className={`hover:bg-gray-50 transition-colors ${rowBg}`}>
                    <td className="px-4 py-3">
                      <div className={`w-3 h-3 rounded-full ${dotColor}`} title={row.status.replace(/_/g, ' ')} />
                    </td>
                    <td className="px-4 py-3 font-semibold text-gray-900 whitespace-nowrap">{row.month}</td>
                    <td className="px-4 py-3 text-xs text-gray-700 whitespace-nowrap">{formatCurrency(row.beginning_balance)}</td>
                    <td className={`px-4 py-3 text-xs font-bold whitespace-nowrap ${row.ending_balance >= 0 ? 'text-gray-900' : 'text-red-600'}`}>{formatCurrency(row.ending_balance)}</td>
                    <td className="px-4 py-3 text-xs text-green-700 font-semibold whitespace-nowrap">+{formatCurrency(row.credits)}</td>
                    <td className="px-4 py-3 text-xs text-red-600 font-semibold whitespace-nowrap">−{formatCurrency(row.debits)}</td>
                    <td className="px-4 py-3 text-xs text-gray-700 whitespace-nowrap">{formatCurrency(row.avg_balance)}</td>
                    <td className="px-4 py-3 text-xs text-gray-700 whitespace-nowrap">{formatCurrency(row.avg_collected_balance)}</td>
                    <td className={`px-4 py-3 text-xs font-semibold whitespace-nowrap ${row.low_balance < 0 ? 'text-red-600' : 'text-gray-700'}`}>{formatCurrency(row.low_balance)}</td>
                    <td className="px-4 py-3 text-xs text-gray-600">{row.tx_count}</td>
                    <td className="px-4 py-3 text-xs">
                      {row.uncategorized_count > 0
                        ? <span className="font-bold text-red-600">{row.uncategorized_count}</span>
                        : <span className="text-green-600">✓</span>
                      }
                    </td>
                    <td className="px-4 py-3">
                      {row.status !== 'verified' ? (
                        <button
                          onClick={() => updateStatus(row.month, 'verified')}
                          disabled={verifying === row.month}
                          className="flex items-center gap-1 text-xs font-semibold px-2.5 py-1.5 rounded-lg text-white disabled:opacity-60 whitespace-nowrap"
                          style={{ background: '#b8895a' }}>
                          {verifying === row.month ? <Loader2 size={11} className="animate-spin" /> : <CheckSquare size={11} />}
                          {verifying === row.month ? '…' : 'Verify'}
                        </button>
                      ) : (
                        <button
                          onClick={() => updateStatus(row.month, 'auto_reconciled')}
                          disabled={verifying === row.month}
                          className="text-xs font-semibold px-2.5 py-1.5 rounded-lg border border-gray-200 text-gray-500 hover:bg-gray-100 disabled:opacity-60 whitespace-nowrap">
                          {verifying === row.month ? '…' : 'Unverify'}
                        </button>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
