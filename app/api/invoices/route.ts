import { NextRequest, NextResponse } from 'next/server'
export const dynamic = 'force-dynamic'
import { createServerClient } from '@/lib/supabase'
import { basicGrammarFix, generateInvoiceNumber } from '@/lib/utils'

export async function GET(req: NextRequest) {
  const supabase = createServerClient()
  const status = req.nextUrl.searchParams.get('status')
  const type = req.nextUrl.searchParams.get('type')
  let query = supabase.from('invoices').select('*').order('created_at', { ascending: false })
  if (status) query = query.eq('invoice_status', status)
  if (type) query = query.eq('invoice_type', type)
  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function POST(req: NextRequest) {
  const supabase = createServerClient()
  const body = await req.json()

  // Auto grammar fix on service description
  const description = body.service_description ? basicGrammarFix(body.service_description) : null

  // Generate invoice number
  const invoice_number = body.invoice_number || generateInvoiceNumber()

  const { data, error } = await supabase.from('invoices').insert({
    invoice_number,
    invoice_type: body.invoice_type || body.type || 'invoice',
    invoice_status: body.invoice_status || 'draft',
    customer_name: body.customer_name,
    customer_email: body.customer_email || null,
    customer_phone: body.customer_phone || null,
    customer_address: body.customer_address || body.job_address || null,
    job_address: body.job_address || null,
    service_type: body.service_type || null,
    service_date: body.service_date || null,
    payment_type: body.payment_type || null,
    contact_id: body.contact_id || null,
    service_description: description,
    line_items: body.line_items || null,
    amount_due: body.amount_due || 0,
    amount_paid: body.amount_paid || 0,
    due_date: body.due_date || null,
    notes: body.notes || null,
    stripe_payment_link: null,
    paid_at: null,
  }).select().single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Auto-upsert contact: update existing or create new
  try {
    const nameParts = (body.customer_name || '').trim().split(/\s+/)
    const firstName = nameParts[0] || ''
    const lastName = nameParts.slice(1).join(' ') || ''
    if (firstName && body.customer_email) {
      // Check by contact_id first, then by email
      let contactId = body.contact_id
      if (!contactId) {
        const { data: byEmail } = await supabase
          .from('contacts')
          .select('id')
          .eq('email', body.customer_email)
          .limit(1)
        if (byEmail && byEmail.length > 0) contactId = byEmail[0].id
      }
      const contactData: Record<string, any> = {
        first_name: firstName,
        last_name: lastName,
        email: body.customer_email,
      }
      if (body.customer_phone) contactData.phone = body.customer_phone
      if (body.job_address) contactData.address = body.job_address

      if (contactId) {
        await supabase.from('contacts').update(contactData).eq('id', contactId)
      } else {
        await supabase.from('contacts').insert(contactData)
      }
    }
  } catch (e) { console.error('Auto-upsert contact failed:', e) }

  return NextResponse.json(data, { status: 201 })
}

export async function PATCH(req: NextRequest) {
  const supabase = createServerClient()
  const body = await req.json()
  const { id, ...updates } = body
  if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 })

  // Auto grammar fix on service description if being updated
  if (updates.service_description) {
    updates.service_description = basicGrammarFix(updates.service_description)
  }

  const { data, error } = await supabase
    .from('invoices')
    .update(updates)
    .eq('id', id)
    .select()
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Auto-update contact if customer info changed
  try {
    if (data.customer_email) {
      const nameParts = (data.customer_name || '').trim().split(/\s+/)
      const firstName = nameParts[0] || ''
      const lastName = nameParts.slice(1).join(' ') || ''
      if (firstName) {
        let contactId = data.contact_id
        if (!contactId) {
          const { data: byEmail } = await supabase
            .from('contacts')
            .select('id')
            .eq('email', data.customer_email)
            .limit(1)
          if (byEmail && byEmail.length > 0) contactId = byEmail[0].id
        }
        const contactData: Record<string, any> = {
          first_name: firstName,
          last_name: lastName,
          email: data.customer_email,
        }
        if (data.customer_phone) contactData.phone = data.customer_phone
        if (data.job_address) contactData.address = data.job_address

        if (contactId) {
          await supabase.from('contacts').update(contactData).eq('id', contactId)
        } else {
          await supabase.from('contacts').insert(contactData)
        }
      }
    }
  } catch (e) { console.error('Auto-update contact failed:', e) }

  return NextResponse.json(data)
}

export async function DELETE(req: NextRequest) {
  const supabase = createServerClient()
  const body = await req.json()
  const { id } = body
  if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 })
  const { error } = await supabase.from('invoices').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
