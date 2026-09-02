import { NextRequest, NextResponse } from 'next/server'
export const dynamic = 'force-dynamic'
import { createServerClient } from '@/lib/supabase'
import { sendScheduleConfirmation } from '@/lib/resend'
import { sendAppointmentConfirmationSMS } from '@/lib/twilio'
import { addEventToGoogleCalendar, listGoogleCalendarEvents, patchGoogleCalendarEvent, deleteGoogleCalendarEvent } from '@/lib/google-calendar'

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
  const appts = data || []

  // 2-way sync: pull Google Calendar events for a window and merge in the ones
  // that aren't already app appointments (dedupe by the linked Google event id).
  try {
    const now = new Date()
    const timeMin = new Date(now.getFullYear(), now.getMonth() - 2, 1).toISOString()
    const timeMax = new Date(now.getFullYear(), now.getMonth() + 4, 0).toISOString()
    const linked = new Set(appts.map((a: any) => a.google_calendar_event_id).filter(Boolean))
    const gEvents = await listGoogleCalendarEvents(timeMin, timeMax)
    const googleOnly = gEvents
      .filter(e => !linked.has(e.id))
      .map(e => ({
        id: `gcal_${e.id}`,
        google_calendar_event_id: e.id,
        title: e.summary,
        customer_name: e.summary,      // shown as the label in the calendar cell
        customer_email: '', customer_phone: '',
        service_address: e.location || '',
        service_type: '', notes: e.description || '',
        start_time: e.start, end_time: e.end || e.start,
        status: 'scheduled',
        _source: 'google',
        _html_link: e.htmlLink,
        _all_day: e.allDay,
      }))
    return NextResponse.json([...appts, ...googleOnly])
  } catch {
    return NextResponse.json(appts)   // Google unreachable → still return app appointments
  }
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

  // A Google-only event (not in our DB) — write the edit straight to Google
  // Calendar. Partial patch: only the fields present in this request change, so
  // a drag-reschedule (time only) leaves the title/location/notes intact.
  if (typeof id === 'string' && id.startsWith('gcal_')) {
    const eventId = id.slice(5)
    const hasTitle = updates.customer_name !== undefined || updates.title !== undefined
    try {
      await patchGoogleCalendarEvent(eventId, {
        summary: hasTitle ? (updates.customer_name || updates.title || 'Event') : undefined,
        location: updates.service_address !== undefined ? (updates.service_address || '') : undefined,
        description: updates.notes !== undefined ? (updates.notes || '') : undefined,
        startTime: updates.start_time,
        endTime: updates.end_time,
      })
      return NextResponse.json({ success: true, google: true })
    } catch {
      return NextResponse.json({ error: 'Could not update the Google Calendar event.' }, { status: 500 })
    }
  }

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

  // A Google-only event — delete it straight from Google Calendar.
  if (typeof id === 'string' && id.startsWith('gcal_')) {
    await deleteGoogleCalendarEvent(id.slice(5))
    return NextResponse.json({ success: true, google: true })
  }

  // App appointment: also remove its linked Google event so it doesn't reappear.
  const { data: existing } = await supabase.from('appointments').select('google_calendar_event_id').eq('id', id).single()
  const { error } = await supabase.from('appointments').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (existing?.google_calendar_event_id) {
    try { await deleteGoogleCalendarEvent(existing.google_calendar_event_id) } catch {}
  }
  return NextResponse.json({ success: true })
}
