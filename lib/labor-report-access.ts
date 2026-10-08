import { NextResponse } from 'next/server'
import type { SupabaseClient } from '@supabase/supabase-js'
import { createAdminClient } from '@/lib/supabase/admin'
import { getCurrentUser, type CurrentUser } from '@/lib/auth'

/** First path segment under /dashboard that already belongs to another page. */
export const RESERVED_DASHBOARD_SEGMENTS = new Set([
  'admin',
  'approvals',
  'bid-sheets',
  'budget',
  'change-password',
  'holiday-calendar',
  'pto',
  'reports',
  'timesheet-confirmations',
  'timesheets',
])

export function normalizePathSegment(raw: string): string | null {
  const s = raw.trim().toLowerCase()
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(s)) return null
  if (s.length < 2 || s.length > 40) return null
  if (RESERVED_DASHBOARD_SEGMENTS.has(s)) return null
  return s
}

export function laborNotFound() {
  return NextResponse.json({ error: 'Not found' }, { status: 404 })
}

export type LaborGate = {
  user: CurrentUser
  admin: SupabaseClient
  isOwner: boolean
}

/**
 * Super admin who is on labor_report_access.
 * Returns null for everyone else, including other super admins.
 * Pass owner: true for the address and grant routes.
 */
export async function requireLaborAccess(opts?: { owner?: boolean }): Promise<LaborGate | null> {
  const user = await getCurrentUser()
  if (!user || user.profile.role !== 'super_admin') return null

  let admin: SupabaseClient
  try {
    admin = createAdminClient()
  } catch {
    return null
  }

  const { data, error } = await admin
    .from('labor_report_access')
    .select('is_owner')
    .eq('user_id', user.id)
    .maybeSingle()

  if (error || !data) return null
  const isOwner = !!(data as { is_owner?: boolean }).is_owner
  if (opts?.owner && !isOwner) return null
  return { user, admin, isOwner }
}
