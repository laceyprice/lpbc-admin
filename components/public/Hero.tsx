import Image from 'next/image'
import { ChevronDown, Star, Shield, Award } from 'lucide-react'

export default function Hero() {
  return (
    <section id="home" className="relative min-h-screen flex items-center overflow-hidden" style={{ background: '#2f5a5e' }}>
      <div className="absolute inset-0" style={{ background: 'linear-gradient(to right, #2f5a5e 0%, #2f5a5e 30%, #3d7a7e 45%, #6a9da0 55%, #a5c8ca 65%, #faf7f2 80%, #faf7f2 100%)' }} />

      <div className="absolute top-20 right-10 w-64 h-64 rounded-full blur-3xl animate-pulse" style={{ background: 'rgba(184,137,90,0.2)' }} />
      <div className="absolute bottom-20 left-10 w-48 h-48 rounded-full blur-3xl animate-pulse" style={{ background: 'rgba(255,255,255,0.15)', animationDelay: '1s' }} />

      <div className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-24 pt-32">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
          <div>
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium mb-6"
              style={{ background: 'rgba(255,255,255,0.25)', color: 'white' }}>
              <Star size={14} style={{ fill: '#c9a870', color: '#c9a870' }} />
              Licensed Residential Contractor &amp; Real Estate Broker
            </div>
            <h1 className="text-4xl md:text-5xl lg:text-6xl font-extrabold text-white leading-tight mb-6">
              If You Can Dream It,{' '}
              <span style={{ color: '#c9a870' }}>Together We Can Build It</span>
            </h1>
            <p className="text-lg md:text-xl leading-relaxed mb-8 max-w-lg" style={{ color: 'rgba(255,255,255,0.95)' }}>
              Custom home design, building and remodeling on Florida's Emerald Coast. Your vision, pieced together with thought and care.
            </p>
            <div className="flex flex-wrap gap-4 mb-10">
              {[{ icon: Shield, label: 'Licensed' }, { icon: Award, label: 'Insured' }, { icon: Star, label: '20+ Years' }].map(({ icon: Icon, label }) => (
                <div key={label} className="flex items-center gap-2 px-4 py-2 rounded-full" style={{ background: 'rgba(255,255,255,0.2)', color: 'white' }}>
                  <Icon size={16} style={{ color: '#c9a870' }} />
                  <span className="text-sm font-medium">{label}</span>
                </div>
              ))}
            </div>
            <div className="flex flex-wrap gap-4">
              <a href="#services" className="font-bold px-8 py-4 rounded-full text-base border-2 border-white text-white hover:bg-white hover:text-[#2f5a5e] transition-all duration-200">
                Our Services
              </a>
              <a href="#schedule" className="font-bold px-8 py-4 rounded-full text-base shadow-lg hover:shadow-xl hover:-translate-y-0.5 transition-all duration-200"
                style={{ background: '#b8895a', color: 'white' }}>
                Start Your Dream Home
              </a>
            </div>
          </div>
          <div className="flex justify-center lg:justify-end">
            <div className="relative w-64 h-64 md:w-80 md:h-80 lg:w-96 lg:h-96">
              <Image src="/logo.png" alt="L. Price Building Company" fill className="object-contain" priority />
            </div>
          </div>
        </div>
      </div>

      <a href="#about" className="absolute bottom-8 left-1/2 -translate-x-1/2 flex flex-col items-center gap-2 animate-bounce"
        style={{ color: '#c9a870' }}>
        <span className="text-xs tracking-widest uppercase">Scroll</span>
        <ChevronDown size={20} />
      </a>
    </section>
  )
}
