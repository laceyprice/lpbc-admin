'use client'
import { useEffect, useState, createContext, useContext } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { Loader2 } from 'lucide-react'

type UserRole = 'admin' | 'bookkeeper' | 'invoicing' | 'customer' | null

interface AuthCtx {
  role: UserRole
  email: string | null
}

const AuthContext = createContext<AuthCtx>({ role: null, email: null })
export const useAuth = () => useContext(AuthContext)

// Pages that each role can access
const INVOICING_PAGES = ['/admin', '/admin/invoices', '/admin/crm']
const FULL_PAGES = [
  '/admin', '/admin/invoices', '/admin/crm', '/admin/bookkeeping',
  '/admin/reports', '/admin/accounts', '/admin/calendar',
  '/admin/schedule-requests', '/admin/taxes', '/admin/users',
]

function canAccess(role: UserRole, path: string): boolean {
  if (!role) return false
  if (role === 'customer') return false   // customers live in /portal, not /admin
  if (role === 'admin' || role === 'bookkeeper') return true
  // Invoicing users can only see dashboard, invoices, and CRM
  return INVOICING_PAGES.some(p => path === p || (p !== '/admin' && path.startsWith(p + '/')))
}

export default function AdminAuthGuard({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const pathname = usePathname()
  const [checking, setChecking] = useState(true)
  const [authed, setAuthed] = useState(false)
  const [role, setRole] = useState<UserRole>(null)
  const [email, setEmail] = useState<string | null>(null)

  const isLoginPage = pathname === '/admin/login'

  useEffect(() => {
    if (isLoginPage) { setChecking(false); setAuthed(true); return }

    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (!session) { router.replace('/admin/login'); setChecking(false); return }

      setEmail(session.user.email || null)

      // Fetch role from user_roles table
      const { createClient } = await import('@supabase/supabase-js')
      const supa = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
      )
      const { data: roleData } = await supa
        .from('user_roles')
        .select('role')
        .eq('user_id', session.user.id)
        .single()

      // If no role record exists, default to admin (for backwards compat with existing user)
      const userRole: UserRole = roleData?.role || 'admin'
      setRole(userRole)
      setAuthed(true)
      setChecking(false)
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_e, session) => {
      if (!session && !isLoginPage) router.replace('/admin/login')
      setAuthed(!!session || isLoginPage)
    })
    return () => subscription.unsubscribe()
  }, [router, isLoginPage])

  // Check page access when role or path changes
  useEffect(() => {
    if (!checking && authed && role && !isLoginPage && !canAccess(role, pathname)) {
      router.replace(role === 'customer' ? '/portal' : '/admin')
    }
  }, [role, pathname, checking, authed, isLoginPage, router])

  if (checking) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: '#f1f5f9' }}>
        <Loader2 size={32} className="animate-spin" style={{ color: '#b8895a' }} />
      </div>
    )
  }

  if (!authed && !isLoginPage) return null
  return <AuthContext.Provider value={{ role, email }}>{children}</AuthContext.Provider>
}
