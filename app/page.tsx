import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { withTimeout } from '@/lib/timeout'

export const dynamic = 'force-dynamic'
export const maxDuration = 10 // Maximum duration for this route in seconds

// Prevent form resubmission warnings
export const revalidate = 0

export default async function Home() {
  let user = null
  try {
    const supabase = await createClient()
    // Add timeout to prevent hanging
    const { data } = await withTimeout(
      supabase.auth.getUser(),
      5000,
      'Auth check timed out'
    )
    user = data?.user || null
  } catch (error) {
    // Supabase not available during build or timed out - this is expected
    // User will be null, redirecting to login
    console.error('Home page auth check error:', error)
  }

  // Redirect to login if not logged in, dashboard if logged in
  if (user) {
    redirect('/dashboard')
  } else {
    redirect('/login')
  }
}
