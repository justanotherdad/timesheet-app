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

    // Try to create the user - if they already exist, find them
    const tempPassword = Math.random().toString(36).slice(-12) + Math.random().toString(36).slice(-12) + 'A1!'
    
    const { data: newUser, error: createError } = await adminClient.auth.admin.createUser({
      email,
      password: tempPassword,
      email_confirm: true, // Auto-confirm email
      user_metadata: {
        name
      }
    })

    if (createError) {
      // If user already exists, find them by listing users
      if (createError.message?.toLowerCase().includes('already') || createError.message?.toLowerCase().includes('exists')) {
        const { data: { users }, error: listError } = await adminClient.auth.admin.listUsers()
        
        if (listError) {
          return { error: 'Failed to check existing user: ' + listError.message }
        }
        
        const existingUser = users?.find(u => u.email?.toLowerCase() === email.toLowerCase())
        if (existingUser) {
          userId = existingUser.id
        } else {
          return { error: 'User already exists but could not be found' }
        }
      } else {
        return { error: createError.message || 'Failed to create auth user' }
      }
    } else if (newUser.user) {
      userId = newUser.user.id
    } else {
      return { error: 'Failed to create auth user: No user returned' }
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
  } catch (error: any) {
    console.error('Error in createUser server action:', error)
    return { error: error.message || 'An unexpected error occurred while creating the user' }
  }
}
