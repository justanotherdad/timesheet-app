import { createBrowserClient } from '@supabase/ssr'

export function createClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  if (!supabaseUrl || !supabaseKey) {
    throw new Error('Missing Supabase environment variables')
  }

  // Omit `maxAge` so cookies written on client-side token refresh stay
  // session-scoped (dropped when the browser is fully closed), matching the
  // server-side behavior and forcing re-login after a full browser quit.
  return createBrowserClient(supabaseUrl, supabaseKey, {
    cookieOptions: { maxAge: undefined },
  })
}

