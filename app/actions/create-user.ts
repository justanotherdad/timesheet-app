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
      if (!['employee', 'client', 'supervisor', 'manager', 'admin'].includes(role)) {
        return { error: 'Invalid role.' }
      }
      effectiveRole = role
    } else if (currentUserProfile.role === 'super_admin') {
      if (!['employee', 'client', 'supervisor', 'manager', 'admin', 'super_admin'].includes(role)) {
        return { error: 'Invalid role.' }
      }
      effectiveRole = role
    } else {
      return { error: 'Unauthorized' }
    }

    // Use admin client to create user
    let adminClient
    try {
      adminClient = createAdminClient()
    } catch (err: any) {
      return { error: 'Server configuration error: ' + (err.message || 'Missing SUPABASE_SERVICE_ROLE_KEY environment variable') }
    }

    // A password is always required now. The old "leave blank to send an invite
    // link" fallback created the auth user with email_confirm:false, so anyone
    // who never clicked the link was permanently blocked at login with
    // "Email not confirmed".
    if (!password || password.length < 6) {
      return { error: 'A password of at least 6 characters is required. The user will be prompted to change it on first login.' }
    }

    // listUsers() pages at 50 by default, so walk the pages — otherwise an
    // existing login past the first page is missed and createUser fails with a
    // duplicate-email error.
    const findAuthUserByEmail = async (targetEmail: string) => {
      const needle = targetEmail.toLowerCase()
      const perPage = 200
      for (let page = 1; page <= 100; page++) {
        const { data, error } = await adminClient.auth.admin.listUsers({ page, perPage })
        if (error) throw new Error(error.message)
        const hit = data.users?.find((u: { email?: string | null }) => u.email?.toLowerCase() === needle)
        if (hit) return hit
        if (!data.users || data.users.length < perPage) return null
      }
      return null
    }

    let userId: string
    let isNewUser = false
    let reusedExistingLogin = false

    let existingUser: { id: string } | null
    try {
      existingUser = await findAuthUserByEmail(email)
    } catch (err: any) {
      return { error: 'Failed to check existing user: ' + (err?.message || 'unknown error') }
    }

    if (existingUser) {
      // Apply the password the admin just typed and confirm the address, so the
      // account is actually usable instead of silently keeping its old password.
      userId = existingUser.id
      reusedExistingLogin = true
      const { error: updateError } = await adminClient.auth.admin.updateUserById(userId, {
        password,
        email_confirm: true,
      })
      if (updateError) {
        return { error: 'A login already exists for this email but could not be updated: ' + updateError.message }
      }
    } else {
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
    }

    const siteId = formData.get('site_id') as string || null
    const departmentId = formData.get('department_id') as string || null
    const employeeIdRaw = (formData.get('employee_id') as string | null)?.trim() || null
    const titleRaw = (formData.get('title') as string | null)?.trim() || null
    const resolvedSupervisorId = supervisorId || null
    const resolvedManagerId = managerId || null
    const resolvedFinalApproverId = finalApproverId || null

    // The admin always sets the password here, so always force a change on first
    // login (mirrors the "Set Password" flow).
    const mustChangePassword = true

    // Create or update profile using admin client (bypasses RLS)
    const profilePayload: Record<string, unknown> = {
      id: userId,
      email,
      name,
      role: effectiveRole,
      employee_type: employeeType,
      employee_id: employeeIdRaw,
      title: titleRaw,
      site_id: siteId || null,
      department_id: departmentId || null,
      supervisor_id: resolvedSupervisorId || null,
      manager_id: resolvedManagerId || null,
      final_approver_id: resolvedFinalApproverId || null,
    }
    if (mustChangePassword) {
      profilePayload.must_change_password = true
    }
    const { error: profileError } = await adminClient
      .from('user_profiles')
      .upsert(profilePayload, {
        onConflict: 'id'
      })

    if (profileError) {
      return { error: profileError.message || 'Failed to create user profile' }
    }

    revalidatePath('/dashboard/admin/users')

    return {
      success: true,
      userId,
      message: isNewUser
        ? 'User created successfully. Give them the password you entered — they must change it on first login.'
        : reusedExistingLogin
          ? 'A login already existed for this email. Its password was reset to the one you entered and the profile was updated. They must change it on first login.'
          : 'User profile updated successfully.'
    }
  } catch (error: any) {
    console.error('Error in createUser server action:', error)
    return { error: error.message || 'An unexpected error occurred while creating the user' }
  }
}
