// src/app/api/matches/[id]/settle/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/app/server/prisma'
import { requireSession } from '@/app/server/session'
import { MatchState, GameMode, Team } from '@prisma/client'

type Body = { refId?: string; winnerUserId?: string } // refId accepted for backwards compat but ignored

const FEE_BPS = Math.max(0, Math.min(10_000, Number(process.env.WAGER_FEE_BPS ?? '1000'))) // clamp 0..10000
const HOUSE_USER_ID = process.env.WAGER_HOUSE_USER_ID || 'HOUSE_USER_ID_MISSING'

type TxOk = {
  ok: true
  idempotent?: boolean
  match: { id: string; state: MatchState; winnerUserId: string | null; stakeWT: number; mode: GameMode }
  payout: { pot: number; feeBps: number; feeToHouse: number; winners: string[]; perWinner: number }
}
type TxErr = { ok: false; code: number; msg: string }
type TxResult = TxOk | TxErr

export const dynamic = 'force-dynamic'
export const revalidate = 0
const noStore = (j:any,i?:number|ResponseInit)=>NextResponse.json(
  j,
  typeof i==='number'?{status:i,headers:{'Cache-Control':'no-store'}}:{...(i||{}),headers:{...((i||{} as any).headers||{}),'Cache-Control':'no-store'}}
)

export async function POST(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    // Auth
    const gate = await requireSession(req)
    if (!gate.ok) return gate.response
    const { session } = gate

    const { id: matchId } = await context.params
    const { winnerUserId } = (await req.json().catch(() => ({} as any))) as Body

    if (!winnerUserId) return noStore({ ok:false, error:'Missing winnerUserId' }, 400)
    if (HOUSE_USER_ID === 'HOUSE_USER_ID_MISSING') return noStore({ ok:false, error:'HOUSE_USER_ID not configured' }, 500)

    const out: TxResult = await prisma.$transaction(async (tx) => {
      const match = await tx.match.findUnique({
        where: { id: matchId },
        include: { participants: { select: { userId: true, team: true } } },
      })
      if (!match) return { ok: false, code: 404, msg: 'Match not found' }

      // Only the assigned ref or the owner can settle
      const me = await tx.user.findUnique({ where: { id: session.userId }, select: { isOwner: true } })
      const isAuthorized = match.refId === session.userId || !!me?.isOwner
      if (!isAuthorized) return { ok: false, code: 403, msg: 'Forbidden' }

      if (match.state === MatchState.CANCELLED) return { ok: false, code: 409, msg: 'Match is cancelled' }
      if (match.state === MatchState.COMPLETE) {
        return {
          ok: true,
          idempotent: true,
          match: {
            id: match.id, state: match.state, winnerUserId: match.winnerUserId ?? null,
            stakeWT: match.stakeWT, mode: match.mode,
          },
          payout: {
            pot: (match.stakeWT ?? 0) * match.participants.length,
            feeBps: FEE_BPS,
            feeToHouse: 0,
            winners: [],
            perWinner: 0,
          },
        }
      }

      const stake = Math.max(0, Math.floor(match.stakeWT ?? 0))
      if (stake <= 0) return { ok: false, code: 400, msg: 'Invalid stake' }

      const allUsers = match.participants.map(p => p.userId)
      if (!allUsers.includes(winnerUserId)) return { ok: false, code: 400, msg: 'Winner must be a participant' }

      // Winners: if teams are set (not NONE), pay the team; else pay only the winner
      const winnerP = match.participants.find(p => p.userId === winnerUserId)!
      const teamsPresent = match.participants.some(p => p.team !== Team.NONE)
      const winners = teamsPresent
        ? match.participants.filter(p => p.team === winnerP.team)
        : [winnerP]

      if (winners.length === 0) return { ok: false, code: 409, msg: 'No winners resolved' }

      // Check escrow: use LedgerAccount.locked as source of truth
      const accounts = await tx.ledgerAccount.findMany({
        where: { userId: { in: allUsers } },
        select: { userId: true, locked: true },
      })
      const lockedByUser = new Map(accounts.map(a => [a.userId, a.locked]))
      for (const uid of allUsers) {
        const locked = lockedByUser.get(uid) ?? 0
        if (locked < stake) return { ok: false, code: 409, msg: `Locked balance mismatch for ${uid}` }
      }

      // POT / FEE / PAYOUT
      const pot = stake * match.participants.length
      const fee = Math.floor((pot * FEE_BPS) / 10_000)
      const distributable = pot - fee
      const perWinner = Math.floor(distributable / winners.length)
      const remainder = distributable - perWinner * winners.length

      // 1) Remove escrow lock for all
      for (const uid of allUsers) {
        // Ledger source of truth
        await tx.ledgerAccount.update({
          where: { userId: uid },
          data: { locked: { decrement: stake } },
        }).catch(async () => {
          // if no account row (edge), create then decrement -> emulate to zero
          await tx.ledgerAccount.upsert({
            where: { userId: uid },
            create: { userId: uid, available: 0, locked: 0 },
            update: {},
          })
        })
        // Mirror simple wallet
        await tx.user.update({
          where: { id: uid },
          data: { lockedWT: { decrement: stake } },
        })
        if (uid !== winnerUserId) {
          await tx.ledgerEntry.create({
            data: { userId: uid, delta: 0, kind: 'ESCROW_LOST', refId: match.id, meta: { stakeWT: stake } },
          })
        }
      }

      // 2) Credit winners (perWinner, plus remainder to first)
      for (let i = 0; i < winners.length; i++) {
        const uid = winners[i].userId
        const add = perWinner + (i === 0 ? remainder : 0)
        if (add > 0) {
          const acct = await tx.ledgerAccount.upsert({
            where: { userId: uid },
            create: { userId: uid, available: add, locked: 0 },
            update: { available: { increment: add } },
            select: { available: true, locked: true },
          })
          await tx.user.update({ where: { id: uid }, data: { availableWT: { increment: add } } })
          await tx.ledgerEntry.create({
            data: {
              userId: uid,
              delta: add,
              kind: 'ESCROW_PAYOUT',
              refId: match.id,
              meta: { potWT: pot, feeWT: fee, portionWT: add, after: acct },
            },
          })
        }
      }

      // 3) House fee
      if (fee > 0) {
        const acct = await tx.ledgerAccount.upsert({
          where: { userId: HOUSE_USER_ID },
          create: { userId: HOUSE_USER_ID, available: fee, locked: 0 },
          update: { available: { increment: fee } },
          select: { available: true, locked: true },
        })
        await tx.user.update({ where: { id: HOUSE_USER_ID }, data: { availableWT: { increment: fee } } }).catch(() => null)
        await tx.ledgerEntry.create({
          data: { userId: HOUSE_USER_ID, delta: fee, kind: 'HOUSE_FEE', refId: match.id, meta: { potWT: pot, feeBps: FEE_BPS, after: acct } },
        })
      }

      // 4) Finalize match
      const updated = await tx.match.update({
        where: { id: match.id },
        data: { state: MatchState.COMPLETE, winnerUserId },
        select: { id: true, state: true, winnerUserId: true, stakeWT: true, mode: true },
      })

      return {
        ok: true,
        match: updated,
        payout: { pot, feeBps: FEE_BPS, feeToHouse: fee, winners: winners.map(w => w.userId), perWinner },
      }
    })

    if (!out.ok) return noStore({ ok:false, error: out.msg }, out.code)
    return noStore(out, 200)
  } catch (e) {
    console.error('SETTLE_MATCH_ERROR', e)
    return noStore({ ok:false, error:'Server error' }, 500)
  }
}