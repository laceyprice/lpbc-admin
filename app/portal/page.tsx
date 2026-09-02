'use client'
import { useEffect, useState } from 'react'
import dynamic from 'next/dynamic'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { usePortalAuth } from '@/components/portal/PortalAuthGuard'

// Heavy 3D viewer — load only when the customer opens it.
const FloorPlan3D = dynamic(() => import('@/components/admin/FloorPlan3D'), { ssr: false })
import {
  Loader2, LogOut, Hammer, DollarSign, Clock, ListChecks, ClipboardList,
  TrendingUp, AlertTriangle, Image as ImageIcon, MapPin, Sparkles,
  ShoppingBag, Plus, Trash2, ExternalLink, Save, Check, Palette, Box, Pencil,
  Calendar as CalendarIcon, ChevronLeft, ChevronRight, Folder, Download, FileText,
} from 'lucide-react'

interface FinishLinkItem { id: string; category: string; label: string; url: string; price: number; room: string; notes: string; image_path?: string | null; image_url?: string | null }
interface MessageItem { id: string; role: 'admin' | 'customer'; name: string; body: string; created_at: string }
const FINISH_CATEGORIES = ['Vanity', 'Faucet', 'Sink', 'Toilet', 'Tub / Shower', 'Tile', 'Countertop', 'Cabinet', 'Lighting', 'Ceiling Fan', 'Appliance', 'Hardware', 'Mirror', 'Flooring', 'Paint', 'Plumbing Fixture', 'Door / Window', 'Other']

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
  finish_links?: FinishLinkItem[]
  messages?: MessageItem[]
  board?: { id: string; label: string; room: string; notes: string; price: number; link: string | null; signed_url: string | null }[]
  comparisons?: { id: string; note: string; before_signed_url: string | null; after_signed_url: string | null }[]
  ai_suggestions?: { id: string; style_name: string; description: string; key_materials?: string[]; color_palette?: string[]; why_it_fits?: string }[]
  sketches?: { id: string; name: string; signed_url: string | null }[]
  floorplan?: any
  floorplans?: { id: string; name: string; doc: any }[]
  attachments?: { name: string; type: string; size: number; url: string | null }[]
  tasks?: PortalTask[]
  drive_folder_id?: string | null
  drive_folder_name?: string | null
}
interface PortalTask { id: string; title: string; description?: string; task_type: string; status: string; assigned_to?: string; start_date: string | null; end_date: string | null; color: string; project?: string }

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
          const hasDesign = !!((p.board?.length) || (p.comparisons || []).some(c => c.before_signed_url || c.after_signed_url) || (p.ai_suggestions?.length) || (p.sketches?.length) || (p.floorplan && Array.isArray(p.floorplan.walls) && p.floorplan.walls.length > 0))
          const projTasks = p.tasks || []
          const files = p.attachments || []
          const tabs = [
            { anchor: `sec-overview-${p.id}`, label: 'Overview', icon: ClipboardList },
            ...(projTasks.length ? [{ anchor: `sec-schedule-${p.id}`, label: 'Schedule', icon: CalendarIcon }] : []),
            ...(files.length || p.drive_folder_id ? [{ anchor: `sec-drive-${p.id}`, label: 'Drive', icon: Folder }] : []),
            { anchor: `sec-finishes-${p.id}`, label: 'Finishes', icon: ShoppingBag },
            ...(p.estimate ? [{ anchor: `sec-estimate-${p.id}`, label: 'Estimate', icon: DollarSign }] : []),
            { anchor: `sec-messages-${p.id}`, label: 'Messages', icon: ListChecks },
            ...(hasDesign ? [{ anchor: `sec-design-${p.id}`, label: 'Design Studio', icon: Palette }] : []),
          ]
          return (
            <div key={p.id} className="bg-white rounded-2xl shadow-sm border border-gray-100">
              <button onClick={() => setOpenId(isOpen ? null : p.id)} className="w-full text-left px-5 py-4 flex items-center justify-between gap-3 hover:bg-gray-50 rounded-t-2xl">
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
                  {/* Section nav — sticky as you scroll the project */}
                  <div className="sticky top-0 z-10 -mx-5 -mt-5 mb-1 px-5 py-2 bg-white/95 backdrop-blur border-b border-gray-100 flex gap-1 overflow-x-auto">
                    {tabs.map(t => (
                      <button key={t.anchor} onClick={() => document.getElementById(t.anchor)?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
                        className="flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg text-gray-600 hover:bg-gray-100 whitespace-nowrap">
                        <t.icon size={13} /> {t.label}
                      </button>
                    ))}
                  </div>

                  <div id={`sec-overview-${p.id}`} className="scroll-mt-16">
                    <h3 className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-gray-500 mb-2"><ClipboardList size={13} /> Overview</h3>
                    <p className="text-sm text-gray-700 whitespace-pre-wrap">{p.description}</p>
                    {p.estimate && (
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-4">
                        <PortalStat label="Job Cost" value={`$${p.estimate.estimated_total.toFixed(2)}`} icon={Hammer} />
                        <PortalStat label="Design + PM Fee" value={`$${p.estimate.design_pm_fee.toFixed(2)}`} sub={`${p.estimate.design_pm_fee_percent}% of job`} accent="#b8895a" icon={ClipboardList} />
                        <PortalStat label="Total" value={`$${grandTotal!.toFixed(2)}`} accent="#185FA5" icon={DollarSign} />
                        <PortalStat label="Estimated Duration" value={`${p.estimate.duration_business_days} days`} icon={Clock} />
                      </div>
                    )}
                  </div>

                  {projTasks.length > 0 && (
                    <div id={`sec-schedule-${p.id}`} className="scroll-mt-16 border-t border-gray-100 pt-4">
                      <ProjectScheduleSection tasks={projTasks} />
                    </div>
                  )}

                  {(files.length > 0 || p.drive_folder_id) && (
                    <div id={`sec-drive-${p.id}`} className="scroll-mt-16 border-t border-gray-100 pt-4">
                      <ProjectDriveSection files={files} folderId={p.drive_folder_id || null} folderName={p.drive_folder_name || null} />
                    </div>
                  )}

                  <div id={`sec-finishes-${p.id}`} className="scroll-mt-16 border-t border-gray-100 pt-4">
                    <FinishLinksEditor project={p} accessToken={accessToken}
                      onSaved={links => setProjects(prev => prev.map(x => x.id === p.id ? { ...x, finish_links: links } : x))} />
                  </div>

                  {p.estimate ? (
                    <div id={`sec-estimate-${p.id}`} className="scroll-mt-16 border-t border-gray-100 pt-4">
                      <ProjectEstimate estimate={p.estimate} grandTotal={grandTotal!} />
                    </div>
                  ) : (
                    <div className="text-sm text-gray-400 italic border-t border-gray-100 pt-4">Your estimate is being prepared — check back soon.</div>
                  )}

                  <div id={`sec-messages-${p.id}`} className="scroll-mt-16 border-t border-gray-100 pt-4">
                    <ProjectMessages project={p} accessToken={accessToken}
                      onPosted={msgs => setProjects(prev => prev.map(x => x.id === p.id ? { ...x, messages: msgs } : x))} />
                  </div>

                  {hasDesign && (
                    <div id={`sec-design-${p.id}`} className="scroll-mt-16 border-t border-gray-100 pt-4">
                      <ProjectDesign project={p} />
                    </div>
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

// Read-only view of the project's Design Studio: mood board, before/after,
// design directions, and the 3D model.
function ProjectDesign({ project }: { project: Project }) {
  const board = project.board || []
  const comparisons = (project.comparisons || []).filter(c => c.before_signed_url || c.after_signed_url)
  const ai = project.ai_suggestions || []
  const sketches = (project.sketches || []).filter(s => s.signed_url)
  const fp = project.floorplan
  // All floor-plan drafts, each viewable in 3D. Fall back to the single legacy plan.
  const plans = (project.floorplans && project.floorplans.length)
    ? project.floorplans
    : (fp && Array.isArray(fp.walls) && fp.walls.length > 0 ? [{ id: 'default', name: 'Floor Plan', doc: fp }] : [])
  const [active3D, setActive3D] = useState<{ id: string; name: string; doc: any } | null>(null)
  if (!board.length && !comparisons.length && !ai.length && !sketches.length && !plans.length) return null

  return (
    <div className="space-y-5">
      <h3 className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-gray-500"><Palette size={13} /> Design Studio</h3>

      {plans.length > 0 && (
        <div>
          <div className="text-[11px] font-semibold text-gray-500 mb-2">3D Models{plans.length > 1 ? ` (${plans.length})` : ''}</div>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {plans.map(pl => (
              <button key={pl.id} onClick={() => setActive3D(pl)}
                className="flex items-center gap-2 text-sm font-bold text-white px-3 py-2.5 rounded-xl shadow-sm hover:opacity-90" style={{ background: '#185FA5' }}>
                <Box size={15} className="flex-shrink-0" /> <span className="truncate">{pl.name}</span>
              </button>
            ))}
          </div>
          {active3D && (
            <FloorPlan3D plan={active3D.doc} wallThick={active3D.doc?.wallThick ?? 0.5}
              finishes={active3D.doc?.finishes || { pick: { floor: 0, walls: 0, cabinet: 0, counter: 0 }, schemes: [] }}
              onFinishesChange={() => {}} onClose={() => setActive3D(null)} readOnly />
          )}
        </div>
      )}

      {sketches.length > 0 && (
        <div>
          <div className="text-[11px] font-semibold text-gray-500 mb-2">Floor Plans</div>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {sketches.map(s => (
              <a key={s.id} href={s.signed_url || '#'} target="_blank" rel="noopener noreferrer" className="border border-gray-200 rounded-xl overflow-hidden bg-white block hover:shadow-sm">
                <img src={s.signed_url!} alt={s.name} className="w-full h-32 object-cover" />
                <div className="p-2 text-xs font-semibold text-gray-700 truncate">{s.name}</div>
              </a>
            ))}
          </div>
        </div>
      )}

      {board.length > 0 && (
        <div>
          <div className="text-[11px] font-semibold text-gray-500 mb-2">Mood Board</div>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {board.map(b => (
              <div key={b.id} className="border border-gray-200 rounded-xl overflow-hidden bg-white">
                {b.signed_url ? <img src={b.signed_url} alt={b.label} className="w-full h-28 object-cover" /> : <div className="w-full h-28 bg-gray-50 flex items-center justify-center text-gray-300"><Palette size={20} /></div>}
                <div className="p-2">
                  <div className="text-xs font-semibold text-gray-800 truncate">{b.label || '—'}</div>
                  {b.price > 0 && <div className="text-[11px] text-gray-500">${b.price.toFixed(2)}</div>}
                  {b.notes && <div className="text-[11px] text-gray-400 line-clamp-2">{b.notes}</div>}
                  {b.link && <a href={b.link} target="_blank" rel="noopener noreferrer" className="text-[11px] font-semibold text-blue-600 hover:text-blue-800 flex items-center gap-1"><ExternalLink size={10} /> View source</a>}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {comparisons.length > 0 && (
        <div>
          <div className="text-[11px] font-semibold text-gray-500 mb-2">Before / After</div>
          <div className="space-y-3">
            {comparisons.map(c => (
              <div key={c.id} className="border border-gray-200 rounded-xl p-3">
                <div className="grid grid-cols-2 gap-2">
                  <div><div className="text-[10px] uppercase tracking-wide text-gray-400 mb-1">Before</div>{c.before_signed_url ? <img src={c.before_signed_url} alt="Before" className="w-full h-32 object-cover rounded-lg" /> : <div className="h-32 bg-gray-50 rounded-lg" />}</div>
                  <div><div className="text-[10px] uppercase tracking-wide text-gray-400 mb-1">After</div>{c.after_signed_url ? <img src={c.after_signed_url} alt="After" className="w-full h-32 object-cover rounded-lg" /> : <div className="h-32 bg-gray-50 rounded-lg" />}</div>
                </div>
                {c.note && <p className="text-xs text-gray-600 mt-2">{c.note}</p>}
              </div>
            ))}
          </div>
        </div>
      )}

      {ai.length > 0 && (
        <div>
          <div className="text-[11px] font-semibold text-gray-500 mb-2">Design Directions</div>
          <div className="space-y-2">
            {ai.map(s => (
              <div key={s.id} className="border border-gray-200 rounded-xl p-3">
                <div className="font-bold text-sm text-gray-900">{s.style_name}</div>
                {s.description && <p className="text-xs text-gray-600 mt-1">{s.description}</p>}
                {Array.isArray(s.key_materials) && s.key_materials.length > 0 && (
                  <ul className="text-[11px] text-gray-500 list-disc list-inside mt-1.5">{s.key_materials.slice(0, 5).map((m, i) => <li key={i}>{m}</li>)}</ul>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

// Customer-editable finish/product links for a project (the only writable part
// of the portal). Saves back to the project via PATCH /api/my-projects.
function FinishLinksEditor({ project, accessToken, onSaved }: { project: Project; accessToken: string | null; onSaved: (links: FinishLinkItem[]) => void }) {
  const [links, setLinks] = useState<FinishLinkItem[]>(project.finish_links || [])
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [pulling, setPulling] = useState<string | null>(null)
  const [editUrlId, setEditUrlId] = useState<string | null>(null)
  const dirty = JSON.stringify(links) !== JSON.stringify(project.finish_links || [])

  const add = () => { const id = `fin_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`; setLinks(l => [...l, { id, category: 'Appliance', label: '', url: '', price: 0, room: 'Kitchen', notes: '' }]); setEditUrlId(id) }
  const update = (i: number, p: Partial<FinishLinkItem>) => setLinks(l => l.map((it, idx) => idx === i ? { ...it, ...p } : it))
  const remove = (i: number) => setLinks(l => l.filter((_, idx) => idx !== i))
  const linkHref = (u: string) => /^https?:\/\//i.test(u) ? u : `https://${u}`
  async function pullImage(i: number, silent = false) {
    const it = links[i]; const u = (it?.url || '').trim(); if (!u) return
    setPulling(it.id)
    try {
      const res = await fetch('/api/link-preview', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ url: u }) })
      const d = await res.json()
      if (res.ok && d.uploaded) update(i, { image_path: d.uploaded.path, image_url: d.uploaded.signed_url, label: it.label || (d.title || '').slice(0, 80) })
      else if (!silent) alert(d?.error || 'Could not pull an image from that link.')
    } catch { if (!silent) alert('Could not pull an image from that link.') }
    setPulling(null)
  }

  async function save() {
    if (!accessToken) return
    setSaving(true); setSaved(false)
    try {
      const res = await fetch('/api/my-projects', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
        body: JSON.stringify({ projectId: project.id, finish_links: links }),
      })
      const d = await res.json()
      if (res.ok) { onSaved(d.finish_links || links); setSaved(true); setTimeout(() => setSaved(false), 2500) }
      else alert(d.error || 'Could not save your links.')
    } catch { alert('Could not save your links.') }
    setSaving(false)
  }

  return (
    <div className="border-t border-gray-100 pt-4">
      <div className="flex items-center justify-between mb-2">
        <h3 className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-gray-500"><ShoppingBag size={13} /> Finishes & Links</h3>
        <button onClick={add} className="flex items-center gap-1 text-xs font-semibold px-2.5 py-1.5 rounded-lg border border-gray-200 hover:bg-gray-50"><Plus size={12} /> Add link</button>
      </div>
      <p className="text-[11px] text-gray-400 mb-3">Add links to products you'd like — vanities, faucets, lights, fans, appliances. Your contractor will see them.</p>

      {links.length === 0 ? (
        <div className="text-center py-6 text-gray-400 text-xs border-2 border-dashed border-gray-200 rounded-xl">No links yet — click <strong>Add link</strong> to share a product.</div>
      ) : (
        <div className="space-y-2.5">
          {links.map((it, i) => (
            <div key={it.id} className="border border-gray-200 rounded-xl p-3">
              <div className="flex gap-2.5">
                {it.image_url ? <img src={it.image_url} alt={it.label} className="w-12 h-12 rounded-lg object-cover border border-gray-200 flex-shrink-0" /> : <div className="w-12 h-12 rounded-lg bg-gray-100 flex items-center justify-center text-gray-300 flex-shrink-0"><ShoppingBag size={14} /></div>}
                <div className="flex-1 min-w-0 space-y-2">
                  <div className="flex items-center gap-2">
                    <select value={it.category} onChange={e => update(i, { category: e.target.value })} className="px-2 py-1.5 rounded-lg border border-gray-200 text-xs bg-white focus:outline-none">
                      {FINISH_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                    </select>
                    <input value={it.label} onChange={e => update(i, { label: e.target.value })} placeholder="Label (e.g. Master vanity)" className="flex-1 min-w-0 px-2.5 py-1.5 rounded-lg border border-gray-200 text-sm font-semibold focus:outline-none focus:ring-2 focus:border-blue-400" />
                    <button onClick={() => remove(i)} className="text-gray-300 hover:text-red-500 p-1 flex-shrink-0"><Trash2 size={14} /></button>
                  </div>
                  <div className="flex items-center gap-2">
                    {(!it.url || editUrlId === it.id) ? (
                      <input autoFocus={editUrlId === it.id} value={it.url} onChange={e => update(i, { url: e.target.value })}
                        onBlur={() => { setEditUrlId(null); if (it.url?.trim() && !it.image_path) pullImage(i, true) }}
                        placeholder="https://…  (product link)" className="flex-1 min-w-0 px-2.5 py-1.5 rounded-lg border border-gray-200 text-xs focus:outline-none focus:ring-2 focus:border-blue-400" />
                    ) : (
                      <a href={linkHref(it.url)} target="_blank" rel="noopener noreferrer" className="flex-1 min-w-0 truncate text-xs font-medium text-blue-600 hover:text-blue-800 underline">{it.url}</a>
                    )}
                    {it.url && editUrlId !== it.id && (
                      <button onClick={() => setEditUrlId(it.id)} title="Edit link" className="text-gray-400 hover:text-gray-700 p-1 flex-shrink-0"><Pencil size={13} /></button>
                    )}
                    <button onClick={() => pullImage(i)} disabled={!it.url?.trim() || pulling === it.id} title="Pull the product image from this link" className="flex items-center gap-1 text-xs font-semibold px-2.5 py-1.5 rounded-lg border border-blue-200 bg-blue-50 text-blue-700 hover:bg-blue-100 disabled:opacity-40 flex-shrink-0">{pulling === it.id ? <Loader2 size={13} className="animate-spin" /> : <ImageIcon size={13} />}</button>
                  </div>
                  <input value={it.notes} onChange={e => update(i, { notes: e.target.value })} placeholder="Notes (model #, color, qty…)" className="w-full px-2.5 py-1.5 rounded-lg border border-gray-200 text-xs focus:outline-none focus:ring-2 focus:border-blue-400" />
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {(dirty || saved) && (
        <div className="mt-3 flex items-center justify-end gap-2">
          {saved && <span className="text-xs text-green-600 font-semibold flex items-center gap-1"><Check size={13} /> Saved</span>}
          <button onClick={save} disabled={saving || !dirty} className="flex items-center gap-1.5 text-xs font-bold text-white px-4 py-2 rounded-xl shadow-sm disabled:opacity-50" style={{ background: '#b8895a' }}>
            {saving ? <Loader2 size={13} className="animate-spin" /> : <Save size={13} />} Save links
          </button>
        </div>
      )}
    </div>
  )
}

// Two-way message thread with the builder. Each post emails the builder, and
// their replies email back — the conversation lives on the project.
function ProjectMessages({ project, accessToken, onPosted }: { project: Project; accessToken: string | null; onPosted: (msgs: MessageItem[]) => void }) {
  const [text, setText] = useState('')
  const [sending, setSending] = useState(false)
  const messages = project.messages || []

  async function send() {
    const body = text.trim()
    if (!body || !accessToken) return
    setSending(true)
    try {
      const res = await fetch('/api/project-messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
        body: JSON.stringify({ projectId: project.id, body }),
      })
      const d = await res.json()
      if (res.ok) { onPosted(d.messages || []); setText('') }
      else alert(d.error || 'Could not send your message.')
    } catch { alert('Could not send your message.') }
    setSending(false)
  }

  return (
    <div className="border-t border-gray-100 pt-4">
      <h3 className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-gray-500 mb-2"><ListChecks size={13} /> Messages</h3>
      {messages.length > 0 && (
        <div className="space-y-2.5 mb-3 max-h-80 overflow-y-auto pr-1">
          {messages.map(m => {
            const mine = m.role === 'customer'
            return (
              <div key={m.id} className={`flex ${mine ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[78%] rounded-2xl px-3.5 py-2 ${mine ? 'text-white' : 'bg-gray-100 text-gray-800'}`} style={mine ? { background: '#185FA5' } : {}}>
                  <div className={`text-[10px] font-semibold mb-0.5 ${mine ? 'text-white/80' : 'text-gray-500'}`}>{mine ? 'You' : (m.name || 'L. Price Building Co.')} · {new Date(m.created_at).toLocaleDateString()} {new Date(m.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</div>
                  <div className="text-sm whitespace-pre-wrap break-words">{m.body}</div>
                </div>
              </div>
            )
          })}
        </div>
      )}
      <div className="flex items-end gap-2">
        <textarea value={text} onChange={e => setText(e.target.value)} rows={2}
          onKeyDown={e => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); send() } }}
          placeholder="Message your builder…  (Ctrl+Enter to send)"
          className="flex-1 px-3 py-2 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:border-blue-400 resize-none" />
        <button onClick={send} disabled={sending || !text.trim()}
          className="flex items-center gap-1.5 text-sm font-bold text-white px-4 py-2.5 rounded-xl shadow-sm disabled:opacity-50" style={{ background: '#185FA5' }}>
          {sending ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />} Send
        </button>
      </div>
    </div>
  )
}

// ── Customer schedule (project tasks) ───────────────────────────────────────
const SDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const SMONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
function sSameDay(a: Date, b: Date) { return a.getDate() === b.getDate() && a.getMonth() === b.getMonth() && a.getFullYear() === b.getFullYear() }
function sMonthCells(year: number, month: number): (Date | null)[] {
  const first = new Date(year, month, 1), last = new Date(year, month + 1, 0)
  const cells: (Date | null)[] = []
  for (let i = 0; i < first.getDay(); i++) cells.push(null)
  for (let d = 1; d <= last.getDate(); d++) cells.push(new Date(year, month, d))
  return cells
}
const TASK_STATUS: Record<string, { label: string; color: string }> = {
  pending: { label: 'Pending', color: 'bg-gray-100 text-gray-600 border-gray-200' },
  in_progress: { label: 'In Progress', color: 'bg-blue-50 text-blue-700 border-blue-200' },
  completed: { label: 'Completed', color: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  blocked: { label: 'Blocked', color: 'bg-red-50 text-red-600 border-red-200' },
}
const toLocalDate = (ds: string) => new Date(ds + 'T12:00:00')
const isoDay = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
function tasksOnDay(tasks: PortalTask[], d: Date): PortalTask[] {
  const ds = isoDay(d)
  return tasks.filter(t => { if (!t.start_date) return false; const end = t.end_date || t.start_date; return ds >= t.start_date && ds <= end })
}


// Full estimate breakdown (its own tab in the portal).
function ProjectEstimate({ estimate, grandTotal }: { estimate: Estimate; grandTotal: number }) {
  return (
    <div className="space-y-5">
      <h3 className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-gray-500"><DollarSign size={13} /> Estimate</h3>
      {estimate.photo_observations?.length > 0 && (
        <PortalSection title="What we saw in your photos" icon={ImageIcon}>
          <ul className="space-y-1.5 text-sm text-gray-700 list-disc list-inside">
            {estimate.photo_observations.map((o, i) => <li key={i}>{o}</li>)}
          </ul>
        </PortalSection>
      )}
      <PortalSection title="Estimated Costs" icon={ListChecks}>
        <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <tbody className="divide-y divide-gray-50">
            {estimate.materials_breakdown.map((m, i) => (
              <tr key={i}>
                <td className="py-2 pr-3 font-medium text-gray-800">{m.category}</td>
                <td className="py-2 pr-3 text-gray-500 text-xs hidden sm:table-cell">{m.notes}</td>
                <td className="py-2 text-right font-mono font-semibold whitespace-nowrap">${m.estimated_cost.toFixed(2)}</td>
              </tr>
            ))}
            <tr className="font-semibold text-gray-800">
              <td className="py-2 pr-3" colSpan={2}>Labor ({estimate.labor_estimate.hours} hrs)</td>
              <td className="py-2 text-right font-mono whitespace-nowrap">${estimate.labor_estimate.total.toFixed(2)}</td>
            </tr>
            {estimate.subcontractor_estimate > 0 && (
              <tr className="font-semibold text-gray-800">
                <td className="py-2 pr-3" colSpan={2}>Subcontractors</td>
                <td className="py-2 text-right font-mono whitespace-nowrap">${estimate.subcontractor_estimate.toFixed(2)}</td>
              </tr>
            )}
            <tr className="font-bold text-gray-900 border-t-2 border-gray-200">
              <td className="py-2 pr-3" colSpan={2}>Design + PM Fee</td>
              <td className="py-2 text-right font-mono whitespace-nowrap">${estimate.design_pm_fee.toFixed(2)}</td>
            </tr>
            <tr className="font-extrabold text-base" style={{ color: '#185FA5' }}>
              <td className="py-2 pr-3" colSpan={2}>Total</td>
              <td className="py-2 text-right font-mono whitespace-nowrap">${grandTotal.toFixed(2)}</td>
            </tr>
          </tbody>
        </table>
        </div>
      </PortalSection>
      {estimate.process_steps?.length > 0 && (
        <PortalSection title={`Project Plan — ${estimate.process_steps.length} steps`} icon={ClipboardList}>
          <div className="divide-y divide-gray-100">
            {estimate.process_steps.map(s => (
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
      {(estimate.assumptions?.length > 0 || estimate.risks?.length > 0) && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {estimate.assumptions?.length > 0 && (
            <PortalSection title="Assumptions" icon={ClipboardList}>
              <ul className="space-y-1.5 text-sm text-gray-700 list-disc list-inside">
                {estimate.assumptions.map((a, i) => <li key={i}>{a}</li>)}
              </ul>
            </PortalSection>
          )}
          {estimate.risks?.length > 0 && (
            <PortalSection title="Things to Keep in Mind" icon={AlertTriangle}>
              <ul className="space-y-1.5 text-sm text-gray-700 list-disc list-inside">
                {estimate.risks.map((r, i) => <li key={i} className="text-amber-900">{r}</li>)}
              </ul>
            </PortalSection>
          )}
        </div>
      )}
    </div>
  )
}

// This project's appointments (read-only list).
// The project's schedule — month calendar + upcoming list, in one place.
function ProjectScheduleSection({ tasks }: { tasks: PortalTask[] }) {
  const [cursor, setCursor] = useState(() => {
    const first = tasks.map(t => t.start_date).filter(Boolean).sort()[0]
    return first ? toLocalDate(first as string) : new Date()
  })
  const cells = sMonthCells(cursor.getFullYear(), cursor.getMonth())
  const todayIso = isoDay(new Date())
  const sorted = [...tasks].sort((a, b) => (a.start_date || '').localeCompare(b.start_date || ''))
  const upcoming = sorted.filter(t => t.status !== 'completed' && (!(t.end_date || t.start_date) || (t.end_date || t.start_date)! >= todayIso))
  const rows = (upcoming.length ? upcoming : sorted).slice(0, 12)

  return (
    <div>
      <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
        <h3 className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-gray-500"><CalendarIcon size={13} /> Schedule</h3>
        <div className="flex items-center gap-1">
          <button onClick={() => setCursor(c => new Date(c.getFullYear(), c.getMonth() - 1, 1))} className="p-1.5 rounded-lg hover:bg-gray-100"><ChevronLeft size={15} /></button>
          <span className="text-sm font-semibold text-gray-700 min-w-[120px] text-center">{SMONTHS[cursor.getMonth()]} {cursor.getFullYear()}</span>
          <button onClick={() => setCursor(c => new Date(c.getFullYear(), c.getMonth() + 1, 1))} className="p-1.5 rounded-lg hover:bg-gray-100"><ChevronRight size={15} /></button>
          <button onClick={() => setCursor(new Date())} className="ml-1 text-xs font-semibold px-2.5 py-1.5 rounded-lg hover:bg-gray-100">Today</button>
        </div>
      </div>

      {/* Month grid */}
      <div className="grid grid-cols-7 gap-px bg-gray-100 rounded-xl overflow-hidden border border-gray-100">
        {SDAYS.map(d => <div key={d} className="bg-gray-50 text-center text-[10px] font-bold uppercase tracking-wider text-gray-400 py-1.5">{d}</div>)}
        {cells.map((d, i) => {
          const day = d ? tasksOnDay(tasks, d) : []
          return (
            <div key={i} className={`bg-white min-h-[58px] p-1 ${d && sSameDay(d, new Date()) ? 'ring-1 ring-inset ring-amber-300' : ''}`}>
              {d && (
                <>
                  <div className={`text-[11px] font-semibold mb-0.5 ${sSameDay(d, new Date()) ? 'text-amber-700' : 'text-gray-500'}`}>{d.getDate()}</div>
                  {day.slice(0, 2).map(t => (
                    <div key={t.id} title={t.title}
                      className="text-[10px] leading-tight rounded px-1 py-0.5 mb-0.5 truncate text-white"
                      style={{ background: t.color || '#185FA5' }}>
                      {t.status === 'completed' ? '✓ ' : ''}{t.title}
                    </div>
                  ))}
                  {day.length > 2 && <div className="text-[9px] text-gray-400">+{day.length - 2} more</div>}
                </>
              )}
            </div>
          )
        })}
      </div>

      {/* Upcoming list */}
      {rows.length > 0 && (
        <div className="mt-4">
          <div className="text-[11px] font-bold uppercase tracking-wider text-gray-400 mb-2">{upcoming.length ? 'Upcoming' : 'All Items'}</div>
          <div className="space-y-2">
            {rows.map(t => {
              const st = TASK_STATUS[t.status] || TASK_STATUS.pending
              const s = t.start_date ? toLocalDate(t.start_date) : null
              return (
                <div key={t.id} className="flex items-center gap-3 rounded-xl border border-gray-100 px-3 py-2.5">
                  <div className="flex-shrink-0 w-12 text-center">
                    {s ? <><div className="text-[10px] uppercase font-bold text-gray-400">{s.toLocaleDateString('en-US', { month: 'short' })}</div><div className="text-lg font-extrabold text-gray-800 leading-none">{s.getDate()}</div></> : <div className="text-[10px] text-gray-400">TBD</div>}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className={`font-semibold text-sm truncate ${t.status === 'completed' ? 'text-gray-400 line-through' : 'text-gray-900'}`}>{t.title}</div>
                    <div className="text-xs text-gray-500 flex items-center gap-2 flex-wrap">
                      {s && <span className="flex items-center gap-1"><Clock size={11} /> {s.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}{t.end_date && t.end_date !== t.start_date ? ` → ${toLocalDate(t.end_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}` : ''}</span>}
                      {t.assigned_to && <span className="truncate">· {t.assigned_to}</span>}
                    </div>
                  </div>
                  <span className={`text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-full border flex-shrink-0 ${st.color}`}>{st.label}</span>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}

// This project's files (photos, videos, documents) — read-only, downloadable.
function ProjectDriveSection({ files, folderId, folderName }: { files: { name: string; type: string; size: number; url: string | null }[]; folderId: string | null; folderName: string | null }) {
  const isImage = (f: { name: string; type: string }) => /^image\//i.test(f.type) || /\.(jpe?g|png|webp|gif|heic)$/i.test(f.name)
  return (
    <div>
      <h3 className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-gray-500 mb-2"><Folder size={13} /> Drive — Project Files</h3>
      {folderId && (
        <a href={`https://drive.google.com/drive/folders/${folderId}`} target="_blank" rel="noopener noreferrer"
          className="flex items-center gap-2 mb-3 px-3 py-2.5 rounded-xl border border-gray-200 hover:bg-gray-50 text-sm font-semibold" style={{ color: '#2f5a5e' }}>
          <Folder size={15} /> <span className="flex-1 truncate">Open Google Drive folder{folderName ? ` — ${folderName}` : ''}</span> <ExternalLink size={13} className="text-gray-400" />
        </a>
      )}
      {files.length === 0 && folderId && <p className="text-[11px] text-gray-400 mb-2">Files live in the shared Google Drive folder above.</p>}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        {files.map((f, i) => (
          <a key={i} href={f.url || '#'} target="_blank" rel="noopener noreferrer"
            className="group border border-gray-200 rounded-xl overflow-hidden bg-white hover:shadow-sm transition-shadow">
            <div className="h-24 bg-gray-50 flex items-center justify-center overflow-hidden">
              {isImage(f) && f.url ? <img src={f.url} alt={f.name} className="w-full h-full object-cover" /> : <FileText size={26} className="text-gray-300" />}
            </div>
            <div className="p-2 flex items-center gap-1.5">
              <span className="flex-1 truncate text-xs font-medium text-gray-700">{f.name}</span>
              <Download size={13} className="text-gray-300 group-hover:text-gray-600 flex-shrink-0" />
            </div>
          </a>
        ))}
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
