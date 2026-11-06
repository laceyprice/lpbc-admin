'use client'
import { useEffect, useState } from 'react'
import { Loader2 } from 'lucide-react'
import { ErrorNote, PageHeader, PrimaryButton, inp, lbl } from '@/components/admin/ui'

// Business settings used by the texting, job-cost and mileage features. Admin only.
export default function BusinessSettingsPage() {
  const [s, setS] = useState<Record<string, string> | null>(null)
  const [err, setErr] = useState(''), [saved, setSaved] = useState(false), [busy, setBusy] = useState(false)
  const [origin, setOrigin] = useState('')
  useEffect(() => { setOrigin(window.location.origin); fetch('/api/settings', { cache: 'no-store' }).then(async r => { const d = await r.json(); if (!r.ok) throw new Error(d.error); setS(d) }).catch(e => { setErr(e.message || 'Could not load'); setS({}) }) }, [])
  const set = (k: string, v: string) => { setSaved(false); setS(p => ({ ...(p || {}), [k]: v })) }

  async function save() {
    setErr(''); setBusy(true)
    try { const r = await fetch('/api/settings', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(s) }); const d = await r.json(); if (!r.ok) throw new Error(d.error || 'Could not save'); setS(d); setSaved(true) } catch (e: any) { setErr(e.message) }
    setBusy(false)
  }
  if (!s) return <div className="p-8 pt-16 flex justify-center"><Loader2 className="animate-spin text-gray-300" /></div>

  return (
    <div className="p-4 md:p-8 pt-16 md:pt-8 max-w-2xl">
      <PageHeader title="Business Settings" subtitle="Numbers and links the new features use. Changes apply immediately." />
      <div className="space-y-5">
        <section className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 space-y-3">
          <h2 className="font-bold text-gray-900">Reviews</h2>
          <div><label className={lbl}>Google review link</label><input className={inp} placeholder="https://g.page/r/…/review" value={s.review_url || ''} onChange={e => set('review_url', e.target.value)} />
            <p className="text-xs text-gray-400 mt-1">Google Business Profile → “Ask for reviews” → copy the link. It powers the “Ask for review” button on paid invoices.</p></div>
        </section>
        <section className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 space-y-3">
          <h2 className="font-bold text-gray-900">Rates</h2>
          <div className="grid grid-cols-2 gap-3">
            <div><label className={lbl}>Default hourly rate ($)</label><input type="number" min="0" className={inp} value={s.default_hourly_rate || ''} onChange={e => set('default_hourly_rate', e.target.value)} /><p className="text-xs text-gray-400 mt-1">Pre-fills the “$/hour” when you log hours on a job.</p></div>
            <div><label className={lbl}>Mileage rate ($/mile)</label><input type="number" step="0.005" min="0" className={inp} value={s.mileage_rate || ''} onChange={e => set('mileage_rate', e.target.value)} /><p className="text-xs text-gray-400 mt-1">IRS standard rate — update each January.</p></div>
          </div>
        </section>
        <section className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 space-y-3">
          <h2 className="font-bold text-gray-900">Missed-call text-back</h2>
          <p className="text-xs text-gray-500">When you can’t answer, the caller gets a text right away and you get a “Call back” todo. Needs your Twilio number pointed at this app — steps below.</p>
          <label className="flex items-center gap-2 text-sm text-gray-700"><input type="checkbox" checked={s.missed_call_enabled === 'true'} onChange={e => set('missed_call_enabled', e.target.checked ? 'true' : 'false')} /> Text callers back when I miss their call</label>
          <div><label className={lbl}>Ring my cell first</label><input type="tel" className={inp} placeholder="850-555-0123" value={s.forward_number || ''} onChange={e => set('forward_number', e.target.value)} /></div>
          <div><label className={lbl}>Message (optional)</label><textarea rows={3} className={inp} placeholder="Leave blank to use the standard message" value={s.missed_call_text || ''} onChange={e => set('missed_call_text', e.target.value)} /></div>
          <div className="text-xs bg-gray-50 border border-gray-100 rounded-lg p-3 text-gray-600 space-y-1">
            <b className="text-gray-800">Twilio setup (one time)</b>
            <div>1. Twilio Console → Phone Numbers → your number → <i>Voice Configuration</i>.</div>
            <div>2. “A call comes in” → <i>Webhook</i>, method <i>HTTP POST</i>, URL:</div>
            <code className="block bg-white border border-gray-200 rounded px-2 py-1 break-all">{origin}/api/twilio-voice</code>
            <div>3. Save. Calls to that number now ring your cell for ~20 seconds, then text the caller if you miss it.</div>
            <div className="text-gray-400">The URL must match this app’s public address exactly, or Twilio’s signature check will reject the call.</div>
          </div>
        </section>
        <ErrorNote>{err}</ErrorNote>
        <div className="flex items-center gap-3"><PrimaryButton onClick={save} disabled={busy}>{busy ? 'Saving…' : 'Save settings'}</PrimaryButton>{saved && <span className="text-sm text-green-600 font-semibold">Saved ✓</span>}</div>
      </div>
    </div>
  )
}
