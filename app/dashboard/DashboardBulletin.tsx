import { createClient } from '@/lib/supabase/server'
import { isBulletinAdmin } from '@/lib/bulletin'
import BulletinBoard from '@/components/bulletin/BulletinBoard'
import type { CurrentUser } from '@/lib/auth'
import type { BulletinPost } from '@/types/database'

export default async function DashboardBulletin({
  user,
  isClient,
}: {
  user: CurrentUser
  isClient: boolean
}) {
  const supabase = await createClient()
  const canEditBulletin = isBulletinAdmin(user.profile.role)
  let bulletinPosts: BulletinPost[] = []
  try {
    let bulletinQuery = supabase
      .from('bulletin_posts')
      .select('id, title, body_html, author_id, author_name, audience, is_pinned, created_at, updated_at')
      .is('deleted_at', null)
      .order('is_pinned', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(canEditBulletin ? 100 : 50)

    if (!canEditBulletin) {
      bulletinQuery = bulletinQuery.eq('audience', isClient ? 'client' : 'employee')
    }

    const { data: bulletinData, error: bulletinError } = await bulletinQuery
    if (!bulletinError && bulletinData) {
      bulletinPosts = (bulletinData as BulletinPost[]).map((p) => ({
        ...p,
        audience: p.audience || 'employee',
      }))
    }
  } catch {
    bulletinPosts = []
  }

  return (
    <BulletinBoard
      initialPosts={bulletinPosts}
      canEdit={!isClient && canEditBulletin}
      audienceMode={isClient ? 'client' : canEditBulletin ? 'admin' : 'employee'}
    />
  )
}

export function BulletinSkeleton() {
  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-4 sm:p-6 mb-6 sm:mb-8 animate-pulse">
      <div className="h-5 w-40 bg-gray-200 dark:bg-gray-700 rounded mb-3" />
      <div className="h-16 bg-gray-100 dark:bg-gray-700/60 rounded" />
    </div>
  )
}
