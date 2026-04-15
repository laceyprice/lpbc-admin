import { NextRequest, NextResponse } from 'next/server'
export const dynamic = 'force-dynamic'
import { createServerClient } from '@/lib/supabase'
import { sendScheduleConfirmation } from '@/lib/resend'
import { sendAppointmentConfirmationSMS } from '@/lib/twilio'
import { addEventToGoogleCalendar } from '@/lib/google-calendar'

function getTimeFrame(startTime: string): string {
  const hour = new Date(startTime).getHours()
  if (hour < 12) return 'Morning (AM Working Hours)'
  return 'Afternoon (PM Working Hours)'
}

export async function GET(req: NextRequest) {
  const supabase = createServerClient()
  const { data, error } = await supabase
    .from('appointments')
    .select('*')
    .order('start_time', { ascending: true })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function POST(req: NextRequest) {
  const supabase = createServerClient()
  const body = await req.json()

  const { data, error } = await supabase.from('appointments').insert({
    title: body.title || `${body.service_type || 'Service'} – ${body.customer_name}`,
    customer_name: body.customer_name,
    customer_email: body.customer_email || null,
    customer_phone: body.customer_phone || null,
    service_address: body.service_address || null,
    service_type: body.service_type || null,
    notes: body.notes || null,
    start_time: body.start_time,
    end_time: body.end_time,
    status: body.status || 'scheduled',
    contact_id: body.contact_id || null,
    schedule_request_id: body.schedule_request_id || null,
    reminder_12_sent: false,
    reminder_1_sent: false,
  }).select().single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Add to Google Calendar
  try {
    const gcalId = await addEventToGoogleCalendar({
      title: data.title,
      startTime: data.start_time,
      endTime: data.end_time,
      serviceAddress: data.service_address || '',
      customerName: data.customer_name,
      customerEmail: data.customer_email || '',
      customerPhone: data.customer_phone || '',
      serviceType: data.service_type || '',
      notes: data.notes || '',
    })
    if (gcalId) {
      await supabase.from('appointments').update({ google_calendar_event_id: gcalId }).eq('id', data.id)
    }
  } catch (e) { console.error('Google Calendar sync failed:', e) }

  // Send confirmation email + SMS
  const appointmentDate = new Date(data.start_time).toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })
  const timeFrame = getTimeFrame(data.start_time)

  if (data.customer_email) {
    try {
      await sendScheduleConfirmation({
        to: data.customer_email,
        customerName: data.customer_name,
        serviceAddress: data.service_address || '',
        appointmentDate,
        timeFrame,
        serviceType: data.service_type || '',
      })
    } catch (e) { console.error('Confirmation email failed:', e) }
  }

  if (data.customer_phone) {
    try {
      await sendAppointmentConfirmationSMS({
        to: data.customer_phone,
        customerName: data.customer_name,
        serviceAddress: data.service_address || '',
        appointmentDate,
        timeFrame,
        serviceType: data.service_type || '',
      })
    } catch (e) { console.error('Confirmation SMS failed:', e) }
  }

  return NextResponse.json(data, { status: 201 })
}

export async function PATCH(req: NextRequest) {
  const supabase = createServerClient()
  const body = await req.json()
  const { id, ...updates } = body
  if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 })

  const { data, error } = await supabase
    .from('appointments')
    .update(updates)
    .eq('id', id)
    .select()
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Update Google Calendar event if time changed
  if ((updates.start_time || updates.end_time) && data.google_calendar_event_id) {
    try {
      await addEventToGoogleCalendar({
        eventId: data.google_calendar_event_id,
        title: data.title,
        startTime: data.start_time,
        endTime: data.end_time,
        serviceAddress: data.service_address || '',
        customerName: data.customer_name,
        customerEmail: data.customer_email || '',
        customerPhone: data.customer_phone || '',
        serviceType: data.service_type || '',
        notes: data.notes || '',
      })
    } catch (e) { console.error('Google Calendar update failed:', e) }
  }

  return NextResponse.json(data)
}

export async function DELETE(req: NextRequest) {
  const supabase = createServerClient()
  const body = await req.json()
  const { id } = body
  if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 })
  const { error } = await supabase.from('appointments').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
