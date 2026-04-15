import { NextRequest, NextResponse } from 'next/server'
export const dynamic = 'force-dynamic'
import { createServerClient } from '@/lib/supabase'
import { createCheckoutSession } from '@/lib/stripe'
import { sendInvoiceEmail } from '@/lib/resend'

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

  // Create Stripe Checkout Session
  const appUrl = process.env.APP_URL || 'http://localhost:3000'
  let paymentUrl = ''
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

  // Update invoice with payment link and status
  await supabase.from('invoices').update({
    stripe_payment_link: paymentUrl,
    invoice_status: 'sent',
  }).eq('id', invoiceId)

  // Send invoice email via Resend
  try {
    await sendInvoiceEmail({
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
    })
  } catch (e) {
    console.error('Resend error:', e)
    // Don't fail the whole request if email fails — payment link is still created
  }

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

  return NextResponse.json({ success: true, paymentUrl })
}
