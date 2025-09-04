// src/app/api/matches/[id]/report/route.ts
import { NextResponse } from 'next/server'
import { prisma } from '@/app/server/prisma'
import { MatchState, Team } from '@prisma/client'

type Body = { refId: string; winnerUserId: string }

const FEE_BPS = Number(process.env.WAGER_FEE_BPS ?? '1000') // 10% default
const HOUSE_USER_ID = process.env.WAGER_HOUSE_USER_ID || 'HOUSE_USER_ID_MISSING'

type TxSuccess = {
  ok: true
  match: {
    id: string
    state: MatchState
    winnerUserId: string | null
    stakeWT: number
    mode: any
  }
  payout: {
    pot: number
    feeBps: number
    feeToHouse: number
    winners: string[]
    perWinner: number
  }
}
type TxError = { ok: false; code: number; msg: string }
type TxResult = TxSuccess | TxError

export async function POST(req: Request, { params }: { params: { id: string } }) {
  try {
    const { refId, winnerUserId } = (await req.json()) as Partial<Body>
    const matchId = params.id

    if (!refId || !winnerUserId) {
      return NextResponse.json({ error: 'Missing refId or winnerUserId' }, { status: 400 })
    }
    if (HOUSE_USER_ID === 'HOUSE_USER_ID_MISSING') {
      return NextResponse.json({ error: 'HOUSE_USER_ID not configured' }, { status: 500 })
    }

    const out: TxResult = await prisma.$transaction(async (tx) => {
      const match = await tx.match.findUnique({
        where: { id: matchId },
        include: { participants: { select: { id: true, userId: true, team: true } } },
      })
      if (!match) return { ok: false, code: 404, msg: 'Match not found' }

      if (match.refId !== refId) return { ok: false, code: 403, msg: 'Only the assigned ref can resolve' }
      if (match.state === MatchState.CANCELLED) return { ok: false, code: 409, msg: 'Match is cancelled' }
      if (match.state === MatchState.COMPLETE) {
        return {
          ok: true,
          match: {
            id: match.id,
            state: match.state,
            winnerUserId: match.winnerUserId,
            stakeWT: match.stakeWT,
            mode: match.mode,
          },
          payout: {
            pot: match.stakeWT * match.participants.length,
            feeBps: FEE_BPS,
            feeToHouse: 0,
            winners: [],
            perWinner: 0,
          },
        }
      }

      const allUsers = match.participants.map((p) => p.userId)
      if (!allUsers.includes(winnerUserId)) {
        return { ok: false, code: 400, msg: 'Winner must be a participant' }
      }

      const winnerP = match.participants.find((p) => p.userId === winnerUserId)!
      const winningTeam = winnerP.team
      const winners = match.participants.filter((p) => p.team === winningTeam)
      const losers = match.participants.filter((p) => p.team !== winningTeam)

      const stake = match.stakeWT
      const totalPlayers = match.participants.length

      // Validate lockedWT for everyone
      for (const p of match.participants) {
        const u = await tx.user.findUnique({ where: { id: p.userId }, select: { lockedWT: true } })
        if (!u) return { ok: false, code: 404, msg: 'User missing on resolve' }
        if ((u.lockedWT ?? 0) < stake) {
          return { ok: false, code: 409, msg: `Locked balance mismatch for user ${p.userId}` }
        }
      }

      // 1) Remove locked from ALL players
      for (const p of match.participants) {
        await tx.user.update({
          where: { id: p.userId },
          data: { lockedWT: { decrement: stake } },
        })
      }

      // 2) Compute pot, fee, payout
      const pot = stake * totalPlayers
      const fee = Math.floor((pot * FEE_BPS) / 10_000)
      const distributable = pot - fee
      const perWinner = Math.floor(distributable / winners.length)
      const remainder = distributable - perWinner * winners.length

      // 3) Credit winners equally (+ remainder to first winner)
      for (let i = 0; i < winners.length; i++) {
        const add = perWinner + (i === 0 ? remainder : 0)
        if (add > 0) {
          await tx.user.update({
            where: { id: winners[i].userId },
            data: { availableWT: { increment: add } },
          })
        }
      }

      // 4) Credit fee to house
      if (fee > 0) {
        await tx.user.update({
          where: { id: HOUSE_USER_ID },
          data: { availableWT: { increment: fee } },
        })
      }

      // 5) Mark match COMPLETE
      const updated = await tx.match.update({
        where: { id: match.id },
        data: { state: MatchState.COMPLETE, winnerUserId },
        select: { id: true, state: true, winnerUserId: true, stakeWT: true, mode: true },
      })

      return {
        ok: true,
        match: updated,
        payout: {
          pot,
          feeBps: FEE_BPS,
          feeToHouse: fee,
          winners: winners.map((w) => w.userId),
          perWinner,
        },
      }
    })

    if (!out.ok) {
      return NextResponse.json({ error: out.msg }, { status: out.code })
    }
    return NextResponse.json(out, { status: 200 })
  } catch (e) {
    console.error('REPORT_RESOLVE_ERROR', e)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}