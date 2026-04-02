import { redirect } from 'next/navigation'
import { requireRole } from '@/lib/auth'
import Header from '@/components/Header'
import BidSheetDetailClient from '@/components/bidsheets/BidSheetDetailClient'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { withQueryTimeout } from '@/lib/timeout'

export const dynamic = 'force-dynamic'

async function canAccess(supabase: Awaited<ReturnType<typeof createClient>>, userId: string, role: string, bidSheetId: string): Promise<boolean> {
  if (role === 'admin' || role === 'super_admin') return true
  const { data: access } = await supabase.from('bid_sheet_access').select('user_id').eq('bid_sheet_id', bidSheetId).eq('user_id', userId).maybeSingle()
  if (access) return true
  const { data: sheet } = await supabase.from('bid_sheets').select('site_id').eq('id', bidSheetId).single()
  if (!sheet) return false
  const { data: siteAccess } = await supabase.from('user_sites').select('site_id').eq('user_id', userId).eq('site_id', sheet.site_id).maybeSingle()
  return !!siteAccess
}

export default async function BidSheetDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const user = await requireRole(['supervisor', 'manager', 'admin', 'super_admin'])
  const supabase = await createClient()

  const allowed = await canAccess(supabase, user.id, user.profile.role, id)
  if (!allowed) redirect('/dashboard/bid-sheets')

  const db = ['admin', 'super_admin'].includes(user.profile.role) ? createAdminClient() : supabase

  const [sheetRes, itemsRes, laborRes, indirectRes, sysRes, delRes, actRes] = await Promise.all([
    withQueryTimeout(() => db.from('bid_sheets').select('*, sites(id, name)').eq('id', id).single()),
    withQueryTimeout(() => db.from('bid_sheet_items').select('*, bid_sheet_systems(id, name, code), bid_sheet_deliverables(id, name), bid_sheet_activities(id, name)').eq('bid_sheet_id', id)),
    withQueryTimeout(() => db.from('bid_sheet_labor').select('*, user_profiles(id, name)').eq('bid_sheet_id', id)),
    withQueryTimeout(() => db.from('bid_sheet_indirect_labor').select('*').eq('bid_sheet_id', id)),
    db.from('bid_sheet_systems').select('id, name, code, description').eq('bid_sheet_id', id).order('name'),
    db.from('bid_sheet_deliverables').select('id, name, description').eq('bid_sheet_id', id).order('name'),
    db.from('bid_sheet_activities').select('id, name, description').eq('bid_sheet_id', id).order('name'),
  ])

  const sheet = sheetRes.data as { id: string; name?: string; site_id: string; status?: string; converted_po_id?: string; sites?: { id: string; name: string } } | null
  if (!sheet) redirect('/dashboard/bid-sheets')

  let linkedPo: { id: string; original_po_amount: number | null; po_balance: number | null } | null = null
  if (sheet.converted_po_id) {
    const { data: poRow } = await db
      .from('purchase_orders')
      .select('id, original_po_amount, po_balance')
      .eq('id', sheet.converted_po_id)
      .maybeSingle()
    if (poRow) linkedPo = poRow as { id: string; original_po_amount: number | null; po_balance: number | null }
  }

  const deptRes = sheet.site_id
    ? await db.from('departments').select('id, name').eq('site_id', sheet.site_id).order('name')
    : { data: [] }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <Header title={sheet.name || 'Bid Sheet'} showBack backUrl="/dashboard/bid-sheets" user={user} />
      <div className="container mx-auto px-4 py-8">
        <BidSheetDetailClient
          sheet={sheet}
          items={(itemsRes.data || []) as any[]}
          labor={(laborRes.data || []) as any[]}
          indirectLabor={(indirectRes.data || []) as any[]}
          systems={(sysRes.data || []) as Array<{ id: string; name: string; code?: string; description?: string | null }>}
          deliverables={(delRes.data || []) as Array<{ id: string; name: string; description?: string | null }>}
          activities={(actRes.data || []) as Array<{ id: string; name: string; description?: string | null }>}
          departments={(deptRes.data || []) as any[]}
          user={user}
          readOnly={user.profile.role === 'supervisor'}
          linkedPo={linkedPo}
        />
      </div>
    </div>
  )
}
