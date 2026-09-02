// Google Calendar integration
// Requires: googleapis (in package.json)

const GCAL_ID = () => process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_REFRESH_TOKEN
const CAL = () => process.env.GOOGLE_CALENDAR_ID || 'Lacey@LaceyNPrice.com'
async function gcal() {
  const { google } = await import('googleapis')
  const auth = new google.auth.OAuth2(process.env.GOOGLE_CLIENT_ID, process.env.GOOGLE_CLIENT_SECRET)
  auth.setCredentials({ refresh_token: process.env.GOOGLE_REFRESH_TOKEN })
  return google.calendar({ version: 'v3', auth })
}

// Pull events from the office Google Calendar for a window (2-way sync: events
// created in Google show up in the app calendar). Returns normalized rows.
export async function listGoogleCalendarEvents(timeMin: string, timeMax: string) {
  if (!GCAL_ID()) return []
  try {
    const calendar = await gcal()
    const res = await calendar.events.list({ calendarId: CAL(), timeMin, timeMax, singleEvents: true, orderBy: 'startTime', maxResults: 500 })
    return (res.data.items || [])
      .filter(e => e.status !== 'cancelled')
      .map(e => ({
        id: e.id as string, summary: e.summary || '(Untitled event)', description: e.description || '', location: e.location || '',
        start: e.start?.dateTime || (e.start?.date ? `${e.start.date}T00:00:00` : null),
        end: e.end?.dateTime || (e.end?.date ? `${e.end.date}T23:59:59` : null),
        allDay: !!e.start?.date, htmlLink: e.htmlLink || '',
      }))
      .filter(e => e.start)
  } catch (err) { console.error('Google Calendar list error:', err); return [] }
}

// Partial update — only the provided fields change (so a drag-reschedule only
// moves the time and leaves title/location/notes intact).
export async function patchGoogleCalendarEvent(eventId: string, fields: {
  summary?: string; location?: string; description?: string; startTime?: string; endTime?: string
}): Promise<boolean> {
  if (!GCAL_ID()) return false
  try {
    const calendar = await gcal()
    const requestBody: any = {}
    if (fields.summary !== undefined) requestBody.summary = fields.summary
    if (fields.location !== undefined) requestBody.location = fields.location
    if (fields.description !== undefined) requestBody.description = fields.description
    if (fields.startTime) requestBody.start = { dateTime: fields.startTime, timeZone: 'America/New_York' }
    if (fields.endTime) requestBody.end = { dateTime: fields.endTime, timeZone: 'America/New_York' }
    if (!Object.keys(requestBody).length) return true
    await calendar.events.patch({ calendarId: CAL(), eventId, requestBody })
    return true
  } catch (err) { console.error('Google Calendar patch error:', err); return false }
}

export async function deleteGoogleCalendarEvent(eventId: string): Promise<boolean> {
  if (!GCAL_ID()) return false
  try {
    const calendar = await gcal()
    await calendar.events.delete({ calendarId: CAL(), eventId })
    return true
  } catch (err) { console.error('Google Calendar delete error:', err); return false }
}

export async function addEventToGoogleCalendar(appointment: {
  title: string; description?: string; serviceAddress: string
  startTime: string; endTime: string; customerEmail?: string
  customerName?: string; customerPhone?: string
  serviceType?: string; notes?: string; eventId?: string
}) {
  if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_REFRESH_TOKEN) {
    console.warn('Google Calendar not configured')
    return null
  }
  try {
    const { google } = await import('googleapis')
    const auth = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET,
    )
    auth.setCredentials({ refresh_token: process.env.GOOGLE_REFRESH_TOKEN })
    const calendar = google.calendar({ version: 'v3', auth })
    const calendarId = process.env.GOOGLE_CALENDAR_ID || 'Lacey@LaceyNPrice.com'

    const descParts = [
      appointment.description,
      appointment.customerName && `Customer: ${appointment.customerName}`,
      appointment.customerPhone && `Phone: ${appointment.customerPhone}`,
      appointment.serviceType && `Service: ${appointment.serviceType}`,
      appointment.notes && `Notes: ${appointment.notes}`,
    ].filter(Boolean).join('\n')

    const requestBody = {
      summary: appointment.title,
      description: descParts,
      location: appointment.serviceAddress,
      start: { dateTime: appointment.startTime, timeZone: 'America/New_York' },
      end: { dateTime: appointment.endTime, timeZone: 'America/New_York' },
      attendees: appointment.customerEmail ? [{ email: appointment.customerEmail }] : [],
      reminders: {
        useDefault: false,
        overrides: [{ method: 'email' as const, minutes: 24 * 60 }, { method: 'popup' as const, minutes: 30 }],
      },
    }

    if (appointment.eventId) {
      const event = await calendar.events.update({
        calendarId,
        eventId: appointment.eventId,
        requestBody,
      })
      return event.data.id
    }

    const event = await calendar.events.insert({ calendarId, requestBody })
    return event.data.id
  } catch (err) {
    console.error('Google Calendar error:', err)
    return null
  }
}
