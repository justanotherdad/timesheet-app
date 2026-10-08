import { NextResponse } from 'next/server'
import { laborNotFound, requireLaborAccess } from '@/lib/labor-report-access'
import type { LaborWeek } from '@/lib/labor-profit-math'

export const dynamic = 'force-dynamic'

function asWeeks(value: unknown): LaborWeek[] | null {
  if (!Array.isArray(value) || value.length > 50000) return null
  const weeks: LaborWeek[] = []
  for (const row of value) {
    if (!row || typeof row !== 'object') return null
    const r = row as Record<string, unknown>
    const employeeType = r.employeeType === 'external' ? 'external' : 'internal'
    const hours = Number(r.hours)
    const billRate = Number(r.billRate)
    const weekEnding = String(r.weekEnding || '').slice(0, 10)
    if (!r.userId || !r.poId || !/^\d{4}-\d{2}-\d{2}$/.test(weekEnding)) return null
    if (!Number.isFinite(hours) || hours < 0 || !Number.isFinite(billRate)) return null
    weeks.push({
      userId: String(r.userId),
      userName: String(r.userName || 'Unknown'),
      employeeType,
      poId: String(r.poId),
      poNumber: String(r.poNumber || ''),
      projectName: String(r.projectName || ''),
      clientName: String(r.clientName || ''),
      weekEnding,
      hours,
      billRate,
    })
  }
  return weeks
}

export async function GET() {
  const gate = await requireLaborAccess()
  if (!gate) return laborNotFound()
  const { admin } = gate

  await admin.from('labor_profit_reports').delete().lt('expires_at', new Date().toISOString())

  const { data, error } = await admin
    .from('labor_profit_reports')
    .select('id, title, created_at, created_by_name, expires_at')
    .order('created_at', { ascending: false })
  if (error) return laborNotFound()

  const reports = ((data || []) as Array<Record<string, unknown>>).map((r) => ({
    id: String(r.id),
    title: String(r.title || ''),
    createdAt: String(r.created_at || ''),
    createdByName: r.created_by_name ? String(r.created_by_name) : null,
    expiresAt: String(r.expires_at || ''),
  }))
  return NextResponse.json({ reports })
}

export async function POST(req: Request) {
  const gate = await requireLaborAccess()
  if (!gate) return laborNotFound()

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return laborNotFound()
  }
  const b = (body || {}) as Record<string, unknown>
  const title = String(b.title || '').trim().slice(0, 160)
  const snap = b.snapshot
  if (!title || !snap || typeof snap !== 'object') {
    return NextResponse.json({ error: 'A report name is required.' }, { status: 400 })
  }
  const raw = snap as Record<string, unknown>
  const weeks = asWeeks(raw.weeks)
  if (!weeks) return NextResponse.json({ error: 'This report could not be saved.' }, { status: 400 })

  const snapshot = {
    kind: 'labor_profit' as const,
    generatedAt: new Date().toISOString(),
    generatedByName: gate.user.profile.name || 'Unknown',
    periodLabel: String(raw.periodLabel || '').slice(0, 200),
    filterLabel: String(raw.filterLabel || '').slice(0, 500),
    weeks,
  }

  const { data, error } = await gate.admin
    .from('labor_profit_reports')
    .insert({
      title,
      created_by: gate.user.id,
      created_by_name: gate.user.profile.name || null,
      snapshot,
    })
    .select('id, title, created_at, created_by_name, expires_at')
    .single()

  if (error || !data) return laborNotFound()
  const row = data as Record<string, unknown>
  return NextResponse.json({
    id: String(row.id),
    title: String(row.title),
    createdAt: String(row.created_at),
    createdByName: row.created_by_name ? String(row.created_by_name) : null,
    expiresAt: String(row.expires_at),
  })
}
