'use client'
import { useEffect, useState, createContext, useContext } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { Loader2 } from 'lucide-react'

interface PortalCtx {
  email: string | null
  accessToken: string | null
}

const PortalContext = createContext<PortalCtx>({ email: null, accessToken: null })
export const usePortalAuth = () => useContext(PortalContext)

// Gate for the customer-facing portal — only 'customer' role users may enter.
// Anyone else (admin/bookkeeper/invoicing/no role) gets bounced to /admin,
// where AdminAuthGuard will route them appropriately.
export default function PortalAuthGuard({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const pathname = usePathname()
  const [checking, setChecking] = useState(true)
  const [ok, setOk] = useState(false)
  const [email, setEmail] = useState<string | null>(null)
  const [accessToken, setAccessToken] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    async function check() {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) { router.replace('/admin/login'); return }

      const { data: roleData } = await supabase
        .from('user_roles')
        .select('role')
        .eq('user_id', session.user.id)
        .single()

      if (cancelled) return
      if (roleData?.role !== 'customer') { router.replace('/admin'); return }

      setEmail(session.user.email || null)
      setAccessToken(session.access_token)
      setOk(true)
      setChecking(false)
    }
    check()
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_e, session) => {
      if (!session) router.replace('/admin/login')
    })
    return () => { cancelled = true; subscription.unsubscribe() }
  }, [router, pathname])

  if (checking) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: '#f1f5f9' }}>
        <Loader2 size={32} className="animate-spin" style={{ color: '#b8895a' }} />
      </div>
    )
  }
  if (!ok) return null
  return <PortalContext.Provider value={{ email, accessToken }}>{children}</PortalContext.Provider>
}
