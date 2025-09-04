// src/app/server/session.ts
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from './prisma'
import crypto from 'crypto'
import bcrypt from 'bcryptjs'

const SESSION_COOKIE = 'sid'
const DEFAULT_TTL_DAYS = 30

// ----- small utils -----
function addDays(d: Date, days: number) {
  const x = new Date(d)
  x.setDate(x.getDate() + days)
  return x
}
function base64url(buf: Buffer) {
  return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '')
}
function sha256(str: string) {
  return crypto.createHash('sha256').update(str).digest('hex')
}
function buildCookie(
  name: string,
  value: string,
  opts: {
    httpOnly?: boolean
    secure?: boolean
    sameSite?: 'Lax' | 'Strict' | 'None'
    path?: string
    expires?: Date
  } = {}
) {
  const {
    httpOnly = true,
    secure = process.env.NODE_ENV === 'production',
    sameSite = 'Lax',
    path = '/',
    expires,
  } = opts

  const parts = [`${name}=${value}`]
  if (expires) parts.push(`Expires=${expires.toUTCString()}`)
  parts.push(`Path=${path}`)
  parts.push(`SameSite=${sameSite}`)
  if (secure) parts.push('Secure')
  if (httpOnly) parts.push('HttpOnly')
  return parts.join('; ')
}

// Parse a cookie from a Request/NextRequest without next/headers()
function getCookie(req: Request | NextRequest, name: string) {
  const raw = req.headers.get('cookie') || ''
  if (!raw) return null
  const cookies = raw.split(/; */)
  for (const c of cookies) {
    const idx = c.indexOf('=')
    const k = idx === -1 ? c : c.slice(0, idx)
    if (k.trim() === name) {
      return idx === -1 ? '' : decodeURIComponent(c.slice(idx + 1))
    }
  }
  return null
}

function getHeader(req: Request | NextRequest, key: string) {
  return req.headers.get(key) ?? undefined
}

// ----- bcrypt wrappers -----
export async function hashPassword(plain: string) {
  const saltRounds = 10
  return bcrypt.hash(plain, saltRounds)
}
export async function verifyPassword(plain: string, hash: string) {
  return bcrypt.compare(plain, hash)
}

// ----- session core -----

/**
 * Create a new session for a user.
 * Stores SHA-256 of token in DB; sets raw token in HttpOnly cookie.
 */
export async function createSessionForUser(
  userId: string,
  req: NextRequest | Request,
  ttlDays = DEFAULT_TTL_DAYS
) {
  const raw = base64url(crypto.randomBytes(32))
  const tokenHash = sha256(raw)
  const now = new Date()
  const expiresAt = addDays(now, ttlDays)

  const ip =
    getHeader(req, 'x-forwarded-for') ||
    getHeader(req, 'x-real-ip') ||
    getHeader(req, 'remote-addr')
  const userAgent = getHeader(req, 'user-agent')

  await prisma.session.create({
    data: {
      token: tokenHash,
      userId,
      expiresAt,
      ip,
      userAgent,
    },
  })

  const cookie = buildCookie(SESSION_COOKIE, raw, { expires: expiresAt })
  return { tokenRaw: raw, tokenHash, cookie, expiresAt }
}

/**
 * Resolve the current session (if any). Returns { user, ... } or null.
 */
export async function getSession(req: NextRequest | Request) {
  const raw = getCookie(req, SESSION_COOKIE)
  if (!raw) return null
  const tokenHash = sha256(raw)

  const session = await prisma.session.findUnique({
    where: { token: tokenHash },
    include: { user: true },
  })
  if (!session) return null
  if (session.expiresAt <= new Date()) {
    // expired -> cleanup
    try {
      await prisma.session.delete({ where: { token: tokenHash } })
    } catch {}
    return null
  }
  return session
}

/** Convenience: just the user or null */
export async function getCurrentUser(req: NextRequest | Request) {
  const s = await getSession(req)
  return s?.user ?? null
}

/**
 * Require a session. If missing, returns 401 response.
 */
export async function requireSession(req: NextRequest | Request) {
  const s = await getSession(req)
  if (!s) {
    return {
      ok: false as const,
      response: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }),
    }
  }
  return { ok: true as const, session: s }
}

/**
 * Destroy session by cookie and return a Set-Cookie clearing header string.
 */
export async function destroySession(req: NextRequest | Request) {
  const raw = getCookie(req, SESSION_COOKIE)
  if (raw) {
    const tokenHash = sha256(raw)
    try {
      await prisma.session.delete({ where: { token: tokenHash } })
    } catch {
      // already deleted
    }
  }
  const past = new Date(0)
  const cookie = buildCookie(SESSION_COOKIE, '', { expires: past })
  return { cookie }
}

/** Helper to append Set-Cookie on a NextResponse */
export function withSetCookie(res: NextResponse, cookieStr: string) {
  res.headers.append('Set-Cookie', cookieStr)
  return res
}

/**
 * Email/password login helper using Credentials table.
 * Usage in route: return await loginAndSetCookie({ email, password }, req)
 */
export async function loginAndSetCookie(
  params: { email: string; password: string },
  req: NextRequest | Request
) {
  const { email, password } = params
  const cred = await prisma.credentials.findUnique({
    where: { email },
    include: { user: true },
  })
  if (!cred) {
    return NextResponse.json({ error: 'Invalid email or password' }, { status: 401 })
  }
  const ok = await verifyPassword(password, cred.passwordHash)
  if (!ok) {
    return NextResponse.json({ error: 'Invalid email or password' }, { status: 401 })
  }

  const { cookie } = await createSessionForUser(cred.userId, req)
  const res = NextResponse.json({ ok: true, userId: cred.userId })
  res.headers.append('Set-Cookie', cookie)
  return res
}