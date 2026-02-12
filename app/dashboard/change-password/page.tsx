import { redirect } from 'next/navigation'
import { getCurrentUser } from '@/lib/auth'
import Header from '@/components/Header'
import ChangePasswordForm from '@/components/ChangePasswordForm'

export default async function ChangePasswordPage() {
  const user = await getCurrentUser()
  
  if (!user) {
    redirect('/login')
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <Header title="Change Password" showBack backUrl="/dashboard" user={user} />
      <div className="container mx-auto px-3 sm:px-4 py-6 sm:py-8">
        <div className="max-w-md mx-auto">
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-4 sm:p-6">
            <ChangePasswordForm />
          </div>
        </div>
      </div>
    </div>
  )
}
