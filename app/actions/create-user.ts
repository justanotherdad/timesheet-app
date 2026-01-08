'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { revalidatePath } from 'next/cache'

export async function createUser(formData: FormData) {
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
  const adminClient = createAdminClient()

  // Check if user already exists in auth
  let userId: string
  let userExists = false

  try {
    const { data: existingUser } = await adminClient.auth.admin.getUserByEmail(email)
    if (existingUser?.user) {
      userId = existingUser.user.id
      userExists = true
    }
  } catch {
    // User doesn't exist, we'll create them
    userExists = false
  }

  if (!userExists) {
    // Create new auth user with temporary password
    // Generate a random password that meets requirements
    const tempPassword = Math.random().toString(36).slice(-12) + Math.random().toString(36).slice(-12) + 'A1!'
    
    const { data: newUser, error: createError } = await adminClient.auth.admin.createUser({
      email,
      password: tempPassword,
      email_confirm: true, // Auto-confirm email
      user_metadata: {
        name
      }
    })

    if (createError || !newUser.user) {
      return { error: createError?.message || 'Failed to create auth user' }
    }

    userId = newUser.user.id
  }

  // Create or update profile using admin client (bypasses RLS)
  const { error: profileError } = await adminClient
    .from('user_profiles')
    .upsert({
      id: userId,
      email,
      name,
      role,
    }, {
      onConflict: 'id'
    })

  if (profileError) {
    return { error: profileError.message || 'Failed to create user profile' }
  }

  revalidatePath('/dashboard/admin/users')
  
  return { success: true, userId }
}
