'use client'
import { useEffect, useState } from 'react'
import { usePathname } from 'next/navigation'
import { Plus } from 'lucide-react'
import SendNoteModal from '@/components/admin/SendNoteModal'
import { useAuth } from '@/components/admin/AdminAuthGuard'

// Floating "+" on every admin page → one form to add a Todo, an appointment, a
// materials list, a permit (or a Notepad entry, admin only). Anything else on the
// page can open it too by dispatching  window.dispatchEvent(new Event('open-quick-add')).
// When something is added we fire 'quick-add-done' so open lists (dashboard) refresh.

export default function QuickAdd({ brand = '#b8895a' }: { brand?: string }) {
  const [open, setOpen] = useState(false)
  const [toast, setToast] = useState('')
  const pathname = usePathname()
  const { role } = useAuth()

  useEffect(() => {
    const show = () => setOpen(true)
    window.addEventListener('open-quick-add', show)
    return () => window.removeEventListener('open-quick-add', show)
  }, [])
  useEffect(() => { if (!toast) return; const t = setTimeout(() => setToast(''), 2600); return () => clearTimeout(t) }, [toast])

  if (pathname === '/admin/login') return null
  // Invoicing-only users can't see the calendar, permits or materials pages — only offer what they can reach.
  if (role === 'invoicing') return null

  return (
    <>
      <button onClick={() => setOpen(true)} aria-label="Quick add" title="Quick add"
        className="fixed z-40 right-4 bottom-6 md:right-6 md:bottom-8 w-14 h-14 rounded-full text-white shadow-lg hover:shadow-xl active:scale-95 transition flex items-center justify-center"
        style={{ background: brand }}>
        <Plus size={26} />
      </button>
      {open && (
        <SendNoteModal text="" brand={brand} quick canNote={role === 'admin' || !role}
          onClose={() => setOpen(false)}
          onSent={label => { setOpen(false); setToast(`Added to ${label}`); window.dispatchEvent(new Event('quick-add-done')) }} />
      )}
      {toast && (
        <div className="fixed z-50 left-1/2 -translate-x-1/2 bottom-24 bg-gray-900 text-white text-sm font-semibold px-4 py-2.5 rounded-xl shadow-lg">{toast}</div>
      )}
    </>
  )
}
