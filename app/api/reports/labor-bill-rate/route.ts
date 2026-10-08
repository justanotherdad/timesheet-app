import { NextResponse } from 'next/server'
import { laborNotFound, requireLaborAccess } from '@/lib/labor-report-access'
import { buildLaborWeeks, parseLaborFilters } from '@/lib/labor-profit-query'

export const dynamic = 'force-dynamic'

export async function POST(req: Request) {
  const gate = await requireLaborAccess()
  if (!gate) return laborNotFound()

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return laborNotFound()
  }
  const filters = parseLaborFilters(body)
  if (!filters) return NextResponse.json({ error: 'Choose a timeframe.' }, { status: 400 })

  try {
    const weeks = await buildLaborWeeks(gate.admin, filters)
    return NextResponse.json({ weeks })
  } catch (err) {
    console.error('labor-bill-rate generate', err)
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }
}
