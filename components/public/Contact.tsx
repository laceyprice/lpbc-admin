'use client'
import { useState } from 'react'
import { Phone, Mail, MapPin, Clock, Send, Loader2 } from 'lucide-react'

export default function Contact() {
  const [form, setForm] = useState({ name: '', email: '', message: '' })
  const [loading, setLoading] = useState(false)
  const [sent, setSent] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault(); setLoading(true)
    try {
      await fetch('/api/contact', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form) })
      setSent(true)
    } finally { setLoading(false) }
  }

  return (
    <section id="contact" className="py-24 bg-gray-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-16">
          <span className="inline-block font-semibold px-4 py-1.5 rounded-full text-sm mb-4"
            style={{ background: 'rgba(74,173,224,0.1)', color: '#185FA5' }}>Get In Touch</span>
          <h2 className="text-3xl md:text-4xl font-extrabold text-gray-900 mb-4">
            Contact <span style={{ color: '#185FA5' }}>Us</span>
          </h2>
          <p className="text-gray-500 text-lg max-w-xl mx-auto">Have a question or need a quote? We'd love to hear from you.</p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-12">
          <div className="rounded-2xl p-8" style={{ background: 'linear-gradient(135deg, #185FA5, #1a4a6b)' }}>
            <h3 className="text-2xl font-bold text-white mb-6">Contact Information</h3>
            <div className="space-y-5">
              {[
                { icon: Phone, label: 'Phone', value: '850-598-3336', href: 'tel:+18505983336' },
                { icon: Mail, label: 'Email', value: 'office@thegasologist.com', href: 'mailto:office@thegasologist.com' },
                { icon: MapPin, label: 'Service Area', value: 'Okaloosa, Santa Rosa & Walton Counties' },
                { icon: Clock, label: 'Hours', value: 'Mon–Fri 8AM–5PM · Emergency Available' },
              ].map(({ icon: Icon, label, value, href }) => (
                <div key={label} className="flex items-start gap-4">
                  <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
                    style={{ background: 'rgba(255,255,255,0.2)' }}>
                    <Icon size={18} style={{ color: '#4AADE0' }} />
                  </div>
                  <div>
                    <p className="text-xs uppercase tracking-wider font-medium" style={{ color: 'rgba(255,255,255,0.6)' }}>{label}</p>
                    {href ? <a href={href} className="text-white font-medium hover:text-blue-200 transition-colors">{value}</a>
                      : <p className="text-white font-medium">{value}</p>}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="bg-white rounded-2xl p-8 shadow-sm border border-gray-100">
            {sent ? (
              <div className="text-center py-8">
                <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
                  <Send size={28} className="text-green-500" />
                </div>
                <h3 className="text-xl font-bold text-gray-900 mb-2">Message Sent!</h3>
                <p className="text-gray-500">We'll get back to you as soon as possible.</p>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-5">
                {[{ label: 'Your Name', key: 'name', type: 'text', placeholder: 'John Smith' },
                  { label: 'Email Address', key: 'email', type: 'email', placeholder: 'john@example.com' }].map(({ label, key, type, placeholder }) => (
                  <div key={key}>
                    <label className="block text-sm font-semibold text-gray-700 mb-1.5">{label}</label>
                    <input type={type} value={(form as Record<string, string>)[key]} onChange={e => setForm(p => ({ ...p, [key]: e.target.value }))}
                      required placeholder={placeholder}
                      className="w-full px-4 py-3 rounded-xl border border-gray-200 text-gray-900 text-sm focus:outline-none focus:ring-2 focus:border-blue-400" />
                  </div>
                ))}
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1.5">Message</label>
                  <textarea value={form.message} onChange={e => setForm(p => ({ ...p, message: e.target.value }))}
                    required rows={5} placeholder="Tell us about your project..."
                    className="w-full px-4 py-3 rounded-xl border border-gray-200 text-gray-900 text-sm focus:outline-none focus:ring-2 focus:border-blue-400 resize-none" />
                </div>
                <button type="submit" disabled={loading} className="w-full text-white font-bold py-3.5 rounded-xl transition-all flex items-center justify-center gap-2"
                  style={{ background: '#185FA5' }}>
                  {loading ? <Loader2 size={18} className="animate-spin" /> : <Send size={18} />}
                  {loading ? 'Sending...' : 'Send Message'}
                </button>
              </form>
            )}
          </div>
        </div>
      </div>
    </section>
  )
}
