'use client'

import { createContext, useContext } from 'react'
import type { HeaderNavFlags } from '@/lib/nav-flags'

const empty: HeaderNavFlags = {
  timesheetConfirm: { show: false, pending: 0 },
  pto: { showRequest: false, showReview: false, pending: 0 },
  clientBudget: false,
}

const HeaderNavContext = createContext<HeaderNavFlags>(empty)

export function HeaderNavProvider({
  value,
  children,
}: {
  value: HeaderNavFlags
  children: React.ReactNode
}) {
  return <HeaderNavContext.Provider value={value}>{children}</HeaderNavContext.Provider>
}

export function useHeaderNav(): HeaderNavFlags {
  return useContext(HeaderNavContext)
}
