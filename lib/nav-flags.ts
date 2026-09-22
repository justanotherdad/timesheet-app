import { cache } from 'react'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getCurrentUser } from '@/lib/auth'
import {
  countPendingPtoRequests,
  isInternalEmployee,
  isPtoApprover,
  parsePtoApproverIds,
} from '@/lib/pto'
import {
  getPendingConfirmationsForUser,
  loadCompanySettingsMap,
  parseConfirmationAssigneeIds,
} from '@/lib/timesheet-confirmation'

export type HeaderNavFlags = {
  timesheetConfirm: { show: boolean; pending: number }
  pto: { showRequest: boolean; showReview: boolean; pending: number }
  clientBudget: boolean
}

const emptyHeaderNav: HeaderNavFlags = {
  timesheetConfirm: { show: false, pending: 0 },
  pto: { showRequest: false, showReview: false, pending: 0 },
  clientBudget: false,
}

/**
 * Menu visibility + badge counts for the header. Cached per request so layout
 * and the dashboard share one round of work.
 */
export const getHeaderNavFlags = cache(async function getHeaderNavFlags(): Promise<HeaderNavFlags> {
  const user = await getCurrentUser()
  if (!user) return emptyHeaderNav

  const isClient = user.profile.role === 'client'
  const showRequest = !isClient && isInternalEmployee(user.profile.employee_type)

  let clientBudget = false
  const admin = createAdminClient()

  const settingsPromise = loadCompanySettingsMap(admin)
  const clientBudgetPromise = isClient
    ? (async () => {
        const supabase = await createClient()
        const { count } = await supabase
          .from('po_budget_access')
          .select('purchase_order_id', { count: 'exact', head: true })
          .eq('user_id', user.id)
          .eq('can_view_budget', true)
        return (count ?? 0) > 0
      })()
    : Promise.resolve(false)

  const [settings, clientBudgetResult] = await Promise.all([settingsPromise, clientBudgetPromise])
  clientBudget = clientBudgetResult

  const confirmationAssignees = parseConfirmationAssigneeIds(settings)
  const ptoApprovers = parsePtoApproverIds(settings)
  const showConfirm = !isClient && confirmationAssignees.length > 0 && confirmationAssignees.includes(user.id)
  const showReview = !isClient && isPtoApprover(user.id, ptoApprovers)

  let confirmPending = 0
  let ptoPending = 0
  const pendingWork: Promise<void>[] = []
  if (showConfirm) {
    pendingWork.push(
      getPendingConfirmationsForUser(admin, user.id, settings)
        .then((pending) => {
          confirmPending = pending.length
        })
        .catch((err) => {
          console.error('[timesheet-confirmation] nav count failed', err)
        })
    )
  }
  if (showReview) {
    pendingWork.push(
      countPendingPtoRequests(admin)
        .then((n) => {
          ptoPending = n
        })
        .catch((err) => {
          console.error('[pto] nav count failed', err)
        })
    )
  }
  if (pendingWork.length) await Promise.all(pendingWork)

  return {
    timesheetConfirm: { show: showConfirm, pending: confirmPending },
    pto: { showRequest, showReview, pending: ptoPending },
    clientBudget,
  }
})

export type DashboardGrantFlags = {
  showBudgetDetailTile: boolean
  showBidSheetsTile: boolean
}

/** Dashboard-only grant checks. Not run from the layout. */
export const getDashboardGrantFlags = cache(async function getDashboardGrantFlags(): Promise<DashboardGrantFlags> {
  const user = await getCurrentUser()
  if (!user) return { showBudgetDetailTile: false, showBidSheetsTile: false }

  const role = user.profile.role
  const isClient = role === 'client'
  const isManagerOrAbove = ['manager', 'admin', 'super_admin'].includes(role)
  const isSupervisorOrAbove = ['supervisor', 'manager', 'admin', 'super_admin'].includes(role)

  const supabase = await createClient()

  const budgetPromise = !isManagerOrAbove
    ? supabase
        .from('po_budget_access')
        .select('purchase_order_id', { count: 'exact', head: true })
        .eq('user_id', user.id)
        .eq('can_view_budget', true)
    : Promise.resolve({ count: 0 })

  const bidPromise =
    !isSupervisorOrAbove && !isClient
      ? supabase
          .from('bid_sheet_access')
          .select('bid_sheet_id', { count: 'exact', head: true })
          .eq('user_id', user.id)
      : Promise.resolve({ count: 0 })

  const [budgetRes, bidRes] = await Promise.all([budgetPromise, bidPromise])
  const hasBudgetGrant = (budgetRes.count ?? 0) > 0
  const hasBidGrant = (bidRes.count ?? 0) > 0

  return {
    showBudgetDetailTile: isManagerOrAbove || hasBudgetGrant,
    showBidSheetsTile: !isClient && (isSupervisorOrAbove || hasBidGrant),
  }
})
