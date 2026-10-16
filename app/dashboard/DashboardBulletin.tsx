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
  const limit = canEditBulletin ? 200 : 50
  const audience = isClient ? 'client' : 'employee'

  const toPosts = (rows: Array<{ audience?: string | null }>): BulletinPost[] =>
    rows.map((p) => ({
      ...(p as unknown as BulletinPost),
      audience: (p.audience || 'employee') as BulletinPost['audience'],
    }))

  try {
    let query = supabase
      .from('bulletin_posts')
      .select('id, title, body_html, author_id, author_name, audience, is_pinned, archived_at, created_at, updated_at')
      .is('deleted_at', null)
      .order('is_pinned', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(limit)
    if (!canEditBulletin) {
      query = query.eq('audience', audience).is('archived_at', null)
    }
    const first = await query
    if (!first.error && first.data) {
      bulletinPosts = toPosts(first.data)
    } else {
      let fallback = supabase
        .from('bulletin_posts')
        .select('id, title, body_html, author_id, author_name, audience, is_pinned, created_at, updated_at')
        .is('deleted_at', null)
        .order('is_pinned', { ascending: false })
        .order('created_at', { ascending: false })
        .limit(limit)
      if (!canEditBulletin) fallback = fallback.eq('audience', audience)
      const second = await fallback
      if (!second.error && second.data) bulletinPosts = toPosts(second.data)
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
