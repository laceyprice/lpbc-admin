import Link from 'next/link'
import Image from 'next/image'

export default function InvoiceCancelledPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 p-6">
      <div className="bg-white rounded-3xl shadow-xl p-10 w-full max-w-md text-center">
        <div className="w-20 h-20 mx-auto mb-6 relative">
          <Image src="/logo.png" alt="L. Price Building Company" fill className="object-contain" />
        </div>
        <div className="w-16 h-16 bg-orange-100 rounded-full flex items-center justify-center mx-auto mb-5">
          <svg className="w-8 h-8 text-orange-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </div>
        <h1 className="text-2xl font-extrabold text-gray-900 mb-2">Payment Cancelled</h1>
        <p className="text-gray-500 mb-6">Your payment was not completed. No charges have been made. You can try again at any time using the link in your invoice email.</p>
        <div className="bg-orange-50 border border-orange-100 rounded-2xl p-4 mb-6 text-sm text-orange-700">
          <p>The payment link in your email remains valid. Please try again or contact us if you need assistance.</p>
        </div>
        <Link href="/" className="inline-block text-white font-bold px-8 py-3 rounded-xl w-full mb-3" style={{ background: '#b8895a' }}>
          Return to Homepage
        </Link>
        <Link href="/#contact" className="inline-block border border-gray-200 text-gray-700 font-bold px-8 py-3 rounded-xl w-full hover:bg-gray-50">
          Contact Us
        </Link>
        <p className="mt-4 text-xs text-gray-400">Need help? Email us at <a href="mailto:Lacey@LaceyNPrice.com" className="underline">Lacey@LaceyNPrice.com</a></p>
      </div>
    </div>
  )
}
