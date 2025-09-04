// src/app/api/matches/[id]/cancel/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/app/server/prisma'
import { requireSession } from '@/app/server/session'
import { MatchState } from '@prisma/client'

type TxOk = {
  ok: true
  idempotent: boolean
  match: { id: string; state: MatchState }
  unlockedForPlayers?: number
}

type TxErr = {
  ok: false
  code: number
  msg: string
}

function bad(status: number, msg: string) {
  return NextResponse.json({ ok: false, error: msg }, { status, headers: { 'Cache-Control': 'no-store' } })
}

export const dynamic = 'force-dynamic'
export const revalidate = 0

export async function POST(
  req: NextRequest,
  context: { params: Promise<{ id: string }> } // typed-routes Promise params
) {
  try {
    const gate = await requireSession(req)
    if (!gate.ok) return gate.response
    const { session } = gate

    const { id: matchId } = await context.params

    const result = await prisma.$transaction<TxOk | TxErr>(async (tx) => {
      const match = await tx.match.findUnique({
        where: { id: matchId },
        include: { participants: { select: { userId: true } } },
      })
      if (!match) return { ok: false, code: 404, msg: 'Match not found' }

      // Allow the assigned ref OR the owner to cancel
      const isAuthorized = session.user.isOwner || match.refId === session.userId
      if (!isAuthorized) return { ok: false, code: 403, msg: 'Forbidden' }

      if (match.state === MatchState.CANCELLED) {
        return { ok: true, idempotent: true, match: { id: match.id, state: match.state } }
      }
      if (match.state === MatchState.COMPLETE) {
        return { ok: false, code: 409, msg: 'Match already complete/cancelled' }
      }

      const stake = Math.max(0, Math.floor(match.stakeWT || 0))

      // Refund each participant: locked -> available (ledger + legacy User wallet) + audit
      if (stake > 0 && match.participants.length) {
        for (const p of match.participants) {
          // Ledger (source of truth)
          await tx.ledgerAccount.upsert({
            where: { userId: p.userId },
            create: { userId: p.userId, available: stake, locked: 0 },
            update: { available: { increment: stake }, locked: { decrement: stake } },
          })
          // Mirror simple wallet for legacy reads
          await tx.user.update({
            where: { id: p.userId },
            data: { availableWT: { increment: stake }, lockedWT: { decrement: stake } },
            select: { id: true },
          })
          // Audit — unlock is a non-monetary movement (delta 0)
          await tx.ledgerEntry.create({
            data: {
              userId: p.userId,
              delta: 0,
              kind: 'ESCROW_UNLOCK',
              refId: match.id,
              meta: { reason: 'MATCH_CANCELLED', stakeWT: stake },
            },
          })
        }
      }

      const updated = await tx.match.update({
        where: { id: match.id },
        data: { state: MatchState.CANCELLED, winnerUserId: null },
        select: { id: true, state: true },
      })

      return {
        ok: true,
        idempotent: false,
        match: updated,
        unlockedForPlayers: match.participants.length * stake,
      }
    })

    if (!result.ok) return bad(result.code, result.msg)
    return NextResponse.json(result, { status: 200, headers: { 'Cache-Control': 'no-store' } })
  } catch (e) {
    console.error('CANCEL_MATCH_ERROR', e)
    return bad(500, 'Server error')
  }
}