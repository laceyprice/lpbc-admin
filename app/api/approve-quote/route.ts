import { NextRequest, NextResponse } from 'next/server'
export const dynamic = 'force-dynamic'
import { createServerClient } from '@/lib/supabase'

import { canViewPublic } from '@/lib/public-link'

const html = (body: string) => new NextResponse(body, { headers: { 'Content-Type': 'text/html' } })
const esc = (s: string) => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string))

async function findQuote(id: string, t: string) {
  const supabase = createServerClient()
  const { data: invoice } = await supabase.from('invoices').select('*').eq('invoice_number', id).eq('invoice_type', 'quote').single()
  // Same answer for "no such quote" and "wrong link" so numbers can't be probed.
  if (!invoice || !canViewPublic(invoice, t)) return { supabase, invoice: null as any }
  return { supabase, invoice }
}

// GET only SHOWS the quote and asks for a click. Email security scanners and link-preview bots
// open every link in a message, so a GET must never approve anything by itself.
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const id = searchParams.get('id'); const t = searchParams.get('t') || ''
  if (!id) return html(page('Missing quote ID', false))
  const { invoice } = await findQuote(id, t)
  if (!invoice) return html(page('Quote not found', false))
  if (invoice.invoice_status === 'approved' || invoice.invoice_status === 'paid') {
    return html(page(`Quote ${esc(invoice.invoice_number)} has already been approved. Thank you!`, true))
  }
  const amount = Number(invoice.amount_due || 0).toLocaleString('en-US', { style: 'currency', currency: 'USD' })
  return html(page(
    `Quote ${esc(invoice.invoice_number)} &middot; ${esc(amount)}<form method="POST" action="/api/approve-quote" style="margin-top:20px"><input type="hidden" name="id" value="${esc(id)}"/><input type="hidden" name="t" value="${esc(t)}"/><button type="submit" style="background:#16a34a;color:#fff;border:0;border-radius:10px;padding:14px 28px;font-size:16px;font-weight:bold;cursor:pointer">Approve this quote</button></form>`,
    true, 'Approve this quote?', 'Approve Quote'))
}

export async function POST(req: NextRequest) {
  let id = '', t = ''
  try { const f = await req.formData(); id = String(f.get('id') || ''); t = String(f.get('t') || '') } catch {}
  if (!id) return html(page('Missing quote ID', false))
  const { supabase, invoice } = await findQuote(id, t)
  if (!invoice) return html(page('Quote not found', false))
  if (invoice.invoice_status === 'approved' || invoice.invoice_status === 'paid') {
    return html(page(`Quote ${esc(invoice.invoice_number)} has already been approved. Thank you!`, true))
  }
  await supabase.from('invoices').update({ invoice_status: 'approved' }).eq('id', invoice.id)
  return html(page(`Quote ${esc(invoice.invoice_number)} has been approved! We'll be in touch to get you scheduled. Thank you for choosing L. Price Building Company!`, true))
}

function page(message: string, success: boolean, heading?: string, title?: string) {
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1"/>
  <title>${title || (success ? 'Quote Approved' : 'Error')} — L. Price Building Company</title>
  <style>
    body { font-family: Arial, sans-serif; display: flex; align-items: center; justify-content: center; min-height: 100vh; margin: 0; background: #faf7f2; }
    .card { background: white; border-radius: 16px; padding: 48px; text-align: center; max-width: 500px; box-shadow: 0 4px 24px rgba(0,0,0,0.08); }
    .icon { font-size: 48px; margin-bottom: 16px; }
    h1 { color: ${success ? '#2f5a5e' : '#dc2626'}; font-size: 24px; margin: 0 0 12px; }
    p { color: #4b5563; font-size: 16px; line-height: 1.6; margin: 0; }
    .footer { margin-top: 24px; font-size: 13px; color: #9ca3af; }
    .footer a { color: #2f5a5e; text-decoration: none; }
  </style>
</head>
<body>
  <div class="card">
    <div class="icon">${success ? '&#10004;' : '&#9888;'}</div>
    <h1>${heading || (success ? 'Quote Approved!' : 'Oops')}</h1>
    <p>${message}</p>
    <div class="footer">
      <p>L. Price Building Company &middot; Lacey Price</p>
      <p><a href="tel:8505989128">850-598-9128</a> &middot; <a href="mailto:Lacey@LaceyNPrice.com">Lacey@LaceyNPrice.com</a></p>
    </div>
  </div>
</body>
</html>`
}
