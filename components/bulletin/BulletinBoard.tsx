'use client'

import { useEffect, useMemo, useState } from 'react'
import dynamic from 'next/dynamic'
import { Megaphone, Pin, Plus, X } from 'lucide-react'
import { useRouter } from 'next/navigation'
import type { BulletinAudience, BulletinPost } from '@/types/database'
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

const EXCERPT_LENGTH = 180

function postPreview(html: string): { excerpt: string; imageSrc: string | null } {
  const doc = new DOMParser().parseFromString(html || '', 'text/html')
  const imageSrc = doc.querySelector('img')?.getAttribute('src') || null
  const text = (doc.body.textContent || '').replace(/\s+/g, ' ').trim()
  const excerpt =
    text.length > EXCERPT_LENGTH ? `${text.slice(0, EXCERPT_LENGTH).trimEnd()}…` : text
  return { excerpt, imageSrc }
}

type AudienceMode = 'admin' | 'employee' | 'client'

type Props = {
  initialPosts: BulletinPost[]
  canEdit: boolean
  /** admin = Employee/Client tabs; employee/client = single feed */
  audienceMode?: AudienceMode
}

export default function BulletinBoard({
  initialPosts,
  canEdit,
  audienceMode = 'employee',
}: Props) {
  const router = useRouter()
  const [posts, setPosts] = useState(initialPosts)
  const [editing, setEditing] = useState<BulletinPost | null | undefined>(undefined)
  // undefined = closed; null = new; object = edit
  const [busyId, setBusyId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [reading, setReading] = useState<BulletinPost | null>(null)
  const [previewsReady, setPreviewsReady] = useState(false)
  const [activeTab, setActiveTab] = useState<BulletinAudience>(
    audienceMode === 'client' ? 'client' : 'employee'
  )

  useEffect(() => {
    setPosts(initialPosts)
  }, [initialPosts])

  useEffect(() => {
    setPreviewsReady(true)
  }, [])

  const showTabs = audienceMode === 'admin' && canEdit

  const visiblePosts = useMemo(() => {
    const audience = showTabs
      ? activeTab
      : audienceMode === 'client'
        ? 'client'
        : 'employee'
    return posts.filter((p) => (p.audience || 'employee') === audience)
  }, [posts, showTabs, activeTab, audienceMode])

  const sorted = useMemo(
    () =>
      [...visiblePosts].sort((a, b) => {
        if (a.is_pinned !== b.is_pinned) return a.is_pinned ? -1 : 1
        return new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      }),
    [visiblePosts]
  )

  const pinned = useMemo(() => sorted.filter((post) => post.is_pinned), [sorted])
  const unpinned = useMemo(() => sorted.filter((post) => !post.is_pinned), [sorted])

  useEffect(() => {
    if (reading && !sorted.some((post) => post.id === reading.id)) {
      setReading(null)
    }
  }, [reading, sorted])
  const previews = useMemo(() => {
    const next = new Map<string, { excerpt: string; imageSrc: string | null }>()
    if (!previewsReady) return next
    for (const post of unpinned) {
      next.set(post.id, postPreview(post.body_html || ''))
    }
    return next
  }, [unpinned, previewsReady])

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
    if (post.audience) setActiveTab(post.audience)
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
              {audienceMode === 'client' ? 'Welcome' : 'Bulletin Board'}
            </h2>
            <p className="text-sm text-gray-600 dark:text-gray-300">
              {audienceMode === 'client'
                ? 'Messages from CTG'
                : 'Company news and information'}
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

      {showTabs && (
        <div className="flex gap-1 mb-4 border-b border-gray-200 dark:border-gray-700">
          {(
            [
              { id: 'employee' as const, label: 'Employee View' },
              { id: 'client' as const, label: 'Client View' },
            ] as const
          ).map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={`px-3 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
                activeTab === tab.id
                  ? 'border-blue-600 text-blue-600 dark:border-blue-400 dark:text-blue-400'
                  : 'border-transparent text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      )}

      {error && (
        <p className="mb-3 text-sm text-red-600 dark:text-red-400">{error}</p>
      )}

      {sorted.length === 0 ? (
        <p className="text-sm text-gray-500 dark:text-gray-400 py-2">
          {canEdit
            ? `No posts yet in ${activeTab === 'client' ? 'Client' : 'Employee'} View. Click “New post” to publish the first bulletin.`
            : 'No bulletin posts right now.'}
        </p>
      ) : (
        <div className="space-y-4">
          {pinned.map((post) => (
            <article
              key={post.id}
              className="rounded-lg border border-gray-200 dark:border-gray-700 p-4"
            >
              <PostHeader
                post={post}
                canEdit={canEdit}
                busy={busyId === post.id}
                onPin={() => void togglePin(post)}
                onEdit={() => setEditing(post)}
                onDelete={() => void remove(post.id)}
              />
              <div
                className="bulletin-content max-w-none text-gray-800 dark:text-gray-200"
                dangerouslySetInnerHTML={{
                  __html: sanitizeBulletinHtml(post.body_html || ''),
                }}
              />
            </article>
          ))}

          {unpinned.length > 0 && (
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
              {unpinned.map((post) => {
                const preview = previews.get(post.id)
                return (
                  <article
                    key={post.id}
                    className="flex h-full flex-col rounded-lg border border-gray-200 dark:border-gray-700 p-4"
                  >
                    <PostHeader
                      post={post}
                      canEdit={canEdit}
                      busy={busyId === post.id}
                      onPin={() => void togglePin(post)}
                      onEdit={() => setEditing(post)}
                      onDelete={() => void remove(post.id)}
                    />
                    {preview?.imageSrc && (
                      <img
                        src={preview.imageSrc}
                        alt=""
                        className="mt-3 h-28 w-full rounded-md object-cover"
                      />
                    )}
                    {preview?.excerpt && (
                      <p className="mt-3 line-clamp-3 text-sm text-gray-700 dark:text-gray-300">
                        {preview.excerpt}
                      </p>
                    )}
                    <button
                      type="button"
                      onClick={() => setReading(post)}
                      className="mt-auto pt-3 text-left text-sm font-medium text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300"
                    >
                      Read more
                    </button>
                  </article>
                )
              })}
            </div>
          )}
        </div>
      )}

      {reading && (
        <BulletinPostDialog post={reading} onClose={() => setReading(null)} />
      )}

      {editing !== undefined && (
        <BulletinEditorModal
          post={editing}
          defaultAudience={activeTab}
          onClose={() => setEditing(undefined)}
          onSaved={onSaved}
        />
      )}
    </div>
  )
}

function PostHeader({
  post,
  canEdit,
  busy,
  onPin,
  onEdit,
  onDelete,
}: {
  post: BulletinPost
  canEdit: boolean
  busy: boolean
  onPin: () => void
  onEdit: () => void
  onDelete: () => void
}) {
  return (
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
            disabled={busy}
            onClick={onPin}
            className="text-xs sm:text-sm text-gray-600 dark:text-gray-300 hover:text-blue-600 dark:hover:text-blue-400"
          >
            {post.is_pinned ? 'Unpin' : 'Pin'}
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={onEdit}
            className="text-xs sm:text-sm text-blue-600 hover:text-blue-700 dark:text-blue-400"
          >
            Edit
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={onDelete}
            className="text-xs sm:text-sm text-red-600 hover:text-red-700 dark:text-red-400"
          >
            Delete
          </button>
        </div>
      )}
    </div>
  )
}

function BulletinPostDialog({
  post,
  onClose,
}: {
  post: BulletinPost
  onClose: () => void
}) {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div
      className="fixed inset-0 z-[80] flex items-center justify-center bg-black/50 p-2 sm:p-4"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="bulletin-post-title"
        className="bg-white dark:bg-gray-800 rounded-xl shadow-2xl flex flex-col w-full max-w-3xl max-h-[90vh] overflow-hidden"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 shrink-0 px-4 sm:px-6 py-3 border-b border-gray-200 dark:border-gray-700">
          <div className="min-w-0">
            <h2
              id="bulletin-post-title"
              className="text-lg font-semibold text-gray-900 dark:text-gray-100"
            >
              {post.title}
            </h2>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
              {formatDate(post.created_at)}
              {post.author_name ? ` · ${post.author_name}` : ''}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-500 dark:text-gray-400"
            aria-label="Close post"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="overflow-y-auto px-4 sm:px-6 py-4">
          <div
            className="bulletin-content max-w-none text-gray-800 dark:text-gray-200"
            dangerouslySetInnerHTML={{
              __html: sanitizeBulletinHtml(post.body_html || ''),
            }}
          />
        </div>
      </div>
    </div>
  )
}
