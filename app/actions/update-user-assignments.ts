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

    if (!currentUserProfile || !['supervisor', 'manager', 'admin', 'super_admin'].includes(currentUserProfile.role)) {
      return { error: 'Unauthorized' }
    }

    // Supervisors and managers may only update assignments for users that report to them
    if (['supervisor', 'manager'].includes(currentUserProfile.role)) {
      const { data: targetProfile } = await supabase
        .from('user_profiles')
        .select('reports_to_id, supervisor_id, manager_id')
        .eq('id', userId)
        .single()
      const reportsToCurrentUser =
        targetProfile?.reports_to_id === user.id ||
        targetProfile?.supervisor_id === user.id ||
        targetProfile?.manager_id === user.id
      if (!reportsToCurrentUser) {
        return { error: 'You can only edit site, PO, and department assignments for users who report to you' }
      }
    }

    // Use admin client to update assignments
    let adminClient
    try {
      adminClient = createAdminClient()
    } catch (err: any) {
      return { error: 'Server configuration error: ' + (err.message || 'Missing SUPABASE_SERVICE_ROLE_KEY environment variable') }
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
