import { createServerClient, type CookieOptions } from '@supabase/ssr'
import { cookies } from 'next/headers'

/**
 * Force Supabase auth cookies to be session cookies (no `Max-Age`/`Expires`) so
 * the browser drops them when it is fully closed, requiring re-login. Cookie
 * *deletions* (Max-Age <= 0, e.g. from signOut) are preserved untouched.
 */
export function toSessionCookieOptions(options: CookieOptions = {}): CookieOptions {
  if (typeof options.maxAge === 'number' && options.maxAge <= 0) {
    return options
  }
  const { maxAge: _maxAge, expires: _expires, ...rest } = options
  return rest
}

export async function createClient() {
  const cookieStore = await cookies()

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  if (!supabaseUrl || !supabaseKey) {
    throw new Error('Missing Supabase environment variables')
  }

  return createServerClient(
    supabaseUrl,
    supabaseKey,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, toSessionCookieOptions(options))
            )
          } catch {
            // The `setAll` method was called from a Server Component.
            // This can be ignored if you have middleware refreshing
            // user sessions.
          }
        },
      },
    }
  )
}

