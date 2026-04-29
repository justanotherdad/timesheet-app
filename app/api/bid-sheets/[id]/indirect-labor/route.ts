import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getCurrentUser } from '@/lib/auth'
import {
  decodeIndirectNotes,
  effectiveIndirectTreatAs,
  indirectLineDollarTotal,
} from '@/lib/bid-sheet-indirect'
import {
  deleteIndirectActivityForProject,
  deleteIndirectExpenseForProject,
  upsertIndirectActivityForProject,
  upsertIndirectExpenseForProject,
} from '@/lib/syncBidSheetToProject'

export const dynamic = 'force-dynamic'

const CATEGORIES = ['project_management', 'document_coordinator', 'project_controls', 'travel_living_project', 'travel_living_fat', 'additional_indirect'] as const

const PRESET_INDIRECT_LABEL: Record<string, string> = {
  project_management: 'Indirect — Project Management',
  document_coordinator: 'Indirect — Document Coordinator',
  project_controls: 'Indirect — Project Controls',
  travel_living_project: 'Indirect — Travel & Living (Project by Person)',
  travel_living_fat: 'Indirect — Travel & Living (FAT)',
  additional_indirect: 'Indirect — Additional Indirect Costs',
}

function indirectExpenseTitle(category: string, notes: string | null | undefined): string {
  if (category.startsWith('custom_')) {
    const meta = decodeIndirectNotes(notes)
    const name = meta.label?.trim()
    return name ? `Indirect — ${name}` : 'Indirect — Additional line'
  }
  return PRESET_INDIRECT_LABEL[category] || `Indirect — ${category}`
}

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

      if (treatAs === 'activity') {
        // Make sure the project_details row exists / is up-to-date AND that
        // any prior po_expenses row (e.g. an Additional Indirect line that
        // was previously flipped from Expense to Activity) is removed so we
        // don't double-count the same line.
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
        await deleteIndirectExpenseForProject(admin, sheet.converted_po_id, data.category)
      } else {
        // Inverse: make sure the po_expenses row reflects the current dollar
        // total, and remove any prior project_details row for this category.
        const amt = indirectLineDollarTotal(
          hrs,
          Number(data.rate) || 0,
          data.category,
          data.notes
        )
        if (amt > 0) {
          await upsertIndirectExpenseForProject(
            admin,
            sheet.converted_po_id,
            data.category,
            amt,
            indirectExpenseTitle(data.category, data.notes),
            new Date().toISOString().slice(0, 10),
            user.id
          )
        } else {
          await deleteIndirectExpenseForProject(admin, sheet.converted_po_id, data.category)
        }
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
    if (sheet?.status === 'converted' && sheet.converted_po_id) {
      try {
        const admin = createAdminClient()
        // Try removing both representations so we leave no orphan if the
        // category had been flipped between activity and expense at some
        // point, or if the row predates the treatAs feature.
        await deleteIndirectExpenseForProject(admin, sheet.converted_po_id, rowBefore.category)
        if (sheet.site_id) {
          await deleteIndirectActivityForProject(
            admin,
            sheet.site_id,
            sheet.converted_po_id,
            rowBefore.category,
            rowBefore.notes
          )
        }
      } catch (e) {
        const msg = e instanceof Error ? e.message : 'Failed to remove indirect cost from project budget'
        return NextResponse.json({ error: msg }, { status: 500 })
      }
    }
  }

  return NextResponse.json({ ok: true })
}
