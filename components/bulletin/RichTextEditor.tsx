'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { EditorContent, useEditor } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Link from '@tiptap/extension-link'
import Underline from '@tiptap/extension-underline'
import TextAlign from '@tiptap/extension-text-align'
import { TextStyle } from '@tiptap/extension-text-style'
import Color from '@tiptap/extension-color'
import Highlight from '@tiptap/extension-highlight'
import Placeholder from '@tiptap/extension-placeholder'
import { Table } from '@tiptap/extension-table'
import { TableRow } from '@tiptap/extension-table-row'
import { TableCell } from '@tiptap/extension-table-cell'
import { TableHeader } from '@tiptap/extension-table-header'
import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  Bold,
  Highlighter,
  Image as ImageIcon,
  Italic,
  Link as LinkIcon,
  List,
  ListOrdered,
  Pilcrow,
  Strikethrough,
  Table as TableIcon,
  Underline as UnderlineIcon,
  Video,
  PanelLeft,
  PanelRight,
  Square,
} from 'lucide-react'
import { ResizableImage } from './ResizableImage'
import { BulletinVideo } from './BulletinVideo'
import {
  BULLETIN_MAX_IMAGE_BYTES,
  BULLETIN_MAX_VIDEO_BYTES,
  BULLETIN_MAX_VIDEO_SECONDS,
  toEmbedSrc,
} from '@/lib/bulletin'
import { cn } from '@/lib/utils'

type Props = {
  content: string
  onChange: (html: string) => void
  disabled?: boolean
}

function ToolbarButton({
  onClick,
  active,
  disabled,
  title,
  children,
}: {
  onClick: () => void
  active?: boolean
  disabled?: boolean
  title: string
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      title={title}
      disabled={disabled}
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
      className={cn(
        'inline-flex h-8 w-8 items-center justify-center rounded border text-sm',
        active
          ? 'border-blue-500 bg-blue-50 text-blue-700 dark:border-blue-400 dark:bg-blue-900/40 dark:text-blue-200'
          : 'border-transparent text-gray-700 hover:bg-gray-100 dark:text-gray-200 dark:hover:bg-gray-700',
        disabled && 'opacity-40 cursor-not-allowed'
      )}
    >
      {children}
    </button>
  )
}

export default function RichTextEditor({ content, onChange, disabled }: Props) {
  const imageInputRef = useRef<HTMLInputElement>(null)
  const videoInputRef = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const editor = useEditor({
    immediatelyRender: false,
    editable: !disabled,
    extensions: [
      StarterKit.configure({
        heading: { levels: [1, 2, 3] },
      }),
      Underline,
      TextStyle,
      Color,
      Highlight.configure({ multicolor: true }),
      TextAlign.configure({ types: ['heading', 'paragraph'] }),
      Link.configure({
        openOnClick: false,
        HTMLAttributes: { rel: 'noopener noreferrer', target: '_blank' },
      }),
      ResizableImage,
      BulletinVideo,
      Table.configure({ resizable: true }),
      TableRow,
      TableHeader,
      TableCell,
      Placeholder.configure({
        placeholder: 'Write your bulletin post…',
      }),
    ],
    content: content || '',
    onUpdate: ({ editor: ed }) => {
      onChange(ed.getHTML())
    },
    editorProps: {
      attributes: {
        class:
          'bulletin-editor max-w-none min-h-[180px] px-3 py-2 focus:outline-none text-gray-900 dark:text-gray-100',
      },
    },
  })

  useEffect(() => {
    if (!editor) return
    editor.setEditable(!disabled)
  }, [editor, disabled])

  useEffect(() => {
    if (!editor) return
    const current = editor.getHTML()
    if (content !== current && content !== undefined) {
      // Only reset when external content changes meaningfully (e.g. opening edit)
      if (!editor.isFocused) {
        editor.commands.setContent(content || '', { emitUpdate: false })
      }
    }
  }, [content, editor])

  const uploadFile = useCallback(
    async (file: File, kind: 'image' | 'video') => {
      if (!editor) return
      setError(null)
      setUploading(true)
      try {
        if (kind === 'image' && file.size > BULLETIN_MAX_IMAGE_BYTES) {
          throw new Error('Image must be 5MB or smaller.')
        }
        if (kind === 'video' && file.size > BULLETIN_MAX_VIDEO_BYTES) {
          throw new Error('Video must be 50MB or smaller.')
        }
        if (kind === 'video') {
          const durationOk = await new Promise<boolean>((resolve) => {
            const url = URL.createObjectURL(file)
            const v = document.createElement('video')
            v.preload = 'metadata'
            v.onloadedmetadata = () => {
              URL.revokeObjectURL(url)
              resolve(v.duration <= BULLETIN_MAX_VIDEO_SECONDS + 1)
            }
            v.onerror = () => {
              URL.revokeObjectURL(url)
              resolve(true) // allow if metadata unreadable; server still enforces size
            }
            v.src = url
          })
          if (!durationOk) {
            throw new Error(`Video must be ${BULLETIN_MAX_VIDEO_SECONDS} seconds or shorter.`)
          }
        }

        const fd = new FormData()
        fd.append('file', file)
        fd.append('kind', kind)
        const res = await fetch('/api/bulletin/media', {
          method: 'POST',
          credentials: 'include',
          body: fd,
        })
        const data = await res.json()
        if (!res.ok) throw new Error(data.error || 'Upload failed')

        if (kind === 'image') {
          editor
            .chain()
            .focus()
            .setImage({ src: data.url, alt: file.name })
            .updateAttributes('image', { 'data-float': 'none', width: null })
            .run()
        } else {
          editor.chain().focus().setBulletinVideo({ src: data.url, provider: 'file' }).run()
        }
      } catch (err: any) {
        setError(err?.message || 'Upload failed')
      } finally {
        setUploading(false)
      }
    },
    [editor]
  )

  const setFloat = (mode: 'none' | 'left' | 'right') => {
    if (!editor) return
    const attrs: Record<string, unknown> = { 'data-float': mode }
    if (mode !== 'none') {
      const currentWidth = editor.getAttributes('image').width as number | null
      if (!currentWidth) {
        const parentWidth =
          editor.view.dom.clientWidth || 640
        attrs.width = Math.round(Math.min(320, parentWidth * 0.45))
      }
    }
    editor.chain().focus().updateAttributes('image', attrs).run()
  }

  const addLink = () => {
    if (!editor) return
    const prev = editor.getAttributes('link').href as string | undefined
    const url = window.prompt('Link URL', prev || 'https://')
    if (url === null) return
    if (url === '') {
      editor.chain().focus().extendMarkRange('link').unsetLink().run()
      return
    }
    editor.chain().focus().extendMarkRange('link').setLink({ href: url }).run()
  }

  const addEmbed = () => {
    if (!editor) return
    const url = window.prompt('YouTube or Vimeo URL')
    if (!url) return
    const embed = toEmbedSrc(url)
    if (!embed) {
      setError('Enter a valid YouTube or Vimeo link.')
      return
    }
    const provider = embed.includes('vimeo') ? 'vimeo' : 'youtube'
    editor.chain().focus().setBulletinVideo({ src: embed, provider }).run()
  }

  if (!editor) {
    return (
      <div className="min-h-[220px] rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/40 animate-pulse" />
    )
  }

  return (
    <div className="rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden bg-white dark:bg-gray-800">
      <div className="flex flex-wrap items-center gap-0.5 border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/50 p-1.5">
        <ToolbarButton
          title="Bold"
          active={editor.isActive('bold')}
          onClick={() => editor.chain().focus().toggleBold().run()}
        >
          <Bold className="h-4 w-4" />
        </ToolbarButton>
        <ToolbarButton
          title="Italic"
          active={editor.isActive('italic')}
          onClick={() => editor.chain().focus().toggleItalic().run()}
        >
          <Italic className="h-4 w-4" />
        </ToolbarButton>
        <ToolbarButton
          title="Underline"
          active={editor.isActive('underline')}
          onClick={() => editor.chain().focus().toggleUnderline().run()}
        >
          <UnderlineIcon className="h-4 w-4" />
        </ToolbarButton>
        <ToolbarButton
          title="Strikethrough"
          active={editor.isActive('strike')}
          onClick={() => editor.chain().focus().toggleStrike().run()}
        >
          <Strikethrough className="h-4 w-4" />
        </ToolbarButton>

        <span className="mx-1 h-5 w-px bg-gray-300 dark:bg-gray-600" />

        <ToolbarButton
          title="Heading 1"
          active={editor.isActive('heading', { level: 1 })}
          onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}
        >
          H1
        </ToolbarButton>
        <ToolbarButton
          title="Heading 2"
          active={editor.isActive('heading', { level: 2 })}
          onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
        >
          H2
        </ToolbarButton>
        <ToolbarButton
          title="Paragraph"
          active={editor.isActive('paragraph')}
          onClick={() => editor.chain().focus().setParagraph().run()}
        >
          <Pilcrow className="h-4 w-4" />
        </ToolbarButton>

        <span className="mx-1 h-5 w-px bg-gray-300 dark:bg-gray-600" />

        <ToolbarButton
          title="Bullet list"
          active={editor.isActive('bulletList')}
          onClick={() => editor.chain().focus().toggleBulletList().run()}
        >
          <List className="h-4 w-4" />
        </ToolbarButton>
        <ToolbarButton
          title="Numbered list"
          active={editor.isActive('orderedList')}
          onClick={() => editor.chain().focus().toggleOrderedList().run()}
        >
          <ListOrdered className="h-4 w-4" />
        </ToolbarButton>

        <span className="mx-1 h-5 w-px bg-gray-300 dark:bg-gray-600" />

        <ToolbarButton
          title="Align left"
          active={editor.isActive({ textAlign: 'left' })}
          onClick={() => editor.chain().focus().setTextAlign('left').run()}
        >
          <AlignLeft className="h-4 w-4" />
        </ToolbarButton>
        <ToolbarButton
          title="Align center"
          active={editor.isActive({ textAlign: 'center' })}
          onClick={() => editor.chain().focus().setTextAlign('center').run()}
        >
          <AlignCenter className="h-4 w-4" />
        </ToolbarButton>
        <ToolbarButton
          title="Align right"
          active={editor.isActive({ textAlign: 'right' })}
          onClick={() => editor.chain().focus().setTextAlign('right').run()}
        >
          <AlignRight className="h-4 w-4" />
        </ToolbarButton>

        <span className="mx-1 h-5 w-px bg-gray-300 dark:bg-gray-600" />

        <label className="inline-flex h-8 items-center gap-1 px-1.5 text-xs text-gray-600 dark:text-gray-300" title="Text color">
          <input
            type="color"
            className="h-5 w-5 cursor-pointer border-0 bg-transparent p-0"
            onChange={(e) => editor.chain().focus().setColor(e.target.value).run()}
          />
        </label>
        <ToolbarButton
          title="Highlight"
          active={editor.isActive('highlight')}
          onClick={() => editor.chain().focus().toggleHighlight({ color: '#fef08a' }).run()}
        >
          <Highlighter className="h-4 w-4" />
        </ToolbarButton>
        <ToolbarButton title="Link" active={editor.isActive('link')} onClick={addLink}>
          <LinkIcon className="h-4 w-4" />
        </ToolbarButton>
        <ToolbarButton
          title="Insert table"
          onClick={() =>
            editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()
          }
        >
          <TableIcon className="h-4 w-4" />
        </ToolbarButton>

        <span className="mx-1 h-5 w-px bg-gray-300 dark:bg-gray-600" />

        <ToolbarButton
          title="Upload image"
          disabled={uploading}
          onClick={() => imageInputRef.current?.click()}
        >
          <ImageIcon className="h-4 w-4" />
        </ToolbarButton>
        <ToolbarButton
          title="Full width image"
          active={editor.isActive('image') && editor.getAttributes('image')['data-float'] === 'none'}
          disabled={!editor.isActive('image')}
          onClick={() => setFloat('none')}
        >
          <Square className="h-4 w-4" />
        </ToolbarButton>
        <ToolbarButton
          title="Float image left (text wraps right)"
          active={editor.isActive('image') && editor.getAttributes('image')['data-float'] === 'left'}
          disabled={!editor.isActive('image')}
          onClick={() => setFloat('left')}
        >
          <PanelLeft className="h-4 w-4" />
        </ToolbarButton>
        <ToolbarButton
          title="Float image right (text wraps left)"
          active={editor.isActive('image') && editor.getAttributes('image')['data-float'] === 'right'}
          disabled={!editor.isActive('image')}
          onClick={() => setFloat('right')}
        >
          <PanelRight className="h-4 w-4" />
        </ToolbarButton>

        <span className="mx-1 h-5 w-px bg-gray-300 dark:bg-gray-600" />

        <ToolbarButton
          title="Upload short video"
          disabled={uploading}
          onClick={() => videoInputRef.current?.click()}
        >
          <Video className="h-4 w-4" />
        </ToolbarButton>
        <ToolbarButton title="Embed YouTube / Vimeo" onClick={addEmbed}>
          <span className="text-[10px] font-semibold leading-none">YT</span>
        </ToolbarButton>
      </div>

      <EditorContent editor={editor} />

      <input
        ref={imageInputRef}
        type="file"
        accept="image/png,image/jpeg,image/gif,image/webp"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0]
          e.target.value = ''
          if (f) void uploadFile(f, 'image')
        }}
      />
      <input
        ref={videoInputRef}
        type="file"
        accept="video/mp4,video/webm,video/quicktime"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0]
          e.target.value = ''
          if (f) void uploadFile(f, 'video')
        }}
      />

      {(uploading || error) && (
        <div className="border-t border-gray-200 dark:border-gray-700 px-3 py-2 text-xs">
          {uploading && (
            <span className="text-gray-600 dark:text-gray-300">Uploading…</span>
          )}
          {error && <span className="text-red-600 dark:text-red-400">{error}</span>}
        </div>
      )}
    </div>
  )
}
