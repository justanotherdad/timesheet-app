import type { SupabaseClient } from '@supabase/supabase-js'
import type { PtoRequest, PtoRequestStatus } from '@/types/database'
import { loadCompanySettingsMap } from '@/lib/timesheet-confirmation'
import { parsePtoApproverIds } from '@/lib/pto-shared'

export * from '@/lib/pto-shared'

export async function loadPtoApproverIds(supabase: SupabaseClient): Promise<string[]> {
  const settings = await loadCompanySettingsMap(supabase)
  return parsePtoApproverIds(settings)
}

export interface PtoQueueRow extends PtoRequest {
  employee_name: string
}

function mapRow(row: Record<string, unknown>): PtoRequest {
  return {
    id: String(row.id),
    user_id: String(row.user_id),
    leave_type: String(row.leave_type),
    start_date: String(row.start_date).slice(0, 10),
    end_date: String(row.end_date).slice(0, 10),
    hours_per_day: Number(row.hours_per_day),
    notes: (row.notes as string | null) ?? null,
    status: row.status as PtoRequestStatus,
    submitted_at: String(row.submitted_at),
    reviewed_by_id: (row.reviewed_by_id as string | null) ?? null,
    reviewed_at: (row.reviewed_at as string | null) ?? null,
    denial_reason: (row.denial_reason as string | null) ?? null,
    cancelled_at: (row.cancelled_at as string | null) ?? null,
    created_at: String(row.created_at),
    updated_at: String(row.updated_at),
  }
}

export async function countPendingPtoRequests(admin: SupabaseClient): Promise<number> {
  const { count, error } = await admin
    .from('pto_requests')
    .select('id', { count: 'exact', head: true })
    .eq('status', 'pending')
  if (error) throw error
  return count ?? 0
}

export async function listMyPtoRequests(admin: SupabaseClient, userId: string): Promise<PtoRequest[]> {
  const { data, error } = await admin
    .from('pto_requests')
    .select('*')
    .eq('user_id', userId)
    .order('submitted_at', { ascending: false })
  if (error) throw error
  return (data || []).map((row) => mapRow(row as Record<string, unknown>))
}

export async function listPendingPtoQueue(admin: SupabaseClient): Promise<PtoQueueRow[]> {
  const { data, error } = await admin
    .from('pto_requests')
    .select('*')
    .eq('status', 'pending')
    .order('submitted_at', { ascending: true })
  if (error) throw error
  const rows = (data || []).map((row) => mapRow(row as Record<string, unknown>))
  const userIds = [...new Set(rows.map((r) => r.user_id))]
  const names = new Map<string, string>()
  if (userIds.length > 0) {
    const { data: profiles } = await admin.from('user_profiles').select('id, name').in('id', userIds)
    for (const p of profiles || []) {
      names.set((p as { id: string }).id, (p as { name: string | null }).name || 'Unknown')
    }
  }
  return rows.map((r) => ({ ...r, employee_name: names.get(r.user_id) || 'Unknown' }))
}

export interface CreatePtoInput {
  userId: string
  leaveType: string
  startDate: string
  endDate: string
  hoursPerDay: number
  notes?: string | null
}

export async function createPtoRequest(admin: SupabaseClient, input: CreatePtoInput): Promise<PtoRequest> {
  const now = new Date().toISOString()
  const { data, error } = await admin
    .from('pto_requests')
    .insert({
      user_id: input.userId,
      leave_type: input.leaveType,
      start_date: input.startDate,
      end_date: input.endDate,
      hours_per_day: input.hoursPerDay,
      notes: input.notes ?? null,
      status: 'pending',
      submitted_at: now,
      updated_at: now,
    })
    .select('*')
    .single()
  if (error || !data) throw error || new Error('Could not create request')
  return mapRow(data as Record<string, unknown>)
}

export async function cancelPtoRequest(
  admin: SupabaseClient,
  requestId: string,
  userId: string
): Promise<{ ok: true } | { ok: false; status: number; error: string }> {
  const { data, error } = await admin.from('pto_requests').select('*').eq('id', requestId).maybeSingle()
  if (error) return { ok: false, status: 500, error: error.message }
  if (!data) return { ok: false, status: 404, error: 'Request not found' }
  if (data.user_id !== userId) return { ok: false, status: 403, error: 'Not your request' }
  if (data.status !== 'pending') return { ok: false, status: 400, error: 'Only pending requests can be cancelled' }
  const now = new Date().toISOString()
  const { error: updErr } = await admin
    .from('pto_requests')
    .update({ status: 'cancelled', cancelled_at: now, updated_at: now })
    .eq('id', requestId)
    .eq('status', 'pending')
  if (updErr) return { ok: false, status: 500, error: updErr.message }
  return { ok: true }
}

export async function reviewPtoRequest(
  admin: SupabaseClient,
  requestId: string,
  reviewerId: string,
  decision: 'approved' | 'denied',
  denialReason?: string | null
): Promise<{ ok: true } | { ok: false; status: number; error: string }> {
  const { data, error } = await admin.from('pto_requests').select('*').eq('id', requestId).maybeSingle()
  if (error) return { ok: false, status: 500, error: error.message }
  if (!data) return { ok: false, status: 404, error: 'Request not found' }
  if (data.status !== 'pending') return { ok: false, status: 400, error: 'This request is no longer pending' }
  const now = new Date().toISOString()
  const patch: Record<string, unknown> = {
    status: decision,
    reviewed_by_id: reviewerId,
    reviewed_at: now,
    updated_at: now,
  }
  if (decision === 'denied') {
    const reason = (denialReason || '').trim()
    if (!reason) return { ok: false, status: 400, error: 'A reason is required to deny a request' }
    patch.denial_reason = reason.slice(0, 500)
  }
  const { error: updErr } = await admin.from('pto_requests').update(patch).eq('id', requestId).eq('status', 'pending')
  if (updErr) return { ok: false, status: 500, error: updErr.message }
  return { ok: true }
}
