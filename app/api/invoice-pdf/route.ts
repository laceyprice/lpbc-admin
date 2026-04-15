import { NextRequest, NextResponse } from 'next/server'
export const dynamic = 'force-dynamic'
import { createServerClient } from '@/lib/supabase'

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
    .header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 40px; border-bottom: 3px solid #185FA5; padding-bottom: 20px; }
    .company-info { text-align: right; color: #666; font-size: 14px; }
    .company-info strong { color: #185FA5; font-size: 18px; display: block; margin-bottom: 4px; }
    .invoice-title { font-size: 32px; font-weight: bold; color: #185FA5; margin: 0; }
    .invoice-number { color: #666; font-size: 16px; margin-top: 4px; }
    .details-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 30px; margin-bottom: 30px; }
    .detail-box h3 { font-size: 11px; text-transform: uppercase; letter-spacing: 1px; color: #999; margin: 0 0 8px; }
    .detail-box p { margin: 2px 0; font-size: 14px; }
    .line-items { width: 100%; border-collapse: collapse; margin-bottom: 30px; }
    .line-items th { background: #185FA5; color: white; padding: 12px 16px; text-align: left; font-size: 13px; text-transform: uppercase; letter-spacing: 0.5px; }
    .line-items td { padding: 12px 16px; border-bottom: 1px solid #eee; font-size: 14px; }
    .line-items tr:nth-child(even) { background: #f8fafc; }
    .total-row { background: #185FA5 !important; }
    .total-row td { color: white; font-weight: bold; font-size: 18px; padding: 14px 16px; }
    .footer { margin-top: 40px; padding-top: 20px; border-top: 1px solid #eee; text-align: center; color: #999; font-size: 12px; }
    .print-btn { display: inline-block; background: #185FA5; color: white; padding: 12px 32px; border-radius: 8px; text-decoration: none; font-weight: bold; font-size: 16px; cursor: pointer; border: none; margin-bottom: 30px; }
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
    <div class="company-info">
      <strong>The Gasologist</strong>
      Daniel Price<br/>
      850-598-3336<br/>
      office@thegasologist.com
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
        <td>${invoice.service_description || invoice.service_type || 'Service'}</td>
        <td style="text-align:right">$${Number(invoice.amount_due).toFixed(2)}</td>
      </tr>
      <tr class="total-row">
        <td>Total Due</td>
        <td style="text-align:right">$${Number(invoice.amount_due).toFixed(2)}</td>
      </tr>
    </tbody>
  </table>

  ${invoice.notes ? `<div style="background:#f8fafc;padding:16px;border-radius:8px;margin-bottom:20px"><p style="margin:0 0 4px;font-weight:bold;color:#185FA5;font-size:13px">Notes</p><p style="margin:0;font-size:14px;color:#666">${invoice.notes}</p></div>` : ''}

  <div class="footer">
    <p>Thank you for your business!</p>
    <p>The Gasologist &middot; Daniel Price &middot; 850-598-3336 &middot; office@thegasologist.com</p>
  </div>
</body>
</html>`

  return new NextResponse(html, {
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
    },
  })
}
