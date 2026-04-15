export const dynamic = 'force-dynamic'

import { requireRole } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import Header from '@/components/Header'
import AdminExport from '@/components/admin/AdminExport'

export default async function AdminExportPage() {
  const user = await requireRole(['manager', 'admin', 'super_admin'])
  const supabase = await createClient()

  // Get timesheets with user profiles (include approver ids for conditional signature lines)
  const { data: timesheets } = await supabase
    .from('weekly_timesheets')
    .select(`
      *,
      user_profiles!user_id(name, email, supervisor_id, manager_id, final_approver_id)
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
      .select('timesheet_id, mon_hours, tue_hours, wed_hours, thu_hours, fri_hours, sat_hours, sun_hours, client_project_id, po_id, system_id, system_name')
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
    
    const siteIdsForTs = Array.from(new Set(entries.map((e: any) => e.client_project_id).filter(Boolean)))
    const poIdsForTs = Array.from(new Set(entries.map((e: any) => e.po_id).filter(Boolean)))
    const systemIdsForTs = Array.from(new Set(entries.map((e: any) => e.system_id).filter(Boolean)))
    const systemNamesForTs = Array.from(new Set(entries.map((e: any) => e.system_name).filter(Boolean)))

    return {
      ...ts,
      hours: totalHours,
      _site_ids: siteIdsForTs,
      _po_ids: poIdsForTs,
      _system_ids: systemIdsForTs,
      _system_names: systemNamesForTs
    }
  })

  const siteIds = Array.from(new Set(timesheetsWithHours.flatMap((ts: any) => ts._site_ids || [])))
  const poIds = Array.from(new Set(timesheetsWithHours.flatMap((ts: any) => ts._po_ids || [])))

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

  // Fetch PO names with site_id, department_id for cascading filters
  let posMap: Record<string, any> = {}
  if (poIds.length > 0) {
    const { data: pos } = await supabase
      .from('purchase_orders')
      .select('id, po_number, site_id, department_id')
      .in('id', poIds)
    posMap = (pos || []).reduce((acc: Record<string, any>, po: any) => {
      acc[po.id] = po
      return acc
    }, {})
  }

  // Fetch systems for filter options
  const systemIdsFromTs = Array.from(new Set(timesheetsWithHours.flatMap((ts: any) => ts._system_ids || [])))
  const customSystemNames = Array.from(new Set(timesheetsWithHours.flatMap((ts: any) => ts._system_names || [])))
  let systemsMap: Record<string, any> = {}
  if (systemIdsFromTs.length > 0) {
    const { data: systemsData } = await supabase
      .from('systems')
      .select('id, name')
      .in('id', systemIdsFromTs)
    systemsMap = (systemsData || []).reduce((acc: Record<string, any>, s: any) => {
      acc[s.id] = s
      return acc
    }, {})
  }

  // Fetch departments for cascading filters
  const { data: departmentsData } = await supabase
    .from('departments')
    .select('id, name, site_id')
    .order('name')
  const departments = departmentsData || []

  // Build sites and purchaseOrders for AdminExport
  const sites = (siteIds as string[]).map((id) => sitesMap[id]).filter(Boolean)
  const purchaseOrders = (poIds as string[]).map((id) => posMap[id]).filter(Boolean)
  const systems = [
    ...(systemIdsFromTs as string[]).map((id) => systemsMap[id]).filter(Boolean),
    ...(customSystemNames as string[]).map((name) => ({ id: `custom:${name}`, name }))
  ]

  // Add site names, PO names, system names to timesheets (all unique per timesheet)
  const timesheetsWithData = timesheetsWithHours.map((ts: any) => {
    const siteNames = (ts._site_ids || []).map((id: string) => sitesMap[id]?.name).filter(Boolean)
    const poNumbers = (ts._po_ids || []).map((id: string) => posMap[id]?.po_number).filter(Boolean)
    const systemNamesList = [
      ...(ts._system_ids || []).map((id: string) => systemsMap[id]?.name).filter(Boolean),
      ...(ts._system_names || []).filter(Boolean)
    ].filter(Boolean)
    const uniqueSystemNames = Array.from(new Set(systemNamesList))
    return {
      ...ts,
      sitesDisplay: siteNames.length ? siteNames.join(', ') : 'N/A',
      posDisplay: poNumbers.length ? poNumbers.join(', ') : 'N/A',
      systemsDisplay: uniqueSystemNames.length ? uniqueSystemNames.join(', ') : '—',
      _site_ids: ts._site_ids,
      _po_ids: ts._po_ids,
      _system_ids: ts._system_ids,
      _system_names: ts._system_names
    }
  })

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <Header title="Export Timesheets" showBack backUrl="/dashboard" user={user} />
      <div className="container mx-auto px-4 py-8">
        <div className="max-w-6xl mx-auto">
          <AdminExport
            timesheets={timesheetsWithData || []}
            sites={sites}
            departments={departments}
            purchaseOrders={purchaseOrders}
            systems={systems}
          />
        </div>
      </div>
    </div>
  )
}

