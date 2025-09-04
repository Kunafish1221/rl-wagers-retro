// src/app/api/auth/session/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/app/server/prisma'
import { getSession } from '@/app/server/session'
import crypto from 'node:crypto'

export const dynamic = 'force-dynamic'
export const revalidate = 0

function noStore(json: any, init?: number | ResponseInit) {
  const base: ResponseInit = typeof init === 'number' ? { status: init } : init || {}
  return NextResponse.json(json, {
    ...base,
    headers: { ...(base.headers || {}), 'Cache-Control': 'no-store' },
  })
}

function hmacVerify(token: string, secret: string) {
  try {
    // Quick sanity limits to avoid huge payload abuse
    if (token.length > 4096) return null

    const [headerB64, bodyB64, sig] = token.split('.')
    if (!headerB64 || !bodyB64 || !sig) return null

    // Basic alg check (optional but good hygiene)
    const headerJson = Buffer.from(headerB64, 'base64url').toString()
    if (headerJson.length > 2048) return null
    const header = JSON.parse(headerJson)
    if (header?.alg && header.alg !== 'HS256') return null

    const data = `${headerB64}.${bodyB64}`
    const expected = crypto.createHmac('sha256', secret).update(data).digest('base64url')
    if (!crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(sig))) return null

    const payloadJson = Buffer.from(bodyB64, 'base64url').toString()
    if (payloadJson.length > 8192) return null
    const payload = JSON.parse(payloadJson)

    // Small clock skew allowance
    const now = Math.floor(Date.now() / 1000)
    const skew = 60
    if (payload.nbf && now + skew < payload.nbf) return null
    if (payload.exp && now - skew > payload.exp) return null

    return payload as { sub?: string; exp?: number; nbf?: number }
  } catch {
    return null
  }
}

export async function GET(req: NextRequest) {
  try {
    // ---- Path A: HMAC-signed cookie "session" (JWT-like) ----
    const token = req.cookies.get('session')?.value
    const secret = process.env.APP_SECRET

    if (token && secret) {
      const payload = hmacVerify(token, secret)
      if (payload?.sub) {
        const user = await prisma.user.findUnique({
          where: { id: payload.sub },
          select: {
            id: true,
            handle: true,
            epicId: true,
            displayName: true,
            avatarUrl: true,
            createdAt: true,
            isRef: true,
            isOwner: true,
          },
        })

        if (user) {
          return noStore({ ok: true, user })
        }
        // Valid token but user no longer exists → treat as signed-out
        return noStore({ ok: false, user: null })
      }
    }

    // ---- Path B: fallback to DB-backed session cookie "sid" ----
    const dbSession = await getSession(req)
    if (dbSession?.user) {
      const u = await prisma.user.findUnique({
        where: { id: dbSession.user.id },
        select: {
          id: true,
          handle: true,
          epicId: true,
          displayName: true,
          avatarUrl: true,
          createdAt: true,
          isRef: true,
          isOwner: true,
        },
      })
      if (u) return noStore({ ok: true, user: u })
      return noStore({ ok: false, user: null })
    }

    // No valid session in either path
    return noStore({ ok: false, user: null })
  } catch (e) {
    console.error('AUTH_SESSION_ERR', e)
    return noStore({ ok: false, error: 'SESSION_FAILED' }, 500)
  }
}