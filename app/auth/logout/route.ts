import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'

/**
 * Sign the current user out and send them to the login page.
 *
 * We redirect to the *request's own origin* rather than NEXT_PUBLIC_SITE_URL,
 * because a missing/incorrect env value made the old route redirect to
 * http://localhost:3000 in production, which surfaced as an error after
 * clicking "Sign Out". We also explicitly expire any Supabase auth cookies on
 * the redirect response as a belt-and-suspenders against the session
 * surviving when cookie deletions made via the cookie store don't get applied
 * to a freshly constructed redirect response.
 */
async function handleLogout(request: Request) {
  const supabase = await createClient()
  await supabase.auth.signOut()

  const origin = new URL(request.url).origin
  // 303 forces the browser to follow the redirect with a GET (correct for a POST form submit).
  const res = NextResponse.redirect(new URL('/login', origin), { status: 303 })

  try {
    const cookieStore = await cookies()
    for (const c of cookieStore.getAll()) {
      if (c.name.startsWith('sb-')) {
        res.cookies.set(c.name, '', { maxAge: 0, path: '/' })
      }
    }
  } catch {
    // Ignore — signOut() already cleared the session server-side.
  }

  return res
}

export async function POST(request: Request) {
  return handleLogout(request)
}

// Allow GET as well so a plain link can sign out (and to avoid 405s from prefetch/probes).
export async function GET(request: Request) {
  return handleLogout(request)
}
