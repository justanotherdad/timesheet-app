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
    classification: (row.classification === '1099' ? '1099' : 'w2') as PayKind,
    amount: Number(row.amount),
    effectiveFrom: String(row.effective_from).slice(0, 10),
    effectiveTo: row.effective_to ? String(row.effective_to).slice(0, 10) : null,
  }
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const gate = await requireLaborAccess()
  if (!gate) return laborNotFound()
  const { id } = await params
  let body: Record<string, unknown>
  try {
    body = await req.json()
  } catch {
    return laborNotFound()
  }

  const { data: current, error: currentError } = await gate.admin
    .from('labor_pay_rates')
    .select('id, user_id, classification, amount, effective_from, effective_to')
    .eq('id', id)
    .maybeSingle()
  if (currentError || !current) return laborNotFound()
  const row = mapRate(current as RateDb)

  const classification: PayKind =
    body.classification === '1099' ? '1099' : body.classification === 'w2' ? 'w2' : row.classification
  const amount = body.amount == null ? row.amount : Number(body.amount)
  const effectiveFrom = body.effectiveFrom == null ? row.effectiveFrom : String(body.effectiveFrom).slice(0, 10)
  const effectiveTo =
    body.effectiveTo === undefined
      ? row.effectiveTo
      : body.effectiveTo == null || String(body.effectiveTo).trim() === ''
        ? null
        : String(body.effectiveTo).slice(0, 10)

  if (!Number.isFinite(amount) || amount < 0) return NextResponse.json({ error: 'Enter a pay rate.' }, { status: 400 })
  if (!/^\d{4}-\d{2}-\d{2}$/.test(effectiveFrom)) return NextResponse.json({ error: 'Enter a start date.' }, { status: 400 })
  if (effectiveTo && (!/^\d{4}-\d{2}-\d{2}$/.test(effectiveTo) || effectiveTo < effectiveFrom)) {
    return NextResponse.json({ error: 'The end date is before the start date.' }, { status: 400 })
  }

  const { data: others } = await gate.admin
    .from('labor_pay_rates')
    .select('id, user_id, classification, amount, effective_from, effective_to')
    .eq('user_id', row.userId)
    .neq('id', id)
  const rest = ((others || []) as RateDb[]).map(mapRate)
  if (!effectiveTo && rest.some((r) => !r.effectiveTo)) {
    return NextResponse.json({ error: 'Only one rate can be current.' }, { status: 400 })
  }
  if (rest.some((r) => rangesOverlap(r.effectiveFrom, r.effectiveTo, effectiveFrom, effectiveTo))) {
    return NextResponse.json({ error: 'That date range overlaps a rate already saved.' }, { status: 400 })
  }

  const { data, error } = await gate.admin
    .from('labor_pay_rates')
    .update({
      classification,
      amount,
      effective_from: effectiveFrom,
      effective_to: effectiveTo,
      updated_at: new Date().toISOString(),
    })
    .eq('id', id)
    .select('id, user_id, classification, amount, effective_from, effective_to')
    .single()
  if (error || !data) return laborNotFound()
  return NextResponse.json({ rate: mapRate(data as RateDb) })
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const gate = await requireLaborAccess()
  if (!gate) return laborNotFound()
  const { id } = await params
  const { error } = await gate.admin.from('labor_pay_rates').delete().eq('id', id)
  if (error) return laborNotFound()
  return NextResponse.json({ ok: true })
}
