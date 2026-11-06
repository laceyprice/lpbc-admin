import { NextRequest, NextResponse } from 'next/server'
export const dynamic = 'force-dynamic'
import { createServerClient } from '@/lib/supabase'
import { BUSINESS } from '@/lib/business'
import { BUCKETS, balance, bucketFor, daysPastDue, tone } from '@/lib/collections'
import { emailCustomer, simpleEmail, textCustomer } from '@/lib/notify'

// Unpaid invoices ("accounts receivable") and one-click payment reminders.
//
// GET  /api/collections                           → { items (oldest first), buckets: [{key,label,total,count}], total }
// POST /api/collections { invoice_ids, channel: 'email'|'sms'|'both', force? }
//      → sends a reminder (friendly → firm → final by how late it is). Skips anything reminded in the
//        last 3 days unless force. Records last_reminder_at / reminder_count.

const money = (n: number) => n.toLocaleString('en-US', { style: 'currency', currency: 'USD' })
const APP = () => process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'

export async function GET() {
  const { data, error } = await createServerClient().from('invoices').select('*').neq('invoice_type', 'quote').not('invoice_status', 'in', '(paid,cancelled,draft)')
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  const items = (data || []).map((i: any) => {
    const bal = balance(i), days = daysPastDue(i)
    return {
      id: i.id, invoice_number: i.invoice_number, customer_name: i.customer_name, customer_email: i.customer_email, customer_phone: i.customer_phone,
      job_address: i.job_address, due_date: i.due_date, balance: bal, days_past_due: days, bucket: bucketFor(days),
      last_reminder_at: i.last_reminder_at || null, reminder_count: i.reminder_count || 0,
    }
  }).filter(i => i.balance > 0).sort((a, b) => b.days_past_due - a.days_past_due)
  const buckets = BUCKETS.map(b => { const rows = items.filter(i => i.bucket === b.key); return { ...b, count: rows.length, total: rows.reduce((s, r) => s + r.balance, 0) } })
  return NextResponse.json({ items, buckets, total: items.reduce((s, i) => s + i.balance, 0) })
}

export async function POST(req: NextRequest) {
  const { invoice_ids, channel = 'email', force = false } = await req.json().catch(() => ({}))
  if (!Array.isArray(invoice_ids) || invoice_ids.length === 0) return NextResponse.json({ error: 'Pick at least one invoice' }, { status: 400 })
  if (invoice_ids.length > 100) return NextResponse.json({ error: 'Up to 100 at a time' }, { status: 400 })
  const supabase = createServerClient()
  const { data: invs, error } = await supabase.from('invoices').select('*').in('id', invoice_ids)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const results: { invoice_number: string; sent: string[]; skipped?: string; errors?: string[] }[] = []
  for (const inv of invs || []) {
    const row: { invoice_number: string; sent: string[]; skipped?: string; errors?: string[] } = { invoice_number: inv.invoice_number, sent: [] }
    const bal = balance(inv)
    if (bal <= 0) { row.skipped = 'nothing owed'; results.push(row); continue }
    if (!force && inv.last_reminder_at && Date.now() - new Date(inv.last_reminder_at).getTime() < 3 * 86400000) { row.skipped = 'reminded in the last 3 days'; results.push(row); continue }

    const days = daysPastDue(inv), t = tone(days)
    const payUrl = inv.stripe_payment_link || `${APP()}/api/invoice-pdf?id=${encodeURIComponent(inv.invoice_number)}${inv.public_token ? `&t=${encodeURIComponent(inv.public_token)}` : ''}`
    const name = String(inv.customer_name || 'there').split(' ')[0]
    const late = days > 0 ? `${days} day${days === 1 ? '' : 's'} past due` : 'coming due'
    const lead = t === 'friendly'
      ? `Just a friendly reminder that invoice ${inv.invoice_number} (${money(bal)}) is ${late}. If you've already sent payment, thank you — please disregard this.`
      : t === 'firm'
        ? `Invoice ${inv.invoice_number} for ${money(bal)} is now ${late}. Please arrange payment as soon as you can, or call us if there's a problem we can help with.`
        : `Invoice ${inv.invoice_number} for ${money(bal)} is seriously overdue (${late}). Please pay today or contact us right away so we can avoid further collection steps.`

    const errs: string[] = []
    if ((channel === 'email' || channel === 'both') && inv.customer_email) {
      const r = await emailCustomer(inv.customer_email, `${t === 'final' ? 'FINAL NOTICE — ' : ''}Invoice ${inv.invoice_number} — ${money(bal)}`,
        simpleEmail(`Payment reminder`, [`Hi ${name},`, lead, 'Thank you for your business!'], { label: 'View & pay invoice', url: payUrl }), { kind: 'collection', invoice_id: inv.id })
      r.ok ? row.sent.push('email') : errs.push('email: ' + r.error)
    } else if (channel === 'email' || channel === 'both') errs.push('no email on file')
    if ((channel === 'sms' || channel === 'both') && inv.customer_phone) {
      const r = await textCustomer(inv.customer_phone, `Hi ${name}, ${BUSINESS.name}: ${lead} ${payUrl}  Questions? ${BUSINESS.phone}`, { kind: 'collection', invoice_id: inv.id })
      r.ok ? row.sent.push('text') : errs.push('text: ' + r.error)
    } else if (channel === 'sms' || channel === 'both') errs.push('no phone on file')

    if (row.sent.length) await supabase.from('invoices').update({ last_reminder_at: new Date().toISOString(), reminder_count: (inv.reminder_count || 0) + 1 }).eq('id', inv.id)
    if (errs.length) row.errors = errs
    results.push(row)
  }
  return NextResponse.json({ results, sent: results.filter(r => r.sent.length).length })
}
