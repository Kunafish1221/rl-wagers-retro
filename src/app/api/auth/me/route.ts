// src/app/api/auth/me/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/app/server/session'
import { prisma } from '@/app/server/prisma'

type Ok = {
  ok: true
  user: {
    id: string
    handle: string
    displayName: string | null
    epicId: string
    avatarUrl: string | null
    createdAt: Date
    email: string | null
    isRef: boolean
    isOwner: boolean
  }
}

type Err = { ok: false; error: string }

export async function GET(req: NextRequest) {
  const s = await getSession(req)
  if (!s) {
    return NextResponse.json<Err>({ ok: false, error: 'Unauthorized' }, { status: 401 })
  }

  try {
    // Pull fresh from DB to ensure role flags are current
    const [user, cred] = await Promise.all([
      prisma.user.findUnique({
        where: { id: s.user.id },
        select: {
          id: true,
          handle: true,
          displayName: true,
          epicId: true,
          avatarUrl: true,
          createdAt: true,
          isRef: true,
          isOwner: true,
        },
      }),
      prisma.credentials.findUnique({
        where: { userId: s.user.id },
        select: { email: true },
      }),
    ])

    if (!user) {
      return NextResponse.json<Err>({ ok: false, error: 'USER_NOT_FOUND' }, { status: 404 })
    }

    return NextResponse.json<Ok>({
      ok: true,
      user: {
        id: user.id,
        handle: user.handle,
        displayName: user.displayName,
        epicId: user.epicId,
        avatarUrl: user.avatarUrl,
        createdAt: user.createdAt,
        email: cred?.email ?? null,
        isRef: user.isRef,
        isOwner: user.isOwner,
      },
    })
  } catch (err) {
    console.error('[auth/me] error', err)
    return NextResponse.json<Err>({ ok: false, error: 'SERVER_ERROR' }, { status: 500 })
  }
}