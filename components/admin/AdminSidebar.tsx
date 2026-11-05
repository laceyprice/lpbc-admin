'use client'
import { useEffect, useState } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { LayoutDashboard, Users, FileText, BookOpen, Calendar, ClipboardList, LogOut, Menu, X, Receipt, BarChart3, ListTree, UserCog, Sparkles, MapPin, ShieldCheck, Package, FileCheck, KeyRound, Hammer, Wallet, PenLine, Settings, ChevronDown, Link2 } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/components/admin/AdminAuthGuard'

const nav = [
  { href: '/admin', label: 'Dashboard', icon: LayoutDashboard, exact: true, roles: ['admin', 'bookkeeper', 'invoicing'] },
  { href: '/admin/crm', label: 'CRM & Email', icon: Users, roles: ['admin', 'bookkeeper', 'invoicing'] },
  { href: '/admin/invoices', label: 'Invoices & Quotes', icon: FileText, roles: ['admin', 'bookkeeper', 'invoicing'] },
  { href: '/admin/plan-job', label: 'Plan & Design Studio', icon: Hammer, roles: ['admin', 'bookkeeper'] },
  { href: '/admin/calendar', label: 'Calendar', icon: Calendar, roles: ['admin', 'bookkeeper'] },
  { href: '/admin/todo', label: 'Todo List', icon: Sparkles, roles: ['admin', 'bookkeeper', 'invoicing'] },
  { href: '/admin/schedule-requests', label: 'Schedule Requests', icon: ClipboardList, roles: ['admin', 'bookkeeper'] },
  { href: '/admin/worksites', label: 'Worksites', icon: MapPin, roles: ['admin', 'bookkeeper'] },
  { href: '/admin/inventory', label: 'Materials & Inventory', icon: Package, roles: ['admin', 'bookkeeper'] },
  { href: '/admin/permits', label: 'Permits & Licensing', icon: FileCheck, roles: ['admin', 'bookkeeper'], matches: ['/admin/permits', '/admin/licensing'] },
  { href: '/admin/bookkeeping', label: 'Bookkeeping', icon: BookOpen, roles: ['admin', 'bookkeeper'] },
  { href: '/admin/reports', label: 'Reports', icon: BarChart3, roles: ['admin', 'bookkeeper'] },
  { href: '/admin/documents', label: 'Insurance & Other Docs', icon: ShieldCheck, roles: ['admin', 'bookkeeper'] },
  { href: '/admin/taxes', label: 'Business Tax Center', icon: Receipt, roles: ['admin', 'bookkeeper'] },
  { href: '/admin/expenses', label: 'Expenses', icon: Wallet, roles: ['admin'] },
  { href: '/admin/notepad', label: 'Notepad', icon: PenLine, roles: ['admin'] },
]

// Admin-only "Settings" group: users, the password vault and the Google connection.
const settingsNav = [
  { href: '/admin/users', label: 'Users', icon: UserCog },
  { href: '/admin/vault', label: 'Account Vault', icon: KeyRound },
  { href: '/admin/google-connect', label: 'Google Connection', icon: Link2 },
]

function SidebarContent({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname()
  const router = useRouter()
  const { role } = useAuth()

  async function logout() {
    await supabase.auth.signOut()
    router.push('/admin/login')
  }

  const visibleNav = nav.filter(n => !role || n.roles.includes(role))
  const showSettings = !role || role === 'admin'
  const inSettings = settingsNav.some(c => pathname.startsWith(c.href))
  const [settingsOpen, setSettingsOpen] = useState(inSettings)
  useEffect(() => { if (inSettings) setSettingsOpen(true) }, [inSettings])

  // New (pending) schedule requests → count badge on that menu item. Refreshes on
  // navigation, every minute, and instantly when the requests page changes one.
  const [pendingRequests, setPendingRequests] = useState(0)
  useEffect(() => {
    let alive = true
    const load = () => fetch('/api/schedule?status=pending&count=true', { cache: 'no-store' })
      .then(r => r.json()).then(d => { if (alive && typeof d?.count === 'number') setPendingRequests(d.count) }).catch(() => {})
    load()
    const t = setInterval(load, 60000)
    window.addEventListener('schedule-requests-changed', load)
    return () => { alive = false; clearInterval(t); window.removeEventListener('schedule-requests-changed', load) }
  }, [pathname])

  return (
    <div className="flex flex-col h-full" style={{ background: 'linear-gradient(180deg, #2f5a5e 0%, #b8895a 100%)' }}>
      <div className="flex items-center gap-3 px-5 py-5 border-b border-white/10">
        <div className="w-10 h-10 bg-white rounded-full flex items-center justify-center flex-shrink-0">
          <Image src="/logo.png" alt="L. Price Building Company" width={28} height={28} className="object-contain" />
        </div>
        <div>
          <div className="text-white font-bold text-sm">L. Price Building Co.</div>
          <div className="text-xs" style={{ color: 'rgba(255,255,255,0.45)' }}>Admin Portal</div>
        </div>
      </div>
      <nav className="flex-1 px-2 py-4 space-y-0.5 overflow-y-auto">
        {visibleNav.map(({ href, label, icon: Icon, exact, matches }: any) => {
          const active = exact
            ? pathname === href
            : matches
              ? matches.some((m: string) => pathname.startsWith(m))
              : pathname.startsWith(href)
          return (
            <Link key={href} href={href} onClick={onNavigate}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all text-sm font-medium ${active ? 'text-white' : 'hover:text-white hover:bg-white/10'}`}
              style={{ background: active ? 'rgba(255,255,255,0.2)' : 'transparent', color: active ? 'white' : 'rgba(255,255,255,0.65)' }}>
              <Icon size={17} className="flex-shrink-0" />
              {label}
              {href === '/admin/schedule-requests' && pendingRequests > 0 && (
                <span className="ml-auto min-w-[20px] h-5 px-1.5 rounded-full bg-amber-400 text-gray-900 text-[11px] font-extrabold flex items-center justify-center">
                  {pendingRequests > 99 ? '99+' : pendingRequests}
                </span>
              )}
            </Link>
          )
        })}
        {showSettings && (
          <div className="pt-1">
            <button onClick={() => setSettingsOpen(o => !o)}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all text-sm font-medium hover:text-white hover:bg-white/10`}
              style={{ background: inSettings && !settingsOpen ? 'rgba(255,255,255,0.2)' : 'transparent', color: inSettings ? 'white' : 'rgba(255,255,255,0.65)' }}>
              <Settings size={17} className="flex-shrink-0" />
              Settings
              <ChevronDown size={15} className={`ml-auto transition-transform ${settingsOpen ? 'rotate-180' : ''}`} />
            </button>
            {settingsOpen && (
              <div className="mt-0.5 ml-4 pl-3 border-l border-white/15 space-y-0.5">
                {settingsNav.map(({ href, label, icon: Icon }) => {
                  const active = pathname.startsWith(href)
                  return (
                    <Link key={href} href={href} onClick={onNavigate}
                      className={`flex items-center gap-2.5 px-3 py-2 rounded-lg transition-all text-[13px] font-medium ${active ? 'text-white' : 'hover:text-white hover:bg-white/10'}`}
                      style={{ background: active ? 'rgba(255,255,255,0.2)' : 'transparent', color: active ? 'white' : 'rgba(255,255,255,0.65)' }}>
                      <Icon size={15} className="flex-shrink-0" />
                      {label}
                    </Link>
                  )
                })}
              </div>
            )}
          </div>
        )}
      </nav>
      <div className="px-2 py-4 border-t border-white/10">
        <button onClick={logout}
          className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all hover:bg-white/10"
          style={{ color: 'rgba(255,255,255,0.65)' }}>
          <LogOut size={17} />
          Sign Out
        </button>
      </div>
    </div>
  )
}

export default function AdminSidebar() {
  const [mobileOpen, setMobileOpen] = useState(false)
  return (
    <>
      <aside className="hidden md:flex flex-col w-60 flex-shrink-0">
        <SidebarContent />
      </aside>
      <div className="md:hidden fixed top-0 left-0 right-0 z-50 flex items-center justify-between px-4 py-3 shadow-md" style={{ background: '#2f5a5e' }}>
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 bg-white rounded-full flex items-center justify-center flex-shrink-0">
            <Image src="/logo.png" alt="" width={22} height={22} className="object-contain" />
          </div>
          <span className="text-white font-bold text-sm">Admin</span>
        </div>
        <button onClick={() => setMobileOpen(!mobileOpen)} className="text-white p-1">
          {mobileOpen ? <X size={22} /> : <Menu size={22} />}
        </button>
      </div>
      {mobileOpen && (
        <div className="md:hidden fixed inset-0 z-40 flex" style={{ top: '53px' }}>
          <div className="w-64 flex flex-col shadow-xl"><SidebarContent onNavigate={() => setMobileOpen(false)} /></div>
          <div className="flex-1 bg-black/50" onClick={() => setMobileOpen(false)} />
        </div>
      )}
    </>
  )
}
