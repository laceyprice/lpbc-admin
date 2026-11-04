import { NextResponse } from 'next/server'
export const dynamic = 'force-dynamic'

// Which build is this server running? (Same id the bottom-right tag shows.)
export async function GET() {
  return NextResponse.json({ build: process.env.NEXT_PUBLIC_BUILD_ID || 'dev' }, { headers: { 'Cache-Control': 'no-store' } })
}
