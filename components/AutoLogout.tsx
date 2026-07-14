'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

export const SESSION_START_KEY = 'authSessionStartedAt'

export default function AutoLogout({
  timeoutMinutes = 60,
  maxSessionHours = 8,
}: {
  timeoutMinutes?: number
  maxSessionHours?: number
}) {
  const router = useRouter()
  const supabase = createClient()

  useEffect(() => {
    let idleTimeoutId: ReturnType<typeof setTimeout> | undefined
    let absoluteTimeoutId: ReturnType<typeof setTimeout> | undefined
    const activityListeners: Array<() => void> = []
    let loggedOut = false

    const logout = async () => {
      if (loggedOut) return
      loggedOut = true
      try {
        window.localStorage.removeItem(SESSION_START_KEY)
      } catch {
        // Ignore storage access errors (e.g. private mode).
      }
      await supabase.auth.signOut()
      router.push('/login')
      router.refresh()
    }

    // Absolute session cap: anchored to the login time so the session can never
    // outlive `maxSessionHours`, even across browser restarts (localStorage
    // persists). The clock is (re)set on login in LoginForm; if it's missing
    // (e.g. a pre-existing session), initialize it now.
    const now = Date.now()
    let startedAt = now
    try {
      const stored = window.localStorage.getItem(SESSION_START_KEY)
      const parsed = stored ? Number(stored) : NaN
      if (Number.isFinite(parsed) && parsed > 0) {
        startedAt = parsed
      } else {
        window.localStorage.setItem(SESSION_START_KEY, String(now))
      }
    } catch {
      // Ignore storage access errors.
    }

    const maxMs = maxSessionHours * 60 * 60 * 1000
    const remaining = startedAt + maxMs - now
    if (remaining <= 0) {
      void logout()
      return
    }
    absoluteTimeoutId = setTimeout(() => {
      void logout()
    }, remaining)

    // Idle timeout: reset on any user activity.
    const resetIdleTimer = () => {
      if (idleTimeoutId) {
        clearTimeout(idleTimeoutId)
      }
      idleTimeoutId = setTimeout(() => {
        void logout()
      }, timeoutMinutes * 60 * 1000)
    }

    const events = ['mousedown', 'mousemove', 'keypress', 'scroll', 'touchstart', 'click']
    events.forEach((event) => {
      const handler = () => resetIdleTimer()
      document.addEventListener(event, handler, true)
      activityListeners.push(() => document.removeEventListener(event, handler, true))
    })

    resetIdleTimer()

    return () => {
      if (idleTimeoutId) {
        clearTimeout(idleTimeoutId)
      }
      if (absoluteTimeoutId) {
        clearTimeout(absoluteTimeoutId)
      }
      activityListeners.forEach((cleanup) => cleanup())
    }
  }, [timeoutMinutes, maxSessionHours, router, supabase])

  return null
}
