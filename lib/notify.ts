import { createServerClient } from '@/lib/supabase'
import { sendSMS } from '@/lib/twilio'
import { BUSINESS } from '@/lib/business'

// One place that sends a customer text or email AND records it in message_log
// (so you can see what went out, when, and to whom). Server-side only.

export function toE164(raw: string): string {
  const d = String(raw || '').replace(/\D/g, '')
  if (d.length === 10) return `+1${d}`
  if (d.length === 11 && d.startsWith('1')) return `+${d}`
  return d ? `+${d}` : ''
}

type Meta = { kind: string; invoice_id?: string | null }

async function log(row: Record<string, any>) {
  try { await createServerClient().from('message_log').insert(row) } catch { /* table not migrated yet — sending still works */ }
}

export async function textCustomer(to: string, body: string, meta: Meta): Promise<{ ok: boolean; error?: string }> {
  const num = toE164(to)
  if (!num) return { ok: false, error: 'No valid phone number' }
  if (!process.env.TWILIO_ACCOUNT_SID || !process.env.TWILIO_AUTH_TOKEN || !process.env.TWILIO_PHONE_NUMBER) {
    return { ok: false, error: 'Texting isn’t set up (Twilio keys missing)' }
  }
  try {
    await sendSMS(num, body)
    await log({ kind: meta.kind, channel: 'sms', to_contact: num, invoice_id: meta.invoice_id || null, body, status: 'sent' })
    return { ok: true }
  } catch (e: any) {
    await log({ kind: meta.kind, channel: 'sms', to_contact: num, invoice_id: meta.invoice_id || null, body, status: 'failed: ' + (e?.message || 'error') })
    return { ok: false, error: e?.message || 'Text failed' }
  }
}

function fromAddress() {
  const raw = process.env.RESEND_FROM_EMAIL || BUSINESS.email
  const at = raw.lastIndexOf('@')
  return at < 0 ? raw : raw.slice(0, at) + '@' + raw.slice(at + 1).toLowerCase()   // lowercase the domain (Resend is picky)
}

export async function emailCustomer(to: string, subject: string, html: string, meta: Meta): Promise<{ ok: boolean; error?: string }> {
  if (!to) return { ok: false, error: 'No email address' }
  if (!process.env.RESEND_API_KEY) return { ok: false, error: 'Email isn’t set up (Resend key missing)' }
  try {
    const { Resend } = await import('resend')
    const r = await new Resend(process.env.RESEND_API_KEY).emails.send({ from: `${BUSINESS.name} <${fromAddress()}>`, to, subject, html })
    if ((r as any)?.error) throw new Error((r as any).error.message || 'send failed')
    await log({ kind: meta.kind, channel: 'email', to_contact: to, invoice_id: meta.invoice_id || null, body: subject, status: 'sent' })
    return { ok: true }
  } catch (e: any) {
    await log({ kind: meta.kind, channel: 'email', to_contact: to, invoice_id: meta.invoice_id || null, body: subject, status: 'failed: ' + (e?.message || 'error') })
    return { ok: false, error: e?.message || 'Email failed' }
  }
}

// Simple, branded wrapper for plain notification emails.
export function simpleEmail(title: string, paragraphs: string[], button?: { label: string; url: string }) {
  const p = paragraphs.map(t => `<p style="margin:0 0 14px;color:#374151;font-size:15px;line-height:1.6">${t}</p>`).join('')
  const b = button ? `<p style="margin:22px 0"><a href="${button.url}" style="background:${BUSINESS.brand};color:#fff;padding:13px 26px;border-radius:8px;text-decoration:none;font-weight:bold;display:inline-block">${button.label}</a></p>` : ''
  return `<div style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto;padding:24px"><h2 style="color:${BUSINESS.brand};margin:0 0 16px">${title}</h2>${p}${b}<p style="margin:24px 0 0;color:#9ca3af;font-size:13px">${BUSINESS.name} · ${BUSINESS.phone}</p></div>`
}
