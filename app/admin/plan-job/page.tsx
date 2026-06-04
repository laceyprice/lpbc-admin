'use client'
import { useState } from 'react'
import { Sparkles, Loader2, ClipboardList, DollarSign, Clock, AlertTriangle, ListChecks, TrendingUp, History, Hammer } from 'lucide-react'

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
}

export default function PlanJobPage() {
  const [description, setDescription] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [estimate, setEstimate] = useState<Estimate | null>(null)
  const [meta, setMeta] = useState<{ invoices_considered: number; expenses_considered: number; top_vendors: number } | null>(null)

  async function generate() {
    if (description.trim().length < 10) { setError('Add at least a sentence or two describing the job'); return }
    setError(''); setLoading(true); setEstimate(null); setMeta(null)
    try {
      const res = await fetch('/api/estimate-job', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ description }),
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

  const grandTotal = estimate ? estimate.estimated_total + estimate.design_pm_fee : 0
  const confidenceColor = estimate?.confidence === 'high' ? 'text-green-700 bg-green-50 border-green-200'
    : estimate?.confidence === 'medium' ? 'text-amber-700 bg-amber-50 border-amber-200'
    : 'text-red-700 bg-red-50 border-red-200'

  return (
    <div className="p-6 md:p-8 pt-16 md:pt-8 max-w-5xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-extrabold text-gray-900 flex items-center gap-2"><Sparkles size={22} style={{ color: '#b8895a' }} /> Plan a New Job</h1>
        <p className="text-gray-500 text-sm mt-0.5">Describe the job — get a cost estimate, process plan, and PM fee anchored to your real historical data</p>
      </div>

      {/* Input */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5 mb-6">
        <label className="block text-sm font-semibold text-gray-700 mb-2">Job description</label>
        <textarea
          value={description}
          onChange={e => setDescription(e.target.value)}
          rows={5}
          placeholder="e.g. Full master bathroom remodel — tear out existing tub/shower/vanity/tile, reframe shower, install new walk-in shower with custom tile, new vanity with double sinks, new toilet, paint, new lighting. Approximately 12x10 ft."
          className="w-full px-4 py-3 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:border-blue-400"
        />
        <div className="flex items-center justify-between mt-3">
          <div className="text-xs text-gray-400">
            Pulled from your bookkeeping ledger + invoice history. The more detail you give (rooms, finishes, scope), the better the estimate.
          </div>
          <button onClick={generate} disabled={loading || description.trim().length < 10}
            className="flex items-center gap-2 text-sm font-bold px-5 py-2.5 rounded-xl text-white shadow-md disabled:opacity-50"
            style={{ background: '#b8895a' }}>
            {loading ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
            {loading ? 'Analyzing your books…' : 'Generate Estimate'}
          </button>
        </div>
        {error && <div className="mt-3 bg-red-50 border border-red-100 text-red-700 text-sm px-4 py-3 rounded-xl">{error}</div>}
      </div>

      {/* Loading skeleton */}
      {loading && (
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-8 text-center text-gray-400">
          <Loader2 size={28} className="animate-spin mx-auto mb-3" style={{ color: '#b8895a' }} />
          <p className="text-sm">Reading invoice history, accounting entries, and vendor patterns…</p>
          <p className="text-xs mt-1">This usually takes 15–40 seconds.</p>
        </div>
      )}

      {/* Result */}
      {estimate && !loading && (
        <div className="space-y-5">
          {/* Confidence + meta */}
          <div className="flex flex-wrap items-center gap-3">
            <span className={`inline-flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 rounded-full border ${confidenceColor}`}>
              <TrendingUp size={11} /> {estimate.confidence.toUpperCase()} CONFIDENCE
            </span>
            {meta && (
              <span className="text-xs text-gray-500">
                Based on {meta.invoices_considered} invoices · {meta.expenses_considered} expense entries · {meta.top_vendors} vendors
              </span>
            )}
          </div>

          {/* Bottom-line numbers */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <Stat label="Job Cost" value={`$${estimate.estimated_total.toFixed(2)}`} icon={Hammer} />
            <Stat label="Design + PM Fee" value={`$${estimate.design_pm_fee.toFixed(2)}`} sublabel={`${estimate.design_pm_fee_percent}% of job`} accent="#b8895a" icon={ClipboardList} />
            <Stat label="Total to Client" value={`$${grandTotal.toFixed(2)}`} accent="#185FA5" icon={DollarSign} big />
            <Stat label="Duration" value={`${estimate.duration_business_days} days`} icon={Clock} />
          </div>

          {/* Materials breakdown */}
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

          {/* Process steps */}
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

          {/* Design / PM fee rationale */}
          <Section title="Design + PM Fee Rationale" icon={DollarSign}>
            <div className="px-5 py-4">
              <div className="flex items-baseline gap-3 mb-2">
                <span className="text-2xl font-extrabold" style={{ color: '#b8895a' }}>${estimate.design_pm_fee.toFixed(2)}</span>
                <span className="text-sm text-gray-500">({estimate.design_pm_fee_percent}% of job cost)</span>
              </div>
              <p className="text-sm text-gray-700">{estimate.design_pm_fee_rationale}</p>
            </div>
          </Section>

          {/* Similar past jobs */}
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

          {/* Assumptions + Risks */}
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

          {/* Confidence rationale */}
          <div className="text-xs text-gray-500 italic px-1">
            <strong>Why {estimate.confidence} confidence:</strong> {estimate.confidence_rationale}
          </div>
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
