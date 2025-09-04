// src/app/api/users/route.ts
import { NextResponse } from 'next/server'
import { prisma } from '@/app/server/prisma'

type Body = { handle: string }

export async function POST(req: Request) {
  try {
    const { handle } = (await req.json()) as Partial<Body>
    if (!handle || typeof handle !== 'string' || !handle.trim()) {
      return NextResponse.json({ error: 'handle is required' }, { status: 400 })
    }

    const user = await prisma.user.create({
      data: { handle: handle.trim() },
      select: { id: true, handle: true, availableWT: true, lockedWT: true, createdAt: true },
    })
    return NextResponse.json(user, { status: 201 })
  } catch (e: any) {
    // Unique constraint violation
    if (String(e?.code) === 'P2002') {
      return NextResponse.json({ error: 'Handle already taken' }, { status: 409 })
    }
    console.error(e)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}