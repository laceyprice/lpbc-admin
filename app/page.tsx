import Navbar from '@/components/public/Navbar'
import Hero from '@/components/public/Hero'
import About from '@/components/public/About'
import Services from '@/components/public/Services'
import ScheduleSection from '@/components/public/ScheduleSection'
import Contact from '@/components/public/Contact'
import Footer from '@/components/public/Footer'

export default function HomePage() {
  return (
    <main>
      <Navbar />
      <Hero />
      <About />
      <Services />
      <ScheduleSection />
      <Contact />
      <Footer />
    </main>
  )
}
