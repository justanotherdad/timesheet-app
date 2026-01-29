import { redirect } from 'next/navigation'
import { getCurrentUser } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import WeeklyTimesheetExport from '@/components/WeeklyTimesheetExport'
import { formatWeekEnding } from '@/lib/utils'
import { withQueryTimeout } from '@/lib/timeout'
import Header from '@/components/Header'

export const maxDuration = 10 // Maximum duration for this route in seconds

export default async function ExportTimesheetPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const user = await getCurrentUser()
  if (!user) redirect('/login')

  const supabase = await createClient()

  // Query timesheet with user profile (avoid nested relationships that might fail)
  const timesheetResult = await withQueryTimeout(() =>
    supabase
      .from('weekly_timesheets')
      .select(`
        *,
        user_profiles!user_id(name, email)
      `)
      .eq('id', id)
      .single()
  )
  const timesheet = timesheetResult.data as any

  if (!timesheet) {
      return (
        <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
          <Header 
            title="Export Timesheet"
            showBack={true}
            backUrl="/dashboard/timesheets"
            user={user}
          />
          <div className="flex items-center justify-center min-h-[60vh]">
            <div className="text-center">
              <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-4">Timesheet not found</h1>
              <a href="/dashboard/timesheets" className="text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300">
                ← Back to Timesheets
              </a>
            </div>
          </div>
        </div>
      )
  }

  // Query signatures separately to avoid relationship issues
  const signaturesResult = await withQueryTimeout(() =>
    supabase
    .from('timesheet_signatures')
    .select(`
      *,
      user_profiles!signer_id(name)
    `)
    .eq('timesheet_id', id)
  )
  
  const signatures = (signaturesResult.data || []) as any[]
  
  // Attach signatures to timesheet object for compatibility
  if (timesheet) {
    timesheet.timesheet_signatures = signatures
  }

  // Verify user can view this timesheet
  if (timesheet.user_id !== user.id && !['admin', 'super_admin'].includes(user.profile.role)) {
    // Check if user is manager/supervisor of the timesheet owner
    const ownerResult = await withQueryTimeout(() =>
      supabase
        .from('user_profiles')
        .select('reports_to_id')
        .eq('id', timesheet.user_id)
        .single()
    )
    const owner = ownerResult.data as any

    if (owner?.reports_to_id !== user.id) {
      redirect('/dashboard')
    }
  }

  // Get entries
  const entriesResult = await withQueryTimeout(() =>
    supabase
      .from('timesheet_entries')
      .select(`
        *,
        sites(name, code),
        purchase_orders(po_number, description)
      `)
      .eq('timesheet_id', id)
      .order('created_at')
  )
  const entries = (entriesResult.data || []) as any[]

  // Get unbillable entries
  const unbillableResult = await withQueryTimeout(() =>
    supabase
      .from('timesheet_unbillable')
      .select('*')
      .eq('timesheet_id', id)
      .order('description')
  )
  const unbillable = (unbillableResult.data || []) as any[]

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      {/* Force landscape and clean print layout when printing from this page */}
      <style
        dangerouslySetInnerHTML={{
          __html: `
            @media print {
              @page { size: landscape; margin: 0.25in; }
              body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
            }
          `,
        }}
      />
      <Header 
        title={`Export Timesheet - Week Ending ${formatWeekEnding(timesheet.week_ending)}`}
        showBack={true}
        backUrl={`/dashboard/timesheets/${id}`}
        user={user}
      />
      {/* Don't hide content when printing - only header/buttons are hidden via their own print:hidden */}
      <div className="container mx-auto px-4 py-8 print:p-0 print:max-w-none">
        <div className="max-w-7xl mx-auto print:max-w-none">
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6 print:shadow-none print:p-0 print:bg-white">
            <WeeklyTimesheetExport 
              timesheet={timesheet}
              entries={entries || []}
              unbillable={unbillable || []}
              user={timesheet.user_profiles}
            />
          </div>
        </div>
      </div>
    </div>
  )
}
