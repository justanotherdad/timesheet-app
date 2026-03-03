'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { revalidatePath } from 'next/cache'

export async function updateUserAssignments(
  userId: string,
  siteIds: string[],
  departmentIds: string[],
  purchaseOrderIds: string[]
) {
  try {
    // Get the current user to verify they're an admin
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

    // Use admin client for permission check and updates (bypasses RLS so we can read target profile)
    let adminClient
    try {
      adminClient = createAdminClient()
    } catch (err: any) {
      return { error: 'Server configuration error: ' + (err.message || 'Missing SUPABASE_SERVICE_ROLE_KEY environment variable') }
    }

    // Managers may only update assignments for users who have them as Supervisor, Manager, or Final Approver
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
        return { error: 'You can only edit site, PO, and department assignments for users who have you as their Supervisor, Manager, or Final Approver' }
      }
    }

    // Delete existing assignments
    await Promise.all([
      adminClient.from('user_sites').delete().eq('user_id', userId),
      adminClient.from('user_departments').delete().eq('user_id', userId),
      adminClient.from('user_purchase_orders').delete().eq('user_id', userId),
    ])

    // Insert new assignments
    if (siteIds.length > 0) {
      await adminClient.from('user_sites').insert(
        siteIds.map(siteId => ({ user_id: userId, site_id: siteId }))
      )
    }

    if (departmentIds.length > 0) {
      await adminClient.from('user_departments').insert(
        departmentIds.map(deptId => ({ user_id: userId, department_id: deptId }))
      )
    }

    if (purchaseOrderIds.length > 0) {
      await adminClient.from('user_purchase_orders').insert(
        purchaseOrderIds.map(poId => ({ user_id: userId, purchase_order_id: poId }))
      )
    }

    revalidatePath('/dashboard/admin/users')
    
    return { success: true }
  } catch (error: any) {
    console.error('Error in updateUserAssignments server action:', error)
    return { error: error.message || 'An unexpected error occurred' }
  }
}

export async function updateUserProfile(
  userId: string,
  updates: {
    name?: string
    email?: string
    role?: string
    supervisor_id?: string | null
    manager_id?: string | null
    final_approver_id?: string | null
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

    const { email, ...profileUpdates } = updates

    if (email !== undefined) {
      const { error: authError } = await adminClient.auth.admin.updateUserById(userId, { email })
      if (authError) return { error: authError.message }
    }

    const { error } = await adminClient
      .from('user_profiles')
      .update({ ...profileUpdates, ...(email !== undefined && { email }) })
      .eq('id', userId)

    if (error) return { error: error.message }
    revalidatePath('/dashboard/admin/users')
    return { success: true }
  } catch (error: any) {
    console.error('Error in updateUserProfile server action:', error)
    return { error: error.message || 'An unexpected error occurred' }
  }
}
