import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { requireRole } from '@/lib/auth'

export async function POST(request: NextRequest) {
  try {
    await requireRole(['admin', 'super_admin'])
    const supabase = await createClient()
    const { timesheetIds } = await request.json()

    if (!timesheetIds || !Array.isArray(timesheetIds) || timesheetIds.length === 0) {
      return NextResponse.json({ error: 'Invalid timesheet IDs' }, { status: 400 })
    }

    // Fetch all timesheets with user profiles
    const { data: timesheets, error: timesheetError } = await supabase
      .from('weekly_timesheets')
      .select(`
        *,
        user_profiles!user_id (
          id,
          name,
          email
        )
      `)
      .in('id', timesheetIds)

    if (timesheetError) throw timesheetError

    // Fetch all entries for these timesheets
    const { data: entries, error: entriesError } = await supabase
      .from('timesheet_entries')
      .select(`
        *
      `)
      .in('timesheet_id', timesheetIds)
      .order('created_at')

    // Get unique site and PO IDs
    const siteIds = Array.from(new Set((entries || []).map((e: any) => e.client_project_id).filter(Boolean)))
    const poIds = Array.from(new Set((entries || []).map((e: any) => e.po_id).filter(Boolean)))

    // Fetch sites
    let sitesMap: Record<string, any> = {}
    if (siteIds.length > 0) {
      const { data: sites } = await supabase
        .from('sites')
        .select('id, name, code')
        .in('id', siteIds)
      sitesMap = (sites || []).reduce((acc: Record<string, any>, site: any) => {
        acc[site.id] = site
        return acc
      }, {})
    }

    // Fetch purchase orders
    let posMap: Record<string, any> = {}
    if (poIds.length > 0) {
      const { data: pos } = await supabase
        .from('purchase_orders')
        .select('id, po_number, description')
        .in('id', poIds)
      posMap = (pos || []).reduce((acc: Record<string, any>, po: any) => {
        acc[po.id] = po
        return acc
      }, {})
    }

    // Attach sites and POs to entries
    const entriesWithRelations = (entries || []).map((entry: any) => ({
      ...entry,
      sites: entry.client_project_id ? sitesMap[entry.client_project_id] : null,
      purchase_orders: entry.po_id ? posMap[entry.po_id] : null
    }))

    if (entriesError) throw entriesError

    // Fetch all unbillable entries
    const { data: unbillable, error: unbillableError } = await supabase
      .from('timesheet_unbillable')
      .select('*')
      .in('timesheet_id', timesheetIds)
      .order('description')

    if (unbillableError) throw unbillableError

    // Fetch signatures for these timesheets
    const { data: signatures, error: signaturesError } = await supabase
      .from('timesheet_signatures')
      .select(`
        *,
        user_profiles!signer_id (
          id,
          name
        )
      `)
      .in('timesheet_id', timesheetIds)

    if (signaturesError) throw signaturesError

    // Organize data by timesheet
    const result = timesheets.map((timesheet: any) => {
      const timesheetEntries = entriesWithRelations.filter((e: any) => e.timesheet_id === timesheet.id)
      const timesheetUnbillable = (unbillable || []).filter((u: any) => u.timesheet_id === timesheet.id)
      const timesheetSignatures = (signatures || []).filter((s: any) => s.timesheet_id === timesheet.id)

      return {
        timesheet: {
          ...timesheet,
          timesheet_signatures: timesheetSignatures.map((sig: any) => ({
            ...sig,
            user_profiles: sig.user_profiles
          }))
        },
        entries: timesheetEntries,
        unbillable: timesheetUnbillable,
        user: timesheet.user_profiles
      }
    })

    return NextResponse.json(result)
  } catch (error: any) {
    console.error('Error fetching timesheet data:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to fetch timesheet data' },
      { status: 500 }
    )
  }
}
