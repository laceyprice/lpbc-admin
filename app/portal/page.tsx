'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { usePortalAuth } from '@/components/portal/PortalAuthGuard'
import {
  Loader2, LogOut, Hammer, DollarSign, Clock, ListChecks, ClipboardList,
  TrendingUp, AlertTriangle, Image as ImageIcon, MapPin, Sparkles,
} from 'lucide-react'

interface MaterialLine { category: string; estimated_cost: number; notes: string }
interface ProcessStep { step: number; title: string; description: string; estimated_days: number }
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
  assumptions: string[]
  risks: string[]
  photo_observations: string[]
}
interface Project {
  id: string
  title: string
  description: string
  estimate: Estimate | null
  estimate_generated_at: string | null
  status: string
  updated_at: string
  worksite: { id: string; address: string; city: string; state: string } | null
}

const STATUS_LABEL: Record<string, { label: string; color: string }> = {
  draft:            { label: 'Draft',               color: 'bg-gray-100 text-gray-600 border-gray-200' },
  estimated:        { label: 'Estimate Ready',      color: 'bg-blue-50 text-blue-700 border-blue-200' },
  sent_to_customer: { label: 'Awaiting Your Review',color: 'bg-amber-50 text-amber-700 border-amber-200' },
  approved:         { label: 'Approved',            color: 'bg-green-50 text-green-700 border-green-200' },
  scheduled:        { label: 'Scheduled',           color: 'bg-indigo-50 text-indigo-700 border-indigo-200' },
  in_progress:      { label: 'In Progress',         color: 'bg-orange-50 text-orange-700 border-orange-200' },
  completed:        { label: 'Completed',           color: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
}

export default function CustomerPortalPage() {
  const router = useRouter()
  const { email, accessToken } = usePortalAuth()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [projects, setProjects] = useState<Project[]>([])
  const [displayName, setDisplayName] = useState('')
  const [openId, setOpenId] = useState<string | null>(null)

  useEffect(() => {
    if (!accessToken) return
    (async () => {
      try {
        const res = await fetch('/api/my-projects', { headers: { Authorization: `Bearer ${accessToken}` } })
        const d = await res.json()
        if (!res.ok) { setError(d.error || 'Could not load your projects'); setLoading(false); return }
        setProjects(d.projects || [])
        setDisplayName(d.display_name || '')
        if ((d.projects || []).length === 1) setOpenId(d.projects[0].id)
      } catch (e: any) {
        setError(e?.message || 'Could not load your projects')
      }
      setLoading(false)
    })()
  }, [accessToken])

  async function signOut() {
    await supabase.auth.signOut()
    router.replace('/admin/login')
  }

  return (
    <div className="max-w-4xl mx-auto px-4 md:px-8 py-8">
      <div className="flex items-center justify-between mb-8 flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-extrabold text-gray-900">Welcome{displayName ? `, ${displayName}` : ''}</h1>
          <p className="text-gray-500 text-sm mt-0.5">L. Price Building Co. — your project hub</p>
        </div>
        <button onClick={signOut} className="flex items-center gap-1.5 text-xs font-semibold px-3 py-2 rounded-xl border border-gray-200 hover:bg-gray-50 bg-white">
          <LogOut size={13} /> Sign Out
        </button>
      </div>

      {loading && (
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-10 text-center text-gray-400">
          <Loader2 size={28} className="animate-spin mx-auto mb-3" style={{ color: '#b8895a' }} />
          Loading your projects…
        </div>
      )}

      {error && !loading && (
        <div className="bg-red-50 border border-red-100 text-red-700 text-sm px-4 py-3 rounded-xl">{error}</div>
      )}

      {!loading && !error && projects.length === 0 && (
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-10 text-center text-gray-400">
          <Sparkles size={28} className="mx-auto mb-3" style={{ color: '#b8895a' }} />
          Nothing has been shared with you yet. Once your estimator finishes pricing your project, it'll show up here.
        </div>
      )}

      <div className="space-y-4">
        {projects.map(p => {
          const st = STATUS_LABEL[p.status] || STATUS_LABEL.draft
          const isOpen = openId === p.id
          const grandTotal = p.estimate ? p.estimate.estimated_total + p.estimate.design_pm_fee : null
          return (
            <div key={p.id} className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
              <button onClick={() => setOpenId(isOpen ? null : p.id)} className="w-full text-left px-5 py-4 flex items-center justify-between gap-3 hover:bg-gray-50">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h2 className="font-bold text-gray-900 text-base truncate">{p.title}</h2>
                    <span className={`text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-full border ${st.color}`}>{st.label}</span>
                  </div>
                  {p.worksite && (
                    <div className="text-xs text-gray-500 flex items-center gap-1 mt-1">
                      <MapPin size={11} /> {p.worksite.address}{p.worksite.city ? `, ${p.worksite.city}` : ''} {p.worksite.state || ''}
                    </div>
                  )}
                </div>
                {grandTotal != null && (
                  <div className="text-right flex-shrink-0">
                    <div className="text-[10px] uppercase text-gray-400 font-semibold">Estimated Total</div>
                    <div className="text-lg font-extrabold" style={{ color: '#185FA5' }}>${grandTotal.toFixed(2)}</div>
                  </div>
                )}
              </button>

              {isOpen && (
                <div className="border-t border-gray-100 px-5 py-5 space-y-5">
                  <p className="text-sm text-gray-700 whitespace-pre-wrap">{p.description}</p>

                  {p.estimate ? (
                    <>
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                        <PortalStat label="Job Cost" value={`$${p.estimate.estimated_total.toFixed(2)}`} icon={Hammer} />
                        <PortalStat label="Design + PM Fee" value={`$${p.estimate.design_pm_fee.toFixed(2)}`} sub={`${p.estimate.design_pm_fee_percent}% of job`} accent="#b8895a" icon={ClipboardList} />
                        <PortalStat label="Total" value={`$${grandTotal!.toFixed(2)}`} accent="#185FA5" icon={DollarSign} />
                        <PortalStat label="Estimated Duration" value={`${p.estimate.duration_business_days} days`} icon={Clock} />
                      </div>

                      {p.estimate.photo_observations?.length > 0 && (
                        <PortalSection title="What we saw in your photos" icon={ImageIcon}>
                          <ul className="space-y-1.5 text-sm text-gray-700 list-disc list-inside">
                            {p.estimate.photo_observations.map((o, i) => <li key={i}>{o}</li>)}
                          </ul>
                        </PortalSection>
                      )}

                      <PortalSection title="Estimated Costs" icon={ListChecks}>
                        <table className="w-full text-sm">
                          <tbody className="divide-y divide-gray-50">
                            {p.estimate.materials_breakdown.map((m, i) => (
                              <tr key={i}>
                                <td className="py-2 pr-3 font-medium text-gray-800">{m.category}</td>
                                <td className="py-2 pr-3 text-gray-500 text-xs hidden sm:table-cell">{m.notes}</td>
                                <td className="py-2 text-right font-mono font-semibold whitespace-nowrap">${m.estimated_cost.toFixed(2)}</td>
                              </tr>
                            ))}
                            <tr className="font-semibold text-gray-800">
                              <td className="py-2 pr-3" colSpan={2}>Labor ({p.estimate.labor_estimate.hours} hrs)</td>
                              <td className="py-2 text-right font-mono whitespace-nowrap">${p.estimate.labor_estimate.total.toFixed(2)}</td>
                            </tr>
                            {p.estimate.subcontractor_estimate > 0 && (
                              <tr className="font-semibold text-gray-800">
                                <td className="py-2 pr-3" colSpan={2}>Subcontractors</td>
                                <td className="py-2 text-right font-mono whitespace-nowrap">${p.estimate.subcontractor_estimate.toFixed(2)}</td>
                              </tr>
                            )}
                            <tr className="font-bold text-gray-900 border-t-2 border-gray-200">
                              <td className="py-2 pr-3" colSpan={2}>Design + PM Fee</td>
                              <td className="py-2 text-right font-mono whitespace-nowrap">${p.estimate.design_pm_fee.toFixed(2)}</td>
                            </tr>
                            <tr className="font-extrabold text-base" style={{ color: '#185FA5' }}>
                              <td className="py-2 pr-3" colSpan={2}>Total</td>
                              <td className="py-2 text-right font-mono whitespace-nowrap">${grandTotal!.toFixed(2)}</td>
                            </tr>
                          </tbody>
                        </table>
                      </PortalSection>

                      {p.estimate.process_steps?.length > 0 && (
                        <PortalSection title={`Project Plan — ${p.estimate.process_steps.length} steps`} icon={ClipboardList}>
                          <div className="divide-y divide-gray-100">
                            {p.estimate.process_steps.map(s => (
                              <div key={s.step} className="py-3 flex items-start gap-3">
                                <div className="flex-shrink-0 w-6 h-6 rounded-full flex items-center justify-center text-white text-[11px] font-bold" style={{ background: '#b8895a' }}>{s.step}</div>
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
                        </PortalSection>
                      )}

                      {(p.estimate.assumptions?.length > 0 || p.estimate.risks?.length > 0) && (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          {p.estimate.assumptions?.length > 0 && (
                            <PortalSection title="Assumptions" icon={ClipboardList}>
                              <ul className="space-y-1.5 text-sm text-gray-700 list-disc list-inside">
                                {p.estimate.assumptions.map((a, i) => <li key={i}>{a}</li>)}
                              </ul>
                            </PortalSection>
                          )}
                          {p.estimate.risks?.length > 0 && (
                            <PortalSection title="Things to Keep in Mind" icon={AlertTriangle}>
                              <ul className="space-y-1.5 text-sm text-gray-700 list-disc list-inside">
                                {p.estimate.risks.map((r, i) => <li key={i} className="text-amber-900">{r}</li>)}
                              </ul>
                            </PortalSection>
                          )}
                        </div>
                      )}
                    </>
                  ) : (
                    <div className="text-sm text-gray-400 italic">Your estimate is being prepared — check back soon.</div>
                  )}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

function PortalStat({ label, value, sub, accent, icon: Icon }: { label: string; value: string; sub?: string; accent?: string; icon: any }) {
  return (
    <div className="rounded-xl border border-gray-100 bg-gray-50/60 px-3 py-2.5">
      <div className="flex items-center gap-1.5 text-[10px] uppercase font-semibold text-gray-400 tracking-wider"><Icon size={11} /> {label}</div>
      <div className="text-base font-extrabold mt-0.5" style={{ color: accent || '#1f2937' }}>{value}</div>
      {sub && <div className="text-[10px] text-gray-400">{sub}</div>}
    </div>
  )
}

function PortalSection({ title, icon: Icon, children }: { title: string; icon: any; children: React.ReactNode }) {
  return (
    <div>
      <h3 className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-gray-500 mb-2"><Icon size={13} /> {title}</h3>
      {children}
    </div>
  )
}
