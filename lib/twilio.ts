// Twilio SMS — appointment reminders
// npm install twilio  (already in package.json)

export async function sendSMS(to: string, body: string) {
  if (!process.env.TWILIO_ACCOUNT_SID || !process.env.TWILIO_AUTH_TOKEN) {
    console.warn('Twilio not configured — SMS skipped')
    return null
  }
  const twilio = (await import('twilio')).default
  const client = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN)
  return client.messages.create({
    body,
    from: process.env.TWILIO_PHONE_NUMBER!,
    to,
  })
}

function formatPhone(to: string) {
  const phone = to.replace(/\D/g, '')
  return phone.startsWith('1') ? `+${phone}` : `+1${phone}`
}

export async function sendAppointmentConfirmationSMS({
  to, customerName, serviceAddress, appointmentDate, timeFrame, serviceType,
}: {
  to: string; customerName: string; serviceAddress: string
  appointmentDate: string; timeFrame: string; serviceType: string
}) {
  const body = `Hi ${customerName}! Your Gasologist appointment is confirmed.\n📅 ${appointmentDate}\n⏰ ${timeFrame}\n🔧 ${serviceType}\n📍 ${serviceAddress}\nYou'll receive reminders before your appointment. Questions? Call or text 850-598-3336.`
  return sendSMS(formatPhone(to), body)
}

export async function sendAppointmentReminderSMS({
  to, customerName, serviceAddress, appointmentDate, appointmentTime, timeFrame, hoursUntil,
}: {
  to: string; customerName: string; serviceAddress: string
  appointmentDate: string; appointmentTime: string; timeFrame: string; hoursUntil: 1 | 12
}) {
  const urgency = hoursUntil === 1 ? 'in 1 hour' : 'tomorrow'
  const body = `Hi ${customerName}! Reminder: Your Gasologist appointment is ${urgency}.\n📅 ${appointmentDate}\n⏰ ${timeFrame}\n📍 ${serviceAddress}\nQuestions? Call or text 850-598-3336.`
  return sendSMS(formatPhone(to), body)
}
