declare module 'react-google-recaptcha' {
  import { Component, RefObject } from 'react'

  export interface ReCAPTCHAProps {
    sitekey: string
    onChange?: (token: string | null) => void
    theme?: 'light' | 'dark'
    size?: 'normal' | 'compact' | 'invisible'
    tabindex?: number
    hl?: string
    badge?: 'bottomright' | 'bottomleft' | 'inline'
    isolated?: boolean
    errorCallback?: () => void
    expiredCallback?: () => void
    render?: string
    grecaptcha?: any
  }

  export interface ReCAPTCHAInstance {
    execute: () => void
    executeAsync: () => Promise<string>
    reset: () => void
    getValue: () => string | null
  }

  const ReCAPTCHA: React.ForwardRefExoticComponent<ReCAPTCHAProps & React.RefAttributes<ReCAPTCHAInstance>>
  export default ReCAPTCHA
}
