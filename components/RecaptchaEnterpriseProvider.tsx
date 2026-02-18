'use client'

import Script from 'next/script'
import { createContext, useContext, useCallback, useState } from 'react'

declare global {
  interface Window {
    grecaptcha?: {
      enterprise?: {
        execute: (siteKey: string, options: { action: string }) => Promise<string>
      }
    }
  }
}

const RecaptchaEnterpriseContext = createContext<(() => Promise<string>) | null>(null)

export function useRecaptchaEnterprise() {
  const execute = useContext(RecaptchaEnterpriseContext)
  return execute
}

export function RecaptchaEnterpriseProvider({
  siteKey,
  children,
}: {
  siteKey: string
  children: React.ReactNode
}) {
  const [ready, setReady] = useState(false)

  const execute = useCallback(async () => {
    if (!ready || !window.grecaptcha?.enterprise?.execute) return ''
    return window.grecaptcha.enterprise.execute(siteKey, { action: 'login' })
  }, [siteKey, ready])

  return (
    <>
      <Script
        src={`https://www.google.com/recaptcha/enterprise.js?render=${siteKey}`}
        strategy="afterInteractive"
        onLoad={() => setReady(true)}
      />
      <RecaptchaEnterpriseContext.Provider value={execute}>
        {children}
      </RecaptchaEnterpriseContext.Provider>
    </>
  )
}
