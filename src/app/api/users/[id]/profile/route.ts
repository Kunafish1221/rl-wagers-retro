// src/app/api/users/[id]/profile/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/app/server/prisma'
import { requireSession } from '@/app/server/session'

type Body = {
  handle?: string
  displayName?: string | null
  epicId?: string
  avatarUrl?: string | null
}

function bad(status: number, msg: string) {
  return NextResponse.json({ error: msg }, { status })
}

function isHttpUrl(u: string) {
  try {
    const x = new URL(u)
    return x.protocol === 'http:' || x.protocol === 'https:'
  } catch {
    return false
  }
}

// GET: return profile + email (from Credentials)
export async function GET(
  _req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    // ✅ Next 15: await params
    const { id } = await context.params

    const user = await prisma.user.findUnique({
      where: { id },
      select: {
        id: true,
        handle: true,
        displayName: true,
        epicId: true,
        avatarUrl: true,
        createdAt: true,
      },
    })
    if (!user) return bad(404, 'User not found')

    const cred = await prisma.credentials.findUnique({
      where: { userId: user.id },
      select: { email: true },
    })

    return NextResponse.json({ ok: true, user: { ...user, email: cred?.email ?? null } })
  } catch (e) {
    console.error('PROFILE_GET_ERROR', e)
    return bad(500, 'PROFILE_GET_ERROR')
  }
}

// PATCH: update profile fields on *current user only* (email not handled here)
export async function PATCH(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  // ✅ Next 15: await params
  const { id: userId } = await context.params

  const gate = await requireSession(req)
  if (!gate.ok) return gate.response
  const { session } = gate
  if (session.userId !== userId) return bad(403, 'Forbidden')

  try {
    const body = (await req.json().catch(() => ({}))) as Partial<Body>

    const data: Record<string, any> = {}

    if (typeof body.handle === 'string') {
      const v = body.handle.trim()
      if (!v) return bad(400, 'handle cannot be empty')
      if (v.length < 3 || v.length > 32) return bad(400, 'handle must be 3–32 characters')
      data.handle = v
    }

    if ('displayName' in body) {
      const v = (body.displayName ?? '').toString().trim()
      data.displayName = v || null
    }

    if (typeof body.epicId === 'string') {
      const v = body.epicId.trim()
      if (v.length < 3) return bad(400, 'epicId must be at least 3 characters')
      data.epicId = v
    }

    if ('avatarUrl' in body) {
      const v = (body.avatarUrl ?? '').toString().trim()
      if (v && !isHttpUrl(v)) return bad(400, 'avatarUrl must be http(s) URL')
      data.avatarUrl = v || null
    }

    if (!Object.keys(data).length) {
      return bad(400, 'No fields to update')
    }

    const exists = await prisma.user.findUnique({ where: { id: userId }, select: { id: true } })
    if (!exists) return bad(404, 'User not found')

    if (data.handle) {
      const taken = await prisma.user.findFirst({
        where: { handle: data.handle, NOT: { id: userId } },
        select: { id: true },
      })
      if (taken) return bad(409, 'Handle already taken')
    }
    if (data.epicId) {
      const takenEpic = await prisma.user.findFirst({
        where: { epicId: data.epicId, NOT: { id: userId } },
        select: { id: true },
      })
      if (takenEpic) return bad(409, 'Epic ID already linked')
    }

    const updated = await prisma.user.update({
      where: { id: userId },
      data,
      select: {
        id: true,
        handle: true,
        displayName: true,
        epicId: true,
        avatarUrl: true,
        createdAt: true,
      },
    })

    const cred = await prisma.credentials.findUnique({
      where: { userId },
      select: { email: true },
    })

    return NextResponse.json({ ok: true, user: { ...updated, email: cred?.email ?? null } })
  } catch (e: any) {
    if (e?.code === 'P2002') {
      const tgt = String(e?.meta?.target ?? '')
      if (tgt.includes('handle')) return bad(409, 'Handle already taken')
      if (tgt.includes('epicId')) return bad(409, 'Epic ID already linked')
      return bad(409, 'Unique constraint failed')
    }
    console.error('PROFILE_PATCH_ERROR', e)
    return bad(500, 'PROFILE_PATCH_ERROR')
  }
}