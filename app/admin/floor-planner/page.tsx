'use client'
import { PencilRuler } from 'lucide-react'
import FloorPlanner from '@/components/admin/FloorPlanner'

export default function FloorPlannerPage() {
  return (
    <div className="p-4 sm:p-6 max-w-6xl mx-auto">
      <div className="flex items-center gap-2 mb-1">
        <PencilRuler size={20} style={{ color: '#b8895a' }} />
        <h1 className="text-xl font-extrabold text-gray-900">Floor Planner</h1>
        <span className="text-[10px] font-bold uppercase tracking-wider bg-amber-100 text-amber-800 px-2 py-0.5 rounded-full">Prototype</span>
      </div>
      <p className="text-sm text-gray-500 mb-4">
        Draft accurate floor plans on a real measured grid — the foundation for printable, engineer-ready sheets and CAD/DXF export.
      </p>
      <FloorPlanner />
    </div>
  )
}
