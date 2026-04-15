import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount)
}

export function formatDate(date: string | Date): string {
  return new Intl.DateTimeFormat('en-US', { year: 'numeric', month: 'long', day: 'numeric' }).format(new Date(date))
}

export function formatDateShort(date: string | Date): string {
  return new Intl.DateTimeFormat('en-US', { year: 'numeric', month: 'short', day: 'numeric' }).format(new Date(date))
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
 *   Invoices: DPG INV-2026-0001
 *   Quotes:   DPG EST-2026-0001
 * Numbering resets each calendar year and is computed by scanning the
 * existing list for the highest used sequence in the current year.
 */
export function generateDocNumber(type: 'invoice' | 'quote', existing: { invoice_number?: string }[] = []): string {
  const prefix = type === 'quote' ? 'DPG EST' : 'DPG INV'
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
