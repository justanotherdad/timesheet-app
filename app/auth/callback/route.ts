import { createClient } from '@/lib/supabase/server'
import { logAuditEvent } from '@/lib/audit-log'
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
      const user = data.session.user
      await logAuditEvent(
        { type: 'invite_accepted', userId: user.id, email: user.email ?? '' },
        {
          ip: request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? undefined,
          userAgent: request.headers.get('user-agent') ?? undefined,
        }
      )
      const redirectUrl = new URL(next, request.url)
      return NextResponse.redirect(redirectUrl)
    } else if (error) {
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

  // No code or token in query - tokens may be in URL hash (Supabase password reset)
  // Return HTML that runs client-side to preserve hash and forward to setup-password
  const baseUrl = new URL(request.url).origin
  const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Redirecting - CTG Timesheet</title>
</head>
<body>
  <p>Redirecting...</p>
  <script>
    (function() {
      var hash = window.location.hash;
      var next = new URLSearchParams(window.location.search).get('next') || '/auth/setup-password';
      if (hash && (hash.indexOf('access_token=') !== -1 || hash.indexOf('code=') !== -1)) {
        window.location.replace(next + hash);
      } else {
        window.location.replace(next + '?error=' + encodeURIComponent('No authentication token found'));
      }
    })();
  </script>
</body>
</html>`
  return new NextResponse(html, {
    headers: { 'Content-Type': 'text/html' },
  })
}
