import DOMPurify from 'isomorphic-dompurify'

/** Max image upload size (~5MB). */
export const BULLETIN_MAX_IMAGE_BYTES = 5 * 1024 * 1024
/** Max short video upload size (~50MB). */
export const BULLETIN_MAX_VIDEO_BYTES = 50 * 1024 * 1024
/** Soft max duration hint for short clips (seconds). */
export const BULLETIN_MAX_VIDEO_SECONDS = 60

const ALLOWED_TAGS = [
  'p', 'br', 'strong', 'b', 'em', 'i', 'u', 's', 'strike', 'span', 'a',
  'h1', 'h2', 'h3', 'h4', 'ul', 'ol', 'li', 'blockquote', 'hr',
  'img', 'video', 'source', 'iframe', 'div',
  'table', 'thead', 'tbody', 'tr', 'th', 'td',
]

const ALLOWED_ATTR = [
  'href', 'target', 'rel', 'src', 'alt', 'title', 'width', 'height',
  'style', 'class', 'controls', 'playsinline', 'preload', 'frameborder',
  'allow', 'allowfullscreen', 'data-float', 'data-youtube', 'data-vimeo',
]

/**
 * Sanitize TipTap HTML before save / before render.
 * Keeps formatting, floated images, uploaded media URLs, and YouTube/Vimeo iframes.
 */
export function sanitizeBulletinHtml(dirty: string): string {
  return DOMPurify.sanitize(dirty || '', {
    ALLOWED_TAGS,
    ALLOWED_ATTR,
    ALLOW_DATA_ATTR: true,
    ADD_ATTR: ['target', 'allowfullscreen', 'playsinline'],
  })
}

export function isBulletinAdmin(role: string | undefined | null): boolean {
  return role === 'admin' || role === 'super_admin'
}

/** Accept only media URLs that point at our bulletin media proxy. */
export function isAllowedBulletinMediaUrl(url: string): boolean {
  if (!url) return false
  try {
    if (url.startsWith('/api/bulletin/media')) return true
    const u = new URL(url, 'http://localhost')
    return u.pathname.startsWith('/api/bulletin/media')
  } catch {
    return false
  }
}

export function isAllowedEmbedUrl(url: string): boolean {
  try {
    const u = new URL(url)
    const host = u.hostname.replace(/^www\./, '')
    return (
      host === 'youtube.com' ||
      host === 'youtube-nocookie.com' ||
      host === 'youtu.be' ||
      host === 'vimeo.com' ||
      host === 'player.vimeo.com'
    )
  } catch {
    return false
  }
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
