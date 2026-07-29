import sanitizeHtml from 'sanitize-html'

/** Max image upload size (~5MB). */
export const BULLETIN_MAX_IMAGE_BYTES = 5 * 1024 * 1024
/** Max short video upload size (~50MB). */
export const BULLETIN_MAX_VIDEO_BYTES = 50 * 1024 * 1024
/** Soft max duration hint for short clips (seconds). */
export const BULLETIN_MAX_VIDEO_SECONDS = 60

/**
 * Sanitize TipTap HTML before save / before render.
 * Uses sanitize-html (no jsdom) so it is safe on Cloudflare/Node runtimes.
 */
export function sanitizeBulletinHtml(dirty: string): string {
  return sanitizeHtml(dirty || '', {
    allowedTags: [
      'p', 'br', 'strong', 'b', 'em', 'i', 'u', 's', 'strike', 'span', 'a',
      'h1', 'h2', 'h3', 'h4', 'ul', 'ol', 'li', 'blockquote', 'hr',
      'img', 'video', 'source', 'iframe', 'div',
      'table', 'thead', 'tbody', 'tr', 'th', 'td',
    ],
    allowedAttributes: {
      a: ['href', 'target', 'rel', 'title'],
      img: ['src', 'alt', 'title', 'width', 'height', 'style', 'class', 'data-float'],
      video: ['src', 'controls', 'playsinline', 'preload', 'class', 'width', 'height'],
      source: ['src', 'type'],
      iframe: ['src', 'title', 'allow', 'allowfullscreen', 'frameborder', 'class', 'width', 'height'],
      div: ['class', 'data-bulletin-video', 'data-provider', 'style'],
      span: ['style', 'class'],
      p: ['style', 'class'],
      h1: ['style', 'class'],
      h2: ['style', 'class'],
      h3: ['style', 'class'],
      h4: ['style', 'class'],
      table: ['class', 'style', 'width'],
      td: ['colspan', 'rowspan', 'style', 'class'],
      th: ['colspan', 'rowspan', 'style', 'class'],
      '*': ['class', 'style'],
    },
    allowedSchemes: ['http', 'https', 'mailto'],
    allowProtocolRelative: false,
    // Keep our media proxy paths and common embed hosts.
    allowedIframeHostnames: [
      'www.youtube.com',
      'youtube.com',
      'www.youtube-nocookie.com',
      'youtube-nocookie.com',
      'player.vimeo.com',
    ],
    transformTags: {
      a: sanitizeHtml.simpleTransform('a', {
        rel: 'noopener noreferrer',
        target: '_blank',
      }),
    },
  })
}

export function isBulletinAdmin(role: string | undefined | null): boolean {
  return role === 'admin' || role === 'super_admin'
}

/** Convert a YouTube/Vimeo watch URL into an embeddable iframe src. */
export function toEmbedSrc(url: string): string | null {
  try {
    const u = new URL(url.trim())
    const host = u.hostname.replace(/^www\./, '')

    if (host === 'youtu.be') {
      const id = u.pathname.replace(/^\//, '').split('/')[0]
      return id ? `https://www.youtube-nocookie.com/embed/${id}` : null
    }
    if (host === 'youtube.com' || host === 'youtube-nocookie.com') {
      if (u.pathname.startsWith('/embed/')) {
        return `https://www.youtube-nocookie.com${u.pathname}`
      }
      const id = u.searchParams.get('v')
      return id ? `https://www.youtube-nocookie.com/embed/${id}` : null
    }
    if (host === 'vimeo.com') {
      const id = u.pathname.split('/').filter(Boolean)[0]
      return id && /^\d+$/.test(id) ? `https://player.vimeo.com/video/${id}` : null
    }
    if (host === 'player.vimeo.com') {
      return url
    }
    return null
  } catch {
    return null
  }
}
