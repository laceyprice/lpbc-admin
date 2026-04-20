'use client'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Calendar, CheckCircle, Loader2 } from 'lucide-react'

const schema = z.object({
  firstName: z.string().min(1, 'Required'),
  lastName: z.string().min(1, 'Required'),
  phone: z.string().min(10, 'Valid phone required'),
  email: z.string().email('Valid email required'),
  jobsiteAddress: z.string().min(5, 'Address required'),
  jobsiteCity: z.string().optional(),
  jobsiteState: z.string().optional(),
  jobsiteZip: z.string().optional(),
  isOwner: z.enum(['yes', 'no']),
  ownerName: z.string().optional(),
  ownerPhone: z.string().optional(),
  ownerEmail: z.string().optional(),
  companyName: z.string().optional(),
  isCompanyOwner: z.enum(['yes', 'no', '']).optional(),
  billingAddress: z.string().optional(),
  billingPhone: z.string().optional(),
  billingEmail: z.string().optional(),
  serviceType: z.string().optional(),
  preferredDate: z.string().optional(),
  preferredTime: z.string().optional(),
  notes: z.string().optional(),
  smsConsent: z.literal(true, { errorMap: () => ({ message: 'You must agree to receive text messages' }) }),
})
type FormData = z.infer<typeof schema>

const INPUT = 'w-full px-4 py-2.5 rounded-xl border border-gray-200 bg-white text-gray-900 text-sm focus:outline-none focus:ring-2 focus:border-blue-400'
const INPUT_ERR = 'w-full px-4 py-2.5 rounded-xl border border-red-400 bg-red-50 text-gray-900 text-sm focus:outline-none focus:ring-2'

function Field({ label, error, children }: { label: string; error?: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-sm font-semibold text-gray-700 mb-1.5">{label}</label>
      {children}
      {error && <p className="mt-1 text-xs text-red-500">{error}</p>}
    </div>
  )
}

export default function ScheduleSection() {
  const [submitted, setSubmitted] = useState(false)
  const [loading, setLoading] = useState(false)
  const [err, setErr] = useState('')
  const { register, handleSubmit, watch, formState: { errors } } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: { isOwner: 'yes' },
  })
  const isOwner = watch('isOwner')
  const company = watch('companyName')
  const isCompanyOwner = watch('isCompanyOwner')

  const onSubmit = async (data: FormData) => {
    setLoading(true); setErr('')
    try {
      const res = await fetch('/api/schedule', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) })
      if (!res.ok) throw new Error()
      setSubmitted(true)
    } catch { setErr('Something went wrong. Please try again or call us directly.') }
    finally { setLoading(false) }
  }

  if (submitted) return (
    <section id="schedule" className="py-24 bg-white">
      <div className="max-w-2xl mx-auto px-4 text-center">
        <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-6">
          <CheckCircle size={40} className="text-green-500" />
        </div>
        <h2 className="text-3xl font-extrabold text-gray-900 mb-4">Request Submitted!</h2>
        <p className="text-gray-600 text-lg mb-8">Thank you! We've received your request and will contact you within 1 business day to confirm your appointment.</p>
        <a href="#home" className="text-white font-bold px-8 py-3 rounded-full" style={{ background: '#b8895a' }}>Back to Home</a>
      </div>
    </section>
  )

  const stepHead = (n: number, title: string, sub?: string) => (
    <div className="mb-4">
      <h3 className="text-lg font-bold text-gray-900 flex items-center gap-2">
        <span className="w-7 h-7 text-white rounded-full flex items-center justify-center text-sm font-bold" style={{ background: '#b8895a' }}>{n}</span>
        {title}
      </h3>
      {sub && <p className="text-gray-500 text-sm ml-9">{sub}</p>}
    </div>
  )

  return (
    <section id="schedule" className="py-24 bg-white">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-12">
          <span className="inline-block font-semibold px-4 py-1.5 rounded-full text-sm mb-4" style={{ background: 'rgba(184,137,90,0.1)', color: '#b8895a' }}>Book a Consultation</span>
          <h2 className="text-3xl md:text-4xl font-extrabold text-gray-900 mb-4">Schedule Your <span style={{ color: '#2f5a5e' }}>Consultation</span></h2>
          <p className="text-gray-500 text-lg max-w-xl mx-auto">Fill out the form below and we'll reach out to confirm your appointment.</p>
        </div>

        <form onSubmit={handleSubmit(onSubmit)} className="bg-gray-50 rounded-3xl p-8 shadow-sm border border-gray-200 space-y-8">
          {/* Step 1 — Contact */}
          <div>
            {stepHead(1, 'Your Contact Information', 'All fields below are required')}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Field label="First Name" error={errors.firstName?.message}><input {...register('firstName')} placeholder="John" className={errors.firstName ? INPUT_ERR : INPUT} /></Field>
              <Field label="Last Name" error={errors.lastName?.message}><input {...register('lastName')} placeholder="Smith" className={errors.lastName ? INPUT_ERR : INPUT} /></Field>
              <Field label="Phone Number" error={errors.phone?.message}><input {...register('phone')} type="tel" placeholder="(555) 555-5555" className={errors.phone ? INPUT_ERR : INPUT} /></Field>
              <Field label="Email Address" error={errors.email?.message}><input {...register('email')} type="email" placeholder="john@example.com" className={errors.email ? INPUT_ERR : INPUT} /></Field>
            </div>
          </div>

          {/* Step 2 — Jobsite */}
          <div>
            {stepHead(2, 'Jobsite Address')}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="sm:col-span-2"><Field label="Street Address" error={errors.jobsiteAddress?.message}><input {...register('jobsiteAddress')} placeholder="123 Main St" className={errors.jobsiteAddress ? INPUT_ERR : INPUT} /></Field></div>
              <Field label="City"><input {...register('jobsiteCity')} placeholder="City" className={INPUT} /></Field>
              <div className="grid grid-cols-2 gap-4">
                <Field label="State"><input {...register('jobsiteState')} placeholder="ST" maxLength={2} className={INPUT} /></Field>
                <Field label="ZIP"><input {...register('jobsiteZip')} placeholder="12345" className={INPUT} /></Field>
              </div>
            </div>
          </div>

          {/* Step 3 — Owner */}
          <div>
            {stepHead(3, 'Property Ownership')}
            <Field label="Are you the property owner?">
              <div className="flex gap-6">
                {['yes', 'no'].map(v => (
                  <label key={v} className="flex items-center gap-2 cursor-pointer">
                    <input {...register('isOwner')} type="radio" value={v} className="w-4 h-4" style={{ accentColor: '#b8895a' }} />
                    <span className="font-medium text-gray-700 capitalize">{v}</span>
                  </label>
                ))}
              </div>
            </Field>
            {isOwner === 'no' && (
              <div className="mt-4 p-4 rounded-xl border border-blue-100" style={{ background: '#EBF5FB' }}>
                <p className="text-sm font-medium mb-3" style={{ color: '#b8895a' }}>Owner's information:</p>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <Field label="Owner Name"><input {...register('ownerName')} placeholder="Full name" className={INPUT} /></Field>
                  <Field label="Owner Phone"><input {...register('ownerPhone')} type="tel" placeholder="(555) 555-5555" className={INPUT} /></Field>
                  <Field label="Owner Email"><input {...register('ownerEmail')} type="email" placeholder="owner@email.com" className={INPUT} /></Field>
                </div>
              </div>
            )}
          </div>

          {/* Step 4 — Company */}
          <div>
            {stepHead(4, 'Company Information', 'Optional — only fill in if work is for a company')}
            <Field label="Company Name (if applicable)"><input {...register('companyName')} placeholder="ABC Company LLC" className={INPUT} /></Field>
            {company && company.length > 0 && (
              <div className="mt-4">
                <Field label="Are you the company owner / authorized representative?">
                  <div className="flex gap-6">
                    {['yes', 'no'].map(v => (
                      <label key={v} className="flex items-center gap-2 cursor-pointer">
                        <input {...register('isCompanyOwner')} type="radio" value={v} className="w-4 h-4" style={{ accentColor: '#b8895a' }} />
                        <span className="font-medium text-gray-700 capitalize">{v}</span>
                      </label>
                    ))}
                  </div>
                </Field>
                {isCompanyOwner === 'no' && (
                  <div className="mt-4 p-4 rounded-xl border border-blue-100" style={{ background: '#EBF5FB' }}>
                    <p className="text-sm font-medium mb-3" style={{ color: '#b8895a' }}>Billing contact:</p>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                      <Field label="Billing Address"><input {...register('billingAddress')} placeholder="123 Billing St" className={INPUT} /></Field>
                      <Field label="Billing Phone"><input {...register('billingPhone')} type="tel" placeholder="(555) 555-5555" className={INPUT} /></Field>
                      <Field label="Billing Email"><input {...register('billingEmail')} type="email" placeholder="billing@company.com" className={INPUT} /></Field>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Step 5 — Service */}
          <div>
            {stepHead(5, 'Service Details')}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <Field label="Service Type">
                <select {...register('serviceType')} className={INPUT}>
                  <option value="">Select...</option>
                  {['Service Call','Gas Line Installation','Gas Appliance Connection','Gas Leak Detection','Emergency Repair','Rough-In','Trim-Out','Retrofit','Appliance Installation','Appliance Repair','Pool/Spa Heater','Outdoor Kitchen','Generator Connection','Safety Inspection','Pressure Testing','Inspection & Compliance','Other'].map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </Field>
              <Field label="Preferred Date"><input {...register('preferredDate')} type="date" className={INPUT} /></Field>
              <Field label="Preferred Time">
                <select {...register('preferredTime')} className={INPUT}>
                  <option value="">Any time</option>
                  <option>Morning (8AM–12PM)</option>
                  <option>Afternoon (12PM–5PM)</option>
                </select>
              </Field>
            </div>
            <div className="mt-4"><Field label="Additional Notes"><textarea {...register('notes')} rows={3} placeholder="Describe your issue..." className={`${INPUT} resize-none`} /></Field></div>
          </div>

          {/* SMS Consent */}
          <div>
            <label className="flex items-start gap-3 cursor-pointer">
              <input {...register('smsConsent')} type="checkbox" className="w-5 h-5 mt-0.5 rounded" style={{ accentColor: '#b8895a' }} />
              <span className="text-sm text-gray-600">
                I agree to receive appointment reminders and confirmations via text message at the phone number provided. Message and data rates may apply. Reply STOP to opt out at any time.
              </span>
            </label>
            {errors.smsConsent && <p className="mt-1 ml-8 text-xs text-red-500">{errors.smsConsent.message}</p>}
          </div>

          {err && <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl text-sm">{err}</div>}

          <button type="submit" disabled={loading} className="w-full text-white font-bold py-4 rounded-xl text-lg transition-all shadow-md disabled:opacity-60 flex items-center justify-center gap-2"
            style={{ background: '#b8895a' }}>
            {loading ? <><Loader2 size={20} className="animate-spin" />Submitting...</> : <><Calendar size={20} />Submit Schedule Request</>}
          </button>
        </form>
      </div>
    </section>
  )
}
