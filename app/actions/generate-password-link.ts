'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

export async function generatePasswordLink(email: string) {
  try {
    if (!email) {
      return { error: 'Email is required' }
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

    // Use admin client to generate link
    let adminClient
    try {
      adminClient = createAdminClient()
    } catch (err: any) {
      return { error: 'Server configuration error: ' + (err.message || 'Missing SUPABASE_SERVICE_ROLE_KEY environment variable') }
    }

    // Generate password reset link
    const { data: linkData, error: linkError } = await adminClient.auth.admin.generateLink({
      type: 'recovery',
      email,
      options: {
        redirectTo: `${process.env.NEXT_PUBLIC_SITE_URL || 'https://ctgtimesheet.com'}/login`
      }
    })

    if (linkError || !linkData?.properties?.action_link) {
      return { error: linkError?.message || 'Failed to generate password reset link' }
    }

    return {
      success: true,
      link: linkData.properties.action_link
    }
  } catch (error: any) {
    console.error('Error in generatePasswordLink:', error)
    return { error: error.message || 'An unexpected error occurred' }
  }
}
