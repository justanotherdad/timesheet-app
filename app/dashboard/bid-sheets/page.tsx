import { requireRole } from '@/lib/auth'
import Header from '@/components/Header'
import BidSheetsClient from '@/components/bidsheets/BidSheetsClient'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { withQueryTimeout } from '@/lib/timeout'
import { getAccessibleBidSheetIds } from '@/lib/access'

export const dynamic = 'force-dynamic'

export default async function BidSheetsPage() {
  const user = await requireRole(['supervisor', 'manager', 'admin', 'super_admin'])
  const supabase = await createClient()
  const role = user.profile.role as 'supervisor' | 'manager' | 'admin' | 'super_admin'
  const db = role === 'admin' || role === 'super_admin' ? createAdminClient() : supabase

  const [sheetsResult, sitesResult] = await Promise.all([
    withQueryTimeout(() => db.from('bid_sheets').select('*, sites(id, name)').order('created_at', { ascending: false })),
    withQueryTimeout(() => supabase.from('sites').select('id, name').order('name')),
  ])

  let sheets = (sheetsResult.data || []) as any[]
  const sites = (sitesResult.data || []) as Array<{ id: string; name: string }>

  const accessibleIds = await getAccessibleBidSheetIds(supabase, user.id, role)
  if (accessibleIds !== null && accessibleIds.length > 0) {
    sheets = sheets.filter((s: any) => accessibleIds.includes(s.id))
  } else if (accessibleIds !== null && accessibleIds.length === 0) {
    sheets = []
  }

  const readOnly = role === 'supervisor'

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <Header title="Bid Sheets" showBack backUrl="/dashboard" user={user} />
      <div className="container mx-auto px-4 py-8">
        <BidSheetsClient
          initialSheets={sheets}
          sites={sites}
          user={user}
          readOnly={readOnly}
        />
      </div>
    </div>
  )
}
