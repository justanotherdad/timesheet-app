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
  const load = async (withArchive: boolean) => {
    const columns = withArchive
      ? 'id, title, body_html, author_id, author_name, audience, is_pinned, archived_at, created_at, updated_at'
      : 'id, title, body_html, author_id, author_name, audience, is_pinned, created_at, updated_at'
    let bulletinQuery = supabase
      .from('bulletin_posts')
      .select(columns)
      .is('deleted_at', null)
      .order('is_pinned', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(canEditBulletin ? 200 : 50)

    if (!canEditBulletin) {
      bulletinQuery = bulletinQuery.eq('audience', isClient ? 'client' : 'employee')
      if (withArchive) bulletinQuery = bulletinQuery.is('archived_at', null)
    }

    return bulletinQuery
  }

  try {
    let { data: bulletinData, error: bulletinError } = await load(true)
    if (bulletinError) {
      const retry = await load(false)
      bulletinData = retry.data
      bulletinError = retry.error
    }
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
