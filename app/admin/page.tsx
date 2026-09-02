'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { DollarSign, Receipt, FileText, Calendar, ClipboardList, TrendingUp } from 'lucide-react'
import { formatCurrency, formatDateShort } from '@/lib/utils'

export default function AdminDashboard() {
  const [data, setData] = useState<{ invoicedMonth: number; invoicedLastMonth: number; openAmt: number; paidMonth: number; paidLastMonth: number; paidYTD: number; pending: number; invoices: any[] } | null>(null)

  useEffect(() => {
    Promise.all([fetch('/api/invoices'), fetch('/api/schedule?status=pending')]).then(async ([i, r]) => {
      const invoicesRaw = await i.json()
      const requestsRaw = await r.json()
      const invoices = Array.isArray(invoicesRaw) ? invoicesRaw : []
      const requests = Array.isArray(requestsRaw) ? requestsRaw : []
      const now = new Date()
      // Previous calendar month (rolls back to December of the prior year in January).
      const lastMonth = now.getMonth() === 0 ? 11 : now.getMonth() - 1
      const lastMonthYear = now.getMonth() === 0 ? now.getFullYear() - 1 : now.getFullYear()
      const inThisMonth = (d: any) => { if (!d) return false; const dt = new Date(d); return dt.getMonth() === now.getMonth() && dt.getFullYear() === now.getFullYear() }
      const inLastMonth = (d: any) => { if (!d) return false; const dt = new Date(d); return dt.getMonth() === lastMonth && dt.getFullYear() === lastMonthYear }
      const inThisYear = (d: any) => { if (!d) return false; return new Date(d).getFullYear() === now.getFullYear() }
      // Only real invoices count toward money figures (quotes are not billed/owed).
      const isInvoice = (x: any) => x.invoice_type !== 'quote'
      const num = (v: any) => Number(v) || 0
      // Outstanding = unpaid BALANCE (amount_due − amount_paid) on issued, unpaid
      // invoices. Excludes quotes, drafts (not issued), cancelled and paid.
      const openAmt = invoices
        .filter((x: any) => isInvoice(x) && !['paid', 'cancelled', 'draft'].includes(x.invoice_status))
        .reduce((s: number, x: any) => s + Math.max(0, num(x.amount_due) - num(x.amount_paid)), 0)
      // Collected = amount actually collected on invoices paid within the period.
      const collectedIn = (matcher: (d: any) => boolean) => invoices
        .filter((x: any) => isInvoice(x) && x.invoice_status === 'paid' && matcher(x.paid_at))
        .reduce((s: number, x: any) => s + (num(x.amount_paid) || num(x.amount_due)), 0)
      const paidMonth = collectedIn(inThisMonth)
      const paidLastMonth = collectedIn(inLastMonth)
      const paidYTD = collectedIn(inThisYear)
      // Invoiced = total billed on invoices issued within the period (not quotes/drafts/cancelled).
      const invoicedIn = (matcher: (d: any) => boolean) => invoices
        .filter((x: any) => isInvoice(x) && !['cancelled', 'draft'].includes(x.invoice_status) && matcher(x.created_at))
        .reduce((s: number, x: any) => s + num(x.amount_due), 0)
      const invoicedMonth = invoicedIn(inThisMonth)
      const invoicedLastMonth = invoicedIn(inLastMonth)
      setData({ invoicedMonth, invoicedLastMonth, openAmt, paidMonth, paidLastMonth, paidYTD, pending: requests.length, invoices: invoices.slice(0, 6) })
    })
  }, [])

  const statusColors: Record<string, string> = { draft: 'bg-gray-100 text-gray-600', sent: 'bg-blue-100 text-blue-700', paid: 'bg-green-100 text-green-700', overdue: 'bg-red-100 text-red-700' }

  const cards = data ? [
    { label: 'Outstanding Invoices', value: formatCurrency(data.openAmt), icon: FileText, color: '#d97706', href: '/admin/invoices' },
    { label: 'Invoiced This Month', value: formatCurrency(data.invoicedMonth), icon: Receipt, color: '#b8895a', href: '/admin/invoices' },
    { label: 'Invoiced Last Month', value: formatCurrency(data.invoicedLastMonth), icon: Receipt, color: '#a97846', href: '/admin/invoices' },
    { label: 'Collected This Month', value: formatCurrency(data.paidMonth), icon: DollarSign, color: '#16a34a', href: '/admin/invoices' },
    { label: 'Collected Last Month', value: formatCurrency(data.paidLastMonth), icon: DollarSign, color: '#0d9488', href: '/admin/invoices' },
    { label: 'Collected YTD', value: formatCurrency(data.paidYTD), icon: TrendingUp, color: '#059669', href: '/admin/invoices' },
    { label: 'Pending Requests', value: data.pending.toString(), icon: ClipboardList, color: '#7c3aed', href: '/admin/schedule-requests' },
    { label: 'Calendar', value: 'View →', icon: Calendar, color: '#0891b2', href: '/admin/calendar' },
    { label: 'Bookkeeping', value: 'View →', icon: TrendingUp, color: '#0f766e', href: '/admin/bookkeeping' },
  ] : []

  return (
    <div className="p-6 md:p-8 pt-16 md:pt-8">
      <div className="mb-8">
        <h1 className="text-2xl font-extrabold text-gray-900">Dashboard</h1>
        <p className="text-gray-500 mt-1">Welcome back to L. Price Building Company admin portal.</p>
      </div>
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-4 mb-8">
        {data ? cards.map(({ label, value, icon: Icon, color, href }) => (
          <Link key={label} href={href} className="rounded-2xl p-5 text-white shadow-md hover:shadow-lg hover:-translate-y-0.5 transition-all"
            style={{ background: color }}>
            <Icon size={22} className="opacity-75 mb-3" />
            <div className="text-2xl font-extrabold">{value}</div>
            <div className="text-sm mt-0.5 opacity-80">{label}</div>
          </Link>
        )) : [...Array(9)].map((_, i) => <div key={i} className="h-28 rounded-2xl bg-gray-200 animate-pulse" />)}
      </div>
      {data && (
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-100 flex justify-between">
            <h2 className="font-bold text-gray-900">Recent Invoices</h2>
            <Link href="/admin/invoices" className="text-sm font-medium" style={{ color: '#b8895a' }}>View All</Link>
          </div>
          {data.invoices.length === 0 ? <div className="py-10 text-center text-gray-400 text-sm">No invoices yet</div> : data.invoices.map((inv: any) => (
            <Link key={inv.id} href={`/admin/invoices?edit=${inv.id}`}
              className="flex items-center justify-between px-6 py-4 border-b border-gray-50 hover:bg-gray-50 transition-colors cursor-pointer">
              <div>
                <div className="font-semibold text-gray-900 text-sm">#{inv.invoice_number}</div>
                <div className="text-gray-500 text-xs">{inv.customer_name} · {formatDateShort(inv.service_date || inv.created_at)}</div>
              </div>
              <div className="flex items-center gap-3">
                <span className="font-bold text-gray-900">{formatCurrency(inv.amount_due)}</span>
                <span className={`text-xs font-semibold px-2 py-1 rounded-full capitalize ${statusColors[inv.invoice_status] || 'bg-gray-100 text-gray-600'}`}>{inv.invoice_status}</span>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
