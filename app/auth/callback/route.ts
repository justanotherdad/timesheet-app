import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

// List of user agents that indicate a preview/bot request
const PREVIEW_BOTS = [
  'microsoftteams',
  'slackbot',
  'slack',
  'discordbot',
  'facebookexternalhit',
  'twitterbot',
  'linkedinbot',
  'whatsapp',
  'telegrambot',
  'skypeuripreview',
  'bot',
  'crawler',
  'spider',
  'preview',
]

function isPreviewRequest(userAgent: string | null): boolean {
  if (!userAgent) return false
  const ua = userAgent.toLowerCase()
  return PREVIEW_BOTS.some(bot => ua.includes(bot))
}

export async function GET(request: Request) {
  const userAgent = request.headers.get('user-agent')
  
  // Check if this is a preview/bot request
  if (isPreviewRequest(userAgent)) {
    // Return a simple HTML page for previews without consuming the token
    const requestUrl = new URL(request.url)
    const next = requestUrl.searchParams.get('next') || '/auth/setup-password'
    
    const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Set Your Password - CTG Timesheet</title>
  <meta property="og:title" content="Set Your Password - CTG Timesheet">
  <meta property="og:description" content="Click to set your password and access your timesheet account.">
  <meta property="og:type" content="website">
</head>
<body>
  <h1>Set Your Password</h1>
  <p>Click the link to set your password and access your account.</p>
  <p><a href="${requestUrl.toString()}">Set Password</a></p>
</body>
</html>`
    
    return new NextResponse(html, {
      headers: {
        'Content-Type': 'text/html',
      },
    })
  }

  // This is a real user request, process the token
  const requestUrl = new URL(request.url)
  const code = requestUrl.searchParams.get('code')
  const token = requestUrl.searchParams.get('token')
  const tokenHash = requestUrl.searchParams.get('token_hash')
  const type = requestUrl.searchParams.get('type')
  const next = requestUrl.searchParams.get('next') || '/auth/setup-password'

  console.log('Callback route - code:', !!code, 'token:', !!token, 'tokenHash:', !!tokenHash, 'type:', type)

  if (code) {
    // OAuth code flow - exchange code for session
    const supabase = await createClient()
    const { data, error } = await supabase.auth.exchangeCodeForSession(code)
    
    console.log('Code exchange result:', { hasSession: !!data?.session, error: error?.message })
    
    if (!error && data.session) {
      // Successfully exchanged code for session
      // Create redirect response with cookies set
      const redirectUrl = new URL(next, request.url)
      const response = NextResponse.redirect(redirectUrl)
      
      // The session cookies are already set by the Supabase client
      // But we need to make sure they're included in the response
      return response
    } else if (error) {
      // If there's an error, redirect with error message
      console.error('Code exchange error:', error)
      const redirectUrl = new URL('/auth/setup-password?error=' + encodeURIComponent(error.message), request.url)
      return NextResponse.redirect(redirectUrl)
    }
  } else if (token || tokenHash) {
    // Token-based flow - redirect to setup-password with token
    // The client-side will handle token verification
    const redirectUrl = new URL('/auth/setup-password', request.url)
    if (token) redirectUrl.searchParams.set('token', token)
    if (tokenHash) redirectUrl.searchParams.set('token_hash', tokenHash)
    if (type) redirectUrl.searchParams.set('type', type)
    return NextResponse.redirect(redirectUrl)
  }

  // If no code or token, redirect to setup password page (it will handle the error)
  console.log('No code or token found in callback URL')
  return NextResponse.redirect(new URL('/auth/setup-password?error=No authentication token found', request.url))
}
