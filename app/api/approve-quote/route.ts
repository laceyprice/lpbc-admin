import { NextRequest, NextResponse } from 'next/server'
export const dynamic = 'force-dynamic'
import { createServerClient } from '@/lib/supabase'

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const id = searchParams.get('id')

  if (!id) {
    return new NextResponse(page('Missing quote ID', false), { headers: { 'Content-Type': 'text/html' } })
  }

  const supabase = createServerClient()
  const { data: invoice, error } = await supabase
    .from('invoices')
    .select('*')
    .eq('invoice_number', id)
    .eq('invoice_type', 'quote')
    .single()

  if (error || !invoice) {
    return new NextResponse(page('Quote not found', false), { headers: { 'Content-Type': 'text/html' } })
  }

  if (invoice.invoice_status === 'approved' || invoice.invoice_status === 'paid') {
    return new NextResponse(page(`Quote ${invoice.invoice_number} has already been approved. Thank you!`, true), { headers: { 'Content-Type': 'text/html' } })
  }

  // Update status to approved
  await supabase
    .from('invoices')
    .update({ invoice_status: 'approved' })
    .eq('id', invoice.id)

  return new NextResponse(
    page(`Quote ${invoice.invoice_number} has been approved! We'll be in touch to get you scheduled. Thank you for choosing L. Price Building Company!`, true),
    { headers: { 'Content-Type': 'text/html' } }
  )
}

function page(message: string, success: boolean) {
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1"/>
  <title>${success ? 'Quote Approved' : 'Error'} — L. Price Building Company</title>
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
    <h1>${success ? 'Quote Approved!' : 'Oops'}</h1>
    <p>${message}</p>
    <div class="footer">
      <p>L. Price Building Company &middot; Lacey Price</p>
      <p><a href="tel:8505989128">850-598-9128</a> &middot; <a href="mailto:Lacey@LaceyNPrice.com">Lacey@LaceyNPrice.com</a></p>
    </div>
  </div>
</body>
</html>`
}
