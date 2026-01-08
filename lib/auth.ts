import { createClient } from './supabase/server'
import { UserRole } from '@/types/database'

export async function getCurrentUser() {
  const supabase = await createClient()
  const { data: { user }, error } = await supabase.auth.getUser()
  
  if (error || !user) return null

  const { data: profile } = await supabase
    .from('user_profiles')
    .select('*')
    .eq('id', user.id)
    .single()

  if (!profile) return null

  return {
    ...user,
    profile
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

