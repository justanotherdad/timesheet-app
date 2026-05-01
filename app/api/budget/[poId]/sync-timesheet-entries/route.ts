import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getCurrentUser } from '@/lib/auth'
import { canAccessPoBudget } from '@/lib/access'

export const dynamic = 'force-dynamic'

type DetailRow = {
  id: string
  po_id: string
  system_id: string | null
  deliverable_id: string | null
  activity_id: string | null
  systems?: { id: string; name?: string | null; code?: string | null } | null
  deliverables?: { id: string; name?: string | null } | null
  activities?: { id: string; name?: string | null } | null
}

type EntryRow = {
  id: string
  system_id: string | null
  deliverable_id: string | null
  activity_id: string | null
  systems?: { id: string; name?: string | null; code?: string | null } | null
  deliverables?: { id: string; name?: string | null } | null
  activities?: { id: string; name?: string | null } | null
}

type RemapResult = {
  entryId: string
  status: 'fixed' | 'already_matched' | 'ambiguous' | 'no_candidate'
  before?: { systemName: string | null; deliverableName: string | null; activityName: string | null }
  after?: { systemName: string; deliverableName: string; activityName: string } | null
  candidates?: Array<{ systemName: string; deliverableName: string; activityName: string }>
}

/** Normalize a name for fuzzy comparison: lowercase, trim, collapse whitespace. */
function norm(s: string | null | undefined): string {
  return String(s ?? '').toLowerCase().trim().replace(/\s+/g, ' ')
}

/**
 * Names match if any of these is true:
 *   - exact (case-insensitive trimmed) equality
 *   - one is a substring of the other (e.g. "SLIA" inside "System Level Impact Assessment (SLIA)")
 *   - both share a parenthesized abbreviation (e.g. "(SLIA)")
 */
function namesLikelyMatch(a: string | null | undefined, b: string | null | undefined): boolean {
  const na = norm(a)
  const nb = norm(b)
  if (!na || !nb) return false
  if (na === nb) return true
  if (na.includes(nb) || nb.includes(na)) return true
  const parenA = na.match(/\(([^)]+)\)/)?.[1]
  const parenB = nb.match(/\(([^)]+)\)/)?.[1]
  if (parenA && parenB && parenA === parenB) return true
  if (parenA && parenA === nb) return true
  if (parenB && parenB === na) return true
  return false
}

type ManualAssignment = {
  entryId: string
  systemId: string
  deliverableId: string
  activityId: string
}

/**
 * POST /api/budget/[poId]/sync-timesheet-entries
 *
 * Two modes, selected by request body:
 *
 *   1. Auto fuzzy-match (no body or { dryRun?: boolean }):
 *      Repairs timesheet entries on this PO whose (system, deliverable,
 *      activity) triplet doesn't match any project_details row. Fuzzy-matches
 *      each entry against project_details rows and updates IDs when exactly
 *      one candidate is found. dryRun=true previews without writing.
 *
 *   2. Manual assignments ({ assignments: [{ entryId, systemId, deliverableId, activityId }] }):
 *      Used when the auto-fix can't pick a candidate. The budget owner picks
 *      a valid project_details cell for each unmatched entry and submits the
 *      list. Each assignment is validated:
 *        - the entry must belong to this PO
 *        - the (systemId, deliverableId, activityId) triplet must exist as a
 *          project_details row for this PO
 *      Valid assignments update the entry's FK columns; the matrix and the
 *      CSV export will then place those hours in the chosen cell.
 */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ poId: string }> }
) {
  const { poId } = await params
  const user = await getCurrentUser()
  if (!user || !['manager', 'admin', 'super_admin'].includes(user.profile.role)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = await createClient()
  const allowed = await canAccessPoBudget(supabase, user.id, user.profile.role, poId)
  if (!allowed) return NextResponse.json({ error: 'Access denied' }, { status: 403 })

  let admin = supabase
  try { admin = createAdminClient() } catch { /* fall back to user client */ }

  const body = await req.json().catch(() => ({}))
  const dryRun = body?.dryRun === true
  const rawAssignments: unknown = body?.assignments

  // Pull project_details for this PO so we know which combos are valid
  const { data: detailRows, error: detErr } = await admin
    .from('project_details')
    .select(
      `
      id,
      po_id,
      system_id,
      deliverable_id,
      activity_id,
      systems (id, name, code),
      deliverables (id, name),
      activities (id, name)
    `
    )
    .eq('po_id', poId)
  if (detErr) return NextResponse.json({ error: detErr.message }, { status: 500 })

  const details = (detailRows || []) as unknown as DetailRow[]
  const validKeys = new Set(
    details
      .filter((d) => d.system_id && d.deliverable_id && d.activity_id)
      .map((d) => `${d.system_id}|${d.deliverable_id}|${d.activity_id}`)
  )

  // ----- Manual assignment mode -----
  if (Array.isArray(rawAssignments)) {
    const assignments: ManualAssignment[] = []
    for (const a of rawAssignments) {
      if (
        a &&
        typeof a === 'object' &&
        typeof (a as Record<string, unknown>).entryId === 'string' &&
        typeof (a as Record<string, unknown>).systemId === 'string' &&
        typeof (a as Record<string, unknown>).deliverableId === 'string' &&
        typeof (a as Record<string, unknown>).activityId === 'string'
      ) {
        assignments.push(a as ManualAssignment)
      }
    }
    if (assignments.length === 0) {
      return NextResponse.json({ error: 'No valid assignments provided' }, { status: 400 })
    }

    // Confirm each entry actually belongs to this PO before we touch it.
    const entryIds = [...new Set(assignments.map((a) => a.entryId))]
    const { data: entryOwnership, error: ownErr } = await admin
      .from('timesheet_entries')
      .select('id, po_id')
      .in('id', entryIds)
    if (ownErr) return NextResponse.json({ error: ownErr.message }, { status: 500 })
    const entryPoMap = new Map<string, string>()
    for (const row of (entryOwnership || []) as Array<{ id: string; po_id: string }>) {
      entryPoMap.set(row.id, row.po_id)
    }

    type AssignResult = {
      entryId: string
      status: 'updated' | 'invalid_combo' | 'not_on_po' | 'error'
      message?: string
    }
    const results: AssignResult[] = []
    let updatedCount = 0

    for (const a of assignments) {
      if (entryPoMap.get(a.entryId) !== poId) {
        results.push({
          entryId: a.entryId,
          status: 'not_on_po',
          message: 'Entry is not on this PO',
        })
        continue
      }
      const triplet = `${a.systemId}|${a.deliverableId}|${a.activityId}`
      if (!validKeys.has(triplet)) {
        results.push({
          entryId: a.entryId,
          status: 'invalid_combo',
          message: 'Selected (system, deliverable, activity) is not a matrix cell on this PO',
        })
        continue
      }

      if (!dryRun) {
        const { error: upErr } = await admin
          .from('timesheet_entries')
          .update({
            system_id: a.systemId,
            deliverable_id: a.deliverableId,
            activity_id: a.activityId,
          })
          .eq('id', a.entryId)
        if (upErr) {
          results.push({ entryId: a.entryId, status: 'error', message: upErr.message })
          continue
        }
      }
      updatedCount++
      results.push({ entryId: a.entryId, status: 'updated' })
    }

    return NextResponse.json({
      mode: 'manual',
      dryRun,
      requested: assignments.length,
      updatedCount,
      invalidComboCount: results.filter((r) => r.status === 'invalid_combo').length,
      notOnPoCount: results.filter((r) => r.status === 'not_on_po').length,
      errorCount: results.filter((r) => r.status === 'error').length,
      results,
    })
  }

  // ----- Auto fuzzy-match mode -----
  // Pull the entries on this PO joined to system/deliverable/activity for fuzzy match input
  const { data: entryRows, error: entErr } = await admin
    .from('timesheet_entries')
    .select(
      `
      id,
      system_id,
      deliverable_id,
      activity_id,
      systems (id, name, code),
      deliverables (id, name),
      activities (id, name)
    `
    )
    .eq('po_id', poId)
  if (entErr) return NextResponse.json({ error: entErr.message }, { status: 500 })

  const entries = (entryRows || []) as unknown as EntryRow[]

  const results: RemapResult[] = []
  let fixedCount = 0

  for (const entry of entries) {
    const triplet = `${entry.system_id || ''}|${entry.deliverable_id || ''}|${entry.activity_id || ''}`
    if (entry.system_id && entry.deliverable_id && entry.activity_id && validKeys.has(triplet)) {
      results.push({ entryId: entry.id, status: 'already_matched' })
      continue
    }

    // Find candidate project_details rows that fuzzy-match this entry. We
    // require a system match (id-equal OR name-equal) and fuzzy matches on
    // deliverable/activity names. If the entry has no system_id at all we
    // can't safely remap, so skip.
    const candidates = details.filter((d) => {
      if (!d.system_id || !d.deliverable_id || !d.activity_id) return false
      const sysIdMatch = d.system_id === entry.system_id
      const sysNameMatch =
        !sysIdMatch &&
        namesLikelyMatch(d.systems?.name, entry.systems?.name) &&
        norm(d.systems?.code) === norm(entry.systems?.code)
      if (!sysIdMatch && !sysNameMatch) return false
      if (!namesLikelyMatch(d.deliverables?.name, entry.deliverables?.name)) return false
      if (!namesLikelyMatch(d.activities?.name, entry.activities?.name)) return false
      return true
    })

    const before = {
      systemName: entry.systems?.name ?? null,
      deliverableName: entry.deliverables?.name ?? null,
      activityName: entry.activities?.name ?? null,
    }

    if (candidates.length === 0) {
      results.push({ entryId: entry.id, status: 'no_candidate', before })
      continue
    }
    if (candidates.length > 1) {
      results.push({
        entryId: entry.id,
        status: 'ambiguous',
        before,
        candidates: candidates.map((c) => ({
          systemName: c.systems?.name || '',
          deliverableName: c.deliverables?.name || '',
          activityName: c.activities?.name || '',
        })),
      })
      continue
    }

    const target = candidates[0]
    const after = {
      systemName: target.systems?.name || '',
      deliverableName: target.deliverables?.name || '',
      activityName: target.activities?.name || '',
    }

    if (!dryRun) {
      const { error: upErr } = await admin
        .from('timesheet_entries')
        .update({
          system_id: target.system_id,
          deliverable_id: target.deliverable_id,
          activity_id: target.activity_id,
        })
        .eq('id', entry.id)
      if (upErr) {
        results.push({ entryId: entry.id, status: 'no_candidate', before })
        continue
      }
    }

    fixedCount++
    results.push({ entryId: entry.id, status: 'fixed', before, after })
  }

  return NextResponse.json({
    mode: 'auto',
    dryRun,
    totalEntries: entries.length,
    fixedCount,
    alreadyMatchedCount: results.filter((r) => r.status === 'already_matched').length,
    ambiguousCount: results.filter((r) => r.status === 'ambiguous').length,
    noCandidateCount: results.filter((r) => r.status === 'no_candidate').length,
    results: results.filter((r) => r.status !== 'already_matched'),
  })
}
