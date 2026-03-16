'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'

/**
 * Safe-Links-friendly password reset confirmation page.
 *
 * Microsoft Safe Links and similar scanners PREFETCH links before users click.
 * If we auto-verify on page load, the prefetch consumes the token before the
 * user arrives. The fix: require a user click before verifying. Bots don't
 * click buttons, so only real users consume the token.
 */
export default function ConfirmResetPage() {
  const [status, setStatus] = useState<'ready' | 'verifying' | 'error'>('ready')
  const [error, setError] = useState<string | null>(null)
  const router = useRouter()
  const searchParams = useSearchParams()
  const supabase = createClient()

  const tokenHash = searchParams.get('token_hash')
  const type = searchParams.get('type') || 'recovery'

  const handleVerify = async () => {
    if (!tokenHash) {
      setError('Invalid link. The reset link is missing required information.')
      setStatus('error')
      return
    }

    setStatus('verifying')

    try {
      const { error: verifyError } = await supabase.auth.verifyOtp({
        token_hash: tokenHash,
        type: type === 'recovery' ? 'recovery' : 'invite',
      })

      if (verifyError) throw verifyError

      router.replace('/auth/setup-password')
    } catch (err: unknown) {
      console.error('Verify OTP error:', err)
      const msg = err instanceof Error ? err.message : 'This link has expired or has already been used.'
      setError(msg)
      setStatus('error')
    }
  }

  if (!tokenHash) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 dark:from-gray-900 dark:to-gray-800 flex items-center justify-center px-4">
        <div className="max-w-md w-full bg-white dark:bg-gray-800 rounded-lg shadow-lg p-8">
          <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100 mb-2 text-center">Set Your Password</h1>
          <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 text-amber-800 dark:text-amber-200 px-4 py-3 rounded mb-4">
            <p className="font-medium mb-2">Invalid link.</p>
            <p className="text-sm mb-3 text-amber-700 dark:text-amber-300">The reset link is missing required information.</p>
            <Link href="/login" className="inline-block w-full text-center bg-amber-600 hover:bg-amber-700 text-white font-semibold py-2.5 px-4 rounded-lg transition-colors">
              Request new link
            </Link>
          </div>
        </div>
      </div>
    )
  }

  if (status === 'error' && error) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 dark:from-gray-900 dark:to-gray-800 flex items-center justify-center px-4">
        <div className="max-w-md w-full bg-white dark:bg-gray-800 rounded-lg shadow-lg p-8">
          <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100 mb-2 text-center">
            Set Your Password
          </h1>
          <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 text-amber-800 dark:text-amber-200 px-4 py-3 rounded mb-4">
            <p className="font-medium mb-2">We couldn&apos;t verify your link.</p>
            <p className="text-sm mb-3 text-amber-700 dark:text-amber-300">
              {error.includes('expired') || error.includes('already been used')
                ? 'This link has expired or has already been used.'
                : error}
            </p>
            <Link
              href="/login"
              className="inline-block w-full text-center bg-amber-600 hover:bg-amber-700 text-white font-semibold py-2.5 px-4 rounded-lg transition-colors"
            >
              Request new link
            </Link>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 dark:from-gray-900 dark:to-gray-800 flex items-center justify-center px-4">
      <div className="max-w-md w-full bg-white dark:bg-gray-800 rounded-lg shadow-lg p-8">
        <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100 mb-2 text-center">
          Set Your Password
        </h1>
        {status === 'verifying' ? (
          <div className="text-center py-8">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
            <p className="text-gray-600 dark:text-gray-300">Verifying your link...</p>
          </div>
        ) : (
          <>
            <p className="text-gray-600 dark:text-gray-300 mb-6 text-center">
              Click the button below to continue and set your password.
            </p>
            <button
              onClick={handleVerify}
              className="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold py-3 px-4 rounded-lg transition-colors"
            >
              Continue to Set Password
            </button>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-4 text-center">
              This extra step helps the link work with work email (e.g. Microsoft 365).
            </p>
          </>
        )}
      </div>
    </div>
  )
}
