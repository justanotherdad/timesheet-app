import Link from 'next/link'
import Image from 'next/image'

interface HeaderProps {
  title?: string
  showBack?: boolean
  backUrl?: string
  user?: {
    profile: {
      name: string
      role: string
    }
  }
}

export default function Header({ title, showBack = false, backUrl, user }: HeaderProps) {
  return (
    <header className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 shadow-sm">
      <div className="container mx-auto px-4 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            {/* CTG Logo */}
            <Link href="/dashboard" className="flex items-center gap-3 hover:opacity-80 transition-opacity">
              {/* If you have a logo image, uncomment this and comment out the text logo below */}
              {/* <Image
                src="/ctg-logo.png" // or /ctg-logo.svg - place your logo file in the public folder
                alt="CTG Logo"
                width={120}
                height={40}
                className="h-10 w-auto"
              /> */}
              
              {/* Text-based logo (current) - comment this out if using image logo above */}
              <div className="flex items-center">
                <span className="text-2xl font-bold text-blue-700 dark:text-blue-400">
                  CT
                </span>
                <span className="text-2xl font-bold text-blue-700 dark:text-blue-400 border-2 border-blue-700 dark:border-blue-400 rounded-sm px-1">
                  G
                </span>
              </div>
              <div className="text-xs text-blue-700 dark:text-blue-400 font-semibold leading-tight">
                COMPLIANCE<br />
                TECHNOLOGY<br />
                GROUP, INC.
              </div>
            </Link>

            {/* Back Button */}
            {showBack && (
              <Link
                href={backUrl || '#'}
                className="text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-gray-100 flex items-center gap-1 text-sm"
              >
                ← Back
              </Link>
            )}

            {/* Title */}
            {title && (
              <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">
                {title}
              </h1>
            )}
          </div>

          {/* User Info */}
          {user && (
            <div className="flex items-center gap-4">
              <span className="text-sm text-gray-600 dark:text-gray-300">
                {user.profile.name} ({user.profile.role})
              </span>
              <form action="/auth/logout" method="post">
                <button
                  type="submit"
                  className="flex items-center gap-2 text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-gray-100 text-sm"
                >
                  Sign Out
                </button>
              </form>
            </div>
          )}
        </div>
      </div>
    </header>
  )
}
