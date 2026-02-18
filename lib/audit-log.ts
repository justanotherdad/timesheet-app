/**
 * Audit logging for auth and sensitive actions.
 * Uses admin client to bypass RLS on insert.
 */

import { createAdminClient } from '@/lib/supabase/admin'

export type AuditEvent =
  | { type: 'login_success'; userId: string; email: string }
  | { type: 'login_failure'; email: string; reason?: string }
  | { type: 'password_changed'; userId: string; email: string }
  | { type: 'invite_accepted'; userId: string; email: string }

export async function logAuditEvent(
  event: AuditEvent,
  context?: { ip?: string; userAgent?: string }
): Promise<void> {
  try {
    const client = createAdminClient()
    const payload = {
      event_type: event.type,
      user_id: 'userId' in event ? event.userId : null,
      email: event.email,
      ip_address: context?.ip ?? null,
      user_agent: context?.userAgent ?? null,
      details:
        event.type === 'login_failure'
          ? { reason: event.reason }
          : null,
      success: !event.type.includes('failure'),
    }
    await client.from('audit_log').insert(payload)
  } catch (err) {
    console.error('Audit log failed:', err)
  }
}
