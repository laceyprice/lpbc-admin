import { NextRequest, NextResponse } from 'next/server'
export const dynamic = 'force-dynamic'
import { createServerClient } from '@/lib/supabase'
import { BUSINESS } from '@/lib/business'

// Public unsubscribe link from Leads Generator marketing emails.
//   GET  ?t=<token> → confirmation page with a button (so email link-scanners can't unsubscribe people by accident)
//   POST ?t=<token> → unsubscribes (the button, and Gmail/Outlook "one-click unsubscribe" via List-Unsubscribe-Post)

const page = (title: string, body: string) => new NextResponse(
  `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title></head>
<body style="font-family:Arial,sans-serif;background:#f3f4f6;margin:0;padding:40px 16px"><div style="max-width:460px;margin:0 auto;background:#fff;border-radius:12px;padding:28px;text-align:center">
<h2 style="color:${BUSINESS.brand};margin:0 0 12px">${title}</h2>${body}<p style="color:#9ca3af;font-size:12px;margin-top:24px">${BUSINESS.name} · ${BUSINESS.phone}</p></div></body></html>`,
  { headers: { 'Content-Type': 'text/html; charset=utf-8' } })

const esc = (s: string) => s.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!))

export async function GET(req: NextRequest) {
  const t = req.nextUrl.searchParams.get('t') || ''
  if (!t || t === 'sample') return page('Unsubscribe', '<p style="color:#374151">This is a sample link.</p>')
  return page('Unsubscribe from our emails?', `<p style="color:#374151">Click below and ${esc(BUSINESS.name)} won't send you any more marketing emails.</p>
<form method="post" action="/api/leads-unsubscribe?t=${encodeURIComponent(t)}"><button type="submit" style="background:${BUSINESS.brand};color:#fff;border:0;padding:12px 24px;border-radius:8px;font-weight:bold;font-size:15px;cursor:pointer">Unsubscribe</button></form>`)
}

export async function POST(req: NextRequest) {
  const t = req.nextUrl.searchParams.get('t') || ''
  if (t && t !== 'sample') {
    const sb = createServerClient()
    const { data } = await sb.from('contacts').update({ email_opt_out: true, email_opt_out_at: new Date().toISOString() }).eq('unsubscribe_token', t).select('id')
    for (const c of data || []) await sb.from('lead_emails').update({ status: 'cancelled', error: 'unsubscribed' }).eq('contact_id', c.id).eq('status', 'queued')
  }
  // Mail clients' one-click unsubscribe only needs a 200; a browser gets the thank-you page.
  return page('You’re unsubscribed', '<p style="color:#374151">You won’t receive any more marketing emails from us. Sorry to see you go!</p>')
}
