import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'

export default async function Home() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100">
      <div className="container mx-auto px-4 py-16">
        <div className="max-w-4xl mx-auto">
          <div className="text-center mb-12">
            <h1 className="text-5xl font-bold text-gray-900 mb-4">
              Timesheet Management System
            </h1>
            <p className="text-xl text-gray-600 mb-8">
              Streamline your time tracking and approval workflow
            </p>
          </div>

          {user ? (
            <div className="bg-white rounded-lg shadow-lg p-8 text-center">
              <h2 className="text-2xl font-semibold text-gray-800 mb-4">
                Welcome back!
              </h2>
              <p className="text-gray-600 mb-6">
                You are logged in. Access your dashboard to manage timesheets.
              </p>
              <Link
                href="/dashboard"
                className="inline-block bg-blue-600 text-white px-6 py-3 rounded-lg font-semibold hover:bg-blue-700 transition-colors"
              >
                Go to Dashboard
              </Link>
            </div>
          ) : (
            <div className="bg-white rounded-lg shadow-lg p-8">
              <div className="text-center mb-8">
                <h2 className="text-2xl font-semibold text-gray-800 mb-4">
                  Get Started
                </h2>
                <p className="text-gray-600">
                  Sign in to access your timesheet management portal
                </p>
              </div>
              <div className="flex gap-4 justify-center">
                <Link
                  href="/login"
                  className="bg-blue-600 text-white px-8 py-3 rounded-lg font-semibold hover:bg-blue-700 transition-colors"
                >
                  Sign In
                </Link>
                <Link
                  href="/signup"
                  className="bg-gray-200 text-gray-800 px-8 py-3 rounded-lg font-semibold hover:bg-gray-300 transition-colors"
                >
                  Sign Up
                </Link>
              </div>
            </div>
          )}

          <div className="mt-12 grid md:grid-cols-3 gap-6">
            <div className="bg-white rounded-lg shadow p-6">
              <h3 className="text-xl font-semibold text-gray-800 mb-2">
                Easy Time Entry
              </h3>
              <p className="text-gray-600">
                Quickly log your hours with intuitive dropdown selections for sites, POs, systems, and more.
              </p>
            </div>
            <div className="bg-white rounded-lg shadow p-6">
              <h3 className="text-xl font-semibold text-gray-800 mb-2">
                Approval Workflow
              </h3>
              <p className="text-gray-600">
                Streamlined approval process with supervisor and manager sign-offs.
              </p>
            </div>
            <div className="bg-white rounded-lg shadow p-6">
              <h3 className="text-xl font-semibold text-gray-800 mb-2">
                Export & History
              </h3>
              <p className="text-gray-600">
                Export timesheets with signatures and access your complete history.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
