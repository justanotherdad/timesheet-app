import { NextResponse } from 'next/server'
import { laborNotFound, requireLaborAccess } from '@/lib/labor-report-access'

export const dynamic = 'force-dynamic'

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const gate = await requireLaborAccess()
  if (!gate) return laborNotFound()
  const { id } = await params

  const { data, error } = await gate.admin
    .from('labor_profit_reports')
    .select('id, title, created_at, created_by_name, expires_at, snapshot')
    .eq('id', id)
    .maybeSingle()
  if (error || !data) return laborNotFound()

  const row = data as Record<string, unknown>
  if (String(row.expires_at || '') < new Date().toISOString()) return laborNotFound()

  return NextResponse.json({
    id: String(row.id),
    title: String(row.title || ''),
    createdAt: String(row.created_at || ''),
    createdByName: row.created_by_name ? String(row.created_by_name) : null,
    expiresAt: String(row.expires_at || ''),
    snapshot: row.snapshot,
  })
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const gate = await requireLaborAccess()
  if (!gate) return laborNotFound()
  const { id } = await params
  const { error } = await gate.admin.from('labor_profit_reports').delete().eq('id', id)
  if (error) return laborNotFound()
  return NextResponse.json({ ok: true })
}
