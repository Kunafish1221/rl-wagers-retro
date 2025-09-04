// src/app/api/users/resolve/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/app/server/prisma'

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const epicId = (searchParams.get('epicId') || '').trim()
    if (!epicId) {
      return NextResponse.json({ ok: false, error: 'Missing epicId' }, { status: 400 })
    }

    const user = await prisma.user.findUnique({
      where: { epicId },
      select: { id: true },
    })

    if (!user) {
      return NextResponse.json({ ok: false, error: 'IGN not found' }, { status: 404 })
    }

    return NextResponse.json({ ok: true, userId: user.id })
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || 'Resolve failed' }, { status: 500 })
  }
}