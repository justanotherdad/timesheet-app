import { cache } from 'react'
import { createClient } from './supabase/server'
import { UserRole, User } from '@/types/database'
import { withTimeout, withQueryTimeout } from './timeout'

export interface CurrentUser {
  id: string
  email?: string
  profile: User
}

/** Auth/profile check timed out or the Auth gateway failed. Not the same as "logged out". */
export class AuthUnavailableError extends Error {
  constructor(message = 'Sign-in is temporarily unavailable. Please try again.') {
    super(message)
    this.name = 'AuthUnavailableError'
  }
}

function isTimeoutLike(error: unknown): boolean {
  const msg =
    error instanceof Error
      ? error.message
      : typeof error === 'object' && error && 'message' in error
        ? String((error as { message?: unknown }).message || '')
        : String(error || '')
  const code =
    typeof error === 'object' && error && 'code' in error
      ? String((error as { code?: unknown }).code || '')
      : ''
  return (
    code === 'TIMEOUT' ||
    /timed out|timeout|Auth check timeout|Authentication check timed out/i.test(msg)
  )
}

export const getCurrentUser = cache(async function getCurrentUser(): Promise<CurrentUser | null> {
  try {
    const supabase = await createClient()
    
    // Add timeout to auth check (5 seconds)
    const authResult = await withTimeout(
      supabase.auth.getUser(),
      5000,
      'Authentication check timed out'
    )
    
    const { data: { user }, error } = authResult || { data: { user: null }, error: null }
    
    if (error) {
      if (isTimeoutLike(error)) {
        throw new AuthUnavailableError()
      }
      return null
    }
    if (!user) return null

    // Add timeout to profile query (5 seconds)
    const profileResult = await withQueryTimeout(
      () => supabase
        .from('user_profiles')
        .select('*')
        .eq('id', user.id)
        .single(),
      5000
    )

    if (profileResult.error && isTimeoutLike(profileResult.error)) {
      throw new AuthUnavailableError()
    }

    const profile = profileResult.data as (User & { active?: boolean }) | null

    if (!profile) return null

    // Deactivated users cannot access the site
    if (profile.active === false) return null

    return {
      id: user.id,
      email: user.email,
      profile
    } as CurrentUser
  } catch (error) {
    if (error instanceof AuthUnavailableError || isTimeoutLike(error)) {
      throw error instanceof AuthUnavailableError ? error : new AuthUnavailableError()
    }
    console.error('Error in getCurrentUser:', error)
    return null
  }
})

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
  return ['supervisor', 'manager', 'admin', 'super_admin', 'client'].includes(userRole)
}

export function canManageUsers(userRole: UserRole): boolean {
  return ['admin', 'super_admin'].includes(userRole)
}

export function canChangeUserRole(userRole: UserRole): boolean {
  return userRole === 'super_admin'
}
