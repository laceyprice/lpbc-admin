import { NextRequest, NextResponse } from 'next/server'
export const dynamic = 'force-dynamic'
import { createServerClient } from '@/lib/supabase'

// Handle CORS preflight
export async function OPTIONS() {
  return new NextResponse(null, {
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    },
  })
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const invoiceNumber = searchParams.get('id')

  if (!invoiceNumber) {
    return NextResponse.json({ error: 'Missing invoice number' }, { status: 400 })
  }

  const supabase = createServerClient()
  const { data: invoice, error } = await supabase
    .from('invoices')
    .select('*')
    .eq('invoice_number', invoiceNumber)
    .single()

  if (error || !invoice) {
    return NextResponse.json({ error: 'Invoice not found' }, { status: 404 })
  }

  const isQuote = invoice.invoice_type === 'quote'
  const isPaid = invoice.invoice_status === 'paid'
  const label = isQuote ? 'Quote' : 'Invoice'
  const fullAddress = [invoice.job_address, invoice.jobsite_city].filter(Boolean).join(', ')
  const formattedDate = invoice.created_at
    ? new Date(invoice.created_at).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })
    : ''
  const dueDate = invoice.due_date
    ? new Date(invoice.due_date).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })
    : ''

  const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8"/>
  <title>${label} ${invoice.invoice_number}</title>
  <style>
    @media print {
      body { margin: 0; }
      .no-print { display: none !important; }
    }
    body { font-family: Arial, sans-serif; max-width: 800px; margin: 0 auto; padding: 40px; color: #1a1a1a; }
    .header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 40px; border-bottom: 3px solid #b8895a; padding-bottom: 20px; }
    .company-info { text-align: right; color: #666; font-size: 14px; }
    .company-info strong { color: #b8895a; font-size: 18px; display: block; margin-bottom: 4px; }
    .invoice-title { font-size: 32px; font-weight: bold; color: #b8895a; margin: 0; }
    .invoice-number { color: #666; font-size: 16px; margin-top: 4px; }
    .details-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 30px; margin-bottom: 30px; }
    .detail-box h3 { font-size: 11px; text-transform: uppercase; letter-spacing: 1px; color: #999; margin: 0 0 8px; }
    .detail-box p { margin: 2px 0; font-size: 14px; }
    .line-items { width: 100%; border-collapse: collapse; margin-bottom: 30px; }
    .line-items th { background: #b8895a; color: white; padding: 12px 16px; text-align: left; font-size: 13px; text-transform: uppercase; letter-spacing: 0.5px; }
    .line-items td { padding: 12px 16px; border-bottom: 1px solid #eee; font-size: 14px; }
    .line-items tr:nth-child(even) { background: #f8fafc; }
    .total-row { background: #b8895a !important; }
    .total-row td { color: white; font-weight: bold; font-size: 18px; padding: 14px 16px; }
    .paid-row { background: #16a34a !important; }
    .paid-row td { color: white; font-weight: bold; font-size: 18px; padding: 14px 16px; }
    .paid-stamp { display:inline-block; border: 4px solid #16a34a; color: #16a34a; font-size: 32px; font-weight: 900; letter-spacing: 4px; padding: 6px 20px; border-radius: 6px; transform: rotate(-8deg); opacity: 0.85; margin: 10px 0; }
    .footer { margin-top: 40px; padding-top: 20px; border-top: 1px solid #eee; text-align: center; color: #999; font-size: 12px; }
    .print-btn { display: inline-block; background: #b8895a; color: white; padding: 12px 32px; border-radius: 8px; text-decoration: none; font-weight: bold; font-size: 16px; cursor: pointer; border: none; margin-bottom: 30px; }
    .print-btn:hover { background: #134a80; }
  </style>
</head>
<body>
  <div class="no-print" style="text-align:center;margin-bottom:20px">
    <button class="print-btn" onclick="window.print()">Print / Save as PDF</button>
  </div>

  <div class="header">
    <div>
      <h1 class="invoice-title">${label}</h1>
      <p class="invoice-number">#${invoice.invoice_number}</p>
    </div>
    <div style="display:flex;align-items:center;gap:16px">
      <div class="company-info">
        <strong>L. Price Building Company</strong>
        Lacey Price<br/>
        850-598-9128<br/>
        Lacey@LaceyNPrice.com
      </div>
      <img src="https://login.laceynprice.com/logo.png" alt="L. Price Building Company" style="height:80px;width:auto;object-fit:contain"/>
    </div>
  </div>

  <div class="details-grid">
    <div class="detail-box">
      <h3>Bill To</h3>
      <p><strong>${invoice.customer_name || ''}</strong></p>
      ${invoice.company_name ? `<p>${invoice.company_name}</p>` : ''}
      ${invoice.customer_email ? `<p>${invoice.customer_email}</p>` : ''}
      ${invoice.customer_phone ? `<p>${invoice.customer_phone}</p>` : ''}
      ${invoice.customer_address ? `<p>${invoice.customer_address}</p>` : ''}
    </div>
    <div class="detail-box">
      <h3>${label} Details</h3>
      <p><strong>${label} #:</strong> ${invoice.invoice_number}</p>
      ${formattedDate ? `<p><strong>Date:</strong> ${formattedDate}</p>` : ''}
      ${dueDate ? `<p><strong>Due Date:</strong> ${dueDate}</p>` : ''}
      ${invoice.job_address ? `<p><strong>Job Address:</strong> ${invoice.job_address}</p>` : ''}
      ${invoice.jobsite_city ? `<p style="padding-left:100px">${invoice.jobsite_city}</p>` : ''}
    </div>
  </div>

  <table class="line-items">
    <thead>
      <tr>
        <th>Description</th>
        <th style="text-align:right">Amount</th>
      </tr>
    </thead>
    <tbody>
      <tr>
        <td colspan="2">${invoice.service_description || invoice.service_type || 'Service'}</td>
      </tr>
      ${isPaid ? `
      <tr class="paid-row">
        <td>Amount Paid</td>
        <td style="text-align:right">$${Number(invoice.amount_due).toFixed(2)} &#10003;</td>
      </tr>` : `
      <tr class="total-row">
        <td>Total Due</td>
        <td style="text-align:right">$${Number(invoice.amount_due).toFixed(2)}</td>
      </tr>`}
    </tbody>
  </table>

  ${isPaid ? `
  <div style="text-align:center;margin:20px 0 10px">
    <span class="paid-stamp">PAID</span>
  </div>
  <div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px;padding:14px;margin-bottom:20px;text-align:center">
    <p style="margin:0;font-weight:bold;color:#15803d;font-size:15px">&#10003; Payment Received — Thank You!</p>
    ${invoice.paid_at ? `<p style="margin:4px 0 0;font-size:12px;color:#166534">Paid ${new Date(invoice.paid_at).toLocaleDateString('en-US', { year:'numeric', month:'long', day:'numeric' })}${invoice.payment_type ? ' via ' + invoice.payment_type : ''}</p>` : ''}
  </div>
  ` : ''}

  ${invoice.notes ? `<div style="background:#f8fafc;padding:16px;border-radius:8px;margin-bottom:20px"><p style="margin:0 0 4px;font-weight:bold;color:#b8895a;font-size:13px">Notes</p><p style="margin:0;font-size:14px;color:#666">${invoice.notes}</p></div>` : ''}

  ${!isPaid ? `
  <div style="background:#f8fafc;padding:16px;border-radius:8px;margin-bottom:20px;border:1px solid #e2e8f0">
    <p style="margin:0 0 8px;font-weight:bold;color:#b8895a;font-size:13px">Payment Options</p>
    <table style="width:100%;font-size:13px;color:#374151">
      <tr><td style="padding:3px 0"><strong>Cash</strong> — Preferred</td></tr>
      <tr><td style="padding:3px 0"><strong>Zelle</strong> — Lacey@LaceyNPrice.com</td></tr>
      <tr><td style="padding:3px 0"><strong>Venmo</strong> — @laceynprice</td></tr>
      <tr><td style="padding:3px 0"><strong>PayPal</strong> — Lacey@LaceyNPrice.com (Friends &amp; Family)</td></tr>
      <tr><td style="padding:3px 0"><strong>Check</strong> — 4231 Country Breeze Lane, Crestview FL 32539</td></tr>
    </table>
    <p style="margin:8px 0 0;font-size:11px;color:#6b7280;font-style:italic">Please include invoice #${invoice.invoice_number} in the memo/notes.</p>
  </div>
  ` : ''}

  <div class="footer">
    <p>Thank you for your business!</p>
    <p>L. Price Building Company &middot; 850-598-9128 &middot; Lacey@LaceyNPrice.com</p>
  </div>
</body>
</html>`

  return new NextResponse(html, {
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET',
      'Content-Security-Policy': "frame-ancestors *; default-src 'self' 'unsafe-inline'; img-src * data:; style-src 'unsafe-inline'",
      'Cache-Control': 'no-cache',
    },
  })
}
