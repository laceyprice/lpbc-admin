'use client'
import { useCallback, useEffect, useRef, useState } from 'react'
import { Paperclip, Upload, Camera, Trash2, Loader2, FileText, Image as ImageIcon, ExternalLink, HardDrive } from 'lucide-react'
import { adminFetch } from '@/lib/admin-fetch'
import DrivePicker from '@/components/admin/DrivePicker'

// Documents & photos for one license or permit: upload from the device (or take a
// photo), pull a file in from Google Drive, and — when Google is authorized for
// writing — every upload is also copied into Drive ("Licenses & Permits" folder).

type RFile = { id: string; file_name: string; mime_type: string | null; size_bytes: number | null; created_at: string; url: string | null; drive_url: string | null; drive_file_id: string | null }

const fmtSize = (n: number | null) => !n ? '' : n < 1024 * 1024 ? `${Math.max(1, Math.round(n / 1024))} KB` : `${(n / 1024 / 1024).toFixed(1)} MB`

export default function RecordFiles({ entityType, entityId, brand }: { entityType: 'license' | 'permit'; entityId: string; brand: string }) {
  const [files, setFiles] = useState<RFile[]>([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<{ kind: 'ok' | 'warn' | 'err'; text: string } | null>(null)
  const [showDrive, setShowDrive] = useState(false)
  const pick = useRef<HTMLInputElement>(null)
  const cam = useRef<HTMLInputElement>(null)

  const load = useCallback(async () => {
    try {
      const res = await adminFetch(`/api/record-files?entity_type=${entityType}&entity_id=${entityId}`)
      const d = await res.json()
      if (!res.ok) setMsg({ kind: 'err', text: d.error || 'Could not load documents' })
      else setFiles(Array.isArray(d) ? d : [])
    } catch { setMsg({ kind: 'err', text: 'Could not load documents' }) }
    setLoading(false)
  }, [entityType, entityId])
  useEffect(() => { setLoading(true); load() }, [load])

  async function upload(list: FileList | null) {
    if (!list || list.length === 0) return
    setBusy(true); setMsg(null)
    let ok = 0, needsWrite = false, failed = ''
    for (const f of Array.from(list)) {
      const fd = new FormData()
      fd.append('file', f); fd.append('entity_type', entityType); fd.append('entity_id', entityId)
      try {
        const res = await adminFetch('/api/record-files?action=upload', { method: 'POST', body: fd })
        const d = await res.json().catch(() => ({}))
        if (!res.ok) failed = d.error || `Upload failed (${res.status})`
        else { ok++; if (d.drive && !d.drive.ok && d.drive.reason === 'needs-write-access') needsWrite = true }
      } catch { failed = 'Upload failed — check your connection' }
    }
    setBusy(false)
    if (pick.current) pick.current.value = ''
    if (cam.current) cam.current.value = ''
    if (failed) setMsg({ kind: 'err', text: failed })
    else if (needsWrite) setMsg({ kind: 'warn', text: `Saved ${ok} file${ok === 1 ? '' : 's'}. It wasn't copied to Google Drive yet — Google needs to be reconnected with permission to add files (Reconnect Google, below).` })
    else setMsg({ kind: 'ok', text: `Uploaded ${ok} file${ok === 1 ? '' : 's'}.` })
    await load()
  }

  async function importFromDrive(file: { id: string }) {
    const res = await adminFetch('/api/record-files?action=import-drive', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fileId: file.id, entity_type: entityType, entity_id: entityId }),
    })
    const d = await res.json().catch(() => ({}))
    if (!res.ok) throw new Error(d.error || 'Import failed')
    await load()
  }

  async function remove(f: RFile) {
    if (!confirm(`Remove "${f.file_name}" from this ${entityType}?${f.drive_url ? ' (The copy in Google Drive stays.)' : ''}`)) return
    await adminFetch(`/api/record-files?id=${f.id}`, { method: 'DELETE' })
    await load()
  }

  async function reconnect() {
    try {
      const r = await fetch('/api/email-scan?action=auth-url'); const d = await r.json()
      if (d.authUrl) window.open(d.authUrl, '_blank', 'noopener,noreferrer')
    } catch { /* ignore */ }
  }

  const btn = 'flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-bold border hover:bg-gray-50 disabled:opacity-50'

  return (
    <div className="border border-gray-100 rounded-xl p-3 bg-gray-50/60">
      <div className="flex items-center gap-2 mb-2">
        <Paperclip size={14} style={{ color: brand }} />
        <span className="text-xs font-bold text-gray-600 uppercase tracking-wider">Documents &amp; photos</span>
        {files.length > 0 && <span className="text-xs text-gray-400">({files.length})</span>}
      </div>

      <div className="flex flex-wrap gap-2 mb-2">
        <button type="button" disabled={busy} onClick={() => pick.current?.click()} className={btn} style={{ color: brand, borderColor: brand + '55' }}>
          {busy ? <Loader2 size={13} className="animate-spin" /> : <Upload size={13} />} Upload file
        </button>
        <button type="button" disabled={busy} onClick={() => cam.current?.click()} className={btn} style={{ color: brand, borderColor: brand + '55' }}>
          <Camera size={13} /> Take photo
        </button>
        <button type="button" disabled={busy} onClick={() => setShowDrive(true)} className={btn} style={{ color: brand, borderColor: brand + '55' }}>
          <HardDrive size={13} /> From Google Drive
        </button>
        <input ref={pick} type="file" multiple accept="image/*,application/pdf,.doc,.docx,.xls,.xlsx,.heic" className="hidden" onChange={e => upload(e.target.files)} />
        <input ref={cam} type="file" accept="image/*" capture="environment" className="hidden" onChange={e => upload(e.target.files)} />
      </div>

      {msg && (
        <div className={`text-xs px-3 py-2 rounded-lg mb-2 ${msg.kind === 'ok' ? 'bg-green-50 text-green-700' : msg.kind === 'warn' ? 'bg-amber-50 text-amber-800' : 'bg-red-50 text-red-700'}`}>
          {msg.text}
          {msg.kind === 'warn' && <> <button type="button" onClick={reconnect} className="underline font-bold">Reconnect Google</button></>}
        </div>
      )}

      {loading ? (
        <div className="py-3 flex justify-center"><Loader2 size={16} className="animate-spin text-gray-400" /></div>
      ) : files.length === 0 ? (
        <p className="text-xs text-gray-400 py-1">Nothing attached yet — upload a scan or photo, or pick one from Google Drive.</p>
      ) : (
        <ul className="space-y-1.5">
          {files.map(f => {
            const isImg = (f.mime_type || '').startsWith('image/')
            return (
              <li key={f.id} className="flex items-center gap-2.5 bg-white rounded-lg border border-gray-100 px-2.5 py-2">
                {isImg && f.url
                  ? <a href={f.url} target="_blank" rel="noreferrer" className="flex-shrink-0"><img src={f.url} alt="" className="w-10 h-10 rounded object-cover border border-gray-100" /></a>
                  : <div className="w-10 h-10 rounded bg-gray-100 flex items-center justify-center flex-shrink-0 text-gray-400">{isImg ? <ImageIcon size={18} /> : <FileText size={18} />}</div>}
                <div className="min-w-0 flex-1">
                  {f.url
                    ? <a href={f.url} target="_blank" rel="noreferrer" className="text-sm font-semibold text-gray-800 hover:underline truncate block">{f.file_name}</a>
                    : <span className="text-sm font-semibold text-gray-800 truncate block">{f.file_name}</span>}
                  <div className="text-[11px] text-gray-400">{[fmtSize(f.size_bytes), new Date(f.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })].filter(Boolean).join(' · ')}</div>
                </div>
                {f.drive_url && (
                  <a href={f.drive_url} target="_blank" rel="noreferrer" className="flex items-center gap-1 text-[11px] font-bold text-gray-500 hover:text-gray-800 px-1.5" title="Open in Google Drive"><ExternalLink size={12} /> Drive</a>
                )}
                <button type="button" onClick={() => remove(f)} className="p-1.5 text-gray-400 hover:text-red-600" title="Remove"><Trash2 size={14} /></button>
              </li>
            )
          })}
        </ul>
      )}

      <DrivePicker open={showDrive} onClose={() => setShowDrive(false)} onPickFile={importFromDrive} brand={brand} />
    </div>
  )
}
