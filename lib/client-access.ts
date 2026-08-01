import type { UserRole } from '@/types/database'

/** Paths a Client role may open (plus change-password / logout via auth). */
const CLIENT_PATH_PREFIXES = [
  '/dashboard/approvals',
  '/dashboard/change-password',
]

/**
 * True when a Client may access this dashboard pathname.
 * Allowed: home, pending/approved approvals, timesheet detail (view/approve),
 * budget (only when they have can_view_budget — page redirects if empty),
 * change-password.
 */
export function clientMayAccessPath(pathname: string): boolean {
  if (!pathname) return false
  const path = pathname.split('?')[0] || ''
  if (path === '/dashboard' || path === '/dashboard/') return true
  if (path === '/dashboard/budget' || path.startsWith('/dashboard/budget/')) return true
  if (CLIENT_PATH_PREFIXES.some((p) => path === p || path.startsWith(p + '/'))) return true
  // Timesheet detail + clear-rejection-note (not list/new/edit/export)
  const tsMatch = path.match(
    /^\/dashboard\/timesheets\/([^/]+)(?:\/(clear-rejection-note))?\/?$/
  )
  if (tsMatch) {
    const id = tsMatch[1]
    if (id === 'new') return false
    return true
  }
  return false
}

export function isClientRole(role: string | undefined | null): boolean {
  return role === 'client'
}

export function rolesIncludingClient(roles: UserRole[]): UserRole[] {
  return roles.includes('client') ? roles : [...roles, 'client']
}
