import PortalAuthGuard from '@/components/portal/PortalAuthGuard'

export default function PortalLayout({ children }: { children: React.ReactNode }) {
  return (
    <PortalAuthGuard>
      <div className="min-h-screen" style={{ background: '#f1f5f9' }}>
        {children}
      </div>
    </PortalAuthGuard>
  )
}
