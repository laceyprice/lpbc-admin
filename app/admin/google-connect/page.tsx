'use client'
import { useCallback, useEffect, useState } from 'react'
import { Loader2, CheckCircle2, AlertCircle, KeyRound, RefreshCw } from 'lucide-react'
import { adminFetch } from '@/lib/admin-fetch'

type Status = { source: 'database' | 'env' | 'none'; valid: boolean; scopes: string[]; updated_at?: string | null; error?: string }

const SCOPE_LABELS: [string, string][] = [
  ['/auth/calendar', 'Google Calendar'],
  ['/auth/gmail.modify', 'Gmail (read / modify)'],
  ['/auth/gmail.send', 'Gmail (send)'],
  ['/auth/drive', 'Drive — folders, uploads & imports'],
  ['/auth/documents', 'Google Docs — Scope of Work'],
  ['/auth/photospicker.mediaitems.readonly', 'Google Photos — pick photos to upload'],
]

export default function GoogleConnectPage() {
  const [status, setStatus] = useState<Status | null>(null)
  const [loading, setLoading] = useState(true)
  const [authBusy, setAuthBusy] = useState(false)
  const [token, setToken] = useState('')
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await adminFetch('/api/google-token')
      const d = await res.json()
      setStatus(res.ok ? d : { source: 'none', valid: false, scopes: [], error: d.error })
    } catch { setStatus({ source: 'none', valid: false, scopes: [], error: 'Could not check the connection' }) }
    setLoading(false)
  }, [])
  useEffect(() => { load() }, [load])

  async function startAuth() {
    setAuthBusy(true); setMsg(null)
    try {
      const res = await fetch('/api/email-scan?action=auth-url')
      const d = await res.json()
      if (!res.ok || !d.authUrl) throw new Error(d.error || 'Failed to start authorization')
      window.open(d.authUrl, '_blank', 'noopener,noreferrer')
    } catch (e: any) { setMsg({ ok: false, text: e.message }) }
    setAuthBusy(false)
  }

  async function saveToken() {
    setSaving(true); setMsg(null)
    try {
      const res = await adminFetch('/api/google-token', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token }) })
      const d = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(d.error || 'Could not save')
      setToken(''); setMsg({ ok: true, text: 'Saved. The new connection is live now — no redeploy needed.' })
      await load()
    } catch (e: any) { setMsg({ ok: false, text: e.message }) }
    setSaving(false)
  }

  const has = (s: string) => status?.scopes.some(x => x.endsWith(s)) ?? false

  return (
    <div className="max-w-2xl mx-auto p-6 md:p-8 pt-16 md:pt-8">
      <h1 className="text-2xl font-bold mb-1" style={{ color: '#2f5a5e' }}>Google connection</h1>
      <p className="text-gray-600 mb-6 text-sm">Gmail, Calendar, Drive, Docs and Photos all use one saved Google authorization. Reconnect it here when you need more permissions.</p>

      <div className="bg-white rounded-2xl border p-5 shadow-sm mb-5">
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-bold text-gray-800">Current connection</h2>
          <button onClick={load} className="text-gray-400 hover:text-gray-700 p-1" title="Re-check"><RefreshCw size={15} className={loading ? 'animate-spin' : ''} /></button>
        </div>
        {loading ? <div className="flex items-center gap-2 text-gray-500 text-sm"><Loader2 size={16} className="animate-spin" /> Checking with Google…</div>
          : !status?.valid ? (
            <div className="text-sm text-red-700 flex items-start gap-2"><AlertCircle size={16} className="mt-0.5 flex-shrink-0" /> <span>{status?.source === 'none' ? 'Google isn’t connected.' : 'Google rejected the saved connection.'} {status?.error}</span></div>
          ) : (
            <>
              <div className="text-sm text-green-700 flex items-center gap-2 mb-3"><CheckCircle2 size={16} /> Connected <span className="text-gray-400">· token from {status.source === 'database' ? 'this app (saved here)' : 'the server environment'}</span></div>
              <ul className="space-y-1">
                {SCOPE_LABELS.map(([s, label]) => (
                  <li key={s} className="text-sm flex items-center gap-2">
                    {has(s) ? <CheckCircle2 size={14} className="text-green-600" /> : <AlertCircle size={14} className="text-amber-500" />}
                    <span className={has(s) ? 'text-gray-700' : 'text-gray-500'}>{label}{!has(s) && ' — not granted yet'}</span>
                  </li>
                ))}
              </ul>
            </>
          )}
      </div>

      <div className="bg-white rounded-2xl border p-5 shadow-sm mb-5">
        <h2 className="font-bold text-gray-800 mb-1">Reconnect Google</h2>
        <p className="text-sm text-gray-500 mb-3">Opens Google’s consent screen in a new tab. Sign in with the office Google account and allow everything. The new connection is <b>saved automatically</b> — when the tab says “Google is connected”, close it and press the refresh icon above. No token to copy, no Flux change, no redeploy.</p>
        <button onClick={startAuth} disabled={authBusy} className="px-4 py-2 rounded-lg text-white font-semibold text-sm flex items-center gap-2 disabled:opacity-60" style={{ background: '#b8895a' }}>
          {authBusy && <Loader2 size={14} className="animate-spin" />} Reconnect Google
        </button>
      </div>

      <div className="bg-white rounded-2xl border p-5 shadow-sm">
        <h2 className="font-bold text-gray-800 mb-1 flex items-center gap-2"><KeyRound size={16} /> Or paste a token by hand</h2>
        <p className="text-sm text-gray-500 mb-3">Only needed if the Google page showed you a token instead of saying “connected”. Paste it here — it’s checked with Google, then saved in your database and used immediately.</p>
        <input type="password" value={token} onChange={e => setToken(e.target.value)} placeholder="1//0g…" autoComplete="off"
          className="w-full px-3 py-2.5 rounded-lg border border-gray-200 text-sm font-mono focus:outline-none focus:ring-2 focus:border-blue-400" />
        <div className="flex items-center gap-3 mt-3">
          <button onClick={saveToken} disabled={saving || !token.trim()} className="px-4 py-2 rounded-lg text-white font-semibold text-sm flex items-center gap-2 disabled:opacity-50" style={{ background: '#b8895a' }}>
            {saving && <Loader2 size={14} className="animate-spin" />} Save token
          </button>
          {msg && <span className={`text-sm ${msg.ok ? 'text-green-700' : 'text-red-700'}`}>{msg.text}</span>}
        </div>
      </div>
    </div>
  )
}
