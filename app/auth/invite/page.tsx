'use client'

import { useState, useEffect } from 'react'
import { useSearchParams } from 'next/navigation'
import Link from 'next/link'

export default function InviteLandingPage() {
  const searchParams = useSearchParams()
  const [redirectUrl, setRedirectUrl] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    // Get the actual Supabase invite link from query params
    const link = searchParams.get('link')
    
    if (!link) {
      setError('Invalid invitation link. Please contact your administrator.')
      return
    }

    // Decode the link (it's URL encoded)
    try {
      const decodedLink = decodeURIComponent(link)
      setRedirectUrl(decodedLink)
    } catch (err) {
      setError('Invalid invitation link format. Please contact your administrator.')
    }
  }, [searchParams])

  const handleContinue = () => {
    if (redirectUrl) {
      // Only redirect when user clicks - this prevents preview bots from consuming the token
      window.location.href = redirectUrl
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 dark:from-gray-900 dark:to-gray-800 flex items-center justify-center px-4">
      <div className="max-w-md w-full bg-white dark:bg-gray-800 rounded-lg shadow-lg p-8 text-center">
        <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100 mb-4">
          Set Your Password
        </h1>
        
        {error ? (
          <div className="bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-300 px-4 py-3 rounded mb-4">
            {error}
          </div>
        ) : (
          <>
            <p className="text-gray-600 dark:text-gray-300 mb-6">
              Click the button below to continue to the password setup page.
            </p>
            <button
              onClick={handleContinue}
              className="w-full bg-blue-600 text-white py-3 px-6 rounded-lg font-semibold hover:bg-blue-700 transition-colors text-lg"
            >
              Continue to Password Setup
            </button>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-4">
              This page prevents link previews from consuming your invitation token.
            </p>
          </>
        )}

        <div className="mt-6">
          <Link href="/login" className="text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 text-sm">
            Already have a password? Sign in
          </Link>
        </div>
      </div>
    </div>
  )
}
