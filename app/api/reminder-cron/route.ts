import { NextRequest, NextResponse } from 'next/server'
export const dynamic = 'force-dynamic'
import { createServerClient } from '@/lib/supabase'
import { sendAppointmentReminder } from '@/lib/resend'
import { sendAppointmentReminderSMS } from '@/lib/twilio'

// This endpoint should be called by a cron job every 30 minutes
// Protect it with CRON_SECRET env var
// Example cron service: https://cron-job.org
// Header: Authorization: Bearer <CRON_SECRET>

function getTimeFrame(startTime: string): string {
  const hour = new Date(startTime).getHours()
  if (hour < 12) return 'Morning (AM Working Hours)'
  return 'Afternoon (PM Working Hours)'
}

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('authorization')
  const cronSecret = process.env.CRON_SECRET

  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = createServerClient()
  const now = new Date()

  // Fetch scheduled appointments in the next 13 hours that haven't had all reminders sent
  const in13h = new Date(now.getTime() + 13 * 60 * 60 * 1000).toISOString()

  const { data: appointments, error } = await supabase
    .from('appointments')
    .select('*')
    .eq('status', 'scheduled')
    .gte('start_time', now.toISOString())
    .lte('start_time', in13h)
    .or('reminder_12_sent.eq.false,reminder_1_sent.eq.false')

  if (error) {
    console.error('Cron: Failed to fetch appointments:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  let sent12 = 0
  let sent1 = 0
  const errors: string[] = []

  for (const appt of (appointments || [])) {
    const apptTime = new Date(appt.start_time)
    const hoursUntil = (apptTime.getTime() - now.getTime()) / (1000 * 60 * 60)

    const appointmentDate = apptTime.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })
    const appointmentTime = apptTime.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
    const timeFrame = getTimeFrame(appt.start_time)

    // 12-hour reminder: between 11-13 hours out
    if (!appt.reminder_12_sent && hoursUntil >= 11 && hoursUntil <= 13) {
      try {
        if (appt.customer_email) {
          await sendAppointmentReminder({
            to: appt.customer_email,
            customerName: appt.customer_name,
            serviceAddress: appt.service_address || '',
            appointmentDate,
            appointmentTime,
            timeFrame,
            hoursUntil: 12,
          })
        }
        if (appt.customer_phone) {
          await sendAppointmentReminderSMS({
            to: appt.customer_phone,
            customerName: appt.customer_name,
            serviceAddress: appt.service_address || '',
            appointmentDate,
            appointmentTime,
            timeFrame,
            hoursUntil: 12,
          })
        }
        await supabase.from('appointments').update({ reminder_12_sent: true }).eq('id', appt.id)
        sent12++
      } catch (e: any) {
        console.error(`12h reminder failed for ${appt.id}:`, e)
        errors.push(`12h for ${appt.customer_name}: ${e.message}`)
      }
    }

    // 1-hour reminder: between 0.5-1.5 hours out
    if (!appt.reminder_1_sent && hoursUntil >= 0.5 && hoursUntil <= 1.5) {
      try {
        if (appt.customer_email) {
          await sendAppointmentReminder({
            to: appt.customer_email,
            customerName: appt.customer_name,
            serviceAddress: appt.service_address || '',
            appointmentDate,
            appointmentTime,
            timeFrame,
            hoursUntil: 1,
          })
        }
        if (appt.customer_phone) {
          await sendAppointmentReminderSMS({
            to: appt.customer_phone,
            customerName: appt.customer_name,
            serviceAddress: appt.service_address || '',
            appointmentDate,
            appointmentTime,
            timeFrame,
            hoursUntil: 1,
          })
        }
        await supabase.from('appointments').update({ reminder_1_sent: true }).eq('id', appt.id)
        sent1++
      } catch (e: any) {
        console.error(`1h reminder failed for ${appt.id}:`, e)
        errors.push(`1h for ${appt.customer_name}: ${e.message}`)
      }
    }
  }

  console.log(`Cron completed: sent12=${sent12}, sent1=${sent1}, errors=${errors.length}`)
  return NextResponse.json({
    success: true,
    sent12,
    sent1,
    processed: appointments?.length || 0,
    errors: errors.length > 0 ? errors : undefined,
  })
}
