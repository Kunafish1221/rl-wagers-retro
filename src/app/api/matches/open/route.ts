// src/app/api/matches/open/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/app/server/prisma'
import { GameMode, MatchState } from '@prisma/client'

function capacityFor(mode: GameMode) {
  if (mode === GameMode.ONE_V_ONE) return 2
  if (mode === GameMode.TWO_V_TWO) return 4
  return 6 // THREE_V_THREE
}

export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url)
    const withParticipants =
      url.searchParams.get('with') === 'participants' ||
      url.searchParams.get('with:participants') === '1' ||
      url.searchParams.get('with_participants') === '1' ||
      url.searchParams.get('withParticipants') === '1'

    const rows = await prisma.match.findMany({
      where: { state: MatchState.OPEN },
      orderBy: { createdAt: 'desc' },
      take: 100,
      select: {
        id: true,
        refId: true,
        ref: { select: { id: true, handle: true, avatarUrl: true } },
        mode: true,
        stakeWT: true,
        createdAt: true,
        _count: { select: { participants: true } },
        ...(withParticipants && {
          participants: {
            select: {
              user: { select: { id: true, handle: true, avatarUrl: true } },
            },
          },
        }),
      },
    })

    const matches = rows.map((m) => {
      const capacity = capacityFor(m.mode)
      const current = m._count.participants
      const slotsOpen = Math.max(capacity - current, 0)
      const joinable = current < capacity

      return {
        id: m.id,
        refId: m.refId,
        ref: m.ref, // { id, handle, avatarUrl } | null
        mode: m.mode,
        stakeWT: m.stakeWT, // WT units (10 WT = $1)
        createdAt: m.createdAt.toISOString(),
        capacity,
        current,
        slotsOpen,
        joinable,
        participants: withParticipants
          ? (m as any).participants.map((p: any) => ({
              id: p.user.id,
              handle: p.user.handle,
              avatarUrl: p.user.avatarUrl,
            }))
          : [],
      }
    })

    return NextResponse.json(
      { ok: true, matches },
      { headers: { 'Cache-Control': 'no-store' } },
    )
  } catch (err) {
    console.error('OPEN_MATCHES_FAIL', err)
    return NextResponse.json({ ok: false, error: 'OPEN_MATCHES_FAIL' }, { status: 500 })
  }
}