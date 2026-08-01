import { NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import {
  isBulletinAdmin,
  sanitizeBulletinHtml,
} from '@/lib/bulletin'
import type { BulletinAudience } from '@/types/database'

export const dynamic = 'force-dynamic'

const noStore = {
  headers: {
    'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0',
    Pragma: 'no-cache',
  },
}

const SELECT_COLS =
  'id, title, body_html, author_id, author_name, audience, is_pinned, created_at, updated_at'

function parseAudience(value: unknown): BulletinAudience | null {
  if (value === 'employee' || value === 'client') return value
  return null
}

/** List active bulletin posts (pinned first, then newest). */
export async function GET(req: Request) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const requestedAudience = parseAudience(searchParams.get('audience'))
  const canEdit = isBulletinAdmin(user.profile.role)
  const isClient = user.profile.role === 'client'

  const supabase = await createClient()
  let query = supabase
    .from('bulletin_posts')
    .select(SELECT_COLS)
    .is('deleted_at', null)
    .order('is_pinned', { ascending: false })
    .order('created_at', { ascending: false })

  if (canEdit) {
    if (requestedAudience) query = query.eq('audience', requestedAudience)
  } else {
    query = query.eq('audience', isClient ? 'client' : 'employee')
  }

  const { data, error } = await query

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ posts: data ?? [], canEdit }, noStore)
}

/** Create a bulletin post (admin / super_admin). */
export async function POST(req: Request) {
  const user = await getCurrentUser()
  if (!user || !isBulletinAdmin(user.profile.role)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let body: {
    title?: string
    body_html?: string
    is_pinned?: boolean
    audience?: string
  }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const title = (body.title || '').trim()
  if (!title) {
    return NextResponse.json({ error: 'Title is required' }, { status: 400 })
  }

  const audience = parseAudience(body.audience) || 'employee'

  let admin
  try {
    admin = createAdminClient()
  } catch {
    return NextResponse.json({ error: 'Server configuration error' }, { status: 500 })
  }

  const { data, error } = await admin
    .from('bulletin_posts')
    .insert({
      title,
      body_html: sanitizeBulletinHtml(body.body_html || ''),
      author_id: user.id,
      author_name: user.profile.name || user.email,
      is_pinned: Boolean(body.is_pinned),
      audience,
    })
    .select(SELECT_COLS)
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ post: data }, noStore)
}
