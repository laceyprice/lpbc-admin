'use client'
import { usePathname } from 'next/navigation'
import AdminSidebar from '@/components/admin/AdminSidebar'
import AdminAuthGuard from '@/components/admin/AdminAuthGuard'
import BuildTag from '@/components/admin/BuildTag'
import QuickAdd from '@/components/admin/QuickAdd'
import OfflineBanner from '@/components/admin/OfflineBanner'

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const isLoginPage = pathname === '/admin/login'

  return (
    <>
    <AdminAuthGuard>
      {isLoginPage ? (
        <>{children}</>
      ) : (
        <div className="flex h-screen bg-gray-100 overflow-hidden">
          <AdminSidebar />
          <main className="flex-1 overflow-y-auto">{children}</main>
          <QuickAdd brand="#b8895a" />
          <OfflineBanner />
        </div>
      )}
    </AdminAuthGuard>
    <BuildTag />
    </>
  )
}
