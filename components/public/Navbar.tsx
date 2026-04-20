'use client'
import { useState, useEffect } from 'react'
import Image from 'next/image'
import { Menu, X } from 'lucide-react'

const links = [
  { label: 'Home', href: '#home' },
  { label: 'About', href: '#about' },
  { label: 'Services', href: '#services' },
  { label: 'Schedule', href: '#schedule' },
  { label: 'Contact', href: '#contact' },
]

const BLUE = '#b8895a'

export default function Navbar() {
  const [open, setOpen] = useState(false)
  const [scrolled, setScrolled] = useState(false)

  useEffect(() => {
    const h = () => setScrolled(window.scrollY > 20)
    window.addEventListener('scroll', h)
    return () => window.removeEventListener('scroll', h)
  }, [])

  return (
    <header className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 ${scrolled ? 'shadow-lg' : ''}`}
      style={{ background: 'white' }}>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-20 md:h-24">
          <a href="#home" className="flex items-center gap-3">
            <div className="relative w-12 h-12 md:w-14 md:h-14">
              <Image src="/logo.png" alt="L. Price Building Company" fill className="object-contain" />
            </div>
            <div className="flex flex-col leading-tight">
              <span className="font-bold text-lg md:text-xl" style={{ color: BLUE }}>L. Price Building Company</span>
              <span className="text-xs md:text-sm font-medium" style={{ color: BLUE }}>Custom Home Design &amp; Building</span>
            </div>
          </a>

          <nav className="hidden md:flex items-center gap-8">
            {links.map(l => (
              <a key={l.href} href={l.href} className="font-bold text-sm uppercase tracking-wider transition-colors hover:opacity-70"
                style={{ color: BLUE }}>
                {l.label}
              </a>
            ))}
          </nav>

          <div className="hidden md:flex items-center gap-4">
            <a href="#schedule" className="text-white font-bold uppercase tracking-wider px-5 py-2 rounded-full text-sm transition-all shadow-md"
              style={{ background: BLUE }}>
              Book Service
            </a>
          </div>

          <button onClick={() => setOpen(!open)} className="md:hidden p-2" style={{ color: BLUE }}>
            {open ? <X size={24} /> : <Menu size={24} />}
          </button>
        </div>
      </div>

      {open && (
        <div className="md:hidden border-t" style={{ background: 'white', borderColor: 'rgba(184,137,90,0.2)' }}>
          <div className="px-4 py-4 space-y-1">
            {links.map(l => (
              <a key={l.href} href={l.href} onClick={() => setOpen(false)}
                className="block py-3 px-4 rounded-lg transition-colors font-bold uppercase tracking-wider hover:bg-blue-50"
                style={{ color: BLUE }}>
                {l.label}
              </a>
            ))}
            <a href="#schedule" onClick={() => setOpen(false)}
              className="block mt-2 text-white font-bold uppercase tracking-wider px-4 py-3 rounded-lg text-center"
              style={{ background: BLUE }}>
              Book Service
            </a>
          </div>
        </div>
      )}
    </header>
  )
}
