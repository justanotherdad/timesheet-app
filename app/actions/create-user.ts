'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { revalidatePath } from 'next/cache'

export async function createUser(formData: FormData) {
  try {
    const email = formData.get('email') as string
    const name = formData.get('name') as string
    const role = formData.get('role') as string

    if (!email || !name || !role) {
      return { error: 'All fields are required' }
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

    // Use admin client to create user
    let adminClient
    try {
      adminClient = createAdminClient()
    } catch (err: any) {
      return { error: 'Server configuration error: ' + (err.message || 'Missing SUPABASE_SERVICE_ROLE_KEY environment variable') }
    }

    let userId: string
    let isNewUser = false
    let invitationLink: string | null = null

    // Check if user already exists
    const { data: { users }, error: listError } = await adminClient.auth.admin.listUsers()
    
    if (listError) {
      return { error: 'Failed to check existing user: ' + listError.message }
    }
    
    const existingUser = users?.find(u => u.email?.toLowerCase() === email.toLowerCase())

    if (existingUser) {
      // User already exists, use their ID
      userId = existingUser.id
    } else {
      // Create new user - set email_confirm to false for invite links
      // The invite link will confirm the email and allow password setup
      const { data: newUser, error: createError } = await adminClient.auth.admin.createUser({
        email,
        email_confirm: false, // Don't auto-confirm - invite link will confirm it
        user_metadata: {
          name
        }
      })

      if (createError || !newUser.user) {
        return { error: createError?.message || 'Failed to create auth user' }
      }

      userId = newUser.user.id
      isNewUser = true

      // Generate invitation link (don't rely on email delivery)
      // Admin will copy and send this link manually
      // Always use production URL, never localhost
      const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://ctgtimesheet.com'
      const redirectUrl = siteUrl.includes('localhost') ? 'https://ctgtimesheet.com' : siteUrl
      
      // Generate invite link - this allows user to set their password
      // Redirect directly to setup-password page - it will handle tokens in hash or query params
      const { data: linkData, error: inviteError } = await adminClient.auth.admin.generateLink({
        type: 'invite',
        email,
        options: {
          redirectTo: `${redirectUrl}/auth/setup-password`
        }
      })

      if (!inviteError && linkData?.properties?.action_link) {
        invitationLink = linkData.properties.action_link
      } else {
        // If invite fails, try magic link instead (alternative approach)
        const { data: magicLinkData, error: magicError } = await adminClient.auth.admin.generateLink({
          type: 'magiclink',
          email,
          options: {
            redirectTo: `${redirectUrl}/auth/setup-password`
          }
        })

        if (!magicError && magicLinkData?.properties?.action_link) {
          invitationLink = magicLinkData.properties.action_link
        } else {
          // Last resort: use recovery link (password reset)
          const { data: resetLinkData, error: resetError } = await adminClient.auth.admin.generateLink({
            type: 'recovery',
            email,
            options: {
              redirectTo: `${redirectUrl}/auth/setup-password`
            }
          })

          if (!resetError && resetLinkData?.properties?.action_link) {
            invitationLink = resetLinkData.properties.action_link
          } else {
            console.error('Failed to generate any invitation link:', { inviteError, magicError, resetError })
            return { error: 'User created but failed to generate invitation link. Please use "Generate Password Link" button for this user.' }
          }
        }
      }
    }

    // Get site_id and department_id from form data
    const siteId = formData.get('site_id') as string || null
    const departmentId = formData.get('department_id') as string || null

    // Create or update profile using admin client (bypasses RLS)
    const { error: profileError } = await adminClient
      .from('user_profiles')
      .upsert({
        id: userId,
        email,
        name,
        role,
        site_id: siteId || null,
        department_id: departmentId || null,
      }, {
        onConflict: 'id'
      })

    if (profileError) {
      return { error: profileError.message || 'Failed to create user profile' }
    }

    revalidatePath('/dashboard/admin/users')
    
    return { 
      success: true, 
      userId,
      emailSent: isNewUser && !!invitationLink,
      invitationLink: invitationLink || null,
      message: isNewUser 
        ? (invitationLink 
          ? 'User created successfully. Copy the invitation link below to send to the user.' 
          : 'User created successfully, but could not generate invitation link. You can generate a password reset link from Supabase dashboard.')
        : 'User profile updated successfully. (User already exists in auth system)'
    }
  } catch (error: any) {
    console.error('Error in createUser server action:', error)
    return { error: error.message || 'An unexpected error occurred while creating the user' }
  }
}
