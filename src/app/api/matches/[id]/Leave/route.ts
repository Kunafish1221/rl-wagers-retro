// src/app/api/matches/[id]/leave/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/app/server/prisma'
import { requireSession } from '@/app/server/session'
import { MatchState } from '@prisma/client'

export const dynamic = 'force-dynamic'
export const revalidate = 0

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Cache-Control': 'no-store',
} as const

function json(data: any, init?: number | ResponseInit) {
  const base: ResponseInit =
    typeof init === 'number' ? { status: init } : init || {}
  return NextResponse.json(data, {
    ...base,
    headers: { ...(base.headers || {}), ...corsHeaders },
  })
}

function bad(status: number, msg: string) {
  return json({ ok: false, error: msg }, status)
}

// --- CORS preflight ---
export function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: corsHeaders })
}

// --- Lightweight GET: participation status ---
export async function GET(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const gate = await requireSession(req)
    if (!gate.ok) return gate.response
    const { session } = gate

    const { id: matchId } = await context.params
    const userId = session.userId

    const match = await prisma.match.findUnique({
      where: { id: matchId },
      select: {
        id: true,
        state: true,
        stakeWT: true,
        participants: { select: { userId: true } },
      },
    })
    if (!match) return bad(404, 'MATCH_NOT_FOUND')

    const isParticipant = match.participants.some((p) => p.userId === userId)

    return json({
      ok: true,
      match: { id: match.id, state: match.state, stakeWT: match.stakeWT ?? 0 },
      participation: { isParticipant },
    })
  } catch (e) {
    console.error('LEAVE_GET_ERR', e)
    return bad(500, 'STATUS_FAILED')
  }
}

// --- POST: leave & unlock escrow ---
export async function POST(
  req: NextRequest,
  context: { params: Promise<{ id: string }> } // typed-routes style
) {
  try {
    const gate = await requireSession(req)
    if (!gate.ok) return gate.response
    const { session } = gate

    const { id: matchId } = await context.params
    const userId = session.userId

    // Load match + participants
    const match = await prisma.match.findUnique({
      where: { id: matchId },
      select: {
        id: true,
        state: true,
        stakeWT: true,
        participants: { select: { userId: true } },
      },
    })
    if (!match) return bad(404, 'MATCH_NOT_FOUND')
    if (match.state === MatchState.CANCELLED || match.state === MatchState.COMPLETE) {
      return bad(409, 'MATCH_CLOSED')
    }

    const isParticipant = match.participants.some((p) => p.userId === userId)
    if (!isParticipant) {
      // Idempotent success: nothing to do
      return json({
        ok: true,
        idempotent: true,
        match: { id: match.id, state: match.state },
      })
    }

    const stake = Math.max(0, match.stakeWT || 0)

    const result = await prisma.$transaction(async (tx) => {
      // Remove participant
      await tx.matchParticipant.deleteMany({ where: { matchId, userId } })

      // Ledger account is source of truth: unlock funds
      const acct = await tx.ledgerAccount.upsert({
        where: { userId },
        update: { available: { increment: stake }, locked: { decrement: stake } },
        create: { userId, available: stake, locked: 0 },
        select: { available: true, locked: true },
      })

      // Keep simple wallet in sync for legacy reads
      const userAfter = await tx.user.update({
        where: { id: userId },
        data: { availableWT: { increment: stake }, lockedWT: { decrement: stake } },
        select: { availableWT: true, lockedWT: true },
      })

      // If lobby was FULL, open it again
      const wasFull = match.state === MatchState.FULL
      const updatedMatch = wasFull
        ? await tx.match.update({
            where: { id: match.id },
            data: { state: MatchState.OPEN },
            select: { id: true, state: true },
          })
        : { id: match.id, state: match.state }

      // Audit
      await tx.ledgerEntry.create({
        data: {
          userId,
          delta: 0,
          kind: 'ESCROW_UNLOCK',
          refId: matchId,
          meta: { stakeWT: stake, after: { available: acct.available, locked: acct.locked } },
        },
      })

      return { updatedMatch, wallet: { availableWT: userAfter.availableWT, lockedWT: userAfter.lockedWT } }
    })

    return json({ ok: true, match: result.updatedMatch, wallet: result.wallet })
  } catch (e) {
    console.error('LEAVE_MATCH_ERR', e)
    return bad(500, 'LEAVE_FAILED')
  }
}