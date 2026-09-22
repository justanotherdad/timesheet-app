import { Suspense } from 'react'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { BarChart3 } from 'lucide-react'
import { getCurrentUser } from '@/lib/auth'
import Header from '@/components/Header'
import DashboardNavTiles from '@/components/DashboardNavTiles'
import { getDashboardGrantFlags, getHeaderNavFlags } from '@/lib/nav-flags'
import { buildEmployeeDashboardTiles } from '@/lib/dashboard-tiles'
import DashboardBulletin, { BulletinSkeleton } from './DashboardBulletin'
import DashboardMainPanels, { MainPanelsSkeleton } from './DashboardMainPanels'

export const dynamic = 'force-dynamic'
export const maxDuration = 10

export default async function DashboardPage() {
  const user = await getCurrentUser()
  if (!user) {
    redirect('/login')
  }

  const isClient = user.profile.role === 'client'
  const isSupervisorOrAbove = ['supervisor', 'manager', 'admin', 'super_admin'].includes(
    user.profile.role
  )

  if (isClient) {
    const nav = await getHeaderNavFlags()
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
        <Header title="Client Dashboard" user={user} />
        <div className="container mx-auto px-3 sm:px-4 py-6 sm:py-8">
          {nav.clientBudget && (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 sm:gap-6 mb-6 sm:mb-8">
              <Link
                href="/dashboard/budget"
                className="bg-white dark:bg-gray-800 rounded-lg shadow p-4 sm:p-6 hover:shadow-md transition-shadow block min-h-[72px] sm:min-h-0"
              >
                <div className="flex items-center gap-3 sm:gap-4">
                  <div className="bg-teal-100 dark:bg-teal-900/30 p-3 rounded-lg">
                    <BarChart3 className="h-6 w-6 text-teal-600 dark:text-teal-400" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-gray-900 dark:text-gray-100">Budget Detail</h3>
                    <p className="text-sm text-gray-600 dark:text-gray-300">
                      View PO budgets you have been granted access to
                    </p>
                  </div>
                </div>
              </Link>
            </div>
          )}
          <Suspense fallback={<BulletinSkeleton />}>
            <DashboardBulletin user={user} isClient />
          </Suspense>
          <Suspense fallback={<MainPanelsSkeleton isClient isSupervisorOrAbove={false} />}>
            <DashboardMainPanels user={user} isClient />
          </Suspense>
        </div>
      </div>
    )
  }

  const [nav, grants] = await Promise.all([getHeaderNavFlags(), getDashboardGrantFlags()])
  const tiles = buildEmployeeDashboardTiles(user, nav, grants)

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <Header title="Timesheet Dashboard" user={user} />
      <div className="container mx-auto px-3 sm:px-4 py-6 sm:py-8">
        <DashboardNavTiles tiles={tiles} />
        <Suspense fallback={<BulletinSkeleton />}>
          <DashboardBulletin user={user} isClient={false} />
        </Suspense>
        <Suspense
          fallback={
            <MainPanelsSkeleton isClient={false} isSupervisorOrAbove={isSupervisorOrAbove} />
          }
        >
          <DashboardMainPanels user={user} isClient={false} />
        </Suspense>
      </div>
    </div>
  )
}
