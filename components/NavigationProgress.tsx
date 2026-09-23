'use client'

import { usePathname, useSearchParams } from 'next/navigation'
import { useEffect, useState } from 'react'

/** How long the bar may run if a click never changes the address. */
const MAX_PENDING_MS = 8000

/** Thin top bar as soon as an in-app link is clicked, until the next screen lands. */
export default function NavigationProgress() {
  const pathname = usePathname()
  const search = useSearchParams().toString()
  const [pending, setPending] = useState(false)

  useEffect(() => {
    setPending(false)
  }, [pathname, search])

  useEffect(() => {
    if (!pending) return
    const id = window.setTimeout(() => setPending(false), MAX_PENDING_MS)
    return () => window.clearTimeout(id)
  }, [pending])

  useEffect(() => {
    function onClick(event: MouseEvent) {
      if (event.defaultPrevented) return
      if (event.button !== 0) return
      if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return
      const target = event.target as HTMLElement | null
      if (target?.closest('button, input, select, textarea, label')) return
      const anchor = target?.closest('a')
      if (!anchor) return
      if (anchor.target && anchor.target !== '_self') return
      if (anchor.hasAttribute('download')) return
      const href = anchor.getAttribute('href')
      if (!href || href.startsWith('#') || href.startsWith('mailto:') || href.startsWith('tel:')) return
      let next: URL
      try {
        next = new URL(href, window.location.href)
      } catch {
        return
      }
      if (next.origin !== window.location.origin) return
      if (next.pathname === window.location.pathname && next.search === window.location.search) return
      setPending(true)
    }
    document.addEventListener('click', onClick, true)
    return () => document.removeEventListener('click', onClick, true)
  }, [])

  if (!pending) return null

  return (
    <div
      className="fixed top-0 left-0 right-0 z-[200] h-0.5 overflow-hidden pointer-events-none"
      role="progressbar"
      aria-hidden="true"
    >
      <div className="h-full w-1/3 bg-blue-600 dark:bg-blue-400 animate-[navprogress_1s_ease-in-out_infinite]" />
      <style>{`
        @keyframes navprogress {
          0% { transform: translateX(-100%); width: 30%; }
          50% { width: 60%; }
          100% { transform: translateX(350%); width: 30%; }
        }
      `}</style>
    </div>
  )
}
