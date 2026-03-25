import type { UserRole } from '@/types/database'

/** Roles allowed to load approvals UI / approve & reject routes. Includes `employee` so active delegates can act. */
export const APPROVAL_PARTICIPANT_ROLES: UserRole[] = ['employee', 'supervisor', 'manager', 'admin', 'super_admin']
