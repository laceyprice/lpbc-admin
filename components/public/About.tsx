import Image from 'next/image'
import { CheckCircle, Users, Clock, ThumbsUp } from 'lucide-react'

const stats = [
  { label: 'Years Experience', value: '20+', icon: Clock },
  { label: 'Happy Customers', value: '500+', icon: Users },
  { label: 'Projects Done', value: '1000+', icon: ThumbsUp },
  { label: 'Service Areas', value: '20+', icon: CheckCircle },
]

const highlights = [
  'Fully licensed and insured contractor',
  'Residential & commercial building services',
  'Custom home design & construction',
  'Kitchen & bath remodeling',
  'Project management & compliance',
  'Design consultation available',
]

export default function About() {
  return (
    <section id="about" className="py-24 bg-white">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-16">
          <span className="inline-block font-semibold px-4 py-1.5 rounded-full text-sm mb-4"
            style={{ background: 'rgba(184,137,90,0.1)', color: '#2f5a5e' }}>About Us</span>
          <h2 className="text-3xl md:text-4xl font-extrabold text-gray-900 mb-4">
            The Builder You Can <span style={{ color: '#2f5a5e' }}>Trust</span>
          </h2>
          <p className="text-gray-500 text-lg max-w-2xl mx-auto">
            With over two decades of hands-on experience, L. Price Building Company delivers safe, reliable, and professional home building and remodeling services.
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-16 items-center">
          <div className="relative">
            <div className="rounded-3xl p-10 flex items-center justify-center"
              style={{ background: 'linear-gradient(135deg, #EBF5FB, #D6EAF8)' }}>
              <div className="relative w-[340px] h-[340px] flex items-center justify-center">
                <div className="absolute inset-0 bg-white rounded-full shadow-xl" />
                <Image src="/logo.png" alt="L. Price Building Company" width={300} height={300} className="relative object-contain drop-shadow-xl" />
              </div>
            </div>
            <div className="absolute -bottom-4 -right-4 text-white rounded-2xl px-6 py-4 shadow-xl" style={{ background: '#2f5a5e' }}>
              <div className="text-3xl font-extrabold">10+</div>
              <div className="text-sm" style={{ color: '#b8895a' }}>Years of Service</div>
            </div>
          </div>
          <div>
            <h3 className="text-2xl font-bold text-gray-900 mb-4">Who is L. Price Building Company?</h3>
            <p className="text-gray-600 leading-relaxed mb-6">
              L. Price Building Company is a fully licensed and insured custom home design, building and remodeling contractor dedicated to providing top-quality custom home building, remodeling, and design services on Florida's Emerald Coast. Whether you need a new custom home built, a kitchen remodeled, or a design consultation, we bring expertise, vision, and care to every project.
            </p>
            <p className="text-gray-600 leading-relaxed mb-8">
              We pride ourselves on transparent pricing, punctual service, and doing the job right the first time. Your satisfaction is our top priority — every project is completed to code and inspected before we leave.
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-8">
              {highlights.map(item => (
                <div key={item} className="flex items-start gap-3">
                  <CheckCircle size={18} className="mt-0.5 flex-shrink-0" style={{ color: '#b8895a' }} />
                  <span className="text-gray-700 text-sm">{item}</span>
                </div>
              ))}
            </div>
            <a href="#schedule" className="inline-block text-white font-bold px-8 py-3 rounded-full transition-all shadow-md"
              style={{ background: '#2f5a5e' }}>
              Book a Consultation
            </a>
          </div>
        </div>

        <div className="mt-20 grid grid-cols-2 md:grid-cols-4 gap-6">
          {stats.map(({ label, value, icon: Icon }) => (
            <div key={label} className="text-center p-6 rounded-2xl text-white shadow-lg card-hover"
              style={{ background: 'linear-gradient(135deg, #2f5a5e, #1f2a2e)' }}>
              <Icon size={28} className="mx-auto mb-3" style={{ color: '#b8895a' }} />
              <div className="text-3xl font-extrabold mb-1">{value}</div>
              <div className="text-sm font-medium" style={{ color: 'rgba(255,255,255,0.8)' }}>{label}</div>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
