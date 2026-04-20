import { Resend } from 'resend'

let _resend: Resend | null = null
function getResend() {
  if (!_resend) _resend = new Resend(process.env.RESEND_API_KEY)
  return _resend
}

const FROM = process.env.RESEND_FROM_EMAIL || 'Lacey@LaceyNPrice.com'
const APP = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'

function baseHtml(content: string) {
  return `<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:20px">
    <div style="border-radius:12px 12px 0 0;overflow:hidden">
      <img src="${APP}/email-hero.png" alt="Thank You for the Business" style="width:100%;display:block"/>
    </div>
    <div style="background:#faf7f2;padding:28px;border:1px solid #e2e8f0;border-top:none">
      ${content}
    </div>
    <div style="background:#1f2a2e;padding:16px;border-radius:0 0 12px 12px;text-align:center">
      <p style="color:#c9a870;margin:0;font-size:12px">&copy; ${new Date().getFullYear()} L. Price Building Company &middot; Lacey@LaceyNPrice.com</p>
    </div>
  </div>`
}

function invoiceHtml(content: string) {
  return `<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:20px">
    <div style="border-radius:12px 12px 0 0;overflow:hidden">
      <img src="${APP}/email-hero.png" alt="Thank You for the Business" style="width:100%;display:block"/>
    </div>
    <div style="background:#faf7f2;padding:28px;border:1px solid #e2e8f0;border-top:none">
      ${content}
    </div>
    <div style="background:#1f2a2e;padding:16px;border-radius:0 0 12px 12px;text-align:center">
      <p style="color:#c9a870;margin:0;font-size:12px">&copy; ${new Date().getFullYear()} L. Price Building Company &middot; Lacey@LaceyNPrice.com</p>
    </div>
  </div>`
}

export async function sendInvoiceEmail({ to, customerName, invoiceNumber, invoiceType, amountDue, dueDate, serviceDescription, jobAddress, jobsiteCity, companyName, paymentUrl }: {
  to: string; customerName: string; invoiceNumber: string; invoiceType?: string
  amountDue: number; dueDate?: string; serviceDescription?: string; jobAddress?: string
  jobsiteCity?: string; companyName?: string; paymentUrl?: string
}) {
  const isQuote = invoiceType === 'quote'
  const label = isQuote ? 'Quote' : 'Invoice'
  const subject = isQuote
    ? `LPBC Quote ${invoiceNumber} ${jobAddress || ''}`
    : `LPBC Invoice ${invoiceNumber} ${jobAddress || ''}`
  const bodyText = isQuote
    ? 'Attached is a quote for future services. Please let us know if you have any questions or if we can do anything else to serve you.'
    : 'Attached is an invoice for completed services. Please let us know if you have any questions or if we can do anything else to serve you.'

  const fullAddress = [jobAddress, jobsiteCity].filter(Boolean).join(', ')
  const pdfUrl = `${APP}/api/invoice-pdf?id=${invoiceNumber}`

  return getResend().emails.send({
    from: `L. Price Building Company <${FROM}>`,
    to,
    subject: subject.trim(),
    html: invoiceHtml(`
      <p style="font-size:16px">Hello,</p>
      <p>${bodyText}</p>

      <table style="width:100%;border-collapse:collapse;margin:20px 0;border-radius:8px;overflow:hidden">
        <tr style="background:#f3ede3"><td style="padding:12px;font-weight:bold;color:#2f5a5e;width:140px">${label} #</td><td style="padding:12px">${invoiceNumber}</td></tr>
        <tr><td style="padding:12px;font-weight:bold;color:#2f5a5e">Customer</td><td style="padding:12px">${customerName}${companyName ? ` &middot; ${companyName}` : ''}</td></tr>
        ${fullAddress ? `<tr style="background:#f3ede3"><td style="padding:12px;font-weight:bold;color:#2f5a5e">Job Address</td><td style="padding:12px">${fullAddress}</td></tr>` : ''}
        ${serviceDescription ? `<tr><td style="padding:12px;font-weight:bold;color:#2f5a5e">Description</td><td style="padding:12px">${serviceDescription}</td></tr>` : ''}
        <tr style="background:#2f5a5e"><td style="padding:14px;font-weight:bold;color:white;font-size:16px">Amount${isQuote ? '' : ' Due'}</td><td style="padding:14px;font-size:20px;font-weight:bold;color:white">$${amountDue.toFixed(2)}</td></tr>
      </table>

      ${isQuote ? `
      <div style="text-align:center;margin:24px 0"><a href="${APP}/api/approve-quote?id=${encodeURIComponent(invoiceNumber)}" style="background:#16a34a;color:white;padding:14px 32px;border-radius:8px;text-decoration:none;font-size:16px;font-weight:bold;display:inline-block">Approve Quote</a></div>
      ` : ''}

      ${!isQuote && paymentUrl ? `
      <div style="text-align:center;margin:24px 0"><a href="${paymentUrl}" style="background:#b8895a;color:white;padding:14px 32px;border-radius:8px;text-decoration:none;font-size:16px;font-weight:bold;display:inline-block">Pay Now &mdash; $${amountDue.toFixed(2)}</a></div>
      ` : ''}

      <div style="text-align:center;margin:16px 0">
        <a href="${pdfUrl}" style="color:#2f5a5e;font-size:14px;text-decoration:underline">Download PDF ${label}</a>
      </div>

      <p>We greatly appreciate the business!</p>

      <div style="border-top:1px solid #e2e8f0;padding-top:16px;margin-top:24px">
        <p style="margin:0 0 8px">With gratitude,</p>
        <p style="margin:0;font-weight:bold;font-size:16px">Lacey Price</p>
        <p style="margin:2px 0;color:#6b7280">L. Price Building Company</p>
        <p style="margin:2px 0"><a href="tel:8505989128" style="color:#2f5a5e;text-decoration:none">850-598-9128</a></p>
        <p style="margin:2px 0"><a href="mailto:Lacey@LaceyNPrice.com" style="color:#2f5a5e;text-decoration:none">Lacey@LaceyNPrice.com</a></p>
        <img src="${APP}/email-logo.png" alt="L. Price Building Company" style="height:100px;margin-top:10px"/>
      </div>
    `),
  })
}

export async function sendScheduleConfirmation({ to, customerName, serviceAddress, appointmentDate, timeFrame, serviceType }: {
  to: string; customerName: string; serviceAddress: string
  appointmentDate: string; timeFrame: string; serviceType: string
}) {
  return getResend().emails.send({
    from: `L. Price Building Company <${FROM}>`,
    to,
    subject: `Appointment Confirmed — L. Price Building Company`,
    html: baseHtml(`
      <h2 style="color:#2f5a5e;margin-top:0">Appointment Confirmed!</h2>
      <p>Hi ${customerName}, your appointment has been scheduled.</p>
      <table style="width:100%;border-collapse:collapse;margin:16px 0">
        <tr style="background:#f3ede3"><td style="padding:10px;font-weight:bold;color:#2f5a5e">Date</td><td style="padding:10px">${appointmentDate}</td></tr>
        <tr><td style="padding:10px;font-weight:bold;color:#2f5a5e">Time</td><td style="padding:10px">${timeFrame}</td></tr>
        <tr style="background:#f3ede3"><td style="padding:10px;font-weight:bold;color:#2f5a5e">Service</td><td style="padding:10px">${serviceType}</td></tr>
        <tr><td style="padding:10px;font-weight:bold;color:#2f5a5e">Address</td><td style="padding:10px">${serviceAddress}</td></tr>
      </table>
      <p style="color:#6b7280;font-size:14px">You'll receive reminders 12 hours and 1 hour before your appointment.</p>
    `),
  })
}

export async function sendAppointmentReminder({ to, customerName, serviceAddress, appointmentDate, appointmentTime, timeFrame, hoursUntil }: {
  to: string; customerName: string; serviceAddress: string
  appointmentDate: string; appointmentTime: string; timeFrame: string; hoursUntil: 1 | 12
}) {
  const urgency = hoursUntil === 1 ? 'in 1 hour' : 'tomorrow'
  const subject = hoursUntil === 1
    ? `Your appointment is in 1 hour — L. Price Building Company`
    : `Reminder: Your appointment is tomorrow — L. Price Building Company`
  return getResend().emails.send({
    from: `L. Price Building Company <${FROM}>`,
    to,
    subject,
    html: baseHtml(`
      <h2 style="color:#2f5a5e;margin-top:0">${hoursUntil === 1 ? 'Almost Time!' : 'Appointment Reminder'}</h2>
      <p>Hi ${customerName}, your appointment is <strong>${urgency}</strong>.</p>
      <table style="width:100%;border-collapse:collapse;margin:16px 0">
        <tr style="background:#f3ede3"><td style="padding:10px;font-weight:bold;color:#2f5a5e">Date</td><td style="padding:10px">${appointmentDate}</td></tr>
        <tr><td style="padding:10px;font-weight:bold;color:#2f5a5e">Time</td><td style="padding:10px">${timeFrame}</td></tr>
        <tr style="background:#f3ede3"><td style="padding:10px;font-weight:bold;color:#2f5a5e">Address</td><td style="padding:10px">${serviceAddress}</td></tr>
      </table>
      <p style="color:#6b7280;font-size:14px">Need to reschedule? Call <a href="tel:8505989128" style="color:#2f5a5e">850-598-9128</a> or email <a href="mailto:Lacey@LaceyNPrice.com" style="color:#2f5a5e">Lacey@LaceyNPrice.com</a></p>
    `),
  })
}

export async function sendScheduleRequestNotification(data: {
  firstName: string; lastName: string; phone: string; email: string
  jobsiteAddress: string; serviceType?: string; preferredDate?: string; notes?: string
}) {
  return getResend().emails.send({
    from: `LPBC Website <${FROM}>`,
    to: process.env.ADMIN_EMAIL || 'Lacey@LaceyNPrice.com',
    subject: `New Schedule Request — ${data.firstName} ${data.lastName}`,
    html: baseHtml(`
      <h2 style="color:#2f5a5e;margin-top:0">New Schedule Request</h2>
      <table style="width:100%;border-collapse:collapse">
        <tr><td style="padding:8px;font-weight:bold">Name</td><td style="padding:8px">${data.firstName} ${data.lastName}</td></tr>
        <tr style="background:#faf7f2"><td style="padding:8px;font-weight:bold">Phone</td><td style="padding:8px">${data.phone}</td></tr>
        <tr><td style="padding:8px;font-weight:bold">Email</td><td style="padding:8px">${data.email}</td></tr>
        <tr style="background:#faf7f2"><td style="padding:8px;font-weight:bold">Jobsite</td><td style="padding:8px">${data.jobsiteAddress}</td></tr>
        ${data.serviceType ? `<tr><td style="padding:8px;font-weight:bold">Service</td><td style="padding:8px">${data.serviceType}</td></tr>` : ''}
      </table>
      <div style="text-align:center;margin-top:20px">
        <a href="${APP}/admin/schedule-requests" style="background:#b8895a;color:white;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:bold">View in Admin Dashboard</a>
      </div>
    `),
  })
}

// Auto-reply to customers who submit a schedule request
export async function sendScheduleRequestAutoReply({ to, customerName }: { to: string; customerName: string }) {
  return getResend().emails.send({
    from: `L. Price Building Company <${FROM}>`,
    to,
    subject: `Thank You for Reaching Out — L. Price Building Company`,
    html: baseHtml(`
      <h2 style="color:#2f5a5e;margin-top:0">Thank You for Reaching Out!</h2>
      <p>Hi ${customerName},</p>
      <p>We received your request and will be in touch soon to get you scheduled.</p>
      <p>We greatly appreciate the business!</p>
      <p>With gratitude,<br/><strong>Lacey Price</strong><br/>L. Price Building Company<br/><a href="tel:8505989128" style="color:#2f5a5e">850-598-9128</a></p>
    `),
  })
}

export async function sendContactMessage({ name, email, phone, message }: { name: string; email: string; phone?: string; message: string }) {
  return getResend().emails.send({
    from: `LPBC Website <${FROM}>`,
    to: process.env.ADMIN_EMAIL || 'Lacey@LaceyNPrice.com',
    reply_to: email,
    subject: `Website Contact: ${name}`,
    html: baseHtml(`
      <h2 style="color:#2f5a5e;margin-top:0">New Contact Message</h2>
      <p><strong>From:</strong> ${name} (${email})${phone ? ` · ${phone}` : ''}</p>
      <div style="background:white;padding:16px;border-radius:8px;border:1px solid #e2e8f0">${message.replace(/\n/g, '<br>')}</div>
    `),
  })
}

export async function sendDeclineEmail({ to, customerName, reason }: { to: string; customerName: string; reason?: string }) {
  return getResend().emails.send({
    from: `L. Price Building Company <${FROM}>`,
    to,
    subject: `Schedule Request Update — L. Price Building Company`,
    html: baseHtml(`
      <h2 style="color:#2f5a5e;margin-top:0">Schedule Request Update</h2>
      <p>Hi ${customerName},</p>
      <p>Thank you for reaching out to L. Price Building Company. Unfortunately, we are unable to accommodate your service request at this time.</p>
      ${reason ? `<div style="background:#FEF3C7;border:1px solid #FDE68A;border-radius:8px;padding:16px;margin:16px 0"><p style="margin:0;font-weight:bold;color:#92400E;font-size:13px">Reason</p><p style="margin:8px 0 0;color:#78350F">${reason}</p></div>` : ''}
      <p>We apologize for any inconvenience. Please don't hesitate to reach out if your needs change or if we can assist you in the future.</p>
      <p>With gratitude,<br/><strong>Lacey Price</strong><br/>L. Price Building Company<br/><a href="tel:8505989128" style="color:#2f5a5e;text-decoration:none">850-598-9128</a><br/><a href="mailto:Lacey@LaceyNPrice.com" style="color:#2f5a5e;text-decoration:none">Lacey@LaceyNPrice.com</a></p>
    `),
  })
}
