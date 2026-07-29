import { NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/admin'
import {
  BULLETIN_MAX_IMAGE_BYTES,
  BULLETIN_MAX_VIDEO_BYTES,
  isBulletinAdmin,
} from '@/lib/bulletin'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

const IMAGE_MIME = new Set([
  'image/png',
  'image/jpeg',
  'image/jpg',
  'image/gif',
  'image/webp',
])
const VIDEO_MIME = new Set([
  'video/mp4',
  'video/webm',
  'video/quicktime',
])

const noStore = {
  headers: {
    'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0',
    Pragma: 'no-cache',
  },
}

/**
 * Serve a bulletin media file from storage.
 * Query: ?path=bulletin/...
 */
export async function GET(req: Request) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const path = searchParams.get('path') || ''
  if (!path.startsWith('bulletin/') || path.includes('..')) {
    return NextResponse.json({ error: 'Invalid path' }, { status: 400 })
  }

  let admin
  try {
    admin = createAdminClient()
  } catch {
    return NextResponse.json({ error: 'Server configuration error' }, { status: 500 })
  }

  const { data, error } = await admin.storage.from('site-attachments').download(path)
  if (error || !data) {
    return NextResponse.json({ error: error?.message || 'Not found' }, { status: 404 })
  }

  const bytes = Buffer.from(await data.arrayBuffer())
  const ext = path.split('.').pop()?.toLowerCase() || ''
  const contentType =
    ext === 'png' ? 'image/png'
    : ext === 'jpg' || ext === 'jpeg' ? 'image/jpeg'
    : ext === 'gif' ? 'image/gif'
    : ext === 'webp' ? 'image/webp'
    : ext === 'mp4' ? 'video/mp4'
    : ext === 'webm' ? 'video/webm'
    : ext === 'mov' ? 'video/quicktime'
    : data.type || 'application/octet-stream'

  return new NextResponse(bytes, {
    status: 200,
    headers: {
      'Content-Type': contentType,
      'Cache-Control': 'private, max-age=3600',
      'Content-Length': String(bytes.length),
    },
  })
}

/** Upload an image or short video for the bulletin editor (admin only). */
export async function POST(req: Request) {
  const user = await getCurrentUser()
  if (!user || !isBulletinAdmin(user.profile.role)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let admin
  try {
    admin = createAdminClient()
  } catch {
    return NextResponse.json({ error: 'Server configuration error' }, { status: 500 })
  }

  const formData = await req.formData()
  const file = formData.get('file') as File | null
  const kind = String(formData.get('kind') || 'image')
  if (!file) return NextResponse.json({ error: 'No file provided' }, { status: 400 })

  const mime = (file.type || '').toLowerCase()
  const isImage = kind === 'image' || IMAGE_MIME.has(mime)
  const isVideo = kind === 'video' || VIDEO_MIME.has(mime)

  if (isImage) {
    if (!IMAGE_MIME.has(mime)) {
      return NextResponse.json({ error: 'Use PNG, JPEG, GIF, or WebP.' }, { status: 400 })
    }
    if (file.size > BULLETIN_MAX_IMAGE_BYTES) {
      return NextResponse.json({ error: 'Image must be 5MB or smaller.' }, { status: 400 })
    }
  } else if (isVideo) {
    if (!VIDEO_MIME.has(mime)) {
      return NextResponse.json({ error: 'Use MP4, WebM, or MOV.' }, { status: 400 })
    }
    if (file.size > BULLETIN_MAX_VIDEO_BYTES) {
      return NextResponse.json({ error: 'Video must be 50MB or smaller.' }, { status: 400 })
    }
  } else {
    return NextResponse.json({ error: 'Unsupported file type.' }, { status: 400 })
  }

  const rawName = file.name || (isVideo ? 'clip.mp4' : 'image.png')
  const ext = (rawName.split('.').pop() || (isVideo ? 'mp4' : 'png')).toLowerCase().replace(/[^a-z0-9]/g, '')
  const safeName = rawName.replace(/[^a-zA-Z0-9.-]/g, '_')
  const path = `bulletin/${crypto.randomUUID()}_${safeName.endsWith(`.${ext}`) ? safeName : `${safeName}.${ext}`}`
  const bytes = Buffer.from(await file.arrayBuffer())

  const { error: uploadErr } = await admin.storage.from('site-attachments').upload(path, bytes, {
    upsert: false,
    contentType: mime || (isVideo ? 'video/mp4' : 'image/png'),
  })
  if (uploadErr) {
    return NextResponse.json({ error: uploadErr.message }, { status: 500 })
  }

  const url = `/api/bulletin/media?path=${encodeURIComponent(path)}`
  return NextResponse.json({ url, path, kind: isVideo ? 'video' : 'image' }, noStore)
}
