'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { revalidatePath } from 'next/cache'

export async function setUserPassword(
  userId: string,
  newPassword: string,
  requireChangeOnFirstLogin = false
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

    // Managers may only set password for users who have them as Supervisor, Manager, or Final Approver
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
        return { error: 'You can only change passwords for users who have you as their Supervisor, Manager, or Final Approver' }
      }
    }

    if (!newPassword || newPassword.length < 6) {
      return { error: 'Password must be at least 6 characters' }
    }

    const { error: updateError } = await adminClient.auth.admin.updateUserById(userId, {
      password: newPassword,
    })
    if (updateError) {
      return { error: updateError.message }
    }

    if (requireChangeOnFirstLogin) {
      await adminClient
        .from('user_profiles')
        .update({ must_change_password: true })
        .eq('id', userId)
    }

    revalidatePath('/dashboard/users')
    return { success: true }
  } catch (err: any) {
    return { error: err.message || 'Failed to set password' }
  }
}
