// src/app/api/users/register/route.ts
import { NextResponse } from 'next/server'
import { prisma } from '@/app/server/prisma'

type Body = {
  handle: string
  displayName?: string
  epicId: string // required
  avatarUrl?: string
}

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as Partial<Body>

    // Raw values from user
    const handleRaw = (body.handle ?? '').trim()
    const epicRaw   = (body.epicId ?? '').trim()
    const displayName = (body.displayName ?? '').trim() || null
    const avatarUrl   = (body.avatarUrl ?? '').trim() || null

    // Required fields
    if (!handleRaw) {
      return NextResponse.json({ error: 'handle is required' }, { status: 400 })
    }
    if (!epicRaw) {
      return NextResponse.json({ error: 'Epic IGN (epicId) is required' }, { status: 400 })
    }

    // Basic validation
    if (handleRaw.length < 3 || handleRaw.length > 32) {
      return NextResponse.json({ error: 'handle must be 3–32 chars' }, { status: 400 })
    }
    if (epicRaw.length < 3 || epicRaw.length > 32) {
      return NextResponse.json({ error: 'Epic IGN must be 3–32 chars' }, { status: 400 })
    }

    // Normalize for case-insensitive uniqueness on SQLite
    const handle = handleRaw.toLowerCase()
    const epicId = epicRaw.toLowerCase()

    // Uniqueness checks (exact match after normalization)
    const existingHandle = await prisma.user.findFirst({
      where: { handle },
      select: { id: true },
    })
    if (existingHandle) {
      return NextResponse.json({ error: 'Handle already taken' }, { status: 409 })
    }

    const existingEpic = await prisma.user.findFirst({
      where: { epicId },
      select: { id: true },
    })
    if (existingEpic) {
      return NextResponse.json({ error: 'Epic IGN already linked' }, { status: 409 })
    }

    // Create user (store normalized handle/epicId)
    const user = await prisma.user.create({
      data: {
        handle,
        displayName, // keep pretty-cased display name if you want
        epicId,
        avatarUrl,
      },
      select: {
        id: true,
        handle: true,
        displayName: true,
        epicId: true,
        avatarUrl: true,
        availableWT: true,
        lockedWT: true,
        createdAt: true,
      },
    })

    return NextResponse.json({ ok: true, user }, { status: 201 })
  } catch (e: any) {
    const msg = String(e?.message || e)
    if (msg.includes('P2002')) {
      // Unique constraint safety net
      return NextResponse.json({ error: 'Unique constraint failed' }, { status: 409 })
    }
    console.error('REGISTER_POST_ERROR', e)
    return NextResponse.json({ error: 'REGISTER_POST_ERROR' }, { status: 500 })
  }
}