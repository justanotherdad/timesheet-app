import { NextResponse } from 'next/server'
import { laborNotFound, requireLaborAccess } from '@/lib/labor-report-access'
import { rangesOverlap, type PayKind } from '@/lib/labor-profit-math'

export const dynamic = 'force-dynamic'

type RateDb = {
  id: string
  user_id: string
  classification: string
  amount: number | string
  effective_from: string
  effective_to: string | null
}

function mapRate(row: RateDb) {
  return {
    id: row.id,
    userId: row.user_id,
    classification: row.classification === '1099' ? '1099' : 'w2',
    amount: Number(row.amount),
    effectiveFrom: String(row.effective_from).slice(0, 10),
    effectiveTo: row.effective_to ? String(row.effective_to).slice(0, 10) : null,
  }
}

function parseRateBody(body: Record<string, unknown>): {
  userId: string
  classification: PayKind
  amount: number
  effectiveFrom: string
  effectiveTo: string | null
  closeOpenOn: string | null
} | null {
  const userId = String(body.userId || '')
  const classification = body.classification === '1099' ? '1099' : body.classification === 'w2' ? 'w2' : null
  const amount = Number(body.amount)
  const effectiveFrom = String(body.effectiveFrom || '').slice(0, 10)
  const effectiveToRaw = body.effectiveTo
  const effectiveTo =
    effectiveToRaw == null || String(effectiveToRaw).trim() === '' ? null : String(effectiveToRaw).slice(0, 10)
  const closeRaw = body.closeOpenOn
  const closeOpenOn = closeRaw == null || String(closeRaw).trim() === '' ? null : String(closeRaw).slice(0, 10)
  if (!userId || !classification) return null
  if (!Number.isFinite(amount) || amount < 0) return null
  if (!/^\d{4}-\d{2}-\d{2}$/.test(effectiveFrom)) return null
  if (effectiveTo && (!/^\d{4}-\d{2}-\d{2}$/.test(effectiveTo) || effectiveTo < effectiveFrom)) return null
  if (closeOpenOn && !/^\d{4}-\d{2}-\d{2}$/.test(closeOpenOn)) return null
  return { userId, classification, amount, effectiveFrom, effectiveTo, closeOpenOn }
}

export async function GET() {
  const gate = await requireLaborAccess()
  if (!gate) return laborNotFound()
  const { data, error } = await gate.admin
    .from('labor_pay_rates')
    .select('id, user_id, classification, amount, effective_from, effective_to')
    .order('effective_from', { ascending: true })
  if (error) return laborNotFound()
  return NextResponse.json({ rates: ((data || []) as RateDb[]).map(mapRate) })
}

export async function POST(req: Request) {
  const gate = await requireLaborAccess()
  if (!gate) return laborNotFound()
  let body: Record<string, unknown>
  try {
    body = await req.json()
  } catch {
    return laborNotFound()
  }
  const parsed = parseRateBody(body)
  if (!parsed) return NextResponse.json({ error: 'Enter a person, a rate, and a start date.' }, { status: 400 })

  const { data: existing, error: loadError } = await gate.admin
    .from('labor_pay_rates')
    .select('id, user_id, classification, amount, effective_from, effective_to')
    .eq('user_id', parsed.userId)
  if (loadError) return laborNotFound()
  const rows = ((existing || []) as RateDb[]).map(mapRate)

  let working = rows
  if (parsed.closeOpenOn) {
    const open = rows.find((r) => !r.effectiveTo)
    if (!open) return NextResponse.json({ error: 'There is no current rate to end.' }, { status: 400 })
    if (parsed.closeOpenOn < open.effectiveFrom) {
      return NextResponse.json({ error: 'The end date is before that rate started.' }, { status: 400 })
    }
    const { error: closeError } = await gate.admin
      .from('labor_pay_rates')
      .update({ effective_to: parsed.closeOpenOn, updated_at: new Date().toISOString() })
      .eq('id', open.id)
    if (closeError) return laborNotFound()
    working = rows.map((r) => (r.id === open.id ? { ...r, effectiveTo: parsed.closeOpenOn } : r))
  }

  const openLeft = working.filter((r) => !r.effectiveTo)
  if (!parsed.effectiveTo && openLeft.length > 0) {
    return NextResponse.json(
      { error: 'End the current rate before adding another current one.' },
      { status: 400 }
    )
  }
  const clash = working.some((r) => rangesOverlap(r.effectiveFrom, r.effectiveTo, parsed.effectiveFrom, parsed.effectiveTo))
  if (clash) return NextResponse.json({ error: 'That date range overlaps a rate already saved.' }, { status: 400 })

  const { data, error } = await gate.admin
    .from('labor_pay_rates')
    .insert({
      user_id: parsed.userId,
      classification: parsed.classification,
      amount: parsed.amount,
      effective_from: parsed.effectiveFrom,
      effective_to: parsed.effectiveTo,
    })
    .select('id, user_id, classification, amount, effective_from, effective_to')
    .single()
  if (error || !data) return laborNotFound()
  return NextResponse.json({ rate: mapRate(data as RateDb) })
}
