'use client'
import { useState } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { LayoutDashboard, Users, FileText, BookOpen, Calendar, ClipboardList, LogOut, Menu, X, Receipt, BarChart3, ListTree, UserCog, Sparkles, MapPin, ShieldCheck, Package, FileCheck } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/components/admin/AdminAuthGuard'

const nav = [
  { href: '/admin', label: 'Dashboard', icon: LayoutDashboard, exact: true, roles: ['admin', 'bookkeeper', 'invoicing'] },
  { href: '/admin/crm', label: 'CRM / Email', icon: Users, roles: ['admin', 'bookkeeper', 'invoicing'] },
  { href: '/admin/invoices', label: 'Invoices & Quotes', icon: FileText, roles: ['admin', 'bookkeeper', 'invoicing'] },
  { href: '/admin/calendar', label: 'Calendar', icon: Calendar, roles: ['admin', 'bookkeeper'] },
  { href: '/admin/todo', label: 'Todo List', icon: Sparkles, roles: ['admin', 'bookkeeper', 'invoicing'] },
  { href: '/admin/schedule-requests', label: 'Schedule Requests', icon: ClipboardList, roles: ['admin', 'bookkeeper'] },
  { href: '/admin/worksites', label: 'Worksites', icon: MapPin, roles: ['admin', 'bookkeeper'] },
  { href: '/admin/inventory', label: 'Materials & Inventory', icon: Package, roles: ['admin', 'bookkeeper'] },
  { href: '/admin/permits', label: 'Permits / Licensing', icon: FileCheck, roles: ['admin', 'bookkeeper'], matches: ['/admin/permits', '/admin/licensing'] },
  { href: '/admin/bookkeeping', label: 'Bookkeeping', icon: BookOpen, roles: ['admin', 'bookkeeper'] },
  { href: '/admin/reports', label: 'Reports', icon: BarChart3, roles: ['admin', 'bookkeeper'] },
  { href: '/admin/documents', label: 'Documents / COIs', icon: ShieldCheck, roles: ['admin', 'bookkeeper'] },
  { href: '/admin/taxes', label: 'W9 / 1099', icon: Receipt, roles: ['admin', 'bookkeeper'] },
  { href: '/admin/users', label: 'User Management', icon: UserCog, roles: ['admin'] },
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
            </Link>
          )
        })}
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
