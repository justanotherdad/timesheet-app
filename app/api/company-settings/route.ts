import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getCurrentUser } from '@/lib/auth'
import {
  TIMESHEET_CONFIRMATION_USER_IDS_KEY,
  parseConfirmationAssigneeIds,
  stringifyConfirmationAssigneeIds,
} from '@/lib/timesheet-confirmation'

export const dynamic = 'force-dynamic'

/** GET: Fetch company settings (all authenticated users can read) */
export async function GET() {
  const user = await getCurrentUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = await createClient()
  const { data, error } = await supabase
    .from('company_settings')
    .select('key, value')
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const settings: Record<string, string> = {}
  for (const row of data || []) {
    settings[row.key] = row.value ?? ''
  }
  return NextResponse.json({
    ...settings,
    timesheet_confirmation_user_ids: parseConfirmationAssigneeIds(settings),
  })
}

/** PATCH: Update company settings (admin/super_admin only) */
export async function PATCH(req: Request) {
  const user = await getCurrentUser()
  if (!user || !['admin', 'super_admin'].includes(user.profile.role)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await req.json()
  const supabase = await createClient()

  const updates: Array<{ key: string; value: string }> = []
  if (typeof body.company_email === 'string') {
    updates.push({ key: 'company_email', value: body.company_email.trim() })
  }
  if (body.timesheet_confirmation_user_ids !== undefined) {
    const raw = body.timesheet_confirmation_user_ids
    const ids = Array.isArray(raw)
      ? raw
      : typeof raw === 'string'
        ? (() => {
            try {
              return JSON.parse(raw) as unknown
            } catch {
              return []
            }
          })()
        : []
    const cleaned = [...new Set((ids as unknown[]).filter((x): x is string => typeof x === 'string' && x.length > 0))]
    updates.push({ key: TIMESHEET_CONFIRMATION_USER_IDS_KEY, value: stringifyConfirmationAssigneeIds(cleaned) })
  }

  for (const { key, value } of updates) {
    const { error } = await supabase
      .from('company_settings')
      .upsert({ key, value, updated_at: new Date().toISOString() }, { onConflict: 'key' })
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }
  }

  const { data } = await supabase.from('company_settings').select('key, value')
  const settings: Record<string, string> = {}
  for (const row of data || []) {
    settings[row.key] = row.value ?? ''
  }
  return NextResponse.json({
    ...settings,
    timesheet_confirmation_user_ids: parseConfirmationAssigneeIds(settings),
  })
}
