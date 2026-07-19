'use client'

import { useCallback, useEffect, useRef, useState } from 'react'

type NoteImage = {
  id: string
  file_name: string
  file_type: string | null
  created_at?: string | null
}

const ACCEPT = 'image/png,image/jpeg,image/gif,image/webp,application/pdf,.png,.jpg,.jpeg,.gif,.webp,.pdf'

/**
 * "Images / Files" tab of the Budget Notes section. Lets editors paste
 * (Ctrl/Cmd+V), drag-and-drop, or choose image/PDF files that render inline.
 * Files are stored via the note-images API (po_attachments, category=note_image).
 */
export default function NoteImages({ poId, canEdit }: { poId: string; canEdit: boolean }) {
  const [images, setImages] = useState<NoteImage[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)
  const [dragOver, setDragOver] = useState(false)
  const [lightbox, setLightbox] = useState<{ src: string; name: string } | null>(null)
  const fileInputRef = useRef<HTMLInputElement | null>(null)

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/budget/${poId}/note-images?t=${Date.now()}`, {
        credentials: 'include',
        cache: 'no-store',
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error((body as { error?: string }).error || 'Could not load images')
      setImages(Array.isArray(body.images) ? body.images : [])
      setError(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load images')
    } finally {
      setLoading(false)
    }
  }, [poId])

  useEffect(() => {
    setLoading(true)
    void load()
  }, [load])

  useEffect(() => {
    if (!lightbox) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setLightbox(null)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [lightbox])

  const uploadFiles = useCallback(
    async (files: File[]) => {
      const valid = files.filter(
        (f) => f.type.startsWith('image/') || f.type === 'application/pdf' || /\.(png|jpe?g|gif|webp|pdf)$/i.test(f.name)
      )
      if (valid.length === 0) return
      setUploading(true)
      setError(null)
      try {
        for (const file of valid) {
          const form = new FormData()
          form.set('file', file)
          const res = await fetch(`/api/budget/${poId}/note-images`, {
            method: 'POST',
            credentials: 'include',
            body: form,
          })
          if (!res.ok) {
            const body = await res.json().catch(() => ({}))
            throw new Error((body as { error?: string }).error || 'Upload failed')
          }
        }
        await load()
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Upload failed')
      } finally {
        setUploading(false)
      }
    },
    [poId, load]
  )

  const handlePaste = useCallback(
    (e: React.ClipboardEvent) => {
      if (!canEdit) return
      const items = Array.from(e.clipboardData?.items || [])
      const files = items
        .filter((it) => it.kind === 'file')
        .map((it) => it.getAsFile())
        .filter((f): f is File => !!f)
      if (files.length > 0) {
        e.preventDefault()
        void uploadFiles(files)
      }
    },
    [canEdit, uploadFiles]
  )

  const handleDelete = async (id: string, name: string) => {
    if (!confirm(`Remove this file?\n${name}`)) return
    try {
      const res = await fetch(`/api/budget/${poId}/note-images/${id}`, { method: 'DELETE', credentials: 'include' })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error((body as { error?: string }).error || 'Delete failed')
      }
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Delete failed')
    }
  }

  const isPdf = (img: NoteImage) => (img.file_type || '').includes('pdf') || /\.pdf$/i.test(img.file_name)

  return (
    <div>
      {canEdit && (
        <div
          tabIndex={0}
          onPaste={handlePaste}
          onDragOver={(e) => {
            e.preventDefault()
            setDragOver(true)
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => {
            e.preventDefault()
            setDragOver(false)
            void uploadFiles(Array.from(e.dataTransfer.files || []))
          }}
          onClick={() => fileInputRef.current?.click()}
          className={`mb-4 flex flex-col items-center justify-center gap-1 rounded-lg border-2 border-dashed px-4 py-6 text-center cursor-pointer transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 ${
            dragOver
              ? 'border-blue-500 bg-blue-50 dark:bg-blue-950/30'
              : 'border-gray-300 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-700/40'
          }`}
        >
          <p className="text-sm font-medium text-gray-700 dark:text-gray-200">
            {uploading ? 'Uploading…' : 'Click to choose files, drag & drop, or paste (Ctrl/Cmd+V)'}
          </p>
          <p className="text-xs text-gray-500 dark:text-gray-400">Images (PNG, JPEG, GIF, WebP) or PDF. You can add more at any time.</p>
          <input
            ref={fileInputRef}
            type="file"
            accept={ACCEPT}
            multiple
            className="sr-only"
            onChange={(e) => {
              void uploadFiles(Array.from(e.target.files || []))
              e.target.value = ''
            }}
          />
        </div>
      )}

      {error && <p className="text-sm text-red-600 dark:text-red-400 mb-3">{error}</p>}

      {loading ? (
        <p className="text-sm text-gray-500 dark:text-gray-400">Loading…</p>
      ) : images.length === 0 ? (
        <p className="text-sm text-gray-500 dark:text-gray-400">No images or files yet.</p>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {images.map((img) => {
            const src = `/api/budget/${poId}/note-images/${img.id}/view`
            return (
              <div
                key={img.id}
                className="group relative rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden bg-white dark:bg-gray-900"
              >
                {isPdf(img) ? (
                  <a href={src} target="_blank" rel="noopener noreferrer" className="block">
                    <div className="flex flex-col items-center justify-center h-48 bg-gray-50 dark:bg-gray-800 text-gray-600 dark:text-gray-300">
                      <span className="text-3xl">PDF</span>
                      <span className="mt-2 px-2 text-xs text-center break-all">{img.file_name}</span>
                    </div>
                  </a>
                ) : (
                  <button
                    type="button"
                    onClick={() => setLightbox({ src, name: img.file_name })}
                    className="block w-full cursor-zoom-in"
                    title="Click to enlarge"
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={src} alt={img.file_name} className="w-full h-48 object-contain bg-gray-50 dark:bg-gray-800" />
                  </button>
                )}
                {canEdit && (
                  <button
                    type="button"
                    onClick={() => handleDelete(img.id, img.file_name)}
                    className="absolute top-2 right-2 rounded-md bg-black/60 text-white text-xs px-2 py-1 opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-600"
                  >
                    Delete
                  </button>
                )}
              </div>
            )
          })}
        </div>
      )}

      {lightbox && (
        <div
          className="fixed inset-0 z-[60] bg-black/80 flex items-center justify-center p-4"
          onClick={() => setLightbox(null)}
        >
          <div className="relative max-w-[95vw] max-h-[95vh]" onClick={(e) => e.stopPropagation()}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={lightbox.src}
              alt={lightbox.name}
              className="max-w-[95vw] max-h-[85vh] object-contain rounded-lg shadow-2xl bg-white"
            />
            <div className="mt-2 flex items-center justify-between gap-3">
              <span className="text-sm text-white/90 truncate">{lightbox.name}</span>
              <div className="flex items-center gap-2 shrink-0">
                <a
                  href={lightbox.src}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="rounded-md bg-white/15 hover:bg-white/25 text-white text-sm px-3 py-1.5"
                >
                  Open full size
                </a>
                <button
                  type="button"
                  onClick={() => setLightbox(null)}
                  className="rounded-md bg-white/15 hover:bg-white/25 text-white text-sm px-3 py-1.5"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
