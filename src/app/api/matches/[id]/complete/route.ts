// src/app/api/matches/[id]/complete/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/app/server/prisma'
import { requireSession } from '@/app/server/session'
import { MatchState } from '@prisma/client'

type Body = { winnerUserId?: string }

function bad(status: number, msg: string) {
  return NextResponse.json({ ok: false, error: msg }, { status, headers: { 'Cache-Control': 'no-store' } })
}

export async function POST(
  req: NextRequest,
  context: { params: Promise<{ id: string }> } // typed-routes: Promise
) {
  try {
    const gate = await requireSession(req)
    if (!gate.ok) return gate.response
    const { session } = gate

    const { id: matchId } = await context.params
    const { winnerUserId } = (await req.json().catch(() => ({}))) as Body
    if (!winnerUserId) return bad(400, 'WINNER_REQUIRED')

    // Load match w/ participants and guard ref ownership
    const match = await prisma.match.findUnique({
      where: { id: matchId },
      select: {
        id: true,
        refId: true,
        state: true,
        mode: true,
        stakeWT: true,
        participants: {
          select: { userId: true },
        },
      },
    })
    if (!match) return bad(404, 'MATCH_NOT_FOUND')
    if (match.refId !== session.userId) return bad(403, 'ONLY_REF_CAN_COMPLETE')
    if (match.state === MatchState.CANCELLED) return bad(409, 'MATCH_CANCELLED')
    if (match.state === MatchState.COMPLETE) return bad(409, 'MATCH_ALREADY_COMPLETE')

    // Validate winner is in match
    const players = match.participants.map(p => p.userId)
    if (!players.includes(winnerUserId)) return bad(400, 'WINNER_NOT_A_PARTICIPANT')

    const stake = Math.max(0, match.stakeWT | 0)
    const count = match.participants.length
    if (count <= 1) return bad(409, 'NOT_ENOUGH_PARTICIPANTS')

    // Winner gets entire pot (stake * count) to available.
    // Escrow (ledger.locked) is released/consumed for all participants.
    const winnerCreditWT = stake * count

    const result = await prisma.$transaction(async (tx) => {
      // Re-check open state
      const fresh = await tx.match.findUnique({ where: { id: matchId }, select: { id: true, state: true } })
      if (!fresh || fresh.state === MatchState.CANCELLED || fresh.state === MatchState.COMPLETE) {
        throw new Error('MATCH_CLOSED')
      }

      const losers = match.participants.filter(p => p.userId !== winnerUserId)
      const winner = match.participants.find(p => p.userId === winnerUserId)!

      // --- Winner wallet (simple User) — add pot to available only ---
      const winnerAfter = await tx.user.update({
        where: { id: winner.userId },
        data: { availableWT: { increment: winnerCreditWT } },
        select: { id: true, availableWT: true, lockedWT: true },
      })

      // --- Ledger mirrors ---
      // Winner: locked -stake, available +pot
      await tx.ledgerAccount.upsert({
        where: { userId: winner.userId },
        update: { locked: { decrement: stake }, available: { increment: winnerCreditWT } },
        create: { userId: winner.userId, locked: 0 - stake, available: winnerCreditWT },
      })
      // Net available change entry for winner (gains stake*(count-1))
      await tx.ledgerEntry.create({
        data: {
          userId: winner.userId,
          delta: stake * (count - 1),
          kind: 'WINNINGS',
          refId: matchId,
          meta: { stakeWT: stake, participants: count },
        },
      })

      // Losers: consume escrow (ledger.locked -stake). We do NOT touch User.lockedWT,
      // because join didn’t increment it (escrow tracked in ledger only).
      for (const l of losers) {
        await tx.ledgerAccount.upsert({
          where: { userId: l.userId },
          update: { locked: { decrement: stake } },
          create: { userId: l.userId, available: 0, locked: 0 - stake },
        })
        await tx.ledgerEntry.create({
          data: {
            userId: l.userId,
            delta: 0,
            kind: 'ESCROW_CONSUMED',
            refId: matchId,
            meta: { lostWT: stake },
          },
        })
      }

      // Mark match complete with winner
      const updated = await tx.match.update({
        where: { id: matchId },
        data: { state: MatchState.COMPLETE, winnerUserId: winner.userId },
        select: { id: true, state: true, mode: true, stakeWT: true, winnerUserId: true },
      })

      return { updated, winnerAfter }
    })

    return NextResponse.json(
      {
        ok: true,
        match: {
          id: result.updated.id,
          state: result.updated.state,
          mode: result.updated.mode,
          stakeWT: result.updated.stakeWT,
          winnerUserId,
        },
        payouts: {
          winnerCreditWT,
          losers: match.participants
            .filter(p => p.userId !== winnerUserId)
            .map(p => ({ userId: p.userId, lostWT: stake })),
        },
        // Wallet numbers for Wallet page (simple User fields)
        winnerWallet: {
          availableWT: result.winnerAfter.availableWT,
          lockedWT: result.winnerAfter.lockedWT,
        },
      },
      { headers: { 'Cache-Control': 'no-store' } }
    )
  } catch (e: any) {
    const msg = String(e?.message || '')
    if (msg === 'MATCH_CLOSED') return bad(409, 'MATCH_CLOSED')
    console.error('MATCH_COMPLETE_ERR', e)
    return bad(500, 'MATCH_COMPLETE_FAIL')
  }
}