'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Eye, EyeOff } from 'lucide-react'
import { GoogleReCaptchaProvider, useGoogleReCaptcha } from 'react-google-recaptcha-v3'
import { RecaptchaEnterpriseProvider, useRecaptchaEnterprise } from './RecaptchaEnterpriseProvider'

type LoginFormInnerProps = {
  getCaptchaToken?: () => Promise<string>
}

function LoginFormInner({ getCaptchaToken }: LoginFormInnerProps) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [showForgotPassword, setShowForgotPassword] = useState(false)
  const [forgotPasswordEmail, setForgotPasswordEmail] = useState('')
  const [forgotPasswordLoading, setForgotPasswordLoading] = useState(false)
  const [forgotPasswordSuccess, setForgotPasswordSuccess] = useState(false)
  const router = useRouter()

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setLoading(true)

    try {
      let captchaToken = ''
      if (getCaptchaToken) {
        try {
          captchaToken = await getCaptchaToken()
        } catch (captchaErr) {
          const msg = captchaErr instanceof Error ? captchaErr.message : String(captchaErr)
          if (msg.includes('Invalid site key') || msg.includes('api.js')) {
            throw new Error(
              'reCAPTCHA error: Add your domain (ctgtimesheet.com and your Vercel URL) to the reCAPTCHA key at console.cloud.google.com/security/recaptcha'
            )
          }
          throw captchaErr
        }
      }
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password, captchaToken }),
        credentials: 'same-origin',
      })

      const data = await res.json().catch(() => ({}))

      if (!res.ok) {
        throw new Error(data.error || 'An error occurred')
      }

      if (data.success) {
        router.push('/dashboard')
        router.refresh()
      } else {
        throw new Error(data.error || 'An error occurred')
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'An error occurred')
    } finally {
      setLoading(false)
    }
  }

  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setForgotPasswordLoading(true)
    setForgotPasswordSuccess(false)

    try {
      const { createClient } = await import('@/lib/supabase/client')
      const supabase = createClient()
      const { error } = await supabase.auth.resetPasswordForEmail(forgotPasswordEmail, {
        redirectTo: `${window.location.origin}/auth/callback?next=/auth/setup-password`,
      })

      if (error) throw error

      setForgotPasswordSuccess(true)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to send reset email')
    } finally {
      setForgotPasswordLoading(false)
    }
  }

  return (
    <>
      {error && (
        <div className="bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-300 px-4 py-3 rounded mb-4">
          {error}
        </div>
      )}

      {showForgotPassword ? (
        <>
          {forgotPasswordSuccess ? (
            <div className="bg-green-50 dark:bg-green-900/30 border border-green-200 dark:border-green-800 text-green-700 dark:text-green-300 px-4 py-3 rounded mb-4">
              <p className="font-medium">Check your email</p>
              <p className="text-sm mt-1">We&apos;ve sent a password reset link to {forgotPasswordEmail}.</p>
              <p className="text-sm mt-2 font-medium">Important:</p>
              <ul className="text-sm mt-0.5 list-disc list-inside space-y-0.5">
                <li>Click the link in <strong>this same browser</strong></li>
                <li>The link expires in 1 day</li>
              </ul>
            </div>
          ) : (
            <form onSubmit={handleForgotPassword} className="space-y-4 mb-4">
              <p className="text-sm text-gray-600 dark:text-gray-400">Enter your email and we&apos;ll send you a link to reset your password.</p>
              <div>
                <label htmlFor="forgot-email" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Email
                </label>
                <input
                  id="forgot-email"
                  type="email"
                  value={forgotPasswordEmail}
                  onChange={(e) => setForgotPasswordEmail(e.target.value)}
                  required
                  className="w-full px-4 py-2.5 text-base border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-gray-900 dark:text-gray-100 bg-white dark:bg-gray-700 placeholder:text-gray-400"
                  placeholder="you@example.com"
                  autoComplete="email"
                />
              </div>
              <div className="flex gap-2">
                <button
                  type="submit"
                  disabled={forgotPasswordLoading}
                  className="flex-1 bg-blue-600 text-white py-2.5 px-4 rounded-lg font-semibold hover:bg-blue-700 transition-colors disabled:opacity-50"
                >
                  {forgotPasswordLoading ? 'Sending...' : 'Send Reset Link'}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setShowForgotPassword(false)
                    setError(null)
                    setForgotPasswordSuccess(false)
                  }}
                  className="px-4 py-2.5 border border-gray-300 dark:border-gray-600 rounded-lg font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700"
                >
                  Back
                </button>
              </div>
            </form>
          )}
        </>
      ) : (
        <form onSubmit={handleLogin} className="space-y-4">
          <div>
            <label htmlFor="email" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Email
            </label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="w-full px-4 py-2.5 text-base border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-gray-900 dark:text-gray-100 bg-white dark:bg-gray-700 placeholder:text-gray-400"
              placeholder="you@example.com"
              autoComplete="email"
            />
          </div>

          <div>
            <div className="flex justify-between items-center mb-1">
              <label htmlFor="password" className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                Password
              </label>
              <button
                type="button"
                onClick={() => setShowForgotPassword(true)}
                className="text-sm text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300"
              >
                Forgot password?
              </button>
            </div>
            <div className="relative">
              <input
                id="password"
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                className="w-full px-4 py-2.5 pr-10 text-base border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-gray-900 dark:text-gray-100 bg-white dark:bg-gray-700 placeholder:text-gray-400"
                placeholder="••••••••"
                autoComplete="current-password"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-700 focus:outline-none"
                aria-label={showPassword ? 'Hide password' : 'Show password'}
              >
                {showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
              </button>
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full min-h-[44px] bg-blue-600 text-white py-2.5 px-4 rounded-lg font-semibold hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed mt-4 text-base"
          >
            {loading ? 'Signing in...' : 'Sign In'}
          </button>
        </form>
      )}
    </>
  )
}

function LoginFormWithStandardCaptcha() {
  const { executeRecaptcha } = useGoogleReCaptcha()
  const getCaptchaToken = async () => {
    if (!executeRecaptcha) return ''
    return executeRecaptcha('login')
  }
  return <LoginFormInner getCaptchaToken={getCaptchaToken} />
}

function LoginFormWithEnterpriseCaptcha({ siteKey }: { siteKey: string }) {
  const execute = useRecaptchaEnterprise()
  const getCaptchaToken = async () => (execute ? execute() : '')
  return <LoginFormInner getCaptchaToken={getCaptchaToken} />
}

export default function LoginForm() {
  if (process.env.NEXT_PUBLIC_RECAPTCHA_DISABLED === 'true') {
    return <LoginFormInner />
  }

  const siteKey = process.env.NEXT_PUBLIC_RECAPTCHA_SITE_KEY
  const useEnterprise = process.env.NEXT_PUBLIC_RECAPTCHA_ENTERPRISE === 'true'

  if (siteKey && useEnterprise) {
    return (
      <RecaptchaEnterpriseProvider siteKey={siteKey}>
        <LoginFormWithEnterpriseCaptcha siteKey={siteKey} />
      </RecaptchaEnterpriseProvider>
    )
  }

  if (siteKey) {
    return (
      <GoogleReCaptchaProvider reCaptchaKey={siteKey}>
        <LoginFormWithStandardCaptcha />
      </GoogleReCaptchaProvider>
    )
  }

  return <LoginFormInner />
}
