'use client'
import { useRef, useState } from 'react'
import { Loader2, Images, X } from 'lucide-react'

// "Google Photos" button: opens Google's own photo picker in a new tab, waits for the
// selection, pulls each picked photo through /api/google-photos and hands them to
// `onFiles` as ordinary File objects — so it plugs into any existing upload handler.
export default function GooglePhotosButton({ onFiles, multiple = true, allowVideo = false, disabled, className, style, label = 'Google Photos', iconSize = 13, wrapClassName }: {
  onFiles: (files: File[]) => void | Promise<void>
  multiple?: boolean
  /** also bring in videos (only where the upload accepts them) */
  allowVideo?: boolean
  disabled?: boolean
  className?: string
  style?: React.CSSProperties
  label?: string
  iconSize?: number
  /** classes for the outer wrapper, e.g. to make the button fill a grid/flex cell */
  wrapClassName?: string
}) {
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<{ kind: 'info' | 'err'; text: string } | null>(null)
  const cancelled = useRef(false)

  const post = (action: string, body: any = {}) =>
    fetch(`/api/google-photos?action=${action}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })

  async function start() {
    if (busy || disabled) return
    cancelled.current = false
    setMsg(null)
    // Open the tab now, while we still have the click — browsers block pop-ups opened after an await.
    const tab = window.open('', '_blank')
    setBusy(true)
    let sessionId = ''
    try {
      const r = await post('create-session', multiple ? {} : { max: 1 })
      const d = await r.json().catch(() => ({}))
      if (!r.ok || !d.pickerUri) {
        tab?.close()
        throw new Error(d.needsAuth
          ? 'Google Photos isn’t connected yet. Reconnect Google (Settings → Google Connection), then try again.'
          : d.error || 'Could not open Google Photos')
      }
      sessionId = d.sessionId
      const url = `${d.pickerUri}/autoclose`   // Google closes its tab once you press Done
      if (tab) tab.location.href = url
      else window.open(url, '_blank')
      setMsg({ kind: 'info', text: `Pick ${allowVideo ? 'photos or videos' : 'photos'} in the Google Photos tab and press Done…` })

      // Wait for the selection (up to 10 minutes).
      const deadline = Date.now() + 10 * 60_000
      let items: { baseUrl: string; mimeType: string; filename: string }[] | null = null
      while (!items) {
        if (cancelled.current) return
        if (Date.now() > deadline) throw new Error('Timed out waiting for your Google Photos selection')
        await new Promise(res => setTimeout(res, 3000))
        const pr = await post('items', { sessionId, allowVideo })
        const pd = await pr.json().catch(() => ({}))
        if (!pr.ok) throw new Error(pd.error || 'Google Photos error')
        if (!pd.pending) items = pd.items || []
      }
      if (cancelled.current) return
      if (!items.length) { setMsg({ kind: 'err', text: allowVideo ? 'Nothing was picked.' : 'No photos were picked (videos can’t be added here).' }); return }

      const files: File[] = []
      for (let i = 0; i < items.length; i++) {
        if (cancelled.current) return
        setMsg({ kind: 'info', text: `Bringing in ${items[i].mimeType.startsWith('video/') ? 'video' : 'photo'} ${i + 1} of ${items.length}…` })
        const it = items[i]
        const fr = await post('file', it)
        if (!fr.ok) continue
        const blob = await fr.blob()
        const type = blob.type || it.mimeType || 'image/jpeg'
        // Downloads come back as JPEG even for iPhone HEIC originals — fix the extension to match.
        const name = type === 'image/jpeg' ? it.filename.replace(/\.(heic|heif|png|webp|gif)$/i, '').replace(/(\.jpe?g)?$/i, '.jpg') : it.filename
        files.push(new File([blob], name, { type }))
      }
      if (!files.length) throw new Error('Could not download the picked items')
      setMsg(null)
      await onFiles(files)
    } catch (e: any) {
      setMsg({ kind: 'err', text: e?.message || 'Google Photos import failed' })
    } finally {
      if (sessionId) post('done', { sessionId }).catch(() => {})
      setBusy(false)
    }
  }

  function cancel() { cancelled.current = true; setBusy(false); setMsg(null) }

  return (
    <span className={wrapClassName || "inline-flex flex-col"}>
      <span className={wrapClassName ? "flex flex-1 items-stretch gap-1" : "inline-flex items-center gap-1"}>
        <button type="button" onClick={start} disabled={disabled || busy}
          className={className || 'flex items-center gap-1.5 px-3 py-2 rounded-xl border border-dashed border-gray-300 text-xs font-semibold text-gray-600 hover:bg-gray-50 hover:border-blue-300 disabled:opacity-60'}
          style={style} title="Pick photos from Google Photos">
          {busy ? <Loader2 size={iconSize} className="animate-spin" /> : <Images size={iconSize} />} {label}
        </button>
        {busy && <button type="button" onClick={cancel} className="text-gray-400 hover:text-gray-700 p-0.5" title="Cancel"><X size={13} /></button>}
      </span>
      {msg && <span className={`text-[11px] mt-1 max-w-xs ${msg.kind === 'err' ? 'text-red-600' : 'text-gray-500'}`}>{msg.text}</span>}
    </span>
  )
}
