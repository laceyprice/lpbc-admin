import Image from 'next/image'
import { ChevronDown, Star, Shield, Award } from 'lucide-react'

export default function Hero() {
  return (
    <section id="home" className="relative min-h-screen flex items-center overflow-hidden bg-[#4AADE0]">
      {/* Light blue on left covering text area, fading to white on right */}
      <div className="absolute inset-0 bg-[#4AADE0]" style={{ background: 'linear-gradient(to right, #4AADE0 0%, #4AADE0 30%, #7CC4E8 45%, #b8dff2 55%, #e0f0f9 65%, white 80%, white 100%)' }} />

      <div className="absolute top-20 right-10 w-64 h-64 rounded-full blur-3xl animate-pulse" style={{ background: 'rgba(74,173,224,0.2)' }} />
      <div className="absolute bottom-20 left-10 w-48 h-48 rounded-full blur-3xl animate-pulse" style={{ background: 'rgba(255,255,255,0.15)', animationDelay: '1s' }} />

      <div className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-24 pt-32">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
          <div>
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium mb-6"
              style={{ background: 'rgba(255,255,255,0.25)', color: 'white' }}>
              <Star size={14} style={{ fill: '#fde047', color: '#fde047' }} />
              Licensed &amp; Insured Gas Professionals
            </div>
            <h1 className="text-4xl md:text-5xl lg:text-6xl font-extrabold text-white leading-tight mb-6">
              We're Your Trusted{' '}
              <span style={{ color: '#fde047' }}>Gas Experts</span>
            </h1>
            <p className="text-lg md:text-xl leading-relaxed mb-8 max-w-lg" style={{ color: 'rgba(255,255,255,0.95)' }}>
              From gas line installations to appliance hookups, we do it safely, correctly, and on time. Serving residential and commercial clients.
            </p>
            <div className="flex flex-wrap gap-4 mb-10">
              {[{ icon: Shield, label: 'Fully Licensed' }, { icon: Award, label: 'Fully Insured' }, { icon: Star, label: '5-Star Service' }].map(({ icon: Icon, label }) => (
                <div key={label} className="flex items-center gap-2 px-4 py-2 rounded-full" style={{ background: 'rgba(255,255,255,0.2)', color: 'white' }}>
                  <Icon size={16} style={{ color: '#fde047' }} />
                  <span className="text-sm font-medium">{label}</span>
                </div>
              ))}
            </div>
            <div className="flex flex-wrap gap-4">
              <a href="#services" className="font-bold px-8 py-4 rounded-full text-base border-2 border-white text-white hover:bg-white hover:text-[#185FA5] transition-all duration-200">
                Our Services
              </a>
              <a href="#schedule" className="font-bold px-8 py-4 rounded-full text-base shadow-lg hover:shadow-xl hover:-translate-y-0.5 transition-all duration-200"
                style={{ background: 'white', color: '#185FA5' }}>
                Schedule Service
              </a>
            </div>
          </div>
          <div className="flex justify-center lg:justify-end">
            <div className="relative w-64 h-64 md:w-80 md:h-80 lg:w-96 lg:h-96">
              <Image src="/logo.png" alt="D P Gas Company" fill className="object-contain" priority />
            </div>
          </div>
        </div>
      </div>

      <a href="#about" className="absolute bottom-8 left-1/2 -translate-x-1/2 flex flex-col items-center gap-2 animate-bounce"
        style={{ color: '#4AADE0' }}>
        <span className="text-xs tracking-widest uppercase">Scroll</span>
        <ChevronDown size={20} />
      </a>
    </section>
  )
}
