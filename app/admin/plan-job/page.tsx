'use client'
import { useRef, useState } from 'react'
import { Sparkles, Loader2, ClipboardList, DollarSign, Clock, AlertTriangle, ListChecks, TrendingUp, History, Hammer, Upload, X, Image as ImageIcon, Film, FileText, Ruler, Eye } from 'lucide-react'

interface MaterialLine { category: string; estimated_cost: number; notes: string }
interface ProcessStep { step: number; title: string; description: string; estimated_days: number }
interface SimilarJob { service_date: string; amount: number; description: string }
interface Estimate {
  estimated_total: number
  materials_breakdown: MaterialLine[]
  labor_estimate: { hours: number; rate_per_hour: number; total: number }
  subcontractor_estimate: number
  duration_business_days: number
  process_steps: ProcessStep[]
  design_pm_fee: number
  design_pm_fee_percent: number
  design_pm_fee_rationale: string
  confidence: 'low' | 'medium' | 'high'
  confidence_rationale: string
  similar_past_jobs: SimilarJob[]
  assumptions: string[]
  risks: string[]
  photo_observations: string[]
}

interface Attachment {
  path: string
  name: string
  type: string
  size: number
  signed_url: string | null
}

export default function PlanJobPage() {
  const [description, setDescription] = useState('')
  const [measurements, setMeasurements] = useState('')
  const [attachments, setAttachments] = useState<Attachment[]>([])
  const [uploading, setUploading] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [estimate, setEstimate] = useState<Estimate | null>(null)
  const [meta, setMeta] = useState<{ invoices_considered: number; expenses_considered: number; top_vendors: number; images_analyzed: number; other_files: number } | null>(null)
  const [sessionId] = useState(() => `plan_${Date.now()}`)
  const [previewing, setPreviewing] = useState<Attachment | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  async function handleFiles(files: FileList | File[]) {
    const list = Array.from(files)
    if (!list.length) return
    setUploading(true)
    setError('')
    try {
      const fd = new FormData()
      fd.append('session_id', sessionId)
      for (const f of list) fd.append('file', f)
      const res = await fetch('/api/job-planning', { method: 'POST', body: fd })
      const d = await res.json()
      if (!res.ok) { setError(d.error || 'Upload failed'); setUploading(false); return }
      setAttachments(prev => [...prev, ...(d.uploaded || [])])
    } catch (e: any) {
      setError(e?.message || 'Upload failed')
    }
    setUploading(false)
    if (fileRef.current) fileRef.current.value = ''
  }

  async function removeAttachment(att: Attachment) {
    await fetch(`/api/job-planning?path=${encodeURIComponent(att.path)}`, { method: 'DELETE' })
    setAttachments(prev => prev.filter(a => a.path !== att.path))
  }

  async function generate() {
    if (description.trim().length < 10) { setError('Add at least a sentence or two describing the job'); return }
    setError(''); setLoading(true); setEstimate(null); setMeta(null)
    try {
      const res = await fetch('/api/estimate-job', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          description,
          measurements,
          attachments: attachments.map(a => ({ path: a.path, name: a.name, type: a.type, size: a.size })),
        }),
      })
      const d = await res.json()
      if (!res.ok) { setError(d.error || 'Estimate failed'); setLoading(false); return }
      setEstimate(d.estimate)
      setMeta(d.historical_data_used)
    } catch (e: any) {
      setError(e?.message || 'Estimate failed')
    }
    setLoading(false)
  }

  function onDrop(e: React.DragEvent) {
    e.preventDefault()
    if (e.dataTransfer.files?.length) handleFiles(e.dataTransfer.files)
  }

  const grandTotal = estimate ? estimate.estimated_total + estimate.design_pm_fee : 0
  const confidenceColor = estimate?.confidence === 'high' ? 'text-green-700 bg-green-50 border-green-200'
    : estimate?.confidence === 'medium' ? 'text-amber-700 bg-amber-50 border-amber-200'
    : 'text-red-700 bg-red-50 border-red-200'

  const isImage = (t: string) => t.startsWith('image/')
  const isVideo = (t: string) => t.startsWith('video/')

  return (
    <div className="p-6 md:p-8 pt-16 md:pt-8 max-w-5xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-extrabold text-gray-900 flex items-center gap-2"><Sparkles size={22} style={{ color: '#b8895a' }} /> Plan a New Job</h1>
        <p className="text-gray-500 text-sm mt-0.5">Describe the job, upload photos/measurements — get a cost estimate, process plan, and PM fee anchored to your real historical data</p>
      </div>

      {/* Input panel */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5 mb-6 space-y-4">
        <div>
          <label className="block text-sm font-semibold text-gray-700 mb-2">Job description</label>
          <textarea
            value={description}
            onChange={e => setDescription(e.target.value)}
            rows={4}
            placeholder="e.g. Full master bathroom remodel — tear out existing tub/shower/vanity/tile, walk-in shower with custom tile, double vanity, new toilet, paint, lighting. Approx 12x10 ft."
            className="w-full px-4 py-3 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:border-blue-400"
          />
        </div>

        {/* Measurements */}
        <div>
          <label className="block text-sm font-semibold text-gray-700 mb-2 flex items-center gap-1.5"><Ruler size={13} /> Measurements & scope notes (optional)</label>
          <textarea
            value={measurements}
            onChange={e => setMeasurements(e.target.value)}
            rows={3}
            placeholder={`Room: 12'×10'×8' ceiling
Shower wall: 6'×4'
Window: 36"×48"
Existing flooring: porcelain tile, mud-set
Plumbing: PEX, accessible from attic`}
            className="w-full px-4 py-3 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:border-blue-400 font-mono"
          />
        </div>

        {/* Upload zone */}
        <div>
          <label className="block text-sm font-semibold text-gray-700 mb-2 flex items-center gap-1.5"><Upload size={13} /> Photos, videos & documents</label>
          <div
            onDragOver={e => e.preventDefault()}
            onDrop={onDrop}
            onClick={() => fileRef.current?.click()}
            className="border-2 border-dashed border-gray-200 rounded-xl p-6 text-center cursor-pointer hover:border-blue-300 hover:bg-blue-50/30 transition-colors"
          >
            <Upload size={20} className="mx-auto text-gray-400 mb-1" />
            <div className="text-sm font-semibold text-gray-600">Click or drag files here</div>
            <div className="text-[11px] text-gray-400 mt-0.5">Photos analyzed by AI · videos & docs referenced by name</div>
            <input ref={fileRef} type="file" multiple accept="image/*,video/*,application/pdf" className="hidden"
              onChange={e => e.target.files && handleFiles(e.target.files)} />
          </div>

          {uploading && (
            <div className="mt-2 text-xs text-blue-600 flex items-center gap-1"><Loader2 size={11} className="animate-spin" /> Uploading…</div>
          )}

          {attachments.length > 0 && (
            <div className="mt-3 grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
              {attachments.map(att => (
                <div key={att.path} className="relative group border border-gray-200 rounded-xl overflow-hidden bg-gray-50">
                  {isImage(att.type) && att.signed_url ? (
                    <img src={att.signed_url} alt={att.name} className="w-full h-24 object-cover cursor-pointer" onClick={() => setPreviewing(att)} />
                  ) : isVideo(att.type) ? (
                    <div className="w-full h-24 flex flex-col items-center justify-center text-gray-500 text-xs">
                      <Film size={20} />
                      <span className="mt-1 truncate max-w-[90%] text-[10px]">{att.name}</span>
                    </div>
                  ) : (
                    <div className="w-full h-24 flex flex-col items-center justify-center text-gray-500 text-xs">
                      <FileText size={20} />
                      <span className="mt-1 truncate max-w-[90%] text-[10px]">{att.name}</span>
                    </div>
                  )}
                  <button onClick={(e) => { e.stopPropagation(); removeAttachment(att) }}
                    className="absolute top-1 right-1 bg-white/90 hover:bg-red-100 rounded-full p-1 shadow opacity-0 group-hover:opacity-100 transition-opacity">
                    <X size={11} className="text-red-600" />
                  </button>
                  <div className="px-2 py-1 text-[10px] text-gray-500 truncate" title={att.name}>{att.name}</div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="flex items-center justify-between pt-1">
          <div className="text-xs text-gray-400">
            The more context (description + measurements + photos), the better the estimate.
          </div>
          <button onClick={generate} disabled={loading || description.trim().length < 10}
            className="flex items-center gap-2 text-sm font-bold px-5 py-2.5 rounded-xl text-white shadow-md disabled:opacity-50"
            style={{ background: '#b8895a' }}>
            {loading ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
            {loading ? 'Analyzing your books + photos…' : 'Generate Estimate'}
          </button>
        </div>
        {error && <div className="bg-red-50 border border-red-100 text-red-700 text-sm px-4 py-3 rounded-xl">{error}</div>}
      </div>

      {/* Loading skeleton */}
      {loading && (
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-8 text-center text-gray-400">
          <Loader2 size={28} className="animate-spin mx-auto mb-3" style={{ color: '#b8895a' }} />
          <p className="text-sm">Reading invoice history, examining photos, analyzing scope…</p>
          <p className="text-xs mt-1">This usually takes 20–60 seconds (longer with many photos).</p>
        </div>
      )}

      {/* Result */}
      {estimate && !loading && (
        <div className="space-y-5">
          <div className="flex flex-wrap items-center gap-3">
            <span className={`inline-flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 rounded-full border ${confidenceColor}`}>
              <TrendingUp size={11} /> {estimate.confidence.toUpperCase()} CONFIDENCE
            </span>
            {meta && (
              <span className="text-xs text-gray-500">
                {meta.invoices_considered} invoices · {meta.expenses_considered} expenses · {meta.images_analyzed > 0 && `${meta.images_analyzed} photos analyzed · `}{meta.other_files > 0 && `${meta.other_files} other files · `}{meta.top_vendors} vendors
              </span>
            )}
          </div>

          {/* Photo observations */}
          {estimate.photo_observations && estimate.photo_observations.length > 0 && (
            <Section title="What the photos revealed" icon={ImageIcon}>
              <ul className="px-5 py-3 space-y-1.5 text-sm text-gray-700 list-disc list-inside">
                {estimate.photo_observations.map((o, i) => <li key={i}>{o}</li>)}
              </ul>
            </Section>
          )}

          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <Stat label="Job Cost" value={`$${estimate.estimated_total.toFixed(2)}`} icon={Hammer} />
            <Stat label="Design + PM Fee" value={`$${estimate.design_pm_fee.toFixed(2)}`} sublabel={`${estimate.design_pm_fee_percent}% of job`} accent="#b8895a" icon={ClipboardList} />
            <Stat label="Total to Client" value={`$${grandTotal.toFixed(2)}`} accent="#185FA5" icon={DollarSign} big />
            <Stat label="Duration" value={`${estimate.duration_business_days} days`} icon={Clock} />
          </div>

          <Section title="Materials Breakdown" icon={ListChecks}>
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-100">
                <tr>
                  <th className="text-left px-4 py-2.5 text-[11px] font-semibold text-gray-600 uppercase tracking-wider">Category</th>
                  <th className="text-left px-4 py-2.5 text-[11px] font-semibold text-gray-600 uppercase tracking-wider">Notes</th>
                  <th className="text-right px-4 py-2.5 text-[11px] font-semibold text-gray-600 uppercase tracking-wider">Estimated</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {estimate.materials_breakdown.map((m, i) => (
                  <tr key={i}>
                    <td className="px-4 py-2.5 font-medium text-gray-800 text-sm">{m.category}</td>
                    <td className="px-4 py-2.5 text-gray-600 text-xs">{m.notes}</td>
                    <td className="px-4 py-2.5 text-right font-mono text-sm font-semibold">${m.estimated_cost.toFixed(2)}</td>
                  </tr>
                ))}
                <tr className="bg-gray-50 font-bold">
                  <td colSpan={2} className="px-4 py-2.5 text-sm">Labor — {estimate.labor_estimate.hours} hrs × ${estimate.labor_estimate.rate_per_hour}/hr</td>
                  <td className="px-4 py-2.5 text-right font-mono">${estimate.labor_estimate.total.toFixed(2)}</td>
                </tr>
                {estimate.subcontractor_estimate > 0 && (
                  <tr className="bg-gray-50 font-bold">
                    <td colSpan={2} className="px-4 py-2.5 text-sm">Subcontractors</td>
                    <td className="px-4 py-2.5 text-right font-mono">${estimate.subcontractor_estimate.toFixed(2)}</td>
                  </tr>
                )}
              </tbody>
            </table>
          </Section>

          <Section title={`Process — ${estimate.process_steps.length} steps`} icon={ClipboardList}>
            <div className="divide-y divide-gray-100">
              {estimate.process_steps.map(s => (
                <div key={s.step} className="px-5 py-3 flex items-start gap-3">
                  <div className="flex-shrink-0 w-7 h-7 rounded-full flex items-center justify-center text-white text-xs font-bold" style={{ background: '#b8895a' }}>{s.step}</div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-baseline justify-between gap-3">
                      <h3 className="font-semibold text-gray-900 text-sm">{s.title}</h3>
                      <span className="text-[11px] text-gray-500 whitespace-nowrap">{s.estimated_days} day{s.estimated_days !== 1 ? 's' : ''}</span>
                    </div>
                    <p className="text-xs text-gray-600 mt-0.5">{s.description}</p>
                  </div>
                </div>
              ))}
            </div>
          </Section>

          <Section title="Design + PM Fee Rationale" icon={DollarSign}>
            <div className="px-5 py-4">
              <div className="flex items-baseline gap-3 mb-2">
                <span className="text-2xl font-extrabold" style={{ color: '#b8895a' }}>${estimate.design_pm_fee.toFixed(2)}</span>
                <span className="text-sm text-gray-500">({estimate.design_pm_fee_percent}% of job cost)</span>
              </div>
              <p className="text-sm text-gray-700">{estimate.design_pm_fee_rationale}</p>
            </div>
          </Section>

          {estimate.similar_past_jobs.length > 0 && (
            <Section title="Anchored to These Past Jobs" icon={History}>
              <div className="divide-y divide-gray-100">
                {estimate.similar_past_jobs.map((j, i) => (
                  <div key={i} className="px-5 py-3 flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="text-xs text-gray-500">{j.service_date}</div>
                      <div className="text-sm text-gray-800">{j.description}</div>
                    </div>
                    <div className="font-mono font-semibold text-sm text-gray-900 whitespace-nowrap">${j.amount.toFixed(2)}</div>
                  </div>
                ))}
              </div>
            </Section>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <Section title="Assumptions" icon={ClipboardList}>
              <ul className="px-5 py-3 space-y-1.5 text-sm text-gray-700 list-disc list-inside">
                {estimate.assumptions.map((a, i) => <li key={i}>{a}</li>)}
              </ul>
            </Section>
            <Section title="Risks" icon={AlertTriangle}>
              <ul className="px-5 py-3 space-y-1.5 text-sm text-gray-700 list-disc list-inside">
                {estimate.risks.map((r, i) => <li key={i} className="text-amber-900">{r}</li>)}
              </ul>
            </Section>
          </div>

          <div className="text-xs text-gray-500 italic px-1">
            <strong>Why {estimate.confidence} confidence:</strong> {estimate.confidence_rationale}
          </div>
        </div>
      )}

      {/* Image preview */}
      {previewing && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4" onClick={() => setPreviewing(null)}>
          <button className="absolute top-4 right-4 text-white bg-white/10 hover:bg-white/20 rounded-full p-2"><X size={20} /></button>
          <img src={previewing.signed_url || ''} alt={previewing.name} className="max-w-full max-h-full rounded-2xl shadow-2xl" />
        </div>
      )}
    </div>
  )
}

function Stat({ label, value, sublabel, accent, icon: Icon, big }: { label: string; value: string; sublabel?: string; accent?: string; icon: any; big?: boolean }) {
  return (
    <div className={`bg-white rounded-2xl shadow-sm border border-gray-100 p-4 ${big ? 'ring-2 ring-blue-100' : ''}`}>
      <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider font-bold text-gray-500">
        <Icon size={11} />{label}
      </div>
      <div className={`${big ? 'text-3xl' : 'text-2xl'} font-extrabold mt-1`} style={{ color: accent || '#111827' }}>{value}</div>
      {sublabel && <div className="text-xs text-gray-400 mt-0.5">{sublabel}</div>}
    </div>
  )
}

function Section({ title, icon: Icon, children }: { title: string; icon: any; children: React.ReactNode }) {
  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
      <div className="px-5 py-3 border-b border-gray-100 flex items-center gap-2">
        <Icon size={14} style={{ color: '#b8895a' }} />
        <h2 className="font-bold text-gray-900 text-sm">{title}</h2>
      </div>
      {children}
    </div>
  )
}
