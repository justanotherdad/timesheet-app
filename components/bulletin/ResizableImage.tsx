'use client'

import Image from '@tiptap/extension-image'
import { NodeViewWrapper, ReactNodeViewRenderer, type NodeViewProps } from '@tiptap/react'
import { useCallback, useEffect, useRef, useState } from 'react'

type FloatMode = 'none' | 'left' | 'right'

function ResizableImageView({ node, updateAttributes, selected }: NodeViewProps) {
  const imgRef = useRef<HTMLImageElement>(null)
  const [width, setWidth] = useState<number | null>(
    typeof node.attrs.width === 'number' ? node.attrs.width : null
  )
  const float = (node.attrs['data-float'] as FloatMode) || 'none'

  useEffect(() => {
    setWidth(typeof node.attrs.width === 'number' ? node.attrs.width : null)
  }, [node.attrs.width])

  const onMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault()
      e.stopPropagation()
      const startX = e.clientX
      const startWidth = width || imgRef.current?.getBoundingClientRect().width || 320
      const parentWidth =
        imgRef.current?.closest('.ProseMirror')?.clientWidth ||
        imgRef.current?.parentElement?.clientWidth ||
        640

      const onMove = (ev: MouseEvent) => {
        const delta = ev.clientX - startX
        // Right float: dragging left edge feel — keep simple: always grow with +delta from right handle
        const next = Math.max(80, Math.min(parentWidth, Math.round(startWidth + delta)))
        setWidth(next)
      }
      const onUp = (ev: MouseEvent) => {
        const delta = ev.clientX - startX
        const next = Math.max(80, Math.min(parentWidth, Math.round(startWidth + delta)))
        updateAttributes({ width: next })
        window.removeEventListener('mousemove', onMove)
        window.removeEventListener('mouseup', onUp)
      }
      window.addEventListener('mousemove', onMove)
      window.addEventListener('mouseup', onUp)
    },
    [updateAttributes, width]
  )

  const style: React.CSSProperties = {
    width: width ? `${width}px` : '100%',
    maxWidth: '100%',
    height: 'auto',
    display: 'block',
  }

  const wrapperStyle: React.CSSProperties =
    float === 'left'
      ? { float: 'left', margin: '0.35rem 1rem 0.75rem 0', maxWidth: '100%' }
      : float === 'right'
        ? { float: 'right', margin: '0.35rem 0 0.75rem 1rem', maxWidth: '100%' }
        : { display: 'block', margin: '0.75rem 0', maxWidth: '100%', clear: 'both' }

  return (
    <NodeViewWrapper
      as="span"
      className={`bulletin-img-node${selected ? ' is-selected' : ''}`}
      style={wrapperStyle}
      data-float={float}
    >
      <span className="bulletin-img-shell relative inline-block max-w-full">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          ref={imgRef}
          src={node.attrs.src}
          alt={node.attrs.alt || ''}
          style={style}
          className="rounded border border-gray-200 dark:border-gray-600"
          draggable={false}
        />
        {selected && (
          <span
            className="absolute bottom-1 right-1 h-3.5 w-3.5 cursor-se-resize rounded-sm border border-white bg-blue-600 shadow"
            onMouseDown={onMouseDown}
            title="Drag to resize"
          />
        )}
      </span>
    </NodeViewWrapper>
  )
}

export const ResizableImage = Image.extend({
  name: 'image',

  addAttributes() {
    return {
      ...this.parent?.(),
      width: {
        default: null,
        parseHTML: (element) => {
          const w = element.getAttribute('width') || (element as HTMLElement).style?.width
          if (!w) return null
          const n = parseInt(String(w), 10)
          return Number.isFinite(n) ? n : null
        },
        renderHTML: (attributes) => {
          if (!attributes.width) return {}
          return {
            width: attributes.width,
            style: `width: ${attributes.width}px; max-width: 100%; height: auto;`,
          }
        },
      },
      'data-float': {
        default: 'none',
        parseHTML: (element) => element.getAttribute('data-float') || 'none',
        renderHTML: (attributes) => {
          if (!attributes['data-float'] || attributes['data-float'] === 'none') return {}
          return { 'data-float': attributes['data-float'] }
        },
      },
      class: {
        default: null,
        parseHTML: (element) => element.getAttribute('class'),
        renderHTML: (attributes) => {
          const float = attributes['data-float']
          const cls =
            float === 'left'
              ? 'bulletin-float-left'
              : float === 'right'
                ? 'bulletin-float-right'
                : 'bulletin-float-none'
          return { class: [attributes.class, cls].filter(Boolean).join(' ') }
        },
      },
    }
  },

  addNodeView() {
    return ReactNodeViewRenderer(ResizableImageView)
  },
}).configure({
  inline: true,
  allowBase64: false,
})
