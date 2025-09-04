// src/app/api/auth/register/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/app/server/prisma'
import { createSessionForUser, hashPassword, withSetCookie } from '@/app/server/session'

type Body = {
  email?: string
  password?: string
  handle?: string
  epicId?: string
  displayName?: string | null
  avatarUrl?: string | null
}

function bad(status: number, msg: string) {
  return NextResponse.json({ error: msg }, { status })
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json().catch(() => ({}))) as Body

    const email = (body.email ?? '').trim().toLowerCase()
    const password = (body.password ?? '').trim()
    const handle = (body.handle ?? '').trim()
    const epicId = (body.epicId ?? '').trim()
    const displayName = (body.displayName ?? '')?.trim() || null
    const avatarUrl = (body.avatarUrl ?? '')?.trim() || null

    // basic validation
    if (!email || !password || !handle || !epicId) {
      return bad(400, 'email, password, handle, and epicId are required')
    }
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
      return bad(400, 'invalid email')
    }
    if (handle.length < 3 || handle.length > 32) {
      return bad(400, 'handle must be 3–32 characters')
    }
    if (password.length < 8) {
      return bad(400, 'password must be at least 8 characters')
    }

    // create user + credentials in a transaction
    const passHash = await hashPassword(password)

    const { user, creds } = await prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          handle,
          epicId,
          displayName,
          avatarUrl,
          // availableWT / lockedWT default via schema
        },
        select: {
          id: true,
          handle: true,
          displayName: true,
          epicId: true,
          avatarUrl: true,
          createdAt: true,
        },
      })

      const creds = await tx.credentials.create({
        data: {
          userId: user.id,
          email,
          passwordHash: passHash,
        },
        select: { id: true, userId: true, email: true },
      })

      return { user, creds }
    })

    // auto-login: create DB session + set HttpOnly cookie
    const { cookie } = await createSessionForUser(user.id, req)
    const res = NextResponse.json({ ok: true, user })
    return withSetCookie(res, cookie)
  } catch (e: any) {
    // Handle Prisma unique constraint errors nicely
    if (e?.code === 'P2002') {
      const target = Array.isArray(e.meta?.target) ? e.meta.target.join(',') : e.meta?.target
      if (String(target).includes('email')) return bad(409, 'email already in use')
      if (String(target).includes('handle')) return bad(409, 'handle already taken')
      if (String(target).includes('epicId')) return bad(409, 'epicId already linked')
      return bad(409, 'duplicate value')
    }
    console.error('REGISTER_ERR', e)
    return bad(500, 'Registration failed')
  }
}