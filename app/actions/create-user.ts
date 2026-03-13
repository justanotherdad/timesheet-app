'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { revalidatePath } from 'next/cache'
import { logAudit } from '@/lib/audit'

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

    const { data: currentUserProfile } = await supabase
      .from('user_profiles')
      .select('role')
      .eq('id', user.id)
      .single()

    if (!currentUserProfile || !['manager', 'admin', 'super_admin'].includes(currentUserProfile.role)) {
      return { error: 'Unauthorized' }
    }

    const supervisorId = formData.get('supervisor_id') as string || null
    const managerId = formData.get('manager_id') as string || null
    const finalApproverId = formData.get('final_approver_id') as string || null
    const employeeType = (formData.get('employee_type') as 'internal' | 'external') || 'internal'
    const password = (formData.get('password') as string)?.trim() || null

    let effectiveRole: string
    if (currentUserProfile.role === 'manager') {
      if (!['employee', 'supervisor', 'manager'].includes(role)) {
        return { error: 'You can only create users with role Employee, Supervisor, or Manager.' }
      }
      effectiveRole = role
    } else if (currentUserProfile.role === 'admin') {
      if (role === 'super_admin') {
        return { error: 'You cannot create a Super Admin user.' }
      }
      effectiveRole = role
    } else {
      effectiveRole = role
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
      // Create new user - with password (admin-set) or invite link
      if (password && password.length >= 6) {
        // Admin sets password - user must change on first login
        const { data: newUser, error: createError } = await adminClient.auth.admin.createUser({
          email,
          password,
          email_confirm: true,
          user_metadata: { name }
        })

        if (createError || !newUser.user) {
          return { error: createError?.message || 'Failed to create auth user' }
        }

        userId = newUser.user.id
        isNewUser = true
        // must_change_password will be set in profile upsert below
      } else {
        // Fallback: invite link (no password provided)
        const { data: newUser, error: createError } = await adminClient.auth.admin.createUser({
          email,
          email_confirm: false,
          user_metadata: { name }
        })

        if (createError || !newUser.user) {
          return { error: createError?.message || 'Failed to create auth user' }
        }

        userId = newUser.user.id
        isNewUser = true

        let siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://ctgtimesheet.com'
        if (siteUrl.includes('localhost')) siteUrl = 'https://ctgtimesheet.com'
        const redirectUrl = siteUrl.replace('www.', '')
        const redirectToUrl = `${redirectUrl}/auth/setup-password`

        const { data: linkData, error: inviteError } = await adminClient.auth.admin.generateLink({
          type: 'invite',
          email,
          options: { redirectTo: redirectToUrl }
        })

        if (!inviteError && linkData?.properties?.action_link) {
          const wrappedLink = `${redirectUrl}/auth/invite?link=${encodeURIComponent(linkData.properties.action_link)}`
          invitationLink = wrappedLink
        } else {
          const { data: magicLinkData, error: magicError } = await adminClient.auth.admin.generateLink({
            type: 'magiclink',
            email,
            options: { redirectTo: redirectToUrl }
          })
          if (!magicError && magicLinkData?.properties?.action_link) {
            invitationLink = `${redirectUrl}/auth/invite?link=${encodeURIComponent(magicLinkData.properties.action_link)}`
          } else {
            const { data: resetLinkData, error: resetError } = await adminClient.auth.admin.generateLink({
              type: 'recovery',
              email,
              options: { redirectTo: redirectToUrl }
            })
            if (!resetError && resetLinkData?.properties?.action_link) {
              invitationLink = `${redirectUrl}/auth/invite?link=${encodeURIComponent(resetLinkData.properties.action_link)}`
            } else {
              return { error: 'User created but failed to generate invitation link. Use "Generate Password Link" for this user.' }
            }
          }
        }
      }
    }

    const siteId = formData.get('site_id') as string || null
    const departmentId = formData.get('department_id') as string || null
    const resolvedSupervisorId = supervisorId || null
    const resolvedManagerId = managerId || null
    const resolvedFinalApproverId = finalApproverId || null

    // Create or update profile using admin client (bypasses RLS)
    const { error: profileError } = await adminClient
      .from('user_profiles')
      .upsert({
        id: userId,
        email,
        name,
        role: effectiveRole,
        employee_type: employeeType,
        site_id: siteId || null,
        department_id: departmentId || null,
        supervisor_id: resolvedSupervisorId || null,
        manager_id: resolvedManagerId || null,
        final_approver_id: resolvedFinalApproverId || null,
      }, {
        onConflict: 'id'
      })

    if (profileError) {
      return { error: profileError.message || 'Failed to create user profile' }
    }

    logAudit({
      actorId: user.id,
      actorName: (currentUserProfile as { name?: string })?.name,
      action: isNewUser ? 'user.create' : 'user.update',
      entityType: 'user',
      entityId: userId,
      newValues: { email, name, role: effectiveRole },
    })

    revalidatePath('/dashboard/admin/users')
    
    const usedPassword = isNewUser && !!password && password.length >= 6
    return { 
      success: true, 
      userId,
      emailSent: isNewUser && !!invitationLink && !usedPassword,
      invitationLink: invitationLink || null,
      message: isNewUser 
        ? (usedPassword 
          ? 'User created successfully. They must change their password on first login.'
          : (invitationLink 
            ? 'User created successfully. Copy the invitation link below to send to the user.' 
            : 'User created successfully, but could not generate invitation link. Use "Generate Password Link" for this user.'))
        : 'User profile updated successfully. (User already exists in auth system)'
    }
  } catch (error: any) {
    console.error('Error in createUser server action:', error)
    return { error: error.message || 'An unexpected error occurred while creating the user' }
  }
}
