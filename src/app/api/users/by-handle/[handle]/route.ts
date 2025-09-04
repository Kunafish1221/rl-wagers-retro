import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/app/server/prisma'
import { requireOwner } from '@/app/server/roles'

type Ok = {
  ok: true
  user: {
    id: string
    handle: string
    displayName: string | null
    epicId: string
    avatarUrl: string | null
    isRef: boolean
    isOwner: boolean
    createdAt: Date
  }
}
type Err = { ok: false; error: string }

export async function GET(
  req: NextRequest,
  context: { params: Promise<{ handle: string }> }
) {
  const gate = await requireOwner(req)
  if (!gate.ok) return gate.response

  try {
    const { handle } = await context.params
    const h = handle.trim().toLowerCase()

    if (!h) {
      return NextResponse.json<Err>({ ok: false, error: 'HANDLE_REQUIRED' }, { status: 400 })
    }

    const user = await prisma.user.findUnique({
      where: { handle: h },
      select: {
        id: true,
        handle: true,
        displayName: true,
        epicId: true,
        avatarUrl: true,
        isRef: true,
        isOwner: true,
        createdAt: true,
      },
    })

    if (!user) {
      return NextResponse.json<Err>({ ok: false, error: 'NOT_FOUND' }, { status: 404 })
    }

    return NextResponse.json<Ok>({ ok: true, user }, { status: 200 })
  } catch (err) {
    console.error('[users/by-handle] error', err)
    return NextResponse.json<Err>({ ok: false, error: 'SERVER_ERROR' }, { status: 500 })
  }
}