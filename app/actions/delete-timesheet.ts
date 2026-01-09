'use server'

import { createClient } from '@/lib/supabase/server'
import { getCurrentUser } from '@/lib/auth'
import { revalidatePath } from 'next/cache'

export async function deleteTimesheet(timesheetId: string) {
  try {
    if (!timesheetId) {
      return { error: 'Timesheet ID is required' }
    }

    const user = await getCurrentUser()
    if (!user) {
      return { error: 'Unauthorized' }
    }

    const supabase = await createClient()

    // Get the timesheet to verify ownership or admin access
    const { data: timesheet, error: fetchError } = await supabase
      .from('weekly_timesheets')
      .select('user_id, status')
      .eq('id', timesheetId)
      .single()

    if (fetchError || !timesheet) {
      return { error: 'Timesheet not found' }
    }

    // Only allow deletion if:
    // 1. User owns the timesheet AND it's in draft status
    // 2. User is admin or super_admin
    const canDelete = 
      (timesheet.user_id === user.id && timesheet.status === 'draft') ||
      ['admin', 'super_admin'].includes(user.profile.role)

    if (!canDelete) {
      return { error: 'Unauthorized: You can only delete your own draft timesheets, or you must be an admin' }
    }

    // Delete the timesheet (cascade will delete entries and signatures)
    const { error: deleteError } = await supabase
      .from('weekly_timesheets')
      .delete()
      .eq('id', timesheetId)

    if (deleteError) {
      return { error: deleteError.message || 'Failed to delete timesheet' }
    }

    revalidatePath('/dashboard/timesheets')
    
    return { success: true }
  } catch (error: any) {
    console.error('Error in deleteTimesheet server action:', error)
    return { error: error.message || 'An unexpected error occurred while deleting the timesheet' }
  }
}
