// src/app/api/refboard/refs/route.ts
import { NextResponse } from 'next/server'
import { prisma } from '@/app/server/prisma'

export const dynamic = 'force-dynamic'
export const revalidate = 0

type RefLite = {
  id: string
  handle: string
  displayName: string | null
  epicId: string
  avatarUrl: string | null
  createdAt: Date
}
type Ok = { ok: true; refs: RefLite[] }
type Err = { ok: false; error: string }

export async function GET() {
  try {
    const refs = await prisma.user.findMany({
      where: { isRef: true },
      select: {
        id: true,
        handle: true,
        displayName: true,
        epicId: true,
        avatarUrl: true,
        createdAt: true,
      },
      orderBy: [{ createdAt: 'asc' }],
    })

    return NextResponse.json<Ok>(
      { ok: true, refs },
      { headers: { 'Cache-Control': 'no-store' } }
    )
  } catch (err) {
    console.error('[refboard/refs] error', err)
    return NextResponse.json<Err>(
      { ok: false, error: 'SERVER_ERROR' },
      { status: 500, headers: { 'Cache-Control': 'no-store' } }
    )
  }
}