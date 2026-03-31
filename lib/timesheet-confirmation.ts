import type { SupabaseClient } from '@supabase/supabase-js'

export const TIMESHEET_CONFIRMATION_USER_IDS_KEY = 'timesheet_confirmation_user_ids'

/** company_settings value: JSON array of user profile UUID strings */
export function parseConfirmationAssigneeIds(settings: Record<string, string>): string[] {
  const raw = settings[TIMESHEET_CONFIRMATION_USER_IDS_KEY]?.trim()
  if (!raw) return []
  try {
    const arr = JSON.parse(raw) as unknown
    if (!Array.isArray(arr)) return []
    return arr.filter((id): id is string => typeof id === 'string' && id.length > 0)
  } catch {
    return []
  }
}

export function stringifyConfirmationAssigneeIds(ids: string[]): string {
  return JSON.stringify([...new Set(ids)])
}

export async function loadCompanySettingsMap(
  supabase: SupabaseClient
): Promise<Record<string, string>> {
  const { data } = await supabase.from('company_settings').select('key, value')
  const settings: Record<string, string> = {}
  for (const row of data || []) {
    settings[(row as { key: string }).key] = (row as { value: string | null }).value ?? ''
  }
  return settings
}

/** Next sequence when transitioning to approved (increment each approval). */
export function nextApprovalConfirmationSequence(current: number | null | undefined): number {
  return (current ?? 0) + 1
}

