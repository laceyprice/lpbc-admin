'use client'
import { useState, useEffect } from 'react'
import { X, Folder, FileText, ChevronLeft, Download, Loader2, Search } from 'lucide-react'

type DriveFile = {
  id: string
  name: string
  mimeType: string
  size?: string
  modifiedTime?: string
  iconLink?: string
  thumbnailLink?: string
  webViewLink?: string
}

type ImportTarget = 'receipt' | 'check' | 'document' | 'statement'

interface DrivePickerProps {
  open: boolean
  onClose: () => void
  onImported?: (record: any) => void
  defaultTarget?: ImportTarget
  defaultAccountId?: string | null
  accounts?: Array<{ id: string; name: string }>
}

export default function DrivePicker({ open, onClose, onImported, defaultTarget = 'receipt', defaultAccountId = null, accounts = [] }: DrivePickerProps) {
  const [folderId, setFolderId] = useState<string>('root')
  const [folderName, setFolderName] = useState<string>('My Drive')
  const [stack, setStack] = useState<Array<{ id: string; name: string }>>([])
  const [files, setFiles] = useState<DriveFile[]>([])
  const [loading, setLoading] = useState(false)
  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [target, setTarget] = useState<ImportTarget>(defaultTarget)
  const [accountId, setAccountId] = useState<string | null>(defaultAccountId)
  const [importing, setImporting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (open) loadFolder('root', 'My Drive', true)
  }, [open])

  async function loadFolder(id: string, name: string, resetStack = false) {
    setLoading(true)
    setError(null)
    try {
      const params = new URLSearchParams({ action: 'list', folderId: id })
      if (search) params.set('q', search)
      const res = await fetch(`/api/google-drive?${params}`)
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to load')
      setFiles(data.files || [])
      setFolderId(id)
      setFolderName(data.folderName || name)
      if (resetStack) setStack([])
    } catch (err: any) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  function openFolder(folder: DriveFile) {
    setStack(prev => [...prev, { id: folderId, name: folderName }])
    setSelected(new Set())
    loadFolder(folder.id, folder.name)
  }

  function goBack() {
    const prev = stack[stack.length - 1]
    if (!prev) return
    setStack(s => s.slice(0, -1))
    setSelected(new Set())
    loadFolder(prev.id, prev.name)
  }

  function toggle(id: string) {
    setSelected(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  async function importSelected() {
    if (selected.size === 0) return
    setImporting(true)
    setError(null)
    let imported = 0
    let failed = 0
    for (const id of selected) {
      const file = files.find(f => f.id === id)
      if (!file) continue
      try {
        const res = await fetch('/api/google-drive?action=import', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            fileId: file.id,
            fileName: file.name,
            mimeType: file.mimeType,
            target,
            financial_account_id: accountId || null,
          }),
        })
        const data = await res.json()
        if (!res.ok) throw new Error(data.error)
        imported++
        onImported?.(data.record)
      } catch (err) {
        failed++
      }
    }
    setImporting(false)
    setSelected(new Set())
    alert(`Imported ${imported} file${imported === 1 ? '' : 's'}${failed ? `, ${failed} failed` : ''}.`)
    if (imported > 0) onClose()
  }

  function isFolder(f: DriveFile) {
    return f.mimeType === 'application/vnd.google-apps.folder'
  }

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl max-h-[90vh] flex flex-col" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b" style={{ background: '#2f5a5e', color: 'white', borderRadius: '1rem 1rem 0 0' }}>
          <div className="flex items-center gap-3">
            <Folder size={20} />
            <h2 className="font-bold text-lg">Import from Google Drive</h2>
          </div>
          <button onClick={onClose} className="hover:bg-white/10 rounded p-1"><X size={20} /></button>
        </div>

        {/* Toolbar */}
        <div className="px-5 py-3 border-b bg-gray-50 flex flex-wrap items-center gap-3">
          {stack.length > 0 && (
            <button onClick={goBack} className="flex items-center gap-1 text-sm px-2 py-1 rounded hover:bg-gray-200">
              <ChevronLeft size={16} /> Back
            </button>
          )}
          <div className="flex-1 font-semibold text-gray-800">{folderName}</div>
          <div className="relative">
            <Search size={14} className="absolute left-2 top-2.5 text-gray-400" />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') loadFolder(folderId, folderName) }}
              placeholder="Search…"
              className="pl-7 pr-2 py-1.5 text-sm border rounded w-48"
            />
          </div>
        </div>

        {/* File list */}
        <div className="flex-1 overflow-y-auto px-5 py-3">
          {loading ? (
            <div className="flex items-center justify-center py-12 text-gray-500">
              <Loader2 className="animate-spin mr-2" size={18} /> Loading…
            </div>
          ) : error ? (
            <div className="text-sm py-4">
              <div className="text-red-600 font-semibold mb-2">{error}</div>
              <p className="text-gray-600 mb-3">Your saved Google authorization may not include Drive access. Click below to re-authorize and grant Drive permission.</p>
              <button
                onClick={async () => {
                  try {
                    const r = await fetch('/api/email-scan?action=auth-url')
                    const d = await r.json()
                    if (d.authUrl) window.open(d.authUrl, '_blank', 'noopener,noreferrer')
                    else setError(d.error || 'Could not start auth flow')
                  } catch (e: any) { setError(e.message) }
                }}
                className="px-4 py-2 rounded-lg text-white text-sm font-semibold"
                style={{ background: '#b8895a' }}
              >
                Reconnect Google (with Drive access)
              </button>
              <p className="text-xs text-gray-500 mt-3">After authorizing, copy the new GOOGLE_REFRESH_TOKEN from the callback page into your Flux env, then restart the pod.</p>
            </div>
          ) : files.length === 0 ? (
            <div className="text-gray-400 text-sm text-center py-12">No files in this folder.</div>
          ) : (
            <ul className="divide-y">
              {files.map(f => {
                const folder = isFolder(f)
                const isSel = selected.has(f.id)
                return (
                  <li key={f.id} className="flex items-center gap-3 py-2 hover:bg-gray-50">
                    {!folder && (
                      <input type="checkbox" checked={isSel} onChange={() => toggle(f.id)} className="ml-1" />
                    )}
                    {folder && <span className="ml-1 w-4 inline-block" />}
                    <button
                      onClick={() => folder ? openFolder(f) : toggle(f.id)}
                      className="flex items-center gap-2 flex-1 text-left text-sm"
                    >
                      {folder ? <Folder size={18} className="text-amber-500" /> : <FileText size={18} className="text-gray-500" />}
                      <span className={folder ? 'font-medium text-gray-800' : 'text-gray-700'}>{f.name}</span>
                      {f.size && <span className="text-xs text-gray-400 ml-auto">{Math.round(Number(f.size) / 1024)} KB</span>}
                    </button>
                  </li>
                )
              })}
            </ul>
          )}
        </div>

        {/* Footer / import controls */}
        <div className="border-t bg-gray-50 px-5 py-3 flex flex-wrap items-center gap-3">
          <label className="text-xs text-gray-600">Import as:</label>
          <select value={target} onChange={e => setTarget(e.target.value as ImportTarget)} className="text-sm border rounded px-2 py-1">
            <option value="receipt">Receipt</option>
            <option value="check">Check</option>
            <option value="statement">Bank Statement</option>
            <option value="document">Document / COI</option>
          </select>
          {(target === 'receipt' || target === 'check') && accounts.length > 0 && (
            <select value={accountId || ''} onChange={e => setAccountId(e.target.value || null)} className="text-sm border rounded px-2 py-1">
              <option value="">— Unassigned account —</option>
              {accounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
          )}
          <div className="flex-1" />
          <span className="text-sm text-gray-600">{selected.size} selected</span>
          <button
            onClick={importSelected}
            disabled={selected.size === 0 || importing}
            className="px-4 py-2 rounded text-white font-medium text-sm disabled:opacity-40"
            style={{ background: '#b8895a' }}
          >
            {importing ? <><Loader2 className="animate-spin inline mr-1" size={14} /> Importing…</> : <><Download size={14} className="inline mr-1" /> Import {selected.size > 0 ? selected.size : ''}</>}
          </button>
        </div>
      </div>
    </div>
  )
}
