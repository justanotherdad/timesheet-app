import type { SupabaseClient } from '@supabase/supabase-js'
import { loadCompanySettingsMap } from '@/lib/timesheet-confirmation'
import {
  COMP_THRESHOLD_KEY,
  type CompAuditDecision,
  type CompAuditRow,
  type CompHistoryRow,
  type CompKind,
  type CompQueueRow,
  type CompRequest,
  type CompStatus,
  bankRequestError,
  type CompPreview,
  compKindLabel,
  formatHours,
  isAdminRole,
  isCompApprover,
  maxBankHours,
  parseCompApproverIds,
  parseCompThreshold,
  roundHours,
  summarizeComp,
  approveUseError,
  requestUseError,
} from '@/lib/comp-shared'

export * from '@/lib/comp-shared'

const DAY_FIELDS = ['mon_hours', 'tue_hours', 'wed_hours', 'thu_hours', 'fri_hours', 'sat_hours', 'sun_hours'] as const

function sumDays(row: Record<string, unknown>): number {
  return DAY_FIELDS.reduce((sum, field) => sum + (Number(row[field]) || 0), 0)
}

function mapRequest(row: Record<string, unknown>): CompRequest {
  return {
    id: String(row.id),
    user_id: String(row.user_id),
    kind: row.kind as CompKind,
    week_ending: String(row.week_ending).slice(0, 10),
    hours: Number(row.hours),
    client_acknowledged: row.client_acknowledged === true,
    status: row.status as CompStatus,
    submitted_at: String(row.submitted_at),
    reviewed_by_id: (row.reviewed_by_id as string | null) ?? null,
    reviewed_at: (row.reviewed_at as string | null) ?? null,
    reviewer_note: (row.reviewer_note as string | null) ?? null,
    cancelled_at: (row.cancelled_at as string | null) ?? null,
    cancelled_by_id: (row.cancelled_by_id as string | null) ?? null,
    decision_seen_at: (row.decision_seen_at as string | null) ?? null,
    created_at: String(row.created_at),
    updated_at: String(row.updated_at),
  }
}

async function loadProfileNames(admin: SupabaseClient, ids: string[]): Promise<Map<string, string>> {
  const names = new Map<string, string>()
  const unique = [...new Set(ids.filter((id) => id.length > 0))]
  if (unique.length === 0) return names
  const { data: profiles } = await admin.from('user_profiles').select('id, name').in('id', unique)
  for (const profile of profiles || []) {
    const row = profile as { id: string; name: string | null }
    names.set(row.id, row.name || 'Unknown')
  }
  return names
}

export async function canManageComp(
  admin: SupabaseClient,
  userId: string,
  role?: string | null
): Promise<{ allowed: boolean; isAdmin: boolean }> {
  if (role === 'client') return { allowed: false, isAdmin: false }
  const isAdmin = isAdminRole(role)
  if (isAdmin) return { allowed: true, isAdmin: true }
  const approvers = await loadCompApproverIds(admin)
  return { allowed: isCompApprover(userId, approvers), isAdmin: false }
}

export async function loadCompApproverIds(admin: SupabaseClient): Promise<string[]> {
  const settings = await loadCompanySettingsMap(admin)
  return parseCompApproverIds(settings)
}

export async function loadCompThreshold(admin: SupabaseClient): Promise<number> {
  const settings = await loadCompanySettingsMap(admin)
  return parseCompThreshold(settings[COMP_THRESHOLD_KEY])
}

export async function listUserCompRequests(admin: SupabaseClient, userId: string): Promise<CompRequest[]> {
  const { data, error } = await admin
    .from('comp_requests')
    .select('*')
    .eq('user_id', userId)
    .order('submitted_at', { ascending: false })
  if (error) throw error
  return (data || []).map((row) => mapRequest(row as Record<string, unknown>))
}

export async function listAllCompRequests(admin: SupabaseClient): Promise<CompRequest[]> {
  const { data, error } = await admin.from('comp_requests').select('*').order('submitted_at', { ascending: false })
  if (error) throw error
  return (data || []).map((row) => mapRequest(row as Record<string, unknown>))
}

export interface SubmittedBillable {
  hasTimesheet: boolean
  submitted: boolean
  billable: number
  unbillable: number
}

export async function submittedBillableHours(
  admin: SupabaseClient,
  userId: string,
  weekEnding: string
): Promise<SubmittedBillable> {
  const { data: sheets, error } = await admin
    .from('weekly_timesheets')
    .select('id, status')
    .eq('user_id', userId)
    .eq('week_ending', weekEnding)
  if (error) throw error
  const rows = (sheets || []) as Array<{ id: string; status: string }>
  if (rows.length === 0) {
    return { hasTimesheet: false, submitted: false, billable: 0, unbillable: 0 }
  }
  const countable = rows.filter((row) => row.status === 'submitted' || row.status === 'approved')
  const source = countable.length > 0 ? countable : rows.filter((row) => row.status === 'draft')
  const ids = source.map((row) => row.id)
  if (ids.length === 0) {
    return { hasTimesheet: true, submitted: false, billable: 0, unbillable: 0 }
  }
  const hourSelect = 'timesheet_id, mon_hours, tue_hours, wed_hours, thu_hours, fri_hours, sat_hours, sun_hours'
  const [billableRes, unbillableRes] = await Promise.all([
    admin.from('timesheet_entries').select(hourSelect).in('timesheet_id', ids),
    admin.from('timesheet_unbillable').select(hourSelect).in('timesheet_id', ids),
  ])
  if (billableRes.error) throw billableRes.error
  if (unbillableRes.error) throw unbillableRes.error
  const billable = roundHours((billableRes.data || []).reduce((sum, row) => sum + sumDays(row as Record<string, unknown>), 0))
  const unbillable = roundHours((unbillableRes.data || []).reduce((sum, row) => sum + sumDays(row as Record<string, unknown>), 0))
  return { hasTimesheet: true, submitted: countable.length > 0, billable, unbillable }
}

export async function countPendingCompRequests(admin: SupabaseClient): Promise<number> {
  const { count, error } = await admin
    .from('comp_requests')
    .select('id', { count: 'exact', head: true })
    .eq('status', 'pending')
  if (error) throw error
  return count ?? 0
}

export async function countUnseenCompDecisions(admin: SupabaseClient, userId: string): Promise<number> {
  const { count, error } = await admin
    .from('comp_requests')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .in('status', ['approved', 'denied'])
    .is('decision_seen_at', null)
  if (error) throw error
  return count ?? 0
}

export async function markCompDecisionsSeen(admin: SupabaseClient, userId: string): Promise<void> {
  const now = new Date().toISOString()
  const { error } = await admin
    .from('comp_requests')
    .update({ decision_seen_at: now })
    .eq('user_id', userId)
    .in('status', ['approved', 'denied'])
    .is('decision_seen_at', null)
  if (error) throw error
}

async function writeAudit(
  admin: SupabaseClient,
  input: {
    requestId: string
    userId: string
    actorId: string
    decision: CompAuditDecision
    weekEnding: string
    hours: number
    kind: string
    response?: string | null
  }
): Promise<void> {
  const { error } = await admin.from('comp_audit').insert({
    request_id: input.requestId,
    user_id: input.userId,
    actor_id: input.actorId,
    decision: input.decision,
    week_ending: input.weekEnding,
    hours: input.hours,
    kind: input.kind,
    response: input.response?.trim() ? input.response.trim().slice(0, 500) : null,
  })
  if (error) throw error
}

export async function buildCompPreview(admin: SupabaseClient, userId: string, weekEnding: string): Promise<CompPreview> {
  const [sheet, rows, threshold] = await Promise.all([
    submittedBillableHours(admin, userId, weekEnding),
    listUserCompRequests(admin, userId),
    loadCompThreshold(admin),
  ])
  const tally = summarizeComp(rows, weekEnding)
  const limit = sheet.submitted ? maxBankHours(sheet.billable, threshold) : 0
  return {
    hasTimesheet: sheet.hasTimesheet,
    submitted: sheet.submitted,
    billable: sheet.billable,
    unbillable: sheet.unbillable,
    threshold,
    maxBank: limit,
    alreadyHours: tally.weekCommitted,
    remaining: Math.max(0, roundHours(limit - tally.weekCommitted)),
    banked: tally.banked,
    held: tally.held,
    available: tally.available,
  }
}

export async function createCompRequest(
  admin: SupabaseClient,
  input: {
    userId: string
    kind: 'bank' | 'use'
    weekEnding: string
    hours: number
    clientAcknowledged: boolean
  }
): Promise<{ ok: true; request: CompRequest } | { ok: false; error: string }> {
  const rows = await listUserCompRequests(admin, input.userId)
  if (input.kind === 'use') {
    const tally = summarizeComp(rows)
    const error = requestUseError(input.hours, tally.available)
    if (error) return { ok: false, error }
  } else {
    const [sheet, threshold] = await Promise.all([
      submittedBillableHours(admin, input.userId, input.weekEnding),
      loadCompThreshold(admin),
    ])
    const tally = summarizeComp(rows, input.weekEnding)
    const error = bankRequestError({
      submitted: sheet.submitted,
      hasTimesheet: sheet.hasTimesheet,
      billable: sheet.billable,
      threshold,
      alreadyHours: tally.weekCommitted,
      requestHours: input.hours,
    })
    if (error) return { ok: false, error }
  }

  const now = new Date().toISOString()
  const { data, error } = await admin
    .from('comp_requests')
    .insert({
      user_id: input.userId,
      kind: input.kind,
      week_ending: input.weekEnding,
      hours: input.hours,
      client_acknowledged: input.kind === 'use' && input.clientAcknowledged,
      status: 'pending',
      submitted_at: now,
      updated_at: now,
    })
    .select('*')
    .single()
  if (error || !data) return { ok: false, error: error?.message || 'Could not submit request' }
  return { ok: true, request: mapRequest(data as Record<string, unknown>) }
}

export async function addCompHours(
  admin: SupabaseClient,
  input: { actorId: string; userId: string; weekEnding: string; hours: number }
): Promise<{ ok: true; request: CompRequest } | { ok: false; error: string }> {
  const { data: profile, error: profileError } = await admin
    .from('user_profiles')
    .select('id, employee_type, role')
    .eq('id', input.userId)
    .maybeSingle()
  if (profileError) return { ok: false, error: profileError.message }
  if (!profile) return { ok: false, error: 'Person not found.' }
  const employeeType = String((profile as { employee_type?: string | null }).employee_type || 'internal').toLowerCase()
  const role = String((profile as { role?: string | null }).role || '')
  if (role === 'client' || employeeType !== 'internal') {
    return { ok: false, error: 'Comp time can be added only for an internal employee.' }
  }

  const now = new Date().toISOString()
  const { data, error } = await admin
    .from('comp_requests')
    .insert({
      user_id: input.userId,
      kind: 'admin_add',
      week_ending: input.weekEnding,
      hours: input.hours,
      client_acknowledged: false,
      status: 'approved',
      submitted_at: now,
      reviewed_by_id: input.actorId,
      reviewed_at: now,
      updated_at: now,
    })
    .select('*')
    .single()
  if (error || !data) return { ok: false, error: error?.message || 'Could not add hours' }
  const request = mapRequest(data as Record<string, unknown>)
  await writeAudit(admin, {
    requestId: request.id,
    userId: request.user_id,
    actorId: input.actorId,
    decision: 'added',
    weekEnding: request.week_ending,
    hours: request.hours,
    kind: request.kind,
  })
  return { ok: true, request }
}

async function lockPending(
  admin: SupabaseClient,
  requestId: string
): Promise<{ ok: true; request: CompRequest } | { ok: false; status: number; error: string }> {
  const { data, error } = await admin.from('comp_requests').select('*').eq('id', requestId).maybeSingle()
  if (error) return { ok: false, status: 500, error: error.message }
  if (!data) return { ok: false, status: 404, error: 'Request not found' }
  const request = mapRequest(data as Record<string, unknown>)
  if (request.status !== 'pending') return { ok: false, status: 400, error: 'This request is no longer pending' }
  if (request.kind !== 'bank' && request.kind !== 'use') {
    return { ok: false, status: 400, error: 'This entry cannot be reviewed' }
  }
  return { ok: true, request }
}

export async function approveBlockReason(admin: SupabaseClient, request: CompRequest): Promise<string | null> {
  const rows = await listUserCompRequests(admin, request.user_id)
  if (request.kind === 'use') {
    return approveUseError(request.hours, summarizeComp(rows))
  }
  const [sheet, threshold] = await Promise.all([
    submittedBillableHours(admin, request.user_id, request.week_ending),
    loadCompThreshold(admin),
  ])
  const tally = summarizeComp(rows, request.week_ending, request.id)
  return bankRequestError({
    submitted: sheet.submitted,
    hasTimesheet: sheet.hasTimesheet,
    billable: sheet.billable,
    threshold,
    alreadyHours: tally.weekCommitted,
    requestHours: request.hours,
  })
}

export async function reviewCompRequest(
  admin: SupabaseClient,
  input: { requestId: string; reviewerId: string; decision: 'approved' | 'denied'; note?: string | null }
): Promise<{ ok: true } | { ok: false; status: number; error: string }> {
  const locked = await lockPending(admin, input.requestId)
  if (!locked.ok) return locked
  const note = (input.note || '').trim().slice(0, 500)
  if (input.decision === 'denied' && !note) {
    return { ok: false, status: 400, error: 'A note is required to deny a request.' }
  }
  if (input.decision === 'approved') {
    const reason = await approveBlockReason(admin, locked.request)
    if (reason) return { ok: false, status: 400, error: reason }
  }
  const now = new Date().toISOString()
  const { data: updated, error } = await admin
    .from('comp_requests')
    .update({
      status: input.decision,
      reviewed_by_id: input.reviewerId,
      reviewed_at: now,
      reviewer_note: note || null,
      updated_at: now,
    })
    .eq('id', input.requestId)
    .eq('status', 'pending')
    .select('id')
    .maybeSingle()
  if (error) return { ok: false, status: 500, error: error.message }
  if (!updated) return { ok: false, status: 400, error: 'This request is no longer pending' }
  await writeAudit(admin, {
    requestId: locked.request.id,
    userId: locked.request.user_id,
    actorId: input.reviewerId,
    decision: input.decision,
    weekEnding: locked.request.week_ending,
    hours: locked.request.hours,
    kind: locked.request.kind,
    response: note || null,
  })
  return { ok: true }
}

export async function cancelCompRequest(
  admin: SupabaseClient,
  input: { requestId: string; actorId: string }
): Promise<{ ok: true } | { ok: false; status: number; error: string }> {
  const { data, error } = await admin.from('comp_requests').select('*').eq('id', input.requestId).maybeSingle()
  if (error) return { ok: false, status: 500, error: error.message }
  if (!data) return { ok: false, status: 404, error: 'Request not found' }
  const request = mapRequest(data as Record<string, unknown>)
  if (request.status !== 'pending' && request.status !== 'approved') {
    return { ok: false, status: 400, error: 'Only pending or approved comp entries can be cancelled.' }
  }
  const decision: CompAuditDecision =
    request.status === 'approved' && (request.kind === 'bank' || request.kind === 'admin_add') ? 'removed' : 'cancelled'
  const now = new Date().toISOString()
  const { data: updated, error: updateError } = await admin
    .from('comp_requests')
    .update({
      status: 'cancelled',
      cancelled_at: now,
      cancelled_by_id: input.actorId,
      updated_at: now,
    })
    .eq('id', input.requestId)
    .in('status', ['pending', 'approved'])
    .select('id')
    .maybeSingle()
  if (updateError) return { ok: false, status: 500, error: updateError.message }
  if (!updated) return { ok: false, status: 400, error: 'This entry can no longer be cancelled.' }
  await writeAudit(admin, {
    requestId: request.id,
    userId: request.user_id,
    actorId: input.actorId,
    decision,
    weekEnding: request.week_ending,
    hours: request.hours,
    kind: request.kind,
  })
  return { ok: true }
}

export async function listCompQueue(admin: SupabaseClient): Promise<CompQueueRow[]> {
  const all = await listAllCompRequests(admin)
  const rows = all.filter((row) => row.status === 'pending')
  rows.sort((a, b) => a.submitted_at.localeCompare(b.submitted_at))
  const names = await loadProfileNames(admin, rows.map((row) => row.user_id))
  const threshold = await loadCompThreshold(admin)
  const byUser = new Map<string, CompRequest[]>()
  for (const row of all) {
    const list = byUser.get(row.user_id) || []
    list.push(row)
    byUser.set(row.user_id, list)
  }
  const queue: CompQueueRow[] = []
  for (const row of rows) {
    const mine = byUser.get(row.user_id) || []
    let canApprove = true
    let blockReason: string | null = null
    let checkNow = ''
    if (row.kind === 'use') {
      const tally = summarizeComp(mine)
      blockReason = approveUseError(row.hours, tally)
      canApprove = !blockReason
      const otherHeld = roundHours(Math.max(0, tally.held - row.hours))
      const left = roundHours(tally.banked - otherHeld)
      checkNow = `${formatHours(Math.max(0, left))} available`
    } else {
      const sheet = await submittedBillableHours(admin, row.user_id, row.week_ending)
      const tally = summarizeComp(mine, row.week_ending, row.id)
      blockReason = bankRequestError({
        submitted: sheet.submitted,
        hasTimesheet: sheet.hasTimesheet,
        billable: sheet.billable,
        threshold,
        alreadyHours: tally.weekCommitted,
        requestHours: row.hours,
      })
      canApprove = !blockReason
      const limit = sheet.submitted ? maxBankHours(sheet.billable, threshold) : 0
      checkNow = sheet.submitted
        ? `Billable ${formatHours(sheet.billable)}, limit ${formatHours(limit)}`
        : 'Timesheet not submitted'
    }
    queue.push({
      ...row,
      employee_name: names.get(row.user_id) || 'Unknown',
      can_approve: canApprove,
      block_reason: blockReason,
      check_now: checkNow,
    })
  }
  return queue
}

export async function listCompHistory(admin: SupabaseClient): Promise<CompHistoryRow[]> {
  const rows = await listAllCompRequests(admin)
  const names = await loadProfileNames(
    admin,
    rows.flatMap((row) => [row.user_id, row.reviewed_by_id || '', row.cancelled_by_id || ''])
  )
  return rows.map((row) => ({
    ...row,
    employee_name: names.get(row.user_id) || 'Unknown',
    reviewer_name: row.reviewed_by_id ? names.get(row.reviewed_by_id) || 'Unknown' : null,
    cancelled_by_name: row.cancelled_by_id ? names.get(row.cancelled_by_id) || 'Unknown' : null,
  }))
}

export async function listCompAudit(admin: SupabaseClient): Promise<CompAuditRow[]> {
  const { data, error } = await admin.from('comp_audit').select('*').order('created_at', { ascending: false })
  if (error) throw error
  const rows = (data || []) as Array<Record<string, unknown>>
  const names = await loadProfileNames(
    admin,
    rows.flatMap((row) => [String(row.user_id || ''), String(row.actor_id || '')])
  )
  return rows.map((row) => {
    const actorId = (row.actor_id as string | null) ?? null
    const userId = String(row.user_id)
    return {
      id: String(row.id),
      request_id: (row.request_id as string | null) ?? null,
      user_id: userId,
      employee_name: names.get(userId) || 'Unknown',
      actor_id: actorId,
      actor_name: actorId ? names.get(actorId) || 'Unknown' : 'Unknown',
      decision: row.decision as CompAuditDecision,
      week_ending: String(row.week_ending).slice(0, 10),
      hours: Number(row.hours),
      kind: String(row.kind),
      response: (row.response as string | null) ?? null,
      created_at: String(row.created_at),
    }
  })
}

export async function listInternalEmployees(admin: SupabaseClient): Promise<Array<{ id: string; name: string }>> {
  const { data, error } = await admin.from('user_profiles').select('id, name, employee_type, role').order('name')
  if (error) throw error
  return (data || [])
    .filter((row) => {
      const profile = row as { employee_type?: string | null; role?: string | null }
      const type = (profile.employee_type || 'internal').toLowerCase()
      return profile.role !== 'client' && type === 'internal'
    })
    .map((row) => {
      const profile = row as { id: string; name: string | null }
      return { id: profile.id, name: profile.name || 'Unknown' }
    })
}

export function cancelEffect(kind: string, status: string): string {
  if (status === 'approved' && (kind === 'bank' || kind === 'admin_add')) return `Removes ${compKindLabel(kind).toLowerCase()} hours`
  if (status === 'approved' && kind === 'use') return 'Returns the hours'
  return 'Cancels the request'
}

export { isCompApprover }
