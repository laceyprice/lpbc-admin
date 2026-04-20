import Link from 'next/link'

export default function PrivacyPage() {
  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-3xl mx-auto px-6 py-16">
        <Link href="/" className="text-sm font-medium mb-8 inline-flex items-center gap-1 hover:underline" style={{ color: '#2f5a5e' }}>
          ← Back to Home
        </Link>
        <h1 className="text-3xl font-extrabold text-gray-900 mb-2">Privacy Policy</h1>
        <p className="text-gray-500 text-sm mb-10">Last updated: {new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}</p>

        <div className="prose prose-gray max-w-none space-y-8 text-gray-700">
          <section>
            <h2 className="text-xl font-bold text-gray-900 mb-3">1. Information We Collect</h2>
            <p>When you use L. Price Building Company website or request our services, we may collect the following information:</p>
            <ul className="list-disc pl-6 mt-2 space-y-1">
              <li>Contact information: name, email address, phone number</li>
              <li>Service address and property information</li>
              <li>Company name and billing information (where applicable)</li>
              <li>Information you provide through our contact or scheduling forms</li>
              <li>Payment information processed securely through Stripe (we do not store card numbers)</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-bold text-gray-900 mb-3">2. How We Use Your Information</h2>
            <p>We use the information we collect to:</p>
            <ul className="list-disc pl-6 mt-2 space-y-1">
              <li>Provide and manage residential contracting services</li>
              <li>Schedule and confirm appointments</li>
              <li>Send invoices and process payments</li>
              <li>Communicate service updates, confirmations, and reminders</li>
              <li>Improve our services and customer experience</li>
              <li>Comply with legal and regulatory obligations</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-bold text-gray-900 mb-3">3. Information Sharing</h2>
            <p>We do not sell, trade, or rent your personal information to third parties. We may share information with:</p>
            <ul className="list-disc pl-6 mt-2 space-y-1">
              <li><strong>Service providers</strong> who assist us in operating our business (e.g., Stripe for payments, email and SMS services for reminders)</li>
              <li><strong>Legal authorities</strong> when required by law or to protect our legal rights</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-bold text-gray-900 mb-3">4. Data Security</h2>
            <p>We implement appropriate technical and organizational measures to protect your personal information against unauthorized access, alteration, disclosure, or destruction. Payment processing is handled securely by Stripe and is never stored on our servers.</p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-gray-900 mb-3">5. SMS and Email Communications</h2>
            <p>By scheduling a service appointment, you consent to receiving appointment confirmations and reminders via email and SMS text message. You may opt out of SMS messages at any time by replying STOP. Standard message and data rates may apply.</p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-gray-900 mb-3">6. Cookies</h2>
            <p>Our website may use cookies and similar tracking technologies to improve your browsing experience. You can control cookie settings through your browser preferences.</p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-gray-900 mb-3">7. Your Rights</h2>
            <p>You have the right to access, correct, or request deletion of your personal information. To exercise these rights, please contact us at the information below.</p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-gray-900 mb-3">8. Contact Us</h2>
            <p>If you have questions about this Privacy Policy, please contact us:</p>
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
