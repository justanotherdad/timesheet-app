import { updateSession } from './lib/supabase/middleware'
import { checkAuthRateLimit } from './lib/rate-limit'
import { NextResponse, type NextRequest } from 'next/server'

const AUTH_PATHS = ['/auth/callback']

export async function middleware(request: NextRequest) {
  // Rate limit auth-related paths
  const pathname = request.nextUrl.pathname
  if (AUTH_PATHS.some((p) => pathname === p || pathname.startsWith(p + '/'))) {
    const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
      ?? request.headers.get('x-real-ip')
      ?? 'unknown'
    const { ok } = await checkAuthRateLimit(ip)
    if (!ok) {
      return new NextResponse('Too many attempts. Please try again later.', { status: 429 })
    }
  }

  return await updateSession(request)
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * Feel free to modify this pattern to include more paths.
     */
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}

