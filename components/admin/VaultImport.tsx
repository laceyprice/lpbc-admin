'use client'
import { useMemo, useRef, useState } from 'react'
import { X, Upload, Loader2, FileSpreadsheet, Eye, EyeOff, AlertTriangle, Check } from 'lucide-react'
import { adminFetch } from '@/lib/admin-fetch'
import type { ImportRow, ParsedSheet } from '@/lib/vault-import'

// Import a password spreadsheet (Account / Username / Password / PassKey) into the vault.
// Step 1: pick the file → server reads it (nothing saved). Step 2: review, rename categories,
// untick anything you don't want. Step 3: import. Entries already in the vault are unticked.

type Row = ImportRow & { id: number; sheet: string; include: boolean; dup: boolean }

const inp = 'px-2.5 py-1.5 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:border-blue-400'
const key = (name: string, user: string | null | undefined) => `${name.trim().toLowerCase()}|${(user || '').trim().toLowerCase()}`

export default function VaultImport({ endpoint, brand, existing, categories, onClose, onDone }: {
  endpoint: string                                            // '/api/vault' or '/api/vault-accounts'
  brand: string
  existing: { name: string; username: string | null }[]
  categories: string[]
  onClose: () => void
  onDone: (count: number) => void
}) {
  const fileRef = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [fileName, setFileName] = useState('')
  const [sheets, setSheets] = useState<ParsedSheet[]>([])
  const [useSheet, setUseSheet] = useState<Record<string, boolean>>({})
  const [rows, setRows] = useState<Row[]>([])
  const [tagSheet, setTagSheet] = useState(true)
  const [showPw, setShowPw] = useState(false)
  const have = useMemo(() => new Set(existing.map(e => key(e.name, e.username))), [existing])

  async function onFile(f: File | null) {
    if (!f) return
    setBusy(true); setErr(''); setFileName(f.name)
    try {
      const fd = new FormData(); fd.append('file', f)
      const res = await adminFetch(`${endpoint}?action=parse`, { method: 'POST', body: fd })
      const d = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(d.error || 'Could not read that file')
      const s: ParsedSheet[] = d.sheets || []
      let n = 0
      const flat: Row[] = []
      s.forEach(sh => sh.rows.forEach(r => flat.push({ ...r, id: n++, sheet: sh.name, dup: have.has(key(r.name, r.username)), include: !have.has(key(r.name, r.username)) })))
      setSheets(s); setRows(flat)
      setUseSheet(Object.fromEntries(s.map(sh => [sh.name, sh.rows.length > 0])))
      setTagSheet(s.filter(sh => sh.rows.length > 0).length > 1)
      if (flat.length === 0) setErr(s.map(sh => sh.error).filter(Boolean)[0] || 'No entries found in that file.')
    } catch (e: any) { setErr(e.message); setSheets([]); setRows([]) }
    setBusy(false)
    if (fileRef.current) fileRef.current.value = ''
  }

  const visible = rows.filter(r => useSheet[r.sheet])
  const groups = useMemo(() => {
    const m = new Map<string, Row[]>()
    visible.forEach(r => m.set(r.category, [...(m.get(r.category) || []), r]))
    return Array.from(m.entries())
  }, [visible])
  const chosen = visible.filter(r => r.include)
  const dupCount = visible.filter(r => r.dup).length
  const multi = sheets.filter(s => s.rows.length > 0).length > 1

  const patch = (id: number, p: Partial<Row>) => setRows(rs => rs.map(r => (r.id === id ? { ...r, ...p } : r)))
  const renameGroup = (from: string, to: string) => setRows(rs => rs.map(r => (useSheet[r.sheet] && r.category === from ? { ...r, category: to } : r)))
  const toggleGroup = (cat: string, on: boolean) => setRows(rs => rs.map(r => (useSheet[r.sheet] && r.category === cat ? { ...r, include: on } : r)))

  async function doImport() {
    setBusy(true); setErr('')
    try {
      const payload = chosen.map(r => ({
        category: r.category.trim() || 'Other', name: r.name, username: r.username, password: r.password, passkey: r.passkey, url: r.url,
        notes: [r.notes, tagSheet && multi ? `Imported from sheet "${r.sheet}"` : ''].filter(Boolean).join('\n'),
      }))
      const res = await adminFetch(`${endpoint}?action=import`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ rows: payload }) })
      const d = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(d.error || 'Import failed')
      onDone(d.imported ?? payload.length)
    } catch (e: any) { setErr(e.message); setBusy(false) }
  }

  const step = rows.length === 0 ? 1 : 2

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-end sm:items-center justify-center p-0 sm:p-4" onClick={onClose}>
      <div className="bg-white w-full sm:max-w-3xl rounded-t-2xl sm:rounded-2xl shadow-xl max-h-[92vh] flex flex-col" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <h3 className="font-extrabold text-gray-900 flex items-center gap-2"><FileSpreadsheet size={17} style={{ color: brand }} /> Import from a spreadsheet</h3>
          <button onClick={onClose} className="p-1 text-gray-400 hover:text-gray-700"><X size={18} /></button>
        </div>

        <div className="px-5 py-4 overflow-y-auto flex-1">
          {step === 1 ? (
            <>
              <p className="text-sm text-gray-600 mb-3">Upload an <b>.xlsx</b> or <b>.csv</b> with the columns <b>Account, Username, Password, PassKey</b>. Rows like “EMAIL” or “BANKING” with nothing else on them become categories for the entries below. You’ll review everything before anything is saved.</p>
              <p className="text-xs text-gray-400 mb-4">From Google Sheets: File → Download → Microsoft Excel (.xlsx). Every tab is read, so you can pick which ones to import.</p>
              <button onClick={() => fileRef.current?.click()} disabled={busy} className="flex items-center gap-2 text-white text-sm font-bold px-5 py-2.5 rounded-xl disabled:opacity-50" style={{ background: brand }}>
                {busy ? <Loader2 size={15} className="animate-spin" /> : <Upload size={15} />} Choose spreadsheet
              </button>
              <input ref={fileRef} type="file" accept=".xlsx,.csv,.txt,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv" className="hidden" onChange={e => onFile(e.target.files?.[0] || null)} />
              {fileName && !busy && <span className="ml-3 text-xs text-gray-400">{fileName}</span>}
            </>
          ) : (
            <>
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-gray-500 mb-3">
                <span className="font-semibold text-gray-700">{fileName}</span>
                {sheets.map(s => s.rows.length > 0 && (
                  <label key={s.name} className="flex items-center gap-1.5 cursor-pointer"><input type="checkbox" checked={!!useSheet[s.name]} onChange={e => setUseSheet(u => ({ ...u, [s.name]: e.target.checked }))} /> Tab “{s.name}” ({s.rows.length})</label>
                ))}
                {multi && <label className="flex items-center gap-1.5 cursor-pointer"><input type="checkbox" checked={tagSheet} onChange={e => setTagSheet(e.target.checked)} /> Note which tab each came from</label>}
                <button onClick={() => setShowPw(s => !s)} className="flex items-center gap-1 hover:text-gray-800 ml-auto">{showPw ? <EyeOff size={13} /> : <Eye size={13} />} {showPw ? 'Hide' : 'Show'} passwords</button>
              </div>
              {dupCount > 0 && <div className="mb-3 text-xs bg-amber-50 text-amber-800 rounded-lg px-3 py-2 flex items-center gap-2"><AlertTriangle size={14} /> {dupCount} entr{dupCount === 1 ? 'y is' : 'ies are'} already in the vault (same name and username) and {dupCount === 1 ? 'is' : 'are'} unticked.</div>}
              <datalist id="vault-import-cats">{categories.map(c => <option key={c} value={c} />)}</datalist>
              <div className="space-y-4">
                {groups.map(([cat, list]) => (
                  <div key={cat} className="border border-gray-100 rounded-xl overflow-hidden">
                    <div className="flex items-center gap-2 bg-gray-50 px-3 py-2">
                      <input type="checkbox" checked={list.every(r => r.include)} onChange={e => toggleGroup(cat, e.target.checked)} title="Select all in this category" />
                      <span className="text-[11px] font-bold text-gray-400 uppercase">Category</span>
                      <input list="vault-import-cats" defaultValue={cat} key={cat} onBlur={e => { const v = e.target.value.trim(); if (v && v !== cat) renameGroup(cat, v) }}
                        className={`${inp} font-semibold flex-1 min-w-0 bg-white`} />
                      <span className="text-xs text-gray-400">{list.length}</span>
                    </div>
                    <div className="divide-y divide-gray-50">
                      {list.map(r => (
                        <div key={r.id} className={`flex items-center gap-2.5 px-3 py-2 text-sm ${r.include ? '' : 'opacity-50'}`}>
                          <input type="checkbox" checked={r.include} onChange={e => patch(r.id, { include: e.target.checked })} />
                          <div className="min-w-0 flex-1 grid grid-cols-1 sm:grid-cols-3 gap-x-3">
                            <span className="font-semibold text-gray-800 truncate">{r.name}{r.dup && <span className="ml-1.5 text-[10px] font-bold text-amber-600 uppercase">already added</span>}{r.nocreds && <span className="ml-1.5 text-[10px] font-bold text-gray-400 uppercase">no login info</span>}</span>
                            <span className="text-gray-600 truncate">{r.username || <span className="text-gray-300">—</span>}</span>
                            <span className="font-mono text-gray-600 truncate">{r.password ? (showPw ? r.password : '••••••••') : <span className="text-gray-300">—</span>}{r.passkey && <span className="ml-1.5 text-[10px] font-sans font-bold text-gray-400">+ passkey</span>}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
          {err && <div className="mt-3 bg-red-50 border border-red-100 text-red-700 text-sm px-3 py-2 rounded-lg">{err}</div>}
        </div>

        <div className="px-5 py-4 border-t border-gray-100 flex items-center justify-end gap-2">
          {step === 2 && <button onClick={() => { setRows([]); setSheets([]); setErr('') }} className="mr-auto text-sm font-semibold text-gray-500 hover:text-gray-800">← Pick a different file</button>}
          <button onClick={onClose} className="px-4 py-2 rounded-xl text-sm font-semibold text-gray-500 hover:bg-gray-100">Cancel</button>
          {step === 2 && (
            <button onClick={doImport} disabled={busy || chosen.length === 0} className="flex items-center gap-2 text-white text-sm font-bold px-5 py-2 rounded-xl disabled:opacity-50" style={{ background: brand }}>
              {busy ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />} Import {chosen.length} entr{chosen.length === 1 ? 'y' : 'ies'}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
