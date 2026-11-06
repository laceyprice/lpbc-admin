'use client'
import { useCallback, useEffect, useRef, useState } from 'react'
import { CheckCircle2, ClipboardCheck, Loader2, Printer, Trash2, XCircle } from 'lucide-react'
import { BRAND, Empty, ErrorNote, Modal, PageHeader, PrimaryButton, fmtDate, inp, lbl } from '@/components/admin/ui'
import { BUSINESS } from '@/lib/business'
import { CHECKLISTS, templateById } from '@/lib/checklists'

// Safety / pressure-test checklists. Fill it out on your phone at the job, have the customer (or you) sign
// with a finger, and it's saved as a record you can print or PDF.

function SignaturePad({ onChange }: { onChange: (dataUrl: string) => void }) {
  const ref = useRef<HTMLCanvasElement>(null)
  const drawing = useRef(false)
  const pos = (e: React.PointerEvent) => { const r = ref.current!.getBoundingClientRect(); return { x: (e.clientX - r.left) * (ref.current!.width / r.width), y: (e.clientY - r.top) * (ref.current!.height / r.height) } }
  function start(e: React.PointerEvent) { e.preventDefault(); ref.current!.setPointerCapture(e.pointerId); drawing.current = true; const c = ref.current!.getContext('2d')!; const p = pos(e); c.beginPath(); c.moveTo(p.x, p.y) }
  function move(e: React.PointerEvent) { if (!drawing.current) return; const c = ref.current!.getContext('2d')!; const p = pos(e); c.lineWidth = 2.5; c.lineCap = 'round'; c.strokeStyle = '#111827'; c.lineTo(p.x, p.y); c.stroke() }
  function end() { if (!drawing.current) return; drawing.current = false; onChange(ref.current!.toDataURL('image/png')) }
  function clear() { const cv = ref.current!; cv.getContext('2d')!.clearRect(0, 0, cv.width, cv.height); onChange('') }
  return (
    <div>
      <canvas ref={ref} width={600} height={180} onPointerDown={start} onPointerMove={move} onPointerUp={end} onPointerLeave={end}
        className="w-full h-32 sm:h-36 rounded-xl border-2 border-dashed border-gray-300 bg-white touch-none" />
      <button type="button" onClick={clear} className="text-xs text-gray-500 underline mt-1">Clear signature</button>
    </div>
  )
}

function printRun(run: any) {
  const t = templateById(run.template)
  const rows = (t?.items || []).map(i => {
    const a = run.answers?.[i.id]
    const v = i.type === 'check' ? (a === 'pass' ? '✔ Pass' : a === 'fail' ? '✘ FAIL' : 'N/A') : (a || '—') + (i.type === 'reading' && a ? ' ' + (i.unit || '') : '')
    return `<tr><td>${i.label}</td><td style="font-weight:bold;${a === 'fail' ? 'color:#b91c1c' : ''}">${v}</td></tr>`
  }).join('')
  const w = window.open('', '_blank'); if (!w) { alert('Allow pop-ups to print'); return }
  w.document.write(`<html><head><title>${run.title}</title><style>body{font-family:Arial,sans-serif;max-width:760px;margin:30px auto;color:#111}h1{color:${BUSINESS.brand};margin:0}table{width:100%;border-collapse:collapse;margin:16px 0}td{border-bottom:1px solid #e5e7eb;padding:7px 4px;font-size:14px}.meta{color:#555;font-size:14px;line-height:1.6}.pass{display:inline-block;padding:3px 10px;border-radius:99px;font-weight:bold;color:#fff;background:${run.passed ? '#16a34a' : '#dc2626'}}</style></head><body>
    <h1>${BUSINESS.name}</h1><h2 style="margin:4px 0 10px">${run.title} <span class="pass">${run.passed ? 'PASSED' : 'FAILED'}</span></h2>
    <div class="meta">${[run.job_address && 'Job: ' + run.job_address, run.customer_name && 'Customer: ' + run.customer_name, run.tech_name && 'Technician: ' + run.tech_name, 'Date: ' + new Date(run.signed_at || run.created_at).toLocaleString()].filter(Boolean).join('<br>')}</div>
    <table>${rows}</table>${run.notes ? `<p><b>Notes:</b> ${String(run.notes).replace(/</g, '&lt;')}</p>` : ''}
    <p style="margin-top:24px"><b>Signed by:</b> ${String(run.signed_by).replace(/</g, '&lt;')}</p>${run.signature ? `<img src="${run.signature}" style="height:80px;border-bottom:1px solid #111"/>` : ''}
    <script>setTimeout(()=>window.print(),300)<\/script></body></html>`)
  w.document.close()
}

export default function ChecklistsPage() {
  const [tab, setTab] = useState<'new' | 'done'>('new')
  const [runs, setRuns] = useState<any[] | null>(null)
  const [view, setView] = useState<any | null>(null)
  const loadRuns = useCallback(async () => { try { const r = await fetch('/api/checklists', { cache: 'no-store' }); const d = await r.json(); setRuns(Array.isArray(d) ? d : []) } catch { setRuns([]) } }, [])
  useEffect(() => { loadRuns() }, [loadRuns])

  async function open(id: string) { const r = await fetch(`/api/checklists?id=${id}`); if (r.ok) setView(await r.json()) }
  async function remove(id: string) { if (confirm('Delete this checklist record?')) { await fetch(`/api/checklists?id=${id}`, { method: 'DELETE' }); setView(null); loadRuns() } }

  return (
    <div className="p-4 md:p-8 pt-16 md:pt-8">
      <PageHeader title="Safety Checklists" subtitle="Pressure tests, installs, tank inspections and leak calls — filled out on site and signed, so you have proof of what you did.">
        <div className="flex rounded-xl border border-gray-200 bg-white overflow-hidden text-sm font-semibold">
          {(['new', 'done'] as const).map(k => <button key={k} onClick={() => setTab(k)} className={`px-4 py-2 ${tab === k ? 'text-white' : 'text-gray-600'}`} style={tab === k ? { background: BRAND } : undefined}>{k === 'new' ? 'New checklist' : `Completed${runs ? ` (${runs.length})` : ''}`}</button>)}
        </div>
      </PageHeader>
      {tab === 'new' ? <NewChecklist onSaved={() => { loadRuns(); setTab('done') }} /> : (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          {runs === null ? <div className="py-16 flex justify-center"><Loader2 className="animate-spin text-gray-300" /></div> : runs.length === 0 ? <Empty>No completed checklists yet.</Empty>
            : runs.map(r => (
              <button key={r.id} onClick={() => open(r.id)} className="w-full text-left flex items-center gap-3 px-4 py-3 border-b border-gray-50 last:border-0 hover:bg-gray-50">
                {r.passed ? <CheckCircle2 size={18} className="text-green-600 flex-shrink-0" /> : <XCircle size={18} className="text-red-600 flex-shrink-0" />}
                <div className="min-w-0 flex-1"><div className="font-semibold text-sm text-gray-900">{r.title}</div><div className="text-xs text-gray-500 truncate">{[r.job_address, r.customer_name, r.tech_name].filter(Boolean).join(' · ')}</div></div>
                <div className="text-xs text-gray-400 flex-shrink-0">{fmtDate(r.signed_at || r.created_at)}</div>
              </button>))}
        </div>)}
      {view && (
        <Modal title={view.title} onClose={() => setView(null)} wide footer={<>
          <button onClick={() => remove(view.id)} className="mr-auto text-sm text-red-600 flex items-center gap-1"><Trash2 size={14} /> Delete</button>
          <PrimaryButton onClick={() => printRun(view)}><Printer size={14} /> Print / PDF</PrimaryButton></>}>
          <div className="text-sm text-gray-600">{[view.job_address, view.customer_name && `Customer: ${view.customer_name}`, view.tech_name && `Tech: ${view.tech_name}`].filter(Boolean).join(' · ')}</div>
          <div className={`inline-block text-xs font-bold px-3 py-1 rounded-full text-white ${view.passed ? 'bg-green-600' : 'bg-red-600'}`}>{view.passed ? 'PASSED' : 'FAILED'}</div>
          <div className="divide-y divide-gray-100 text-sm">{(templateById(view.template)?.items || []).map(i => { const a = view.answers?.[i.id]; return (
            <div key={i.id} className="py-1.5 flex justify-between gap-4"><span className="text-gray-700">{i.label}</span><b className={a === 'fail' ? 'text-red-600' : ''}>{i.type === 'check' ? (a === 'pass' ? 'Pass' : a === 'fail' ? 'FAIL' : 'N/A') : (a || '—') + (a && i.unit ? ' ' + i.unit : '')}</b></div>) })}</div>
          {view.notes && <p className="text-sm"><b>Notes:</b> {view.notes}</p>}
          <div className="text-sm"><b>Signed by:</b> {view.signed_by}</div>{view.signature && <img src={view.signature} alt="Signature" className="h-20 border-b border-gray-300" />}
        </Modal>)}
    </div>
  )
}

function NewChecklist({ onSaved }: { onSaved: () => void }) {
  const [tid, setTid] = useState(CHECKLISTS[0].id)
  const t = templateById(tid)!
  const [a, setA] = useState<Record<string, string>>({})
  const [meta, setMeta] = useState({ job_address: '', customer_name: '', tech_name: '', notes: '', signed_by: '' })
  const [sig, setSig] = useState('')
  const [err, setErr] = useState(''), [busy, setBusy] = useState(false)
  const done = t.items.filter(i => i.type !== 'text' && String(a[i.id] ?? '').trim()).length, need = t.items.filter(i => i.type !== 'text').length

  async function save() {
    setErr(''); setBusy(true)
    try {
      const r = await fetch('/api/checklists', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ template: tid, answers: a, ...meta, signature: sig }) })
      const d = await r.json(); if (!r.ok) throw new Error(d.error || 'Could not save')
      setA({}); setSig(''); setMeta({ job_address: '', customer_name: '', tech_name: meta.tech_name, notes: '', signed_by: '' }); onSaved()
    } catch (e: any) { setErr(e.message) }
    setBusy(false)
  }

  return (
    <div className="max-w-3xl space-y-4">
      <div className="grid sm:grid-cols-2 gap-2">
        {CHECKLISTS.map(c => (
          <button key={c.id} onClick={() => { setTid(c.id); setA({}) }} className={`text-left rounded-xl border p-3 ${tid === c.id ? 'border-transparent text-white' : 'bg-white border-gray-200'}`} style={tid === c.id ? { background: BRAND } : undefined}>
            <div className="font-bold text-sm flex items-center gap-2"><ClipboardCheck size={15} /> {c.name}</div><div className={`text-xs mt-0.5 ${tid === c.id ? 'text-white/80' : 'text-gray-500'}`}>{c.description}</div></button>))}
      </div>
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 space-y-3">
        <div className="grid sm:grid-cols-3 gap-3">
          <div className="sm:col-span-3"><label className={lbl}>Job address</label><input className={inp} value={meta.job_address} onChange={e => setMeta({ ...meta, job_address: e.target.value })} /></div>
          <div><label className={lbl}>Customer</label><input className={inp} value={meta.customer_name} onChange={e => setMeta({ ...meta, customer_name: e.target.value })} /></div>
          <div><label className={lbl}>Technician</label><input className={inp} value={meta.tech_name} onChange={e => setMeta({ ...meta, tech_name: e.target.value })} /></div>
        </div>
      </div>
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm divide-y divide-gray-50">
        {t.items.map(i => (
          <div key={i.id} className="px-4 py-3">
            <div className="text-sm text-gray-800 mb-2">{i.label}</div>
            {i.type === 'check' && <div className="flex gap-2">{([['pass', 'Pass', 'bg-green-600'], ['fail', 'Fail', 'bg-red-600'], ['na', 'N/A', 'bg-gray-500']] as const).map(([v, label, bg]) => (
              <button key={v} type="button" onClick={() => setA({ ...a, [i.id]: v })} className={`flex-1 sm:flex-none sm:w-24 py-2 rounded-lg text-sm font-bold border ${a[i.id] === v ? `${bg} text-white border-transparent` : 'bg-white text-gray-600 border-gray-200'}`}>{label}</button>))}</div>}
            {i.type === 'reading' && <div className="flex items-center gap-2"><input inputMode="decimal" className={inp + ' !w-32'} value={a[i.id] || ''} onChange={e => setA({ ...a, [i.id]: e.target.value })} /><span className="text-sm text-gray-500">{i.unit}</span></div>}
            {i.type === 'text' && <textarea rows={2} className={inp} value={a[i.id] || ''} onChange={e => setA({ ...a, [i.id]: e.target.value })} />}
          </div>))}
      </div>
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 space-y-3">
        <div><label className={lbl}>Extra notes</label><textarea rows={2} className={inp} value={meta.notes} onChange={e => setMeta({ ...meta, notes: e.target.value })} /></div>
        <div className="grid sm:grid-cols-2 gap-3 items-start">
          <div><label className={lbl}>Signed by (print name) *</label><input className={inp} value={meta.signed_by} onChange={e => setMeta({ ...meta, signed_by: e.target.value })} /></div>
          <div><label className={lbl}>Signature *</label><SignaturePad onChange={setSig} /></div>
        </div>
        <ErrorNote>{err}</ErrorNote>
        <div className="flex items-center justify-between gap-3"><span className="text-xs text-gray-500">{done} of {need} items answered</span>
          <PrimaryButton onClick={save} disabled={busy || !sig || done < need}>{busy ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle2 size={14} />} Save signed checklist</PrimaryButton></div>
      </div>
    </div>
  )
}
