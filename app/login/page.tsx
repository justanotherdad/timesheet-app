'use client'

import Link from 'next/link'
import LoginForm from '@/components/LoginForm'

export default function LoginPage() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 dark:from-gray-900 dark:to-gray-800 flex items-center justify-center px-4">
      <div className="max-w-md w-full bg-white dark:bg-gray-800 rounded-lg shadow-lg p-8">
        <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100 mb-2 text-center">
          CTG Timesheet Management
        </h1>
        <p className="text-sm text-gray-600 dark:text-gray-400 mb-6 text-center">
          Sign In
        </p>

        <LoginForm />

        <div className="mt-6 text-center">
          <p className="text-sm text-gray-500 dark:text-gray-400">
            New accounts must be created by an administrator.
          </p>
        </div>
      </div>
    </div>
  )
}
