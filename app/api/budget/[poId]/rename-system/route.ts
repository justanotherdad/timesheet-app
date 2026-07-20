import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getCurrentUser } from '@/lib/auth'
import { canAccessPoBudget } from '@/lib/access'

export const dynamic = 'force-dynamic'

function canWrite(role: string) {
  return ['manager', 'admin', 'super_admin'].includes(role)
}

/**
 * PATCH: rename a project system IN PLACE. Updates systems.name / systems.code
 * for a system scoped to this project PO, so every matrix row (and future
 * timesheet mapping) that uses this system reflects the new name. Used by the
 * Project Matrix edit-row dialog.
 *
 * Body: { system_id: string, name: string, code?: string | null }
 */
export async function PATCH(req: Request, { params }: { params: Promise<{ poId: string }> }) {
  const { poId } = await params
  const user = await getCurrentUser()
  if (!user || !canWrite(user.profile.role)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = await createClient()
  if (!(await canAccessPoBudget(supabase, user.id, user.profile.role, poId))) {
    return NextResponse.json({ error: 'Access denied' }, { status: 403 })
  }

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>
  const systemId = typeof body.system_id === 'string' ? body.system_id.trim() : ''
  const name = typeof body.name === 'string' ? body.name.trim() : ''
  const code =
    body.code == null || String(body.code).trim() === '' ? null : String(body.code).trim()
  if (!systemId) return NextResponse.json({ error: 'system_id is required' }, { status: 400 })
  if (!name) return NextResponse.json({ error: 'System name is required' }, { status: 400 })

  let admin: ReturnType<typeof createAdminClient>
  try {
    admin = createAdminClient()
  } catch {
    return NextResponse.json({ error: 'Server configuration error' }, { status: 500 })
  }

  // Ensure the system belongs to this project PO before renaming it.
  const { data: sys } = await admin
    .from('systems')
    .select('id, project_po_id')
    .eq('id', systemId)
    .single()
  if (!sys || sys.project_po_id !== poId) {
    return NextResponse.json({ error: 'System not found on this PO' }, { status: 404 })
  }

  const { error } = await admin
    .from('systems')
    .update({ name, code })
    .eq('id', systemId)
    .eq('project_po_id', poId)
  if (error) {
    if ((error as { code?: string }).code === '23505') {
      return NextResponse.json(
        {
          error:
            'A system with that name already exists on this PO. Use the System dropdown to move this row onto it instead of renaming.',
        },
        { status: 409 }
      )
    }
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
