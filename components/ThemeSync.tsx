'use client'

import { useLayoutEffect } from 'react'

/** Re-apply the saved theme after hydration. A full page load can drop the
 *  class ThemeScript set, which would switch the app to light mode. */
export default function ThemeSync() {
  useLayoutEffect(() => {
    try {
      const saved = localStorage.getItem('theme')
      const theme =
        saved === 'dark' || saved === 'light'
          ? saved
          : window.matchMedia('(prefers-color-scheme: dark)').matches
            ? 'dark'
            : 'light'
      document.documentElement.classList.toggle('dark', theme === 'dark')
    } catch {
      // localStorage unavailable
    }
  }, [])
  return null
}
