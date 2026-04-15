import AdminSidebar from '@/components/admin/AdminSidebar'
import AdminAuthGuard from '@/components/admin/AdminAuthGuard'

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <AdminAuthGuard>
      <div className="flex h-screen bg-gray-100 overflow-hidden">
        <AdminSidebar />
        <main className="flex-1 overflow-y-auto">{children}</main>
      </div>
    </AdminAuthGuard>
  )
}
