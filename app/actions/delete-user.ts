'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { revalidatePath } from 'next/cache'

export async function deleteUser(userId: string) {
  try {
    if (!userId) {
      return { error: 'User ID is required' }
    }

    // Get the current user to verify they're an admin
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    
    if (authError || !user) {
      return { error: 'Unauthorized' }
    }

    // Check if current user is admin
    const { data: currentUserProfile } = await supabase
      .from('user_profiles')
      .select('role')
      .eq('id', user.id)
      .single()

    if (!currentUserProfile || !['admin', 'super_admin'].includes(currentUserProfile.role)) {
      return { error: 'Unauthorized: Admin access required' }
    }

    // Prevent deleting yourself
    if (user.id === userId) {
      return { error: 'You cannot delete your own account' }
    }

    // Use admin client to delete user
    let adminClient
    try {
      adminClient = createAdminClient()
    } catch (err: any) {
      return { error: 'Server configuration error: ' + (err.message || 'Missing SUPABASE_SERVICE_ROLE_KEY environment variable') }
    }

    // Delete the auth user (this will cascade delete the profile due to foreign key)
    const { error: deleteError } = await adminClient.auth.admin.deleteUser(userId)

    if (deleteError) {
      // If auth user deletion fails, try to delete the profile anyway
      const { error: profileError } = await adminClient
        .from('user_profiles')
        .delete()
        .eq('id', userId)

      if (profileError) {
        return { error: deleteError.message || profileError.message || 'Failed to delete user' }
      }
    }

    revalidatePath('/dashboard/admin/users')
    
    return { success: true }
  } catch (error: any) {
    console.error('Error in deleteUser server action:', error)
    return { error: error.message || 'An unexpected error occurred while deleting the user' }
  }
}
