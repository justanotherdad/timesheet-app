'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import Link from 'next/link'

export default function SignupPage() {
  const router = useRouter()
  
  // Redirect to login - signup is disabled, admins must invite users
  useEffect(() => {
    router.push('/login?message=signup_disabled')
  }, [router])

  // Show message while redirecting
  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 dark:from-gray-900 dark:to-gray-800 flex items-center justify-center px-4">
      <div className="max-w-md w-full bg-white dark:bg-gray-800 rounded-lg shadow-lg p-8 text-center">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-4">Sign Up Disabled</h1>
        <p className="text-gray-600 dark:text-gray-300 mb-6">
          New accounts must be created by an administrator. Please contact your administrator for access.
        </p>
        <Link
          href="/login"
          className="text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 font-medium"
        >
          Go to Sign In →
        </Link>
      </div>
    </div>
  )
}


