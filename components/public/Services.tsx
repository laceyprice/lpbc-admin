import { Home, Wrench, PaintBucket, Building2, ShieldCheck, Ruler, Lightbulb, HardHat } from 'lucide-react'

const services = [
  { icon: Home, title: 'Custom Home Building', description: 'Full-service custom home construction from concept to completion. We bring your dream home to life.', features: ['Floor plan design', 'New construction', 'Coastal living'] },
  { icon: Wrench, title: 'Home Remodeling', description: 'Transform your existing home with expert remodeling and renovation services.', features: ['Whole-home renovation', 'Room additions', 'Structural updates'] },
  { icon: PaintBucket, title: 'Kitchen & Bath Design', description: 'Beautiful, functional kitchen and bathroom designs tailored to your lifestyle.', features: ['Custom cabinetry', 'Counter tops', 'Fixture selection'] },
  { icon: Ruler, title: 'Design Consultation', description: 'Expert guidance on floor plans, materials, colors, and finishes for your project.', features: ['Floor plan review', 'Material selection', 'Color consultation'] },
  { icon: Building2, title: 'Residential Construction', description: 'Licensed residential contractor delivering quality craftsmanship on every project.', features: ['Licensed & insured', 'Code compliant', 'Quality materials'] },
  { icon: Lightbulb, title: 'Interior Design', description: 'Lighting, colors, fixtures, and finishes that make your space feel like home.', features: ['Lighting design', 'Color selection', 'Finish coordination'] },
  { icon: HardHat, title: 'Project Management', description: 'Full project oversight from permitting through final walk-through.', features: ['Timeline management', 'Subcontractor coordination', 'Budget tracking'] },
  { icon: ShieldCheck, title: 'Inspections & Permits', description: 'We handle all permitting and ensure your project meets local building codes.', features: ['Permit applications', 'Code compliance', 'Final inspections'] },
]

export default function Services() {
  return (
    <section id="services" className="py-24 bg-gray-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-16">
          <span className="inline-block font-semibold px-4 py-1.5 rounded-full text-sm mb-4"
            style={{ background: 'rgba(184,137,90,0.1)', color: '#2f5a5e' }}>What We Do</span>
          <h2 className="text-3xl md:text-4xl font-extrabold text-gray-900 mb-4">
            Our <span style={{ color: '#2f5a5e' }}>Services</span>
          </h2>
          <p className="text-gray-500 text-lg max-w-2xl mx-auto">
            From custom home design to complete construction and remodeling — every decision, considered together.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
          {services.map(({ icon: Icon, title, description, features }) => (
            <div key={title} className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100 card-hover group">
              <div className="w-12 h-12 rounded-xl flex items-center justify-center mb-4 group-hover:scale-110 transition-transform"
                style={{ background: 'linear-gradient(135deg, #b8895a, #2f5a5e)' }}>
                <Icon size={22} className="text-white" />
              </div>
              <h3 className="font-bold text-gray-900 text-base mb-2">{title}</h3>
              <p className="text-gray-500 text-sm leading-relaxed mb-4">{description}</p>
              <ul className="space-y-1">
                {features.map(f => (
                  <li key={f} className="text-xs flex items-center gap-1.5" style={{ color: '#2f5a5e' }}>
                    <span className="w-1 h-1 rounded-full inline-block" style={{ background: '#b8895a' }} />
                    {f}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div className="text-center mt-14">
          <p className="text-gray-600 mb-5">Have a specific project in mind? Let's talk about it.</p>
          <div className="flex flex-wrap justify-center gap-4">
            <a href="#schedule" className="text-white font-bold px-8 py-3 rounded-full shadow-md transition-all"
              style={{ background: '#b8895a' }}>Schedule a Consultation</a>
            <a href="#contact" className="font-bold px-8 py-3 rounded-full transition-all border-2"
              style={{ borderColor: '#2f5a5e', color: '#2f5a5e' }}>Ask Us a Question</a>
          </div>
        </div>
      </div>
    </section>
  )
}
