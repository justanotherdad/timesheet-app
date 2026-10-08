import { NextResponse } from 'next/server'
import { laborNotFound, normalizePathSegment, requireLaborAccess } from '@/lib/labor-report-access'

export const dynamic = 'force-dynamic'

export async function GET() {
  const gate = await requireLaborAccess({ owner: true })
  if (!gate) return laborNotFound()
  const { admin } = gate

  const { data: settings } = await admin.from('labor_report_settings').select('path_segment').eq('id', 1).maybeSingle()
  const { data: access } = await admin.from('labor_report_access').select('user_id, is_owner')
  const { data: supers } = await admin
    .from('user_profiles')
    .select('id, name')
    .eq('role', 'super_admin')
    .order('name')

  const names = new Map(
    ((supers || []) as Array<{ id: string; name: string }>).map((p) => [p.id, p.name || 'Unknown'])
  )
  const memberIds = new Set(((access || []) as Array<{ user_id: string }>).map((r) => r.user_id))
  const missing = [...memberIds].filter((id) => !names.has(id))
  if (missing.length > 0) {
    const { data: extra } = await admin.from('user_profiles').select('id, name').in('id', missing)
    for (const p of (extra || []) as Array<{ id: string; name: string }>) names.set(p.id, p.name || 'Unknown')
  }

  return NextResponse.json({
    pathSegment: String((settings as { path_segment?: string } | null)?.path_segment || 'rv'),
    members: ((access || []) as Array<{ user_id: string; is_owner: boolean }>)
      .map((r) => ({ userId: r.user_id, name: names.get(r.user_id) || 'Unknown', isOwner: !!r.is_owner }))
      .sort((a, b) => Number(b.isOwner) - Number(a.isOwner) || a.name.localeCompare(b.name)),
    superAdmins: ((supers || []) as Array<{ id: string; name: string }>)
      .filter((p) => !memberIds.has(p.id))
      .map((p) => ({ userId: p.id, name: p.name || 'Unknown' })),
  })
}

export async function POST(req: Request) {
  const gate = await requireLaborAccess({ owner: true })
  if (!gate) return laborNotFound()
  let body: { userId?: string }
  try {
    body = await req.json()
  } catch {
    return laborNotFound()
  }
  const userId = String(body.userId || '')
  if (!userId) return NextResponse.json({ error: 'Choose a super admin.' }, { status: 400 })

  const { data: profile } = await gate.admin.from('user_profiles').select('id, role').eq('id', userId).maybeSingle()
  if (!profile || (profile as { role: string }).role !== 'super_admin') {
    return NextResponse.json({ error: 'That person is not a super admin.' }, { status: 400 })
  }

  const { error } = await gate.admin.from('labor_report_access').insert({
    user_id: userId,
    is_owner: false,
    granted_by: gate.user.id,
  })
  if (error) return NextResponse.json({ error: 'That person already has access.' }, { status: 400 })
  return NextResponse.json({ ok: true })
}

export async function PATCH(req: Request) {
  const gate = await requireLaborAccess({ owner: true })
  if (!gate) return laborNotFound()
  let body: { pathSegment?: string }
  try {
    body = await req.json()
  } catch {
    return laborNotFound()
  }
  const segment = normalizePathSegment(String(body.pathSegment || ''))
  if (!segment) {
    return NextResponse.json(
      { error: 'Use 2–40 letters, numbers, or hyphens. That word is already a page in the app.' },
      { status: 400 }
    )
  }
  const { error } = await gate.admin.from('labor_report_settings').update({ path_segment: segment }).eq('id', 1)
  if (error) return laborNotFound()
  return NextResponse.json({ pathSegment: segment })
}

export async function DELETE(req: Request) {
  const gate = await requireLaborAccess({ owner: true })
  if (!gate) return laborNotFound()
  let body: { userId?: string }
  try {
    body = await req.json()
  } catch {
    return laborNotFound()
  }
  const userId = String(body.userId || '')
  if (!userId) return laborNotFound()

  const { data: row } = await gate.admin
    .from('labor_report_access')
    .select('is_owner')
    .eq('user_id', userId)
    .maybeSingle()
  if (!row) return laborNotFound()
  if ((row as { is_owner: boolean }).is_owner) {
    return NextResponse.json({ error: 'The owner cannot be removed.' }, { status: 400 })
  }
  const { error } = await gate.admin.from('labor_report_access').delete().eq('user_id', userId).eq('is_owner', false)
  if (error) return laborNotFound()
  return NextResponse.json({ ok: true })
}
