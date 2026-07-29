'use client'

import { useState } from 'react'
import RichTextEditor from './RichTextEditor'
import type { BulletinPost } from '@/types/database'

type Props = {
  post?: BulletinPost | null
  onClose: () => void
  onSaved: (post: BulletinPost) => void
}

export default function BulletinEditorModal({ post, onClose, onSaved }: Props) {
  const [title, setTitle] = useState(post?.title || '')
  const [bodyHtml, setBodyHtml] = useState(post?.body_html || '')
  const [isPinned, setIsPinned] = useState(Boolean(post?.is_pinned))
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const save = async () => {
    setError(null)
    const trimmed = title.trim()
    if (!trimmed) {
      setError('Title is required.')
      return
    }
    setSaving(true)
    try {
      const isEdit = Boolean(post?.id)
      const res = await fetch(isEdit ? `/api/bulletin/${post!.id}` : '/api/bulletin', {
        method: isEdit ? 'PATCH' : 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: trimmed,
          body_html: bodyHtml,
          is_pinned: isPinned,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Save failed')
      onSaved(data.post as BulletinPost)
      onClose()
    } catch (err: any) {
      setError(err?.message || 'Save failed')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 p-0 sm:p-4"
      onClick={onClose}
    >
      <div
        className="bg-white dark:bg-gray-800 rounded-t-xl sm:rounded-xl shadow-xl w-full max-w-3xl max-h-[92vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sticky top-0 z-10 flex items-center justify-between gap-3 border-b border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-4 sm:px-6 py-3">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
            {post ? 'Edit bulletin post' : 'New bulletin post'}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="text-sm text-gray-500 hover:text-gray-800 dark:hover:text-gray-200"
          >
            Close
          </button>
        </div>

        <div className="px-4 sm:px-6 py-4 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Title
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 px-3 py-2 text-gray-900 dark:text-gray-100"
              placeholder="Post title"
              maxLength={200}
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Body
            </label>
            <RichTextEditor content={bodyHtml} onChange={setBodyHtml} disabled={saving} />
            <p className="mt-1.5 text-xs text-gray-500 dark:text-gray-400">
              Images auto-fit the width — select one and drag the corner to resize. Use float left/right
              for text wrap. Videos: upload short clips (≤60s / 50MB) or embed YouTube/Vimeo.
            </p>
          </div>

          <label className="inline-flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
            <input
              type="checkbox"
              checked={isPinned}
              onChange={(e) => setIsPinned(e.target.checked)}
              className="rounded border-gray-300"
            />
            Pin to top of Bulletin Board
          </label>

          {error && (
            <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
          )}
        </div>

        <div className="sticky bottom-0 flex justify-end gap-2 border-t border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-4 sm:px-6 py-3">
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="rounded-lg px-4 py-2 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => void save()}
            disabled={saving}
            className="rounded-lg bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 text-sm font-medium disabled:opacity-50"
          >
            {saving ? 'Saving…' : post ? 'Save changes' : 'Publish'}
          </button>
        </div>
      </div>
    </div>
  )
}
