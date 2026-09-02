import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount)
}

// A bare "YYYY-MM-DD" (a Postgres `date` column) parses as UTC midnight via
// `new Date()`, which then renders as the PREVIOUS day in any timezone behind
// UTC (e.g. US). Treat date-only strings as LOCAL midnight so the day is exact;
// full timestamps (with a time/zone) are left to normal parsing.
function parseDateSafe(date: string | Date): Date {
  if (typeof date === 'string') {
    const m = date.match(/^(\d{4})-(\d{2})-(\d{2})$/)
    if (m) return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]))
  }
  return new Date(date)
}

export function formatDate(date: string | Date): string {
  return new Intl.DateTimeFormat('en-US', { year: 'numeric', month: 'long', day: 'numeric' }).format(parseDateSafe(date))
}

export function formatDateShort(date: string | Date): string {
  return new Intl.DateTimeFormat('en-US', { year: 'numeric', month: 'short', day: 'numeric' }).format(parseDateSafe(date))
}

export function formatPhone(phone: string): string {
  if (!phone) return ''
  const c = phone.replace(/\D/g, '')
  // Handle +1 prefix
  const digits = c.length === 11 && c.startsWith('1') ? c.slice(1) : c
  if (digits.length === 10) return `${digits.slice(0,3)}-${digits.slice(3,6)}-${digits.slice(6)}`
  return phone
}

// Legacy export, kept for any callers that still import it.
export function generateInvoiceNumber(): string {
  return generateDocNumber('invoice', [])
}

/**
 * Generates the next sequential document number for a given year/type.
 *   Invoices: LPBC INV-2026-0001
 *   Quotes:   LPBC EST-2026-0001
 * Numbering resets each calendar year and is computed by scanning the
 * existing list for the highest used sequence in the current year.
 */
export function generateDocNumber(type: 'invoice' | 'quote', existing: { invoice_number?: string }[] = []): string {
  const prefix = type === 'quote' ? 'LPBC EST' : 'LPBC INV'
  const year = new Date().getFullYear().toString()
  const re = new RegExp(`^${prefix}-${year}-(\\d+)$`)
  let max = 0
  for (const doc of existing) {
    const m = doc.invoice_number?.match(re)
    if (m) {
      const n = parseInt(m[1], 10)
      if (n > max) max = n
    }
  }
  const next = String(max + 1).padStart(4, '0')
  return `${prefix}-${year}-${next}`
}

export function basicGrammarFix(text: string): string {
  if (!text) return text
  let fixed = text.replace(/(^\s*\w|[.!?]\s+\w)/g, (c) => c.toUpperCase())
  if (fixed && !fixed.match(/[.!?]$/)) fixed += '.'
  return fixed
}
