import { NextRequest, NextResponse } from 'next/server'
export const dynamic = 'force-dynamic'
import { createServerClient } from '@/lib/supabase'
import { sendScheduleRequestNotification, sendScheduleRequestAutoReply, sendDeclineEmail } from '@/lib/resend'
import { sendSMS } from '@/lib/twilio'

export async function GET(req: NextRequest) {
  const supabase = createServerClient()
  const status = req.nextUrl.searchParams.get('status')
  let query = supabase.from('schedule_requests').select('*').order('created_at', { ascending: false })
  if (status) query = query.eq('status', status)
  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function POST(req: NextRequest) {
  const supabase = createServerClient()
  const body = await req.json()

  // Handle decline email action
  if (body.action === 'decline-email') {
    try {
      await sendDeclineEmail({
        to: body.email,
        customerName: body.customerName,
        reason: body.reason || undefined,
      })
      return NextResponse.json({ success: true })
    } catch (e: any) {
      console.error('Decline email failed:', e)
      return NextResponse.json({ error: e.message }, { status: 500 })
    }
  }

  const { data, error } = await supabase.from('schedule_requests').insert({
    first_name: body.firstName,
    last_name: body.lastName,
    phone: body.phone,
    email: body.email,
    jobsite_address: body.jobsiteAddress,
    service_type: body.serviceType || null,
    preferred_date: body.preferredDate || null,
    preferred_time: body.preferredTime || null,
    notes: body.notes || null,
    is_owner: body.isOwner !== false,
    owner_name: body.ownerName || null,
    owner_phone: body.ownerPhone || null,
    owner_email: body.ownerEmail || null,
    company_name: body.companyName || null,
    is_company_owner: body.isCompanyOwner !== false,
    billing_address: body.billingAddress || null,
    billing_phone: body.billingPhone || null,
    billing_email: body.billingEmail || null,
    status: 'pending',
  }).select().single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Send admin notification email
  try {
    await sendScheduleRequestNotification({
      firstName: body.firstName,
      lastName: body.lastName,
      phone: body.phone,
      email: body.email,
      jobsiteAddress: body.jobsiteAddress,
      serviceType: body.serviceType,
      preferredDate: body.preferredDate,
      notes: body.notes,
    })
  } catch (e) { console.error('Email notification failed:', e) }

  // Auto-reply to customer (email + SMS)
  try {
    await sendScheduleRequestAutoReply({
      to: body.email,
      customerName: body.firstName,
    })
  } catch (e) { console.error('Auto-reply email failed:', e) }

  if (body.phone) {
    try {
      const phone = body.phone.replace(/\D/g, '')
      const formattedPhone = phone.startsWith('1') ? `+${phone}` : `+1${phone}`
      await sendSMS(formattedPhone,
        `Hi ${body.firstName}! Thank you for reaching out to L. Price Building Company. We received your request and will be in touch soon. If this is an emergency gas call, please call us at 850-598-9128.`
      )
    } catch (e) { console.error('Auto-reply SMS failed:', e) }
  }

  // Auto-save customer as a contact
  try {
    const { data: existing } = await supabase
      .from('contacts')
      .select('id')
      .eq('email', body.email)
      .limit(1)
    if (!existing || existing.length === 0) {
      await supabase.from('contacts').insert({
        first_name: body.firstName,
        last_name: body.lastName,
        email: body.email,
        phone: body.phone || null,
        address: body.jobsiteAddress || null,
        company_name: body.companyName || null,
        city: body.jobsiteCity || null,
        state: body.jobsiteState || null,
        zip: body.jobsiteZip || null,
        notes: 'Auto-saved from schedule request',
        source: 'schedule-request',
      })
    }
  } catch (e) { console.error('Auto-save contact failed:', e) }

  return NextResponse.json(data, { status: 201 })
}

export async function PATCH(req: NextRequest) {
  const supabase = createServerClient()
  const body = await req.json()
  const { id, ...updates } = body
  if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 })

  const { data, error } = await supabase.from('schedule_requests').update(updates).eq('id', id).select().single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function DELETE(req: NextRequest) {
  const supabase = createServerClient()
  const id = req.nextUrl.searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 })

  const { error } = await supabase.from('schedule_requests').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
