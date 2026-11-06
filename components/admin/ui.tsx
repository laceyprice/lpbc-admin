'use client'
import { X } from 'lucide-react'
import { BUSINESS } from '@/lib/business'

// Small shared building blocks for the operations pages (same look in both apps; colors come from lib/business).
export const BRAND = BUSINESS.brand
export const inp = 'w-full px-3 py-2 rounded-lg border border-gray-200 text-sm bg-white focus:outline-none focus:ring-2 focus:border-blue-400'
export const lbl = 'block text-xs font-bold text-gray-600 uppercase tracking-wider mb-1'
export const money = (n: number | string | null | undefined) => (Number(n) || 0).toLocaleString('en-US', { style: 'currency', currency: 'USD' })
export const fmtDate = (d?: string | null) => d ? new Date(String(d).slice(0, 10) + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—'

export function PageHeader({ title, subtitle, children }: { title: string; subtitle?: string; children?: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-3 flex-wrap mb-6">
      <div><h1 className="text-2xl font-extrabold text-gray-900">{title}</h1>{subtitle && <p className="text-gray-500 text-sm mt-1 max-w-2xl">{subtitle}</p>}</div>
      <div className="flex items-center gap-2 flex-wrap">{children}</div>
    </div>
  )
}

export function PrimaryButton({ children, onClick, disabled, type = 'button' }: { children: React.ReactNode; onClick?: () => void; disabled?: boolean; type?: 'button' | 'submit' }) {
  return <button type={type} onClick={onClick} disabled={disabled} className="inline-flex items-center gap-2 text-white text-sm font-bold px-4 py-2.5 rounded-xl shadow-sm disabled:opacity-50" style={{ background: BRAND }}>{children}</button>
}

export function Stat({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone?: 'good' | 'bad' | 'warn' }) {
  const c = tone === 'good' ? 'text-green-700' : tone === 'bad' ? 'text-red-600' : tone === 'warn' ? 'text-amber-700' : 'text-gray-900'
  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 min-w-0">
      <div className="text-[11px] font-bold uppercase tracking-wider text-gray-400">{label}</div>
      <div className={`text-xl sm:text-2xl font-extrabold mt-1 truncate ${c}`}>{value}</div>
      {sub && <div className="text-xs text-gray-400 mt-0.5 truncate">{sub}</div>}
    </div>
  )
}

export function Modal({ title, onClose, children, footer, wide }: { title: string; onClose: () => void; children: React.ReactNode; footer?: React.ReactNode; wide?: boolean }) {
  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-end sm:items-center justify-center p-0 sm:p-4" onClick={onClose}>
      <div className={`bg-white w-full ${wide ? 'sm:max-w-3xl' : 'sm:max-w-lg'} rounded-t-2xl sm:rounded-2xl shadow-xl max-h-[92vh] flex flex-col`} onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <h3 className="font-extrabold text-gray-900">{title}</h3>
          <button onClick={onClose} className="p-1 text-gray-400 hover:text-gray-700" aria-label="Close"><X size={18} /></button>
        </div>
        <div className="px-5 py-4 overflow-y-auto flex-1 space-y-3">{children}</div>
        {footer && <div className="px-5 py-4 border-t border-gray-100 flex justify-end gap-2">{footer}</div>}
      </div>
    </div>
  )
}

export const Empty = ({ children }: { children: React.ReactNode }) => <div className="py-12 text-center text-sm text-gray-400">{children}</div>
export const ErrorNote = ({ children }: { children: React.ReactNode }) => children ? <div className="bg-red-50 border border-red-100 text-red-700 text-sm px-3 py-2 rounded-lg">{children}</div> : null
