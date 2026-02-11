'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

export async function generatePasswordLink(email: string, targetUserId?: string) {
  try {
    if (!email) {
      return { error: 'Email is required' }
    }

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

    // Managers may only send reset links to users that report to them
    if (currentUserProfile.role === 'manager') {
      if (!targetUserId) {
        return { error: 'Cannot generate link for this user' }
      }
      const { data: targetProfile } = await supabase
        .from('user_profiles')
        .select('reports_to_id, supervisor_id, manager_id')
        .eq('id', targetUserId)
        .single()
      const reportsToMe =
        targetProfile?.reports_to_id === user.id ||
        targetProfile?.supervisor_id === user.id ||
        targetProfile?.manager_id === user.id
      if (!reportsToMe) {
        return { error: 'You can only send password reset links to users who report to you' }
      }
    }

    // Use admin client to generate link
    let adminClient
    try {
      adminClient = createAdminClient()
    } catch (err: any) {
      return { error: 'Server configuration error: ' + (err.message || 'Missing SUPABASE_SERVICE_ROLE_KEY environment variable') }
    }

    // Generate password reset link
    // Always use production URL, never localhost
    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://ctgtimesheet.com'
    const redirectUrl = siteUrl.includes('localhost') ? 'https://ctgtimesheet.com' : siteUrl
    
    const { data: linkData, error: linkError } = await adminClient.auth.admin.generateLink({
      type: 'recovery',
      email,
      options: {
        redirectTo: `${redirectUrl}/auth/setup-password`
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
