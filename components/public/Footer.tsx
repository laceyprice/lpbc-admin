import Image from 'next/image'
import Link from 'next/link'
import { Phone, Mail } from 'lucide-react'

export default function Footer() {
  return (
    <footer style={{ background: '#1a4a6b' }}>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-10">
          <div>
            <div className="flex items-center gap-3 mb-4">
              <Image src="/logo.png" alt="D P Gas Company" width={44} height={44} className="object-contain" />
              <span className="text-white font-bold text-lg" style={{ color: '#4AADE0' }}>D P Gas Company</span>
            </div>
            <p className="text-sm leading-relaxed mb-4" style={{ color: 'rgba(255,255,255,0.6)' }}>
              Natural Gas &amp; Propane Specialist. Safe, reliable, and professional service every time.
            </p>
          </div>
          <div>
            <h4 className="text-white font-bold text-sm uppercase tracking-wider mb-5">Quick Links</h4>
            <ul className="space-y-3">
              {[['Home','#home'],['About','#about'],['Services','#services'],['Schedule','#schedule'],['Contact','#contact']].map(([l,h]) => (
                <li key={l}><a href={h} className="text-sm transition-colors hover:text-white" style={{ color: 'rgba(255,255,255,0.6)' }}>{l}</a></li>
              ))}
            </ul>
          </div>
          <div>
            <h4 className="text-white font-bold text-sm uppercase tracking-wider mb-5">Services</h4>
            <ul className="space-y-3">
              {['Gas Line Installation','Appliance Installation','Appliance Repair','Safety Inspections','Pressure Testing','Emergency Services'].map(s => (
                <li key={s}><a href="#services" className="text-sm transition-colors hover:text-white" style={{ color: 'rgba(255,255,255,0.6)' }}>{s}</a></li>
              ))}
            </ul>
          </div>
          <div>
            <h4 className="text-white font-bold text-sm uppercase tracking-wider mb-5">Contact</h4>
            <div className="space-y-4">
              <a href="tel:+18505983336" className="flex items-center gap-3 text-sm transition-colors hover:text-white" style={{ color: 'rgba(255,255,255,0.6)' }}>
                <Phone size={15} /> 850-598-3336
              </a>
              <a href="mailto:office@thegasologist.com" className="flex items-center gap-3 text-sm transition-colors hover:text-white" style={{ color: 'rgba(255,255,255,0.6)' }}>
                <Mail size={15} /> office@thegasologist.com
              </a>
            </div>
            <div className="mt-6">
              <a href="#schedule" className="inline-block text-white font-bold px-6 py-2.5 rounded-full text-sm transition-all"
                style={{ background: '#4AADE0' }}>Book Service</a>
            </div>
          </div>
        </div>
        <div className="border-t mt-12 pt-8 flex flex-col sm:flex-row justify-between items-center gap-4" style={{ borderColor: 'rgba(255,255,255,0.1)' }}>
          <p className="text-sm" style={{ color: 'rgba(255,255,255,0.4)' }}>© {new Date().getFullYear()} D P Gas Company. All rights reserved.</p>
          <div className="flex gap-6">
            <Link href="/privacy" className="text-sm transition-colors hover:text-white" style={{ color: 'rgba(255,255,255,0.4)' }}>Privacy Policy</Link>
            <Link href="/terms" className="text-sm transition-colors hover:text-white" style={{ color: 'rgba(255,255,255,0.4)' }}>Terms & Conditions</Link>
          </div>
        </div>
      </div>
    </footer>
  )
}
