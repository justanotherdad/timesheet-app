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
  const next = requestUrl.searchParams.get('next') || '/auth/setup-password'

  if (code) {
    const supabase = await createClient()
    const { error } = await supabase.auth.exchangeCodeForSession(code)
    
    if (!error) {
      // Successfully exchanged code for session, redirect to setup password
      return NextResponse.redirect(new URL(next, request.url))
    }
  }

  // If no code or error, redirect to setup password page (it will handle the error)
  return NextResponse.redirect(new URL('/auth/setup-password', request.url))
}
