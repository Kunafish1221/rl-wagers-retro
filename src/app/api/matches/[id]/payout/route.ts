import { NextResponse } from 'next/server'
import { prisma } from '@/app/server/prisma'
import { MatchState } from '@prisma/client'

type Body = {
  refId: string              // the ref (match creator) performing payout
  winnerUserId: string       // the user who won
  houseUserId?: string       // OPTIONAL: where to send the 10% house cut
}

export async function POST(
  req: Request,
  { params }: { params: { id: string } }
) {
  try {
    const matchId = params.id
    const body = (await req.json()) as Partial<Body>
    const refId = String(body.refId ?? '')
    const winnerUserId = String(body.winnerUserId ?? '')
    const houseUserId = body.houseUserId ? String(body.houseUserId) : undefined

    if (!refId)         return NextResponse.json({ error: 'Missing refId' }, { status: 400 })
    if (!winnerUserId)  return NextResponse.json({ error: 'Missing winnerUserId' }, { status: 400 })

    // Load match with participants
    const match = await prisma.match.findUnique({
      where: { id: matchId },
      include: { participants: true },
    })
    if (!match) return NextResponse.json({ error: 'Match not found' }, { status: 404 })

    // Only the creating ref can settle
    if (match.refId !== refId) {
      return NextResponse.json({ error: 'Not authorized (ref only)' }, { status: 403 })
    }

    // Idempotency: if already complete with same winner, return success
    if (match.state === MatchState.COMPLETE) {
      if (match.winnerUserId === winnerUserId) {
        const winner = await prisma.user.findUnique({ where: { id: winnerUserId }, select: { availableWT: true, lockedWT: true } })
        return NextResponse.json({
          ok: true,
          idempotent: true,
          match: { id: match.id, state: match.state, stakeWT: match.stakeWT, winnerUserId: match.winnerUserId },
          winnerBalances: winner ?? null,
        })
      }
      // Completed with a different winner
      return NextResponse.json({ error: 'Match already settled' }, { status: 409 })
    }

    // Must have at least 2 participants and the winner must be one of them
    const participants = match.participants
    if (!participants.length || participants.length < 2) {
      return NextResponse.json({ error: 'Not enough participants to settle' }, { status: 409 })
    }
    const winnerInMatch = participants.some(p => p.userId === winnerUserId)
    if (!winnerInMatch) {
      return NextResponse.json({ error: 'Winner not in match' }, { status: 400 })
    }

    // Compute pool and cuts
    const poolWT = participants.length * match.stakeWT
    const houseCutWT = Math.floor(poolWT * 0.10) // 10% house
    const payoutWT = poolWT - houseCutWT

    // Transaction: release all escrow, pay winner, optional house credit, mark COMPLETE
    const result = await prisma.$transaction(async (tx) => {
      // Release each participant's locked stake
      for (const p of participants) {
        await tx.user.update({
          where: { id: p.userId },
          data: { lockedWT: { decrement: match.stakeWT } },
        })
      }

      // Credit winner with full payout (includes their stake)
      const winner = await tx.user.update({
        where: { id: winnerUserId },
        data: { availableWT: { increment: payoutWT } },
        select: { id: true, availableWT: true, lockedWT: true },
      })

      // Optional: credit house cut to houseUserId if provided and exists
      let house: { id: string; availableWT: number; lockedWT: number } | null = null
      if (houseUserId) {
        const maybeHouse = await tx.user.findUnique({ where: { id: houseUserId } })
        if (maybeHouse) {
          house = await tx.user.update({
            where: { id: houseUserId },
            data: { availableWT: { increment: houseCutWT } },
            select: { id: true, availableWT: true, lockedWT: true },
          })
        }
      }

      // Mark match complete with winner
      const updatedMatch = await tx.match.update({
        where: { id: match.id },
        data: { state: MatchState.COMPLETE, winnerUserId },
        select: { id: true, state: true, stakeWT: true, winnerUserId: true },
      })

      return { updatedMatch, winner, house }
    })

    return NextResponse.json({
      ok: true,
      match: result.updatedMatch,
      winnerBalances: result.winner,
      housecredited: Boolean(houseUserId),
      houseBalances: result.house ?? null,
      breakdown: {
        participants: participants.length,
        stakeWT: match.stakeWT,
        poolWT,
        houseCutWT,
        payoutWT,
      },
    })
  } catch (e) {
    console.error('PAYOUT_ERROR', e)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}