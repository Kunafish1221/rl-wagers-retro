// src/app/api/auth/logout/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { destroySession, withSetCookie } from '@/app/server/session'

export const dynamic = 'force-dynamic'
export const revalidate = 0

export async function POST(req: NextRequest) {
  // Remove DB session and return a Set-Cookie that clears 'sid'
  const { cookie } = await destroySession(req)

  const res = NextResponse.json(
    { ok: true, message: 'Logged out' },
    { headers: { 'Cache-Control': 'no-store' } }
  )

  // Clear 'sid'
  withSetCookie(res, cookie)

  // Also clear optional HMAC “JWT-like” cookie named 'session', if present
  res.headers.append(
    'Set-Cookie',
    [
      'session=',
      'Path=/',
      'SameSite=Lax',
      process.env.NODE_ENV === 'production' ? 'Secure' : '',
      `Expires=${new Date(0).toUTCString()}`,
      'HttpOnly',
    ]
      .filter(Boolean)
      .join('; ')
  )

  return res
}