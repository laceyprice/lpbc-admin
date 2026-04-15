'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { DollarSign, Users, FileText, Calendar, ClipboardList, TrendingUp } from 'lucide-react'
import { formatCurrency, formatDateShort } from '@/lib/utils'

export default function AdminDashboard() {
  const [data, setData] = useState<{ contacts: number; openAmt: number; paidMonth: number; pending: number; invoices: any[] } | null>(null)

  useEffect(() => {
    Promise.all([fetch('/api/contacts'), fetch('/api/invoices'), fetch('/api/schedule?status=pending')]).then(async ([c, i, r]) => {
      const contacts = await c.json()
      const invoices = await i.json()
      const requests = await r.json()
      const open = invoices.filter((x: any) => x.invoice_status !== 'paid' && x.invoice_status !== 'cancelled')
      const now = new Date()
      const paid = invoices.filter((x: any) => x.invoice_status === 'paid' && x.paid_at && new Date(x.paid_at).getMonth() === now.getMonth())
      setData({ contacts: contacts.length, openAmt: open.reduce((s: number, x: any) => s + (x.amount_due || 0), 0), paidMonth: paid.reduce((s: number, x: any) => s + (x.amount_due || 0), 0), pending: requests.length, invoices: invoices.slice(0, 6) })
    })
  }, [])

  const statusColors: Record<string, string> = { draft: 'bg-gray-100 text-gray-600', sent: 'bg-blue-100 text-blue-700', paid: 'bg-green-100 text-green-700', overdue: 'bg-red-100 text-red-700' }

  const cards = data ? [
    { label: 'Total Contacts', value: data.contacts.toString(), icon: Users, color: '#185FA5', href: '/admin/crm' },
    { label: 'Outstanding Invoices', value: formatCurrency(data.openAmt), icon: FileText, color: '#d97706', href: '/admin/invoices' },
    { label: 'Collected This Month', value: formatCurrency(data.paidMonth), icon: DollarSign, color: '#16a34a', href: '/admin/invoices' },
    { label: 'Pending Requests', value: data.pending.toString(), icon: ClipboardList, color: '#7c3aed', href: '/admin/schedule-requests' },
    { label: 'Calendar', value: 'View →', icon: Calendar, color: '#0891b2', href: '/admin/calendar' },
    { label: 'Bookkeeping', value: 'View →', icon: TrendingUp, color: '#059669', href: '/admin/bookkeeping' },
  ] : []

  return (
    <div className="p-6 md:p-8 pt-16 md:pt-8">
      <div className="mb-8">
        <h1 className="text-2xl font-extrabold text-gray-900">Dashboard</h1>
        <p className="text-gray-500 mt-1">Welcome back to The Gasologist admin portal.</p>
      </div>
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-4 mb-8">
        {data ? cards.map(({ label, value, icon: Icon, color, href }) => (
          <Link key={label} href={href} className="rounded-2xl p-5 text-white shadow-md hover:shadow-lg hover:-translate-y-0.5 transition-all"
            style={{ background: color }}>
            <Icon size={22} className="opacity-75 mb-3" />
            <div className="text-2xl font-extrabold">{value}</div>
            <div className="text-sm mt-0.5 opacity-80">{label}</div>
          </Link>
        )) : [...Array(6)].map((_, i) => <div key={i} className="h-28 rounded-2xl bg-gray-200 animate-pulse" />)}
      </div>
      {data && (
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-100 flex justify-between">
            <h2 className="font-bold text-gray-900">Recent Invoices</h2>
            <Link href="/admin/invoices" className="text-sm font-medium" style={{ color: '#185FA5' }}>View All</Link>
          </div>
          {data.invoices.length === 0 ? <div className="py-10 text-center text-gray-400 text-sm">No invoices yet</div> : data.invoices.map((inv: any) => (
            <div key={inv.id} className="flex items-center justify-between px-6 py-4 border-b border-gray-50 hover:bg-gray-50 transition-colors">
              <div>
                <div className="font-semibold text-gray-900 text-sm">#{inv.invoice_number}</div>
                <div className="text-gray-500 text-xs">{inv.customer_name} · {formatDateShort(inv.created_at)}</div>
              </div>
              <div className="flex items-center gap-3">
                <span className="font-bold text-gray-900">{formatCurrency(inv.amount_due)}</span>
                <span className={`text-xs font-semibold px-2 py-1 rounded-full capitalize ${statusColors[inv.invoice_status] || 'bg-gray-100 text-gray-600'}`}>{inv.invoice_status}</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
