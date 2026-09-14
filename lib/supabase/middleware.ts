import { createServerClient, type CookieOptions } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

/**
 * Force Supabase auth cookies to be session cookies (no `Max-Age`/`Expires`) so
 * the browser drops them when fully closed. Deletions (Max-Age <= 0) are kept.
 */
function toSessionCookieOptions(options: CookieOptions = {}): CookieOptions {
  if (typeof options.maxAge === 'number' && options.maxAge <= 0) {
    return options
  }
  const { maxAge: _maxAge, expires: _expires, ...rest } = options
  return rest
}

function isPublicPath(pathname: string): boolean {
  if (
    pathname === '/' ||
    pathname === '/login' ||
    pathname === '/signup' ||
    pathname === '/auth/setup-password' ||
    pathname === '/auth/invite'
  ) {
    return true
  }
  if (pathname.startsWith('/auth')) return true
  if (pathname === '/api/auth/login' || pathname === '/api/auth/forgot-password') {
    return true
  }
  return false
}

function copyCookies(from: NextResponse, to: NextResponse): NextResponse {
  from.cookies.getAll().forEach((cookie) => to.cookies.set(cookie))
  return to
}

function unavailableResponse(request: NextRequest, from: NextResponse): NextResponse {
  if (request.nextUrl.pathname.startsWith('/api/')) {
    return copyCookies(
      from,
      NextResponse.json(
        { error: 'Sign-in is temporarily unavailable. Please try again.' },
        { status: 503 }
      )
    )
  }
  return copyCookies(
    from,
    new NextResponse(
      `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Temporarily unavailable</title>
  </head>
  <body style="font-family:system-ui,sans-serif;padding:2rem;line-height:1.5">
    <h1 style="font-size:1.25rem">Temporarily unavailable</h1>
    <p>We could not verify your session. Your login was not cleared — refresh this page in a moment.</p>
    <p><a href="/dashboard">Retry</a> · <a href="/login">Sign in</a></p>
  </body>
</html>`,
      {
        status: 503,
        headers: {
          'content-type': 'text/html; charset=utf-8',
          'cache-control': 'no-store',
        },
      }
    )
  )
}

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({
    request,
  })

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  // If env vars are missing, skip Supabase auth check and allow request through
  if (!supabaseUrl || !supabaseKey) {
    return supabaseResponse
  }

  // Login and other public routes must not wait on getUser(). During an Auth
  // outage that 5s timeout was blocking POST /api/auth/login and looking like
  // a failed sign-in. Skipping here does not grant access to /dashboard.
  if (isPublicPath(request.nextUrl.pathname)) {
    return supabaseResponse
  }

  const supabase = createServerClient(
    supabaseUrl,
    supabaseKey,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) => request.cookies.set(name, value))
          supabaseResponse = NextResponse.next({
            request,
          })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, toSessionCookieOptions(options))
          )
        },
      },
    }
  )

  // IMPORTANT: Avoid writing any logic between createServerClient and
  // supabase.auth.getUser(). A simple mistake could make it very hard to debug
  // issues with users being randomly logged out.

  try {
    // Add timeout to auth check to prevent hanging
    const authPromise = supabase.auth.getUser()
    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => reject(new Error('Auth check timeout')), 5000)
    })

    const {
      data: { user },
    } = await Promise.race([authPromise, timeoutPromise])

    if (!user) {
      // API routes: return 401 JSON so the client gets a proper error, not an HTML redirect
      if (request.nextUrl.pathname.startsWith('/api/')) {
        return copyCookies(
          supabaseResponse,
          NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
        )
      }
      const url = request.nextUrl.clone()
      url.pathname = '/login'
      return copyCookies(supabaseResponse, NextResponse.redirect(url))
    }
  } catch (error) {
    // Fail closed (no dashboard data) but do not send people to /login — that
    // looked like a failed sign-in and raced with cookies from a successful grant.
    console.error('Supabase auth error in middleware:', error)
    return unavailableResponse(request, supabaseResponse)
  }

  // IMPORTANT: You *must* return the supabaseResponse object as it is. If you're
  // creating a new response object with NextResponse.next() make sure to:
  // 1. Pass the request in it, like so:
  //    const myNewResponse = NextResponse.next({ request })
  // 2. Copy over the cookies, like so:
  //    myNewResponse.cookies.setAll(supabaseResponse.cookies.getAll())
  // 3. Change the myNewResponse object to fit your needs, but avoid changing
  //    the cookies!
  // 4. Finally:
  //    return myNewResponse
  // If this is not done, you may be causing the browser and server to go out
  // of sync and terminate the user's session prematurely.

  return supabaseResponse
}
