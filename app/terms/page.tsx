import Link from 'next/link'

export default function TermsPage() {
  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-3xl mx-auto px-6 py-16">
        <Link href="/" className="text-sm font-medium mb-8 inline-flex items-center gap-1 hover:underline" style={{ color: '#2f5a5e' }}>
          ← Back to Home
        </Link>
        <h1 className="text-3xl font-extrabold text-gray-900 mb-2">Terms &amp; Conditions</h1>
        <p className="text-gray-500 text-sm mb-10">Last updated: {new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}</p>

        <div className="prose prose-gray max-w-none space-y-8 text-gray-700">
          <section>
            <h2 className="text-xl font-bold text-gray-900 mb-3">1. Acceptance of Terms</h2>
            <p>By accessing our website or engaging L. Price Building Company for services, you agree to be bound by these Terms and Conditions. If you do not agree, please do not use our services.</p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-gray-900 mb-3">2. Services</h2>
            <p>L. Price Building Company provides licensed licensed residential contracting services including custom home building, remodeling, renovation, and design consultation. All work is performed by licensed contractors in accordance with applicable codes and standards.</p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-gray-900 mb-3">3. Scheduling and Appointments</h2>
            <p>Appointment requests submitted through our website are subject to availability and confirmation. We will contact you to confirm your appointment. We reserve the right to reschedule appointments due to emergency calls or unforeseen circumstances.</p>
            <p className="mt-2">By scheduling an appointment, you consent to receive appointment confirmation and reminder communications via email and SMS.</p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-gray-900 mb-3">4. Quotes and Invoices</h2>
            <p>All quotes are estimates based on the information provided and may be subject to change upon on-site assessment. Final invoices reflect actual work completed. Payment is due upon receipt of invoice unless otherwise agreed in writing.</p>
            <p className="mt-2">Overdue invoices may be subject to late fees. We reserve the right to pursue collections for unpaid balances.</p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-gray-900 mb-3">5. Payment</h2>
            <p>We accept payment via credit card through our secure Stripe payment portal. By submitting payment, you authorize L. Price Building Company to charge the stated amount. All payments are processed securely; we do not store credit card information.</p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-gray-900 mb-3">6. Access and Site Requirements</h2>
            <p>The customer is responsible for ensuring safe access to the work site, including turning off relevant gas supplies where applicable. L. Price Building Company is not liable for delays or additional costs arising from inaccessible sites or failure to prepare the work area.</p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-gray-900 mb-3">7. Warranty</h2>
            <p>Workmanship is warranted for a period of one (1) year from the date of completion. This warranty covers defects in installation or workmanship only and does not cover damage caused by misuse, third-party modifications, or acts of nature. Manufacturer warranties apply to all installed equipment.</p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-gray-900 mb-3">8. Limitation of Liability</h2>
            <p>To the maximum extent permitted by law, L. Price Building Company's liability for any claim arising from our services is limited to the amount paid for the specific service giving rise to the claim. We are not liable for indirect, consequential, or incidental damages.</p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-gray-900 mb-3">9. Cancellations</h2>
            <p>Cancellations must be made at least 24 hours before the scheduled appointment. Late cancellations or no-shows may be subject to a service call fee.</p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-gray-900 mb-3">10. Changes to Terms</h2>
            <p>We reserve the right to update these Terms at any time. Continued use of our services constitutes acceptance of the updated terms.</p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-gray-900 mb-3">11. Contact</h2>
            <p>Questions about these Terms? Contact us:</p>
            <div className="mt-2">
              <p className="font-semibold">L. Price Building Company</p>
              <p>Email: <a href="mailto:Lacey@LaceyNPrice.com" className="underline" style={{ color: '#2f5a5e' }}>Lacey@LaceyNPrice.com</a></p>
            </div>
          </section>
        </div>
      </div>
    </div>
  )
}
