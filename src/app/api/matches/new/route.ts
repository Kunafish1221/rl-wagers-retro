// src/app/api/matches/new/route.ts
import { NextResponse } from 'next/server'
import { prisma } from '@/app/server/prisma'
import { GameMode, MatchState } from '@prisma/client'

type Body = {
  refId: string
  mode: GameMode            // 'ONE_V_ONE' | 'TWO_V_TWO' | 'THREE_V_THREE'
  stakeWT: number           // cents
}

export async function POST(req: Request) {
  try {
    const { refId, mode, stakeWT } = (await req.json()) as Partial<Body>

    if (!refId || !mode || stakeWT == null) {
      return NextResponse.json({ error: 'Missing refId, mode, or stakeWT' }, { status: 400 })
    }

    const stake = Math.floor(Number(stakeWT))
    if (!Number.isFinite(stake) || stake <= 0) {
      return NextResponse.json({ error: 'Invalid stakeWT' }, { status: 400 })
    }

    if (!['ONE_V_ONE','TWO_V_TWO','THREE_V_THREE'].includes(String(mode))) {
      return NextResponse.json({ error: 'Invalid mode' }, { status: 400 })
    }

    // TODO (later): verify refId belongs to an authorized ref user

    const match = await prisma.match.create({
      data: {
        refId,
        mode,
        stakeWT: stake,
        state: MatchState.OPEN,
      },
      select: {
        id: true,
        refId: true,
        mode: true,
        stakeWT: true,
        state: true,
        createdAt: true,
      },
    })

    return NextResponse.json({ ok: true, match }, { status: 201 })
  } catch (e) {
    console.error('CREATE_MATCH_ERROR', e)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}