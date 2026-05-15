import { NextRequest, NextResponse } from 'next/server'
export const dynamic = 'force-dynamic'
import { createServerClient } from '@/lib/supabase'
import { createCheckoutSession } from '@/lib/stripe'
import { sendInvoiceEmail } from '@/lib/resend'
import { google } from 'googleapis'

// Copy sent email to Gmail Sent folder via Google API
async function copyToGmailSent(invoice: any, paymentUrl: string) {
  if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_REFRESH_TOKEN) {
    console.log('Gmail: skipping — missing credentials')
    return
  }
  try {
    const auth = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET,
    )
    auth.setCredentials({ refresh_token: process.env.GOOGLE_REFRESH_TOKEN })
    const gmail = google.gmail({ version: 'v1', auth })

    const isQuote = invoice.invoice_type === 'quote'
    const label = isQuote ? 'Quote' : 'Invoice'
    // Subject matches the new email format — just "DPG INV-..." no "Invoice" word
    const subject = `DPG ${invoice.invoice_number}${invoice.job_address ? ' ' + invoice.job_address : ''}`

    const fromEmail = process.env.RESEND_FROM_EMAIL || 'Lacey@LaceyNPrice.com'

    const bodyHtml = [
      `<p><strong>${label} #${invoice.invoice_number}</strong> sent to ${invoice.customer_name} (${invoice.customer_email})</p>`,
      `<p>Amount: $${Number(invoice.amount_due).toFixed(2)}</p>`,
      invoice.job_address ? `<p>Job: ${invoice.job_address}${invoice.jobsite_city ? ', ' + invoice.jobsite_city : ''}</p>` : '',
      invoice.service_description ? `<p>Description: ${invoice.service_description}</p>` : '',
      paymentUrl ? `<p><a href="${paymentUrl}">Payment Link</a></p>` : '',
      `<hr/><p style="color:#999;font-size:12px">Sent via L. Price Building Company app · ${new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}</p>`,
    ].filter(Boolean).join('\n')

    // RFC 2822 message — headers then blank line then body
    const message = [
      `From: L. Price Building Company <${fromEmail}>`,
      `To: ${invoice.customer_name} <${invoice.customer_email}>`,
      `Subject: ${subject.trim()}`,
      `Date: ${new Date().toUTCString()}`,
      `MIME-Version: 1.0`,
      `Content-Type: text/html; charset=UTF-8`,
      ``,
      `<html><body>${bodyHtml}</body></html>`,
    ].join('\r\n')

    // Base64url encode
    const encoded = Buffer.from(message, 'utf-8')
      .toString('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '')

    await gmail.users.messages.insert({
      userId: 'me',
      internalDateSource: 'dateHeader',
      requestBody: {
        raw: encoded,
        labelIds: ['SENT'],
      },
    })
    console.log(`Gmail: ✅ inserted ${label} ${invoice.invoice_number} into Sent folder`)
  } catch (e: any) {
    console.error('Gmail copy-to-sent failed:', e?.message || e)
  }
}

export async function POST(req: NextRequest) {
  const supabase = createServerClient()
  const { invoiceId } = await req.json()

  if (!invoiceId) return NextResponse.json({ error: 'Missing invoiceId' }, { status: 400 })

  // Fetch the invoice
  const { data: invoice, error } = await supabase
    .from('invoices')
    .select('*')
    .eq('id', invoiceId)
    .single()

  if (error || !invoice) return NextResponse.json({ error: 'Invoice not found' }, { status: 404 })
  if (!invoice.customer_email) return NextResponse.json({ error: 'Invoice has no customer email' }, { status: 400 })

  // Create Stripe Checkout Session (skip for quotes)
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || process.env.APP_URL || 'http://localhost:3000'
  let paymentUrl = ''
  if (invoice.invoice_type !== 'quote') {
    try {
      const session = await createCheckoutSession({
        invoiceId: invoice.id,
        invoiceNumber: invoice.invoice_number,
        customerName: invoice.customer_name,
        customerEmail: invoice.customer_email,
        amountDue: invoice.amount_due,
        description: invoice.service_description || `Invoice ${invoice.invoice_number}`,
        successUrl: `${appUrl}/invoice/success`,
        cancelUrl: `${appUrl}/invoice/cancelled`,
      })
      paymentUrl = session.url || ''
    } catch (e: any) {
      console.error('Stripe error:', e)
      return NextResponse.json({ error: 'Failed to create payment link: ' + e.message }, { status: 500 })
    }
  }

  // SEND FIRST — DB update second. That way Resend always runs and shows in logs.
  let resendResult: any = null
  let resendError: string | null = null
  try {
    resendResult = await sendInvoiceEmail({
      to: invoice.customer_email,
      customerName: invoice.customer_name,
      invoiceNumber: invoice.invoice_number,
      invoiceType: invoice.invoice_type || 'invoice',
      amountDue: invoice.amount_due,
      dueDate: invoice.due_date,
      serviceDescription: invoice.service_description,
      jobAddress: invoice.job_address,
      jobsiteCity: invoice.jobsite_city,
      companyName: invoice.company_name,
      paymentUrl,
      isPaid: invoice.invoice_status === 'paid',
      cc: invoice.cc_email,
    })
    // Resend's SDK returns { data, error } — error field is set on failure
    if (resendResult?.error) {
      resendError = `${resendResult.error.name || 'Error'}: ${resendResult.error.message || JSON.stringify(resendResult.error)}`
      console.error('Resend returned error:', resendResult.error)
    } else {
      console.log('Resend ✅ sent', resendResult?.data?.id)
    }
  } catch (e: any) {
    resendError = e?.message || String(e)
    console.error('Resend threw exception:', e)
  }

  // Now update invoice — preserve paid status if already paid
  const now = new Date().toISOString()
  const updates: Record<string, any> = {
    last_sent_at: now,
  }
  // Only set stripe link if we created one
  if (paymentUrl) updates.stripe_payment_link = paymentUrl
  // First send: record sent_at
  if (!invoice.sent_at) updates.sent_at = now
  // Only change status to 'sent' if it's currently draft (don't overwrite paid/approved)
  if (invoice.invoice_status === 'draft') {
    updates.invoice_status = 'sent'
  }

  let dbError: string | null = null
  const { error: updateErr } = await supabase.from('invoices').update(updates).eq('id', invoiceId)
  if (updateErr) {
    dbError = updateErr.message
    console.error('Failed to update invoice status:', updateErr)
    // Don't 500 — Resend may have succeeded already, return diagnostic info instead
  }

  // Copy to Gmail Sent folder (fire-and-forget)
  copyToGmailSent(invoice, paymentUrl).catch(() => {})

  // Auto-upsert contact: update existing or create new
  try {
    const nameParts = invoice.customer_name.trim().split(/\s+/)
    const firstName = nameParts[0] || ''
    const lastName = nameParts.slice(1).join(' ') || ''
    if (firstName) {
      const { data: existing } = await supabase
        .from('contacts')
        .select('id')
        .eq('email', invoice.customer_email)
        .limit(1)
      const contactData: Record<string, any> = {
        first_name: firstName,
        last_name: lastName,
        email: invoice.customer_email,
        phone: invoice.customer_phone || null,
        address: invoice.customer_address || invoice.job_address || null,
        company_name: invoice.company_name || null,
        city: invoice.jobsite_city || null,
        source: 'invoice',
      }
      if (existing && existing.length > 0) {
        await supabase.from('contacts').update(contactData).eq('id', existing[0].id)
      } else {
        contactData.notes = `Auto-saved from ${invoice.invoice_type === 'quote' ? 'quote' : 'invoice'} ${invoice.invoice_number}`
        await supabase.from('contacts').insert(contactData)
      }
    }
  } catch (e) { console.error('Auto-upsert contact failed:', e) }

  return NextResponse.json({
    success: !resendError,
    paymentUrl,
    resendId: resendResult?.data?.id || null,
    resendError,
    dbError,
  })
}
