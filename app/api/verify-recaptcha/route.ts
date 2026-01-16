import { NextRequest, NextResponse } from 'next/server'

export async function POST(request: NextRequest) {
  try {
    const { token } = await request.json()

    if (!token) {
      return NextResponse.json({ success: false, message: 'No token provided' }, { status: 400 })
    }

    const secretKey = process.env.RECAPTCHA_SECRET_KEY

    if (!secretKey) {
      // If secret key is not configured, allow the request (recaptcha is optional)
      return NextResponse.json({ success: true, message: 'reCAPTCHA not configured' })
    }

    const verificationURL = `https://www.google.com/recaptcha/api/siteverify?secret=${secretKey}&response=${token}`
    
    const googleResponse = await fetch(verificationURL, { method: 'POST' })
    const data = await googleResponse.json()

    if (data.success) {
      // For v3, check score threshold (if applicable)
      if (data.score !== undefined && data.score < 0.5) {
        return NextResponse.json({ success: false, message: 'reCAPTCHA score too low', score: data.score }, { status: 400 })
      }

      return NextResponse.json({ success: true, ...data })
    } else {
      return NextResponse.json({ success: false, ...data }, { status: 400 })
    }
  } catch (error: any) {
    console.error('reCAPTCHA verification error:', error)
    return NextResponse.json({ success: false, message: error.message }, { status: 500 })
  }
}
