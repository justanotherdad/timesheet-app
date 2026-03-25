import type { SupabaseClient } from '@supabase/supabase-js'

/** True when `delegatorId` has an active delegation (someone else may approve in their place). */
export async function hasActiveOutgoingDelegation(
  adminSupabase: SupabaseClient,
  delegatorId: string,
  today: string
): Promise<boolean> {
  const { data } = await adminSupabase
    .from('approval_delegations')
    .select('id')
    .eq('delegator_id', delegatorId)
    .lte('start_date', today)
    .gte('end_date', today)
    .limit(1)
    .maybeSingle()
  return !!data
}
