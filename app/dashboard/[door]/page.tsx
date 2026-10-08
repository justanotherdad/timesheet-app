export const dynamic = 'force-dynamic'

import { notFound } from 'next/navigation'
import { getCurrentUser } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/admin'
import Header from '@/components/Header'
import LaborBillRateReport from '@/components/reports/LaborBillRateReport'

export default async function LaborDoorPage({ params }: { params: Promise<{ door: string }> }) {
  const { door } = await params
  const user = await getCurrentUser()
  if (!user || user.profile.role !== 'super_admin') notFound()

  let admin: ReturnType<typeof createAdminClient>
  try {
    admin = createAdminClient()
  } catch {
    notFound()
  }

  const { data: settings } = await admin.from('labor_report_settings').select('path_segment').eq('id', 1).maybeSingle()
  const segment = String((settings as { path_segment?: string } | null)?.path_segment || '').toLowerCase()
  if (!segment || door.toLowerCase() !== segment) notFound()

  const { data: access } = await admin
    .from('labor_report_access')
    .select('is_owner')
    .eq('user_id', user.id)
    .maybeSingle()
  if (!access) notFound()

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <Header title="Labor profitability" showBack backUrl="/dashboard" user={user} />
      <div className="container mx-auto px-4 py-8">
        <div className="max-w-7xl mx-auto min-w-0 w-full">
          <LaborBillRateReport
            isOwner={!!(access as { is_owner?: boolean }).is_owner}
            pathSegment={segment}
            viewerName={user.profile.name || 'Unknown'}
          />
        </div>
      </div>
    </div>
  )
}
