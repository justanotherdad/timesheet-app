'use client'

import { Node, mergeAttributes } from '@tiptap/core'
import { NodeViewWrapper, ReactNodeViewRenderer, type NodeViewProps } from '@tiptap/react'

function VideoView({ node }: NodeViewProps) {
  const { src, provider } = node.attrs as { src: string; provider?: string }

  if (provider === 'youtube' || provider === 'vimeo' || src.includes('youtube') || src.includes('vimeo')) {
    return (
      <NodeViewWrapper className="bulletin-video-embed my-3">
        <div className="relative w-full overflow-hidden rounded-lg border border-gray-200 dark:border-gray-600 aspect-video bg-black">
          <iframe
            src={src}
            title="Embedded video"
            className="absolute inset-0 h-full w-full"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowFullScreen
          />
        </div>
      </NodeViewWrapper>
    )
  }

  return (
    <NodeViewWrapper className="bulletin-video-file my-3">
      <video
        src={src}
        controls
        playsInline
        preload="metadata"
        className="w-full max-w-full rounded-lg border border-gray-200 dark:border-gray-600 bg-black"
      />
    </NodeViewWrapper>
  )
}

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    bulletinVideo: {
      setBulletinVideo: (options: { src: string; provider?: string }) => ReturnType
    }
  }
}

export const BulletinVideo = Node.create({
  name: 'bulletinVideo',
  group: 'block',
  atom: true,
  draggable: true,

  addAttributes() {
    return {
      src: { default: null },
      provider: { default: null },
    }
  },

  parseHTML() {
    return [
      {
        tag: 'div[data-bulletin-video]',
        getAttrs: (el) => {
          const element = el as HTMLElement
          const iframe = element.querySelector('iframe')
          const video = element.querySelector('video')
          if (iframe?.getAttribute('src')) {
            return {
              src: iframe.getAttribute('src'),
              provider: element.getAttribute('data-provider') || 'embed',
            }
          }
          if (video?.getAttribute('src')) {
            return { src: video.getAttribute('src'), provider: 'file' }
          }
          return false
        },
      },
      {
        tag: 'iframe[src]',
        getAttrs: (el) => {
          const src = (el as HTMLElement).getAttribute('src') || ''
          if (!src.includes('youtube') && !src.includes('vimeo')) return false
          return {
            src,
            provider: src.includes('vimeo') ? 'vimeo' : 'youtube',
          }
        },
      },
      {
        tag: 'video[src]',
        getAttrs: (el) => ({
          src: (el as HTMLElement).getAttribute('src'),
          provider: 'file',
        }),
      },
    ]
  },

  renderHTML({ HTMLAttributes }) {
    const src = HTMLAttributes.src as string
    const provider = (HTMLAttributes.provider as string) || 'file'
    if (provider === 'youtube' || provider === 'vimeo' || provider === 'embed') {
      return [
        'div',
        mergeAttributes({
          'data-bulletin-video': '',
          'data-provider': provider,
          class: 'bulletin-video-embed',
        }),
        [
          'iframe',
          {
            src,
            title: 'Embedded video',
            allow:
              'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture',
            allowfullscreen: 'true',
            frameborder: '0',
          },
        ],
      ]
    }
    return [
      'div',
      mergeAttributes({
        'data-bulletin-video': '',
        'data-provider': 'file',
        class: 'bulletin-video-file',
      }),
      [
        'video',
        {
          src,
          controls: 'true',
          playsinline: 'true',
          preload: 'metadata',
        },
      ],
    ]
  },

  addCommands() {
    return {
      setBulletinVideo:
        (options) =>
        ({ commands }) =>
          commands.insertContent({
            type: this.name,
            attrs: options,
          }),
    }
  },

  addNodeView() {
    return ReactNodeViewRenderer(VideoView)
  },
})
