import { Flame, Wrench, Home, Building2, ShieldCheck, AlertTriangle, Thermometer, Pipette } from 'lucide-react'

const services = [
  { icon: Flame, title: 'Gas Line Installation', description: 'New gas line installation for homes and businesses. Properly sized, tested, and code compliant.', features: ['Residential & commercial', 'Leak-tested & certified', 'Permit assistance'] },
  { icon: Wrench, title: 'Appliance Installation', description: 'Safe connection of ranges, dryers, water heaters, generators, and all gas appliances.', features: ['All major brands', 'Flexible connectors', 'Full test & inspection'] },
  { icon: Thermometer, title: 'Appliance Repair', description: 'Diagnosis and repair of gas appliances that aren\'t performing properly or safely.', features: ['Same-day available', 'All appliance types', 'Warranty on repairs'] },
  { icon: ShieldCheck, title: 'Safety Inspections', description: 'Comprehensive gas safety inspections to detect leaks, check connections, and ensure compliance.', features: ['Full system check', 'Leak detection', 'Compliance report'] },
  { icon: Home, title: 'Residential Services', description: 'Complete residential gas services for homeowners — new construction to renovation projects.', features: ['Kitchen gas lines', 'Outdoor BBQ/fire pit', 'Generator connections'] },
  { icon: Building2, title: 'Commercial Services', description: 'Professional gas services for restaurants, retail spaces, and commercial properties.', features: ['Restaurant equipment', 'HVAC gas systems', 'Code compliance'] },
  { icon: Pipette, title: 'Pressure Testing', description: 'Pressure testing of gas lines to ensure system integrity and identify any existing issues.', features: ['Pre-inspection testing', 'Post-repair verification', 'Documentation provided'] },
  { icon: AlertTriangle, title: 'Emergency Services', description: 'When you smell gas or have an urgent issue, we respond quickly to keep your family safe.', features: ['Rapid response', 'Leak isolation', 'Emergency shut-off'] },
]

export default function Services() {
  return (
    <section id="services" className="py-24 bg-gray-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-16">
          <span className="inline-block font-semibold px-4 py-1.5 rounded-full text-sm mb-4"
            style={{ background: 'rgba(74,173,224,0.1)', color: '#185FA5' }}>What We Do</span>
          <h2 className="text-3xl md:text-4xl font-extrabold text-gray-900 mb-4">
            Our <span style={{ color: '#185FA5' }}>Services</span>
          </h2>
          <p className="text-gray-500 text-lg max-w-2xl mx-auto">
            From simple appliance hookups to full gas line installations — we handle it all safely and professionally.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
          {services.map(({ icon: Icon, title, description, features }) => (
            <div key={title} className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100 card-hover group">
              <div className="w-12 h-12 rounded-xl flex items-center justify-center mb-4 group-hover:scale-110 transition-transform"
                style={{ background: 'linear-gradient(135deg, #4AADE0, #185FA5)' }}>
                <Icon size={22} className="text-white" />
              </div>
              <h3 className="font-bold text-gray-900 text-base mb-2">{title}</h3>
              <p className="text-gray-500 text-sm leading-relaxed mb-4">{description}</p>
              <ul className="space-y-1">
                {features.map(f => (
                  <li key={f} className="text-xs flex items-center gap-1.5" style={{ color: '#185FA5' }}>
                    <span className="w-1 h-1 rounded-full inline-block" style={{ background: '#4AADE0' }} />
                    {f}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div className="text-center mt-14">
          <p className="text-gray-600 mb-5">Don't see your specific need? We likely handle it.</p>
          <div className="flex flex-wrap justify-center gap-4">
            <a href="#schedule" className="text-white font-bold px-8 py-3 rounded-full shadow-md transition-all"
              style={{ background: '#185FA5' }}>Schedule a Service</a>
            <a href="#contact" className="font-bold px-8 py-3 rounded-full transition-all border-2"
              style={{ borderColor: '#185FA5', color: '#185FA5' }}>Ask Us a Question</a>
          </div>
        </div>
      </div>
    </section>
  )
}
