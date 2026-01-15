import { redirect } from 'next/navigation'
import { requireRole } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import Link from 'next/link'
import AdminExport from '@/components/admin/AdminExport'

export default async function AdminExportPage() {
  await requireRole(['admin', 'super_admin'])
  const supabase = await createClient()

  // Get timesheets with user profiles
  const { data: timesheets } = await supabase
    .from('weekly_timesheets')
    .select(`
      *,
      user_profiles!user_id(name, email)
    `)
    .order('week_ending', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(1000)

  // Get all timesheet entries to calculate hours
  const timesheetIds = (timesheets || []).map((ts: any) => ts.id)
  let entriesData: any[] = []
  
  if (timesheetIds.length > 0) {
    const { data: entries } = await supabase
      .from('timesheet_entries')
      .select('timesheet_id, mon_hours, tue_hours, wed_hours, thu_hours, fri_hours, sat_hours, sun_hours, client_project_id, po_id')
      .in('timesheet_id', timesheetIds)
    
    entriesData = entries || []
  }

  // Calculate total hours for each timesheet and get site/PO info
  const timesheetsWithHours = (timesheets || []).map((ts: any) => {
    const entries = entriesData.filter((e: any) => e.timesheet_id === ts.id)
    const totalHours = entries.reduce((sum: number, entry: any) => {
      return sum + (entry.mon_hours || 0) + (entry.tue_hours || 0) + 
             (entry.wed_hours || 0) + (entry.thu_hours || 0) + 
             (entry.fri_hours || 0) + (entry.sat_hours || 0) + 
             (entry.sun_hours || 0)
    }, 0)
    
    // Get the first entry's site and PO for display (or aggregate if needed)
    const firstEntry = entries[0]
    const siteId = firstEntry?.client_project_id
    const poId = firstEntry?.po_id

    return {
      ...ts,
      hours: totalHours,
      _site_id: siteId,
      _po_id: poId
    }
  })

  // Get unique site and PO IDs to fetch names
  const siteIds = Array.from(new Set(timesheetsWithHours.map((ts: any) => ts._site_id).filter(Boolean)))
  const poIds = Array.from(new Set(timesheetsWithHours.map((ts: any) => ts._po_id).filter(Boolean)))

  // Fetch site names
  let sitesMap: Record<string, any> = {}
  if (siteIds.length > 0) {
    const { data: sites } = await supabase
      .from('sites')
      .select('id, name')
      .in('id', siteIds)
    sitesMap = (sites || []).reduce((acc: Record<string, any>, site: any) => {
      acc[site.id] = site
      return acc
    }, {})
  }

  // Fetch PO names
  let posMap: Record<string, any> = {}
  if (poIds.length > 0) {
    const { data: pos } = await supabase
      .from('purchase_orders')
      .select('id, po_number')
      .in('id', poIds)
    posMap = (pos || []).reduce((acc: Record<string, any>, po: any) => {
      acc[po.id] = po
      return acc
    }, {})
  }

  // Add site and PO names to timesheets
  const timesheetsWithData = timesheetsWithHours.map((ts: any) => ({
    ...ts,
    sites: ts._site_id ? sitesMap[ts._site_id] : null,
    purchase_orders: ts._po_id ? posMap[ts._po_id] : null
  }))

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <div className="container mx-auto px-4 py-8">
        <div className="max-w-6xl mx-auto">
          <div className="flex items-center gap-4 mb-6">
            <Link
              href="/dashboard/admin"
              className="text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-gray-100"
            >
              ← Back to Admin
            </Link>
          </div>
          <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100 mb-6">Export Timesheets</h1>
          <AdminExport timesheets={timesheetsWithData || []} />
        </div>
      </div>
    </div>
  )
}

