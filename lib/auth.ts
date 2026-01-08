import { createClient } from './supabase/server'
import { UserRole, User } from '@/types/database'
import { withTimeout, withQueryTimeout } from './timeout'

export interface CurrentUser {
  id: string
  email?: string
  profile: User
}

export async function getCurrentUser(): Promise<CurrentUser | null> {
  try {
    const supabase = await createClient()
    
    // Add timeout to auth check (5 seconds)
    const authResult = await withTimeout(
      supabase.auth.getUser(),
      5000,
      'Authentication check timed out'
    )
    
    const { data: { user }, error } = authResult || { data: { user: null }, error: null }
    
    if (error || !user) return null

    // Add timeout to profile query (5 seconds)
    const profileResult = await withQueryTimeout(
      () => supabase
        .from('user_profiles')
        .select('*')
        .eq('id', user.id)
        .single(),
      5000
    )

    const profile = profileResult.data as User | null

    if (!profile) return null

    return {
      id: user.id,
      email: user.email,
      profile
    } as CurrentUser
  } catch (error) {
    console.error('Error in getCurrentUser:', error)
    return null
  }
}

export async function requireAuth() {
  const user = await getCurrentUser()
  if (!user) {
    throw new Error('Unauthorized')
  }
  return user
}

export async function requireRole(allowedRoles: UserRole[]) {
  const user = await requireAuth()
  if (!allowedRoles.includes(user.profile.role)) {
    throw new Error('Forbidden')
  }
  return user
}

export function hasRole(userRole: UserRole, allowedRoles: UserRole[]): boolean {
  return allowedRoles.includes(userRole)
}

export function canEditTimesheet(userRole: UserRole): boolean {
  return ['admin', 'super_admin'].includes(userRole)
}

export function canApproveTimesheet(userRole: UserRole): boolean {
  return ['supervisor', 'manager', 'admin', 'super_admin'].includes(userRole)
}

export function canManageUsers(userRole: UserRole): boolean {
  return ['admin', 'super_admin'].includes(userRole)
}

export function canChangeUserRole(userRole: UserRole): boolean {
  return userRole === 'super_admin'
}

