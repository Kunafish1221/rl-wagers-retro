// src/app/api/matches/[id]/start/route.ts
import { NextResponse } from 'next/server'
import { prisma } from '@/app/server/prisma'
import { MatchState } from '@prisma/client'

type Body = { refId: string }

/**
 * Ref "start" validation:
 * - Only the assigned ref can call it
 * - Match must be FULL (otherwise 409)
 * - COMPLETE/CANCELLED => 409
 * - No state change (you don't use IN_PROGRESS in your enum)
 * - Returns current participants so the client can proceed
 */
export async function POST(req: Request, { params }: { params: { id: string } }) {
  try {
    const { refId } = (await req.json()) as Partial<Body>
    const matchId = params.id
    if (!refId) return NextResponse.json({ error: 'Missing refId' }, { status: 400 })

    const out = await prisma.$transaction(async (tx) => {
      const match = await tx.match.findUnique({
        where: { id: matchId },
        include: { participants: { select: { id: true, userId: true, team: true, role: true } } },
      })
      if (!match) return { ok: false as const, code: 404, msg: 'Match not found' }
      if (match.refId !== refId) return { ok: false as const, code: 403, msg: 'Only the assigned ref can start' }

      if (match.state === MatchState.CANCELLED || match.state === MatchState.COMPLETE) {
        return { ok: false as const, code: 409, msg: 'Match is closed' }
      }
      if (match.state !== MatchState.FULL) {
        return { ok: false as const, code: 409, msg: 'Match must be FULL to start' }
      }

      // No state change — just acknowledge and echo current data
      return {
        ok: true as const,
        match: { id: match.id, state: match.state, mode: match.mode, stakeWT: match.stakeWT },
        participants: match.participants,
      }
    })

    if (!out.ok) {
      return NextResponse.json({ error: out.msg }, { status: out.code })
    }
    return NextResponse.json(out, { status: 200 })
  } catch (e) {
    console.error('START_MATCH_ERROR', e)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}