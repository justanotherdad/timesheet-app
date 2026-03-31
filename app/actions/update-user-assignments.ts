'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { revalidatePath } from 'next/cache'

export async function updateUserProfile(
  userId: string,
  updates: {
    name?: string
    email?: string
    role?: string
    employee_type?: 'internal' | 'external' | null
    supervisor_id?: string | null
    manager_id?: string | null
    final_approver_id?: string | null
    active?: boolean
  }
) {
  try {
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    
    if (authError || !user) {
      return { error: 'Unauthorized' }
    }

    const { data: currentUserProfile } = await supabase
      .from('user_profiles')
      .select('role')
      .eq('id', user.id)
      .single()

    if (!currentUserProfile || !['manager', 'admin', 'super_admin'].includes(currentUserProfile.role)) {
      return { error: 'Unauthorized' }
    }

    let adminClient
    try {
      adminClient = createAdminClient()
    } catch (err: any) {
      return { error: 'Server configuration error: ' + (err.message || 'Missing SUPABASE_SERVICE_ROLE_KEY environment variable') }
    }

    // Managers may only update profiles for users who have them as Supervisor, Manager, or Final Approver
    if (currentUserProfile.role === 'manager') {
      const { data: targetProfile } = await adminClient
        .from('user_profiles')
        .select('supervisor_id, manager_id, reports_to_id, final_approver_id')
        .eq('id', userId)
        .single()
      const canEdit =
        targetProfile?.supervisor_id === user.id ||
        targetProfile?.manager_id === user.id ||
        targetProfile?.reports_to_id === user.id ||
        targetProfile?.final_approver_id === user.id
      if (!canEdit) {
        return { error: 'You can only edit users who have you as their Supervisor, Manager, or Final Approver' }
      }
    }

    const { email, employee_type, ...profileUpdates } = updates

    if (email !== undefined) {
      const { error: authError } = await adminClient.auth.admin.updateUserById(userId, { email })
      if (authError) return { error: authError.message }
    }

    const updatePayload: Record<string, unknown> = {
      ...profileUpdates,
      ...(email !== undefined && { email }),
      ...(employee_type !== undefined && { employee_type: employee_type ?? 'internal' }),
    }
    if (updates.active !== undefined) updatePayload.active = updates.active

    const { error } = await adminClient
      .from('user_profiles')
      .update(updatePayload)
      .eq('id', userId)

    if (error) return { error: error.message }

    revalidatePath('/dashboard/admin/users')
    return { success: true }
  } catch (error: any) {
    console.error('Error in updateUserProfile server action:', error)
    return { error: error.message || 'An unexpected error occurred' }
  }
}
