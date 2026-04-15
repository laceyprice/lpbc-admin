// Google Calendar integration
// Requires: googleapis (in package.json)

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
    const calendarId = process.env.GOOGLE_CALENDAR_ID || 'office@thegasologist.com'

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
