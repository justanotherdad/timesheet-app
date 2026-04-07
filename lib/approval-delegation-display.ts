import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * For each next approver in the chain, if they have an active timesheet delegation today,
 * return the delegate's display name; otherwise the approver's name. Used for "With (person)" columns.
 */
export async function buildApproverDisplayNamesByNextId(
  adminSupabase: SupabaseClient,
  nextApproverIds: string[],
  today: string
): Promise<Record<string, string>> {
  const unique = [...new Set(nextApproverIds.filter(Boolean))]
  if (unique.length === 0) return {}

  const { data: delegations } = await adminSupabase
    .from('approval_delegations')
    .select('delegator_id, delegate_id')
    .in('delegator_id', unique)
    .lte('start_date', today)
    .gte('end_date', today)

  const delegatorToDelegate = new Map<string, string>()
  for (const row of delegations || []) {
    const d = row as { delegator_id: string; delegate_id: string }
    if (!delegatorToDelegate.has(d.delegator_id)) {
      delegatorToDelegate.set(d.delegator_id, d.delegate_id)
    }
  }

  const delegateIds = [...new Set(Array.from(delegatorToDelegate.values()))]
  const needNames = [...new Set([...unique, ...delegateIds])]
  const { data: allProfiles } = await adminSupabase.from('user_profiles').select('id, name').in('id', needNames)
  const names = Object.fromEntries(
    (allProfiles || []).map((p: { id: string; name?: string | null }) => [p.id, p.name || 'Unknown'])
  )

  const out: Record<string, string> = {}
  for (const nextId of unique) {
    const delegateId = delegatorToDelegate.get(nextId)
    out[nextId] = delegateId ? names[delegateId] ?? 'Unknown' : names[nextId] ?? 'Unknown'
  }
  return out
}
