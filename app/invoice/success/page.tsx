import Link from 'next/link'
import Image from 'next/image'

export default function InvoiceSuccessPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 p-6">
      <div className="bg-white rounded-3xl shadow-xl p-10 w-full max-w-md text-center">
        <div className="w-20 h-20 mx-auto mb-6 relative">
          <Image src="/logo.png" alt="L. Price Building Company" fill className="object-contain" />
        </div>
        <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-5">
          <svg className="w-8 h-8 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
          </svg>
        </div>
        <h1 className="text-2xl font-extrabold text-gray-900 mb-2">Payment Successful!</h1>
        <p className="text-gray-500 mb-6">Thank you for your payment. Your invoice has been marked as paid and a receipt has been sent to your email.</p>
        <div className="bg-gray-50 rounded-2xl p-4 mb-6 text-left text-sm text-gray-600 space-y-1">
          <div className="flex items-center gap-2">
            <svg className="w-4 h-4 text-green-500" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" /></svg>
            Payment processed securely
          </div>
          <div className="flex items-center gap-2">
            <svg className="w-4 h-4 text-green-500" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" /></svg>
            Receipt sent to your email
          </div>
          <div className="flex items-center gap-2">
            <svg className="w-4 h-4 text-green-500" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" /></svg>
            Invoice updated to paid
          </div>
        </div>
        <Link href="/" className="inline-block text-white font-bold px-8 py-3 rounded-xl w-full" style={{ background: '#b8895a' }}>
          Return to Homepage
        </Link>
        <p className="mt-4 text-xs text-gray-400">Questions? Call us at <a href="tel:+18505989128" className="underline">850-598-9128</a></p>
      </div>
    </div>
  )
}
