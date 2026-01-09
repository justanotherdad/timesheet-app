'use client'

import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { Eye, EyeOff } from 'lucide-react'

export default function SetupPasswordPage() {
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirmPassword, setShowConfirmPassword] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [verifying, setVerifying] = useState(true)
  const router = useRouter()
  const searchParams = useSearchParams()
  const supabase = createClient()

  const checkSession = useCallback(async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (session) {
        // User already has a session, allow password setup
        setVerifying(false)
      } else {
        setError('Invalid or expired invitation link. Please contact your administrator for a new link.')
        setVerifying(false)
      }
    } catch (err) {
      setError('Error verifying invitation. Please contact your administrator.')
      setVerifying(false)
    }
  }, [supabase])

  const handleTokenExchange = useCallback(async (accessToken: string, refreshToken: string) => {
    try {
      console.log('Attempting token exchange...')
      // Exchange the tokens for a session
      const { data, error } = await supabase.auth.setSession({
        access_token: accessToken,
        refresh_token: refreshToken,
      })

      if (error) {
        console.error('setSession error:', error)
        throw error
      }

      if (data.session) {
        console.log('Session created successfully')
        setVerifying(false)
        // Clear the hash from URL
        window.history.replaceState(null, '', window.location.pathname)
      } else {
        console.error('No session returned from setSession')
        throw new Error('Failed to create session')
      }
    } catch (err: any) {
      console.error('Token exchange error:', err)
      // Try checking session one more time in case it was set asynchronously
      const { data: { session } } = await supabase.auth.getSession()
      if (session) {
        console.log('Session found after error, continuing...')
        setVerifying(false)
        window.history.replaceState(null, '', window.location.pathname)
      } else {
        setError(err.message || 'Invalid or expired invitation link. Please contact your administrator.')
        setVerifying(false)
      }
    }
  }, [supabase])

  const handleTokenVerification = useCallback(async (token: string) => {
    try {
      // Verify the token (for recovery/invite tokens)
      const { data, error } = await supabase.auth.verifyOtp({
        token_hash: token,
        type: 'invite',
      })

      if (error) throw error

      setVerifying(false)
    } catch (err: any) {
      console.error('Token verification error:', err)
      // Try to check if user is already logged in
      await checkSession()
    }
  }, [supabase, checkSession])

  const handleCodeExchange = useCallback(async (code: string) => {
    try {
      // Exchange code for session (OAuth flow)
      const { data, error } = await supabase.auth.exchangeCodeForSession(code)

      if (error) throw error

      if (data.session) {
        setVerifying(false)
        // Clear the code from URL
        window.history.replaceState(null, '', window.location.pathname)
      } else {
        throw new Error('Failed to create session')
      }
    } catch (err: any) {
      console.error('Code exchange error:', err)
      setError(err.message || 'Invalid or expired invitation link. Please contact your administrator.')
      setVerifying(false)
    }
  }, [supabase])

  useEffect(() => {
    // Check if this is a preview/bot request (don't process tokens for previews)
    const userAgent = navigator.userAgent.toLowerCase()
    const isPreview = userAgent.includes('microsoftteams') || 
                      userAgent.includes('slackbot') || 
                      userAgent.includes('discordbot') ||
                      userAgent.includes('facebookexternalhit') ||
                      userAgent.includes('twitterbot') ||
                      userAgent.includes('linkedinbot') ||
                      userAgent.includes('bot') ||
                      userAgent.includes('crawler') ||
                      userAgent.includes('spider') ||
                      userAgent.includes('preview')
    
    if (isPreview) {
      // This is a preview request, don't process tokens
      console.log('Preview request detected, skipping token processing')
      setVerifying(false)
      setError('Please click the link directly to set your password. Link previews cannot process authentication tokens.')
      return
    }

    // Listen for Supabase auth state changes (handles automatic session creation from invite links)
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      console.log('Auth state change:', event, session ? 'Session exists' : 'No session')
      
      if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') {
        if (session) {
          setVerifying(false)
          // Clear any hash/query params from URL
          window.history.replaceState(null, '', window.location.pathname)
          return
        }
      }
    })

    // Also check URL for tokens (for immediate processing)
    const hash = window.location.hash
    if (hash) {
      console.log('Found hash in URL:', hash.substring(0, 100) + '...')
      const hashParams = new URLSearchParams(hash.substring(1))
      const accessToken = hashParams.get('access_token')
      const refreshToken = hashParams.get('refresh_token')
      const type = hashParams.get('type')
      
      console.log('Hash params:', { hasAccessToken: !!accessToken, hasRefreshToken: !!refreshToken, type })
      
      if (accessToken) {
        // Token is in hash, exchange it for a session
        handleTokenExchange(accessToken, refreshToken || '')
        return
      }
    }
    
    // Also check query params (some Supabase links use query params)
    const token = searchParams.get('token')
    const tokenHash = searchParams.get('token_hash')
    const code = searchParams.get('code')

    console.log('Query params:', { token: !!token, tokenHash: !!tokenHash, code: !!code })

    if (code) {
      // OAuth code flow
      handleCodeExchange(code)
    } else if (token || tokenHash) {
      // Token is in query params, verify it
      handleTokenVerification(token || tokenHash || '')
    } else {
      // No token found, check if user is already logged in
      // Also wait a bit for auth state change to fire
      setTimeout(() => {
        checkSession()
      }, 1000)
    }

    // Cleanup subscription
    return () => {
      subscription.unsubscribe()
    }
  }, [searchParams, handleTokenExchange, handleCodeExchange, handleTokenVerification, checkSession, supabase])


  const handlePasswordSetup = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)

    if (password.length < 6) {
      setError('Password must be at least 6 characters long')
      return
    }

    if (password !== confirmPassword) {
      setError('Passwords do not match')
      return
    }

    setLoading(true)

    try {
      // Update the user's password
      const { error } = await supabase.auth.updateUser({
        password: password,
      })

      if (error) throw error

      // Password set successfully, redirect to dashboard
      router.push('/dashboard')
      router.refresh()
    } catch (error: any) {
      setError(error.message || 'Failed to set password. Please try again.')
      setLoading(false)
    }
  }

  if (verifying) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 dark:from-gray-900 dark:to-gray-800 flex items-center justify-center px-4">
        <div className="max-w-md w-full bg-white dark:bg-gray-800 rounded-lg shadow-lg p-8 text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600 dark:text-gray-300">Verifying invitation link...</p>
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
        <p className="text-sm text-gray-600 dark:text-gray-300 mb-6 text-center">
          Create a password for your account
        </p>

        {error && (
          <div className="bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-300 px-4 py-3 rounded mb-4">
            {error}
          </div>
        )}

        <form onSubmit={handlePasswordSetup} className="space-y-4">
          <div>
            <label htmlFor="password" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              New Password
            </label>
            <div className="relative">
              <input
                id="password"
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={6}
                className="w-full px-4 py-2 pr-10 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-gray-900 dark:text-gray-100 bg-white dark:bg-gray-700 placeholder:text-gray-400 dark:placeholder:text-gray-500"
                placeholder="Enter your password (min. 6 characters)"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 focus:outline-none"
                aria-label={showPassword ? 'Hide password' : 'Show password'}
              >
                {showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
              </button>
            </div>
          </div>

          <div>
            <label htmlFor="confirmPassword" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Confirm Password
            </label>
            <div className="relative">
              <input
                id="confirmPassword"
                type={showConfirmPassword ? 'text' : 'password'}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                required
                minLength={6}
                className="w-full px-4 py-2 pr-10 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-gray-900 dark:text-gray-100 bg-white dark:bg-gray-700 placeholder:text-gray-400 dark:placeholder:text-gray-500"
                placeholder="Confirm your password"
              />
              <button
                type="button"
                onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 focus:outline-none"
                aria-label={showConfirmPassword ? 'Hide password' : 'Show password'}
              >
                {showConfirmPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
              </button>
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-blue-600 text-white py-2 px-4 rounded-lg font-semibold hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? 'Setting password...' : 'Set Password'}
          </button>
        </form>

        <div className="mt-6 text-center">
          <Link href="/login" className="text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 text-sm">
            Already have a password? Sign in
          </Link>
        </div>
      </div>
    </div>
  )
}
