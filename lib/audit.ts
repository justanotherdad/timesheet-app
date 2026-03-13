import { createAdminClient } from '@/lib/supabase/admin'

export type AuditAction =
  | 'user.create'
  | 'user.update'
  | 'user.delete'
  | 'user.role_change'
  | 'timesheet.submit'
  | 'timesheet.approve'
  | 'timesheet.reject'
  | 'bid_sheet.create'
  | 'bid_sheet.convert'
  | 'bid_sheet.delete'
  | 'bid_sheet.access.grant'
  | 'bid_sheet.access.revoke'
  | 'budget.access.grant'
  | 'budget.access.revoke'

export type AuditEntityType =
  | 'user'
  | 'timesheet'
  | 'bid_sheet'
  | 'purchase_order'
  | 'po_budget_access'
  | 'bid_sheet_access'

export interface AuditLogParams {
  actorId: string
  actorName?: string
  action: AuditAction
  entityType: AuditEntityType
  entityId?: string
  oldValues?: Record<string, unknown>
  newValues?: Record<string, unknown>
  metadata?: Record<string, unknown>
}

/**
 * Log an audit event. Fire-and-forget; does not throw.
 * Use admin client so RLS does not block inserts.
 */
export async function logAudit(params: AuditLogParams): Promise<void> {
  try {
    const supabase = createAdminClient()
    await supabase.from('audit_log').insert({
      actor_id: params.actorId,
      actor_name: params.actorName ?? null,
      action: params.action,
      entity_type: params.entityType,
      entity_id: params.entityId ?? null,
      old_values: params.oldValues ?? null,
      new_values: params.newValues ?? null,
      metadata: params.metadata ?? null,
    })
  } catch (err) {
    console.error('[audit] Failed to log:', err)
  }
}
