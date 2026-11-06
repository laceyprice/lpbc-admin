import { NextRequest, NextResponse } from 'next/server'
export const dynamic = 'force-dynamic'
import { createServerClient } from '@/lib/supabase'
import { BUSINESS } from '@/lib/business'
import { getSettings } from '@/lib/settings'
import { emailCustomer, simpleEmail, textCustomer } from '@/lib/notify'

// One-tap customer messages, sent only when staff clicks the button.
//
// POST /api/notify { kind: 'otw', phone, name, eta_minutes? }   → "I'm on my way" text
// POST /api/notify { kind: 'review', invoice_id }                → asks for a Google review (text, else email)
export async function POST(req: NextRequest) {
  const b = await req.json().catch(() => ({}))

  if (b.kind === 'otw') {
    if (!b.phone) return NextResponse.json({ error: 'This appointment has no phone number' }, { status: 400 })
    const first = String(b.name || '').split(' ')[0]
    const eta = Number(b.eta_minutes)
    const body = `Hi${first ? ' ' + first : ''}, it's ${BUSINESS.owner} with ${BUSINESS.name} — I'm on my way${eta > 0 ? `, about ${eta} minutes out` : ''}. See you soon! Questions? ${BUSINESS.phone}`
    const r = await textCustomer(b.phone, body, { kind: 'otw' })
    return r.ok ? NextResponse.json({ ok: true }) : NextResponse.json({ error: r.error }, { status: 502 })
  }

  if (b.kind === 'review') {
    const settings = await getSettings()
    if (!settings.review_url) return NextResponse.json({ error: 'Add your Google review link first (Settings → Business Settings).' }, { status: 400 })
    const { data: inv } = await createServerClient().from('invoices').select('id,invoice_number,customer_name,customer_phone,customer_email').eq('id', b.invoice_id).single()
    if (!inv) return NextResponse.json({ error: 'Invoice not found' }, { status: 404 })
    const first = String(inv.customer_name || '').split(' ')[0]
    const sms = `Hi${first ? ' ' + first : ''}, thank you for choosing ${BUSINESS.name}! If we did a good job, a quick review really helps a small business like ours: ${settings.review_url}`
    if (inv.customer_phone) {
      const r = await textCustomer(inv.customer_phone, sms, { kind: 'review', invoice_id: inv.id })
      if (r.ok) return NextResponse.json({ ok: true, via: 'text' })
      if (!inv.customer_email) return NextResponse.json({ error: r.error }, { status: 502 })
    }
    if (inv.customer_email) {
      const r = await emailCustomer(inv.customer_email, `How did we do, ${first || 'friend'}?`,
        simpleEmail('Thank you!', [`Hi${first ? ' ' + first : ''},`, `Thank you for choosing ${BUSINESS.name}. If we did a good job, a quick review really helps a small business like ours.`], { label: 'Leave a review', url: settings.review_url }), { kind: 'review', invoice_id: inv.id })
      return r.ok ? NextResponse.json({ ok: true, via: 'email' }) : NextResponse.json({ error: r.error }, { status: 502 })
    }
    return NextResponse.json({ error: 'This customer has no phone or email on the invoice' }, { status: 400 })
  }
  return NextResponse.json({ error: 'Unknown kind' }, { status: 400 })
}
