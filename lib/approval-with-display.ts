/**
 * Shared "With" / "With (person)" labels for approval workflow stage.
 * Budget stage first, then profile chain — same rules on My Timesheets,
 * Pending, Approved, and related views.
 */

import { buildApprovalChain } from '@/lib/timesheet-auto-approve'
import {
  resolveApprovalStage,
  type ApprovalProfileFields,
  type ApprovalStage,
} from '@/lib/budget-timesheet-approvers'

export type ApprovalWithDisplay = {
  label: string
  person: string
  stage: ApprovalStage
}

/**
 * Describe who a submitted timesheet is currently with.
 * `budgetDisplayByUserId` should already include PO suffixes when applicable.
 */
export function describeApprovalWith(
  requiredBudgetIds: string[],
  profile: ApprovalProfileFields | null | undefined,
  signedIds: Iterable<string>,
  options: {
    approverNamesById?: Record<string, string>
    budgetDisplayByUserId?: Record<string, string>
  } = {}
): ApprovalWithDisplay {
  const stage = resolveApprovalStage(requiredBudgetIds, profile || null, signedIds)
  const names = options.approverNamesById || {}
  const budgetDisplay = options.budgetDisplayByUserId || {}

  if (stage.kind === 'done') {
    return { label: 'Approved', person: 'Approved', stage }
  }

  if (stage.kind === 'budget') {
    const label =
      stage.pendingIds.length === 1 ? 'With Budget Approver' : 'With Budget Approvers'
    const people = stage.pendingIds
      .map((id) => budgetDisplay[id] || names[id])
      .filter(Boolean)
    return {
      label,
      person: people.length > 0 ? people.join('; ') : label,
      stage,
    }
  }

  const nextId = stage.nextId
  const chain = buildApprovalChain(profile || null)
  let label = 'With Approver'
  if (nextId === profile?.manager_id) label = 'With Manager'
  else if (nextId === profile?.supervisor_id || nextId === profile?.reports_to_id) {
    label = 'With Supervisor'
  } else if (nextId === profile?.final_approver_id) label = 'With Final Approver'
  else if (chain[0] === nextId) label = 'With Supervisor'

  return {
    label,
    person: names[nextId] || label,
    stage,
  }
}
