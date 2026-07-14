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

export const TIMESHEET_CONFIRMATION_SITE_FILTERS_KEY = 'timesheet_confirmation_site_filters'

/**
 * company_settings value: JSON object mapping a confirmation user id to an
 * array of site (client) ids they want to see confirmations for. A user with
 * no entry (or an empty array) sees confirmations for ALL clients.
 */
export function parseConfirmationSiteFilters(settings: Record<string, string>): Record<string, string[]> {
  const raw = settings[TIMESHEET_CONFIRMATION_SITE_FILTERS_KEY]?.trim()
  if (!raw) return {}
  try {
    const obj = JSON.parse(raw) as unknown
    if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return {}
    const out: Record<string, string[]> = {}
    for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
      if (Array.isArray(value)) {
        const ids = [...new Set(value.filter((x): x is string => typeof x === 'string' && x.length > 0))]
        if (ids.length) out[key] = ids
      }
    }
    return out
  } catch {
    return {}
  }
}

export function stringifyConfirmationSiteFilters(map: Record<string, string[]>): string {
  const clean: Record<string, string[]> = {}
  for (const [key, value] of Object.entries(map || {})) {
    const ids = [...new Set((value || []).filter((x) => typeof x === 'string' && x.length > 0))]
    if (ids.length) clean[key] = ids
  }
  return JSON.stringify(clean)
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

