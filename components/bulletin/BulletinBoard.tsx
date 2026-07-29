'use client'

import { useEffect, useMemo, useState } from 'react'
import dynamic from 'next/dynamic'
import { Megaphone, Pin, Plus } from 'lucide-react'
import { useRouter } from 'next/navigation'
import type { BulletinPost } from '@/types/database'
import { sanitizeBulletinHtml } from '@/lib/bulletin'
import { formatDate } from '@/lib/utils'

// TipTap editor is heavy — load only when an admin opens the modal (client-only).
const BulletinEditorModal = dynamic(() => import('./BulletinEditorModal'), {
  ssr: false,
  loading: () => (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="rounded-lg bg-white dark:bg-gray-800 px-4 py-3 text-sm text-gray-700 dark:text-gray-200">
        Loading editor…
      </div>
    </div>
  ),
})

type Props = {
  initialPosts: BulletinPost[]
  canEdit: boolean
}

export default function BulletinBoard({ initialPosts, canEdit }: Props) {
  const router = useRouter()
  const [posts, setPosts] = useState(initialPosts)
  const [editing, setEditing] = useState<BulletinPost | null | undefined>(undefined)
  // undefined = closed; null = new; object = edit
  const [busyId, setBusyId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    setPosts(initialPosts)
  }, [initialPosts])

  const sorted = useMemo(
    () =>
      [...posts].sort((a, b) => {
        if (a.is_pinned !== b.is_pinned) return a.is_pinned ? -1 : 1
        return new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      }),
    [posts]
  )

  const onSaved = (post: BulletinPost) => {
    setPosts((prev) => {
      const idx = prev.findIndex((p) => p.id === post.id)
      if (idx >= 0) {
        const next = [...prev]
        next[idx] = post
        return next
      }
      return [post, ...prev]
    })
    router.refresh()
  }

  const remove = async (id: string) => {
    if (!confirm('Delete this bulletin post?')) return
    setBusyId(id)
    setError(null)
    try {
      const res = await fetch(`/api/bulletin/${id}`, {
        method: 'DELETE',
        credentials: 'include',
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || 'Delete failed')
      setPosts((prev) => prev.filter((p) => p.id !== id))
      router.refresh()
    } catch (err: any) {
      setError(err?.message || 'Delete failed')
    } finally {
      setBusyId(null)
    }
  }

  const togglePin = async (post: BulletinPost) => {
    setBusyId(post.id)
    setError(null)
    try {
      const res = await fetch(`/api/bulletin/${post.id}`, {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_pinned: !post.is_pinned }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Update failed')
      onSaved(data.post as BulletinPost)
    } catch (err: any) {
      setError(err?.message || 'Update failed')
    } finally {
      setBusyId(null)
    }
  }

  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-4 sm:p-6 mb-6 sm:mb-8">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <div className="flex items-center gap-3">
          <div className="bg-amber-100 dark:bg-amber-900/30 p-2.5 rounded-lg">
            <Megaphone className="h-5 w-5 text-amber-700 dark:text-amber-400" />
          </div>
          <div>
            <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100">
              Bulletin Board
            </h2>
            <p className="text-sm text-gray-600 dark:text-gray-300">
              Company news and information
            </p>
          </div>
        </div>
        {canEdit && (
          <button
            type="button"
            onClick={() => setEditing(null)}
            className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white px-3 py-2 text-sm font-medium"
          >
            <Plus className="h-4 w-4" />
            New post
          </button>
        )}
      </div>

      {error && (
        <p className="mb-3 text-sm text-red-600 dark:text-red-400">{error}</p>
      )}

      {sorted.length === 0 ? (
        <p className="text-sm text-gray-500 dark:text-gray-400 py-2">
          {canEdit
            ? 'No posts yet. Click “New post” to publish the first bulletin.'
            : 'No bulletin posts right now.'}
        </p>
      ) : (
        <div className="space-y-4">
          {sorted.map((post) => (
            <article
              key={post.id}
              className="rounded-lg border border-gray-200 dark:border-gray-700 p-4"
            >
              <div className="flex flex-wrap items-start justify-between gap-2 mb-2">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2 mb-1">
                    {post.is_pinned && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 dark:bg-amber-900/40 text-amber-800 dark:text-amber-300 px-2 py-0.5 text-xs font-medium">
                        <Pin className="h-3 w-3" />
                        Pinned
                      </span>
                    )}
                    <h3 className="text-base sm:text-lg font-semibold text-gray-900 dark:text-gray-100">
                      {post.title}
                    </h3>
                  </div>
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    {formatDate(post.created_at)}
                    {post.author_name ? ` · ${post.author_name}` : ''}
                  </p>
                </div>
                {canEdit && (
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      disabled={busyId === post.id}
                      onClick={() => void togglePin(post)}
                      className="text-xs sm:text-sm text-gray-600 dark:text-gray-300 hover:text-blue-600 dark:hover:text-blue-400"
                    >
                      {post.is_pinned ? 'Unpin' : 'Pin'}
                    </button>
                    <button
                      type="button"
                      disabled={busyId === post.id}
                      onClick={() => setEditing(post)}
                      className="text-xs sm:text-sm text-blue-600 hover:text-blue-700 dark:text-blue-400"
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      disabled={busyId === post.id}
                      onClick={() => void remove(post.id)}
                      className="text-xs sm:text-sm text-red-600 hover:text-red-700 dark:text-red-400"
                    >
                      Delete
                    </button>
                  </div>
                )}
              </div>
              <div
                className="bulletin-content max-w-none text-gray-800 dark:text-gray-200"
                dangerouslySetInnerHTML={{
                  __html: sanitizeBulletinHtml(post.body_html || ''),
                }}
              />
            </article>
          ))}
        </div>
      )}

      {editing !== undefined && (
        <BulletinEditorModal
          post={editing}
          onClose={() => setEditing(undefined)}
          onSaved={onSaved}
        />
      )}
    </div>
  )
}
