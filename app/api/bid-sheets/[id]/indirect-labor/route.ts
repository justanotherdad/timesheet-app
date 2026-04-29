import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getCurrentUser } from '@/lib/auth'
import { effectiveIndirectTreatAs } from '@/lib/bid-sheet-indirect'
import {
  deleteIndirectActivityForProject,
  upsertIndirectActivityForProject,
} from '@/lib/syncBidSheetToProject'

export const dynamic = 'force-dynamic'

const CATEGORIES = ['project_management', 'document_coordinator', 'project_controls', 'travel_living_project', 'travel_living_fat', 'additional_indirect'] as const

async function canAccess(supabase: Awaited<ReturnType<typeof createClient>>, userId: string, role: string, bidSheetId: string): Promise<boolean> {
  if (role === 'admin' || role === 'super_admin') return true
  const { data: access } = await supabase.from('bid_sheet_access').select('user_id').eq('bid_sheet_id', bidSheetId).eq('user_id', userId).maybeSingle()
  if (access) return true
  const { data: sheet } = await supabase.from('bid_sheets').select('site_id').eq('id', bidSheetId).single()
  if (!sheet) return false
  const { data: siteAccess } = await supabase.from('user_sites').select('site_id').eq('user_id', userId).eq('site_id', sheet.site_id).maybeSingle()
  return !!siteAccess
}

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!['supervisor', 'manager', 'admin', 'super_admin'].includes(user.profile.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const supabase = await createClient()
  const allowed = await canAccess(supabase, user.id, user.profile.role, id)
  if (!allowed) return NextResponse.json({ error: 'Access denied' }, { status: 403 })

  const body = await req.json()
  const { category, hours, rate, notes } = body
  const notesVal = notes != null ? String(notes).trim() || null : null
  if (!category || (typeof category !== 'string')) {
    return NextResponse.json({ error: 'category required' }, { status: 400 })
  }
  const isValid = CATEGORIES.includes(category as any) || (category.startsWith('custom_') && category.length <= 64)
  if (!isValid) {
    return NextResponse.json({ error: 'Invalid category' }, { status: 400 })
  }

  const { data, error } = await supabase
    .from('bid_sheet_indirect_labor')
    .upsert(
      {
        bid_sheet_id: id,
        category,
        hours: parseFloat(String(hours)) || 0,
        rate: parseFloat(String(rate)) || 0,
        notes: notesVal,
      },
      { onConflict: 'bid_sheet_id,category' }
    )
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const { data: sheet } = await supabase
    .from('bid_sheets')
    .select('status, converted_po_id, site_id')
    .eq('id', id)
    .single()

  if (sheet?.status === 'converted' && sheet.converted_po_id && sheet.site_id && data) {
    try {
      const admin = createAdminClient()
      const treatAs = effectiveIndirectTreatAs(data.category, data.notes)
      const hrs = Number(data.hours) || 0

      // We only sync the loggable-activity side of the indirect ↔ project
      // relationship. Expense-style indirect lines on the bid sheet are
      // proposal estimates that roll up into the PO total — actual expenses
      // get added to the project budget manually as they're incurred during
      // the project, so we deliberately don't touch po_expenses here.
      if (treatAs === 'activity') {
        if (hrs > 0) {
          await upsertIndirectActivityForProject(
            admin,
            sheet.site_id,
            sheet.converted_po_id,
            data.category,
            hrs,
            data.notes
          )
        } else {
          await deleteIndirectActivityForProject(
            admin,
            sheet.site_id,
            sheet.converted_po_id,
            data.category,
            data.notes
          )
        }
      } else {
        // Flipped Activity → Expense (or row is now a flat expense): drop
        // the project_details row so people can't keep logging time to a
        // line that's no longer a loggable activity. Any pre-existing
        // po_expenses row stays in place — it's user-managed budget data.
        await deleteIndirectActivityForProject(
          admin,
          sheet.site_id,
          sheet.converted_po_id,
          data.category,
          data.notes
        )
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Failed to sync indirect cost to project budget'
      return NextResponse.json({ error: msg }, { status: 500 })
    }
  }

  return NextResponse.json(data)
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!['supervisor', 'manager', 'admin', 'super_admin'].includes(user.profile.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const supabase = await createClient()
  const allowed = await canAccess(supabase, user.id, user.profile.role, id)
  if (!allowed) return NextResponse.json({ error: 'Access denied' }, { status: 403 })

  const { searchParams } = new URL(req.url)
  const indirectId = searchParams.get('id')
  if (!indirectId) return NextResponse.json({ error: 'id required' }, { status: 400 })

  // Look up the row first so we know which category to clean up downstream
  // when the bid sheet has already been converted to a project budget.
  const { data: rowBefore } = await supabase
    .from('bid_sheet_indirect_labor')
    .select('category, notes')
    .eq('id', indirectId)
    .eq('bid_sheet_id', id)
    .maybeSingle()

  const { error } = await supabase
    .from('bid_sheet_indirect_labor')
    .delete()
    .eq('id', indirectId)
    .eq('bid_sheet_id', id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  if (rowBefore?.category) {
    const { data: sheet } = await supabase
      .from('bid_sheets')
      .select('status, converted_po_id, site_id')
      .eq('id', id)
      .single()
    if (sheet?.status === 'converted' && sheet.converted_po_id && sheet.site_id) {
      try {
        const admin = createAdminClient()
        // Drop the linked project_details row so people can't keep logging
        // time to an indirect activity that no longer exists on the bid
        // sheet. We deliberately leave po_expenses alone — those are user
        // -managed budget data, and indirect-expense bid sheet lines never
        // create them automatically.
        await deleteIndirectActivityForProject(
          admin,
          sheet.site_id,
          sheet.converted_po_id,
          rowBefore.category,
          rowBefore.notes
        )
      } catch (e) {
        const msg = e instanceof Error ? e.message : 'Failed to remove indirect cost from project budget'
        return NextResponse.json({ error: msg }, { status: 500 })
      }
    }
  }

  return NextResponse.json({ ok: true })
}
