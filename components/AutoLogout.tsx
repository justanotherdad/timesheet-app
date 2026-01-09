'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

export default function AutoLogout({ timeoutMinutes = 30 }: { timeoutMinutes?: number }) {
  const router = useRouter()
  const supabase = createClient()

  useEffect(() => {
    let timeoutId: NodeJS.Timeout
    let activityListeners: Array<() => void> = []

    const resetTimer = () => {
      // Clear existing timeout
      if (timeoutId) {
        clearTimeout(timeoutId)
      }

      // Set new timeout
      timeoutId = setTimeout(async () => {
        // Sign out the user
        await supabase.auth.signOut()
        // Redirect to login
        router.push('/login')
        router.refresh()
      }, timeoutMinutes * 60 * 1000) // Convert minutes to milliseconds
    }

    // Set up activity listeners
    const events = ['mousedown', 'mousemove', 'keypress', 'scroll', 'touchstart', 'click']
    
    events.forEach(event => {
      const handler = () => resetTimer()
      document.addEventListener(event, handler, true)
      activityListeners.push(() => document.removeEventListener(event, handler, true))
    })

    // Initial timer
    resetTimer()

    // Cleanup
    return () => {
      if (timeoutId) {
        clearTimeout(timeoutId)
      }
      activityListeners.forEach(cleanup => cleanup())
    }
  }, [timeoutMinutes, router, supabase])

  return null // This component doesn't render anything
}
