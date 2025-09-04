// src/app/api/users/[id]/credit/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/app/server/prisma'

type Body = { amountWT: number } // e.g. 100 = $10

export async function POST(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params
    const { amountWT } = (await req.json()) as Partial<Body>

    if (!amountWT || amountWT <= 0 || !Number.isFinite(amountWT)) {
      return NextResponse.json(
        { error: 'amountWT must be a positive number' },
        { status: 400 }
      )
    }

    const user = await prisma.user.update({
      where: { id },
      data: { availableWT: { increment: Math.floor(amountWT) } },
      select: { id: true, handle: true, availableWT: true, lockedWT: true },
    })

    return NextResponse.json(user, { status: 200 })
  } catch (e: any) {
    if (String(e?.code) === 'P2025') {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }
    console.error(e)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}