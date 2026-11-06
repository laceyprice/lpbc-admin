'use client'
import { useEffect, useMemo, useState } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { LogOut, Menu, X, ChevronDown, Search } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/components/admin/AdminAuthGuard'
import { BUSINESS } from '@/lib/business'
import { DASHBOARD, GROUPS, SETTINGS_GROUP, isItemActive, type NavItem } from '@/lib/nav'

// Grouped menu: Dashboard on top, then a handful of collapsible sections (what you're doing, not which
// table it touches). The section holding the current page is always open; others stay collapsed, and
// what you opened is remembered on this device. The search box finds any page by name.
const OPEN_KEY = 'admin_nav_open_v2'
const rowStyle = (active: boolean) => ({ background: active ? 'rgba(255,255,255,0.2)' : 'transparent', color: active ? 'white' : 'rgba(255,255,255,0.7)' })

function SidebarContent({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname()
  const router = useRouter()
  const { role } = useAuth()
  const [q, setQ] = useState('')

  async function logout() { await supabase.auth.signOut(); router.push('/admin/login') }

  const canSee = (i: NavItem) => !role || i.roles.includes(role)
  const groups = useMemo(() => [...GROUPS, SETTINGS_GROUP].map(g => ({ ...g, items: g.items.filter(canSee) })).filter(g => g.items.length > 0),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [role])
  const activeGroupId = groups.find(g => g.items.some(i => isItemActive(i, pathname)))?.id

  const [open, setOpen] = useState<string[]>(activeGroupId ? [activeGroupId] : [])
  useEffect(() => {
    try { const s = JSON.parse(localStorage.getItem(OPEN_KEY) || 'null'); if (Array.isArray(s)) setOpen(prev => Array.from(new Set([...s, ...prev]))) } catch { /* ignore */ }
  }, [])
  useEffect(() => { if (activeGroupId) setOpen(o => (o.includes(activeGroupId) ? o : [...o, activeGroupId])) }, [activeGroupId])
  function toggle(id: string) {
    setOpen(o => {
      const next = o.includes(id) ? o.filter(x => x !== id) : [...o, id]
      try { localStorage.setItem(OPEN_KEY, JSON.stringify(next)) } catch { /* ignore */ }
      return next
    })
  }

  // New (pending) schedule requests → count badge. Refreshes on navigation, every minute, and instantly
  // when the requests page changes one.
  const [pending, setPending] = useState(0)
  useEffect(() => {
    let alive = true
    const load = () => fetch('/api/schedule?status=pending&count=true', { cache: 'no-store' })
      .then(r => r.json()).then(d => { if (alive && typeof d?.count === 'number') setPending(d.count) }).catch(() => {})
    load()
    const t = setInterval(load, 60000)
    window.addEventListener('schedule-requests-changed', load)
    return () => { alive = false; clearInterval(t); window.removeEventListener('schedule-requests-changed', load) }
  }, [pathname])

  const Badge = ({ n }: { n: number }) => n > 0 ? (
    <span className="ml-auto min-w-[20px] h-5 px-1.5 rounded-full bg-amber-400 text-gray-900 text-[11px] font-extrabold flex items-center justify-center">{n > 99 ? '99+' : n}</span>
  ) : null

  const needle = q.trim().toLowerCase()
  const results = needle ? groups.flatMap(g => g.items.filter(i => i.label.toLowerCase().includes(needle)).map(i => ({ ...i, group: g.label }))) : []
  const dash = canSee(DASHBOARD)

  return (
    <div className="flex flex-col h-full" style={{ background: `linear-gradient(180deg, ${BUSINESS.brandDark} 0%, ${BUSINESS.brand} 100%)` }}>
      <div className="flex items-center gap-3 px-5 py-4 border-b border-white/10">
        <div className="w-10 h-10 bg-white rounded-full flex items-center justify-center flex-shrink-0 overflow-hidden">
          <Image src={BUSINESS.logo} alt={BUSINESS.name} width={28} height={28} className="object-contain" />
        </div>
        <div>
          <div className="text-white font-bold text-sm">{BUSINESS.shortName}</div>
          <div className="text-xs" style={{ color: 'rgba(255,255,255,0.45)' }}>Admin Portal</div>
        </div>
      </div>

      <div className="px-3 pt-3">
        <div className="relative">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-white/50" />
          <input value={q} onChange={e => setQ(e.target.value)} placeholder="Find a page…" aria-label="Find a page"
            className="w-full pl-8 pr-7 py-2 rounded-lg bg-white/10 text-white placeholder-white/50 text-[13px] focus:outline-none focus:bg-white/20" />
          {q && <button onClick={() => setQ('')} aria-label="Clear" className="absolute right-2 top-1/2 -translate-y-1/2 text-white/60 hover:text-white"><X size={14} /></button>}
        </div>
      </div>

      <nav className="flex-1 px-2 py-3 space-y-0.5 overflow-y-auto">
        {needle ? (
          results.length === 0 ? <div className="px-3 py-4 text-[13px] text-white/60">No page matches “{q}”.</div> :
            results.map(i => (
              <Link key={i.href} href={i.href} onClick={() => { setQ(''); onNavigate?.() }} className="flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium hover:bg-white/10" style={rowStyle(isItemActive(i, pathname))}>
                <i.icon size={16} className="flex-shrink-0" />
                <span className="min-w-0"><span className="block truncate">{i.label}</span><span className="block text-[10px] text-white/45">{i.group}</span></span>
              </Link>))
        ) : (
          <>
            {dash && (
              <Link href={DASHBOARD.href} onClick={onNavigate} className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-semibold hover:bg-white/10 mb-1" style={rowStyle(isItemActive(DASHBOARD, pathname))}>
                <DASHBOARD.icon size={17} className="flex-shrink-0" /> {DASHBOARD.label}
              </Link>)}
            {groups.map(g => {
              const isOpen = open.includes(g.id)
              const holdsActive = g.id === activeGroupId
              const groupBadge = g.items.some(i => i.badge === 'requests') ? pending : 0
              return (
                <div key={g.id} className={g.id === 'settings' ? 'pt-2 mt-2 border-t border-white/10' : ''}>
                  <button onClick={() => toggle(g.id)} aria-expanded={isOpen}
                    className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-sm font-semibold text-left transition-all hover:text-white hover:bg-white/10"
                    style={{ background: holdsActive && !isOpen ? 'rgba(255,255,255,0.2)' : 'transparent', color: holdsActive ? 'white' : 'rgba(255,255,255,0.8)' }}>
                    <g.icon size={17} className="flex-shrink-0" />
                    <span className="whitespace-nowrap">{g.label}</span>
                    {!isOpen && <Badge n={groupBadge} />}
                    <ChevronDown size={15} className={`${!isOpen && groupBadge > 0 ? 'ml-1' : 'ml-auto'} transition-transform flex-shrink-0 ${isOpen ? 'rotate-180' : ''}`} />
                  </button>
                  {isOpen && (
                    <div className="mt-0.5 mb-1 ml-5 pl-2 border-l border-white/15 space-y-0.5">
                      {g.items.map(i => (
                        <Link key={i.href} href={i.href} onClick={onNavigate} className="flex items-center gap-2.5 px-3 py-2 rounded-lg transition-all text-[13px] font-medium hover:text-white hover:bg-white/10" style={rowStyle(isItemActive(i, pathname))}>
                          <i.icon size={15} className="flex-shrink-0" />
                          {i.label}
                          {i.badge === 'requests' && <Badge n={pending} />}
                        </Link>))}
                    </div>)}
                </div>)
            })}
          </>
        )}
      </nav>

      <div className="px-2 py-3 border-t border-white/10">
        <button onClick={logout} className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all hover:bg-white/10" style={{ color: 'rgba(255,255,255,0.65)' }}>
          <LogOut size={17} /> Sign Out
        </button>
      </div>
    </div>
  )
}

export default function AdminSidebar() {
  const [mobileOpen, setMobileOpen] = useState(false)
  return (
    <>
      <aside className="hidden md:flex flex-col w-60 flex-shrink-0"><SidebarContent /></aside>
      <div className="md:hidden fixed top-0 left-0 right-0 z-50 flex items-center justify-between px-4 py-3 shadow-md" style={{ background: BUSINESS.brandDark }}>
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 bg-white rounded-full flex items-center justify-center flex-shrink-0 overflow-hidden">
            <Image src={BUSINESS.logo} alt="" width={22} height={22} className="object-contain" />
          </div>
          <span className="text-white font-bold text-sm">Admin</span>
        </div>
        <button onClick={() => setMobileOpen(!mobileOpen)} className="text-white p-1" aria-label="Menu">{mobileOpen ? <X size={22} /> : <Menu size={22} />}</button>
      </div>
      {mobileOpen && (
        <div className="md:hidden fixed inset-0 z-40 flex" style={{ top: '53px' }}>
          <div className="w-72 max-w-[85vw] flex flex-col shadow-xl"><SidebarContent onNavigate={() => setMobileOpen(false)} /></div>
          <div className="flex-1 bg-black/50" onClick={() => setMobileOpen(false)} />
        </div>
      )}
    </>
  )
}
