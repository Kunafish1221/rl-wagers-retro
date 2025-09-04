// src/app/api/matches/[id]/join/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/app/server/prisma'
import { requireSession } from '@/app/server/session'
import { GameMode, MatchState, Role, Team } from '@prisma/client'

function bad(status: number, msg: string) {
  return NextResponse.json({ ok: false, error: msg }, { status, headers: { 'Cache-Control': 'no-store' } })
}

function capacityFor(mode: GameMode) {
  if (mode === 'ONE_V_ONE') return 2
  if (mode === 'TWO_V_TWO') return 4
  return 6
}

export async function POST(
  req: NextRequest,
  context: { params: Promise<{ id: string }> } // typed-routes: Promise params
) {
  try {
    // Auth
    const gate = await requireSession(req)
    if (!gate.ok) return gate.response
    const { session } = gate
    const userId = session.userId

    const { id: matchId } = await context.params

    // Fast guards
    const match = await prisma.match.findUnique({
      where: { id: matchId },
      select: {
        id: true, mode: true, state: true, stakeWT: true, refId: true,
        _count: { select: { participants: true } },
      },
    })
    if (!match) return bad(404, 'MATCH_NOT_FOUND')
    if (match.state === MatchState.COMPLETE || match.state === MatchState.CANCELLED) return bad(409, 'MATCH_CLOSED')
    if (match.refId === userId) return bad(400, 'REF_CANNOT_JOIN')

    const capacity = capacityFor(match.mode)
    if (match._count.participants >= capacity) return bad(409, 'MATCH_FULL')

    // Ensure user + Epic IGN
    const me = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, epicId: true },
    })
    if (!me) return bad(404, 'USER_NOT_FOUND')
    if (!me.epicId) return bad(400, 'EPIC_ID_REQUIRED')

    // Idempotency: already joined?
    const already = await prisma.matchParticipant.findFirst({
      where: { matchId, userId },
      select: { id: true, userId: true, role: true, team: true },
    })
    if (already) {
      const [fresh, acct] = await Promise.all([
        prisma.match.findUnique({
          where: { id: matchId },
          select: {
            id: true, state: true, mode: true, stakeWT: true,
            participants: { select: { id: true, userId: true, role: true, team: true } },
          },
        }),
        prisma.ledgerAccount.findUnique({ where: { userId }, select: { available: true, locked: true } }),
      ])
      return NextResponse.json(
        {
          ok: true,
          idempotent: true,
          match: { id: fresh!.id, state: fresh!.state, mode: fresh!.mode, stakeWT: fresh!.stakeWT },
          participants: fresh!.participants,
          balances: { availableWT: acct?.available ?? 0, lockedWT: acct?.locked ?? 0 },
        },
        { headers: { 'Cache-Control': 'no-store' } }
      )
    }

    // Transactional join with ledger escrow
    const out = await prisma.$transaction(async (tx) => {
      // Re-read match w/ participants to compute team + capacity safely
      const fresh = await tx.match.findUnique({
        where: { id: matchId },
        include: { participants: { select: { id: true, userId: true, team: true, role: true } } },
      })
      if (!fresh) throw new Error('MATCH_NOT_FOUND_AGAIN')
      if (fresh.state === MatchState.COMPLETE || fresh.state === MatchState.CANCELLED) throw new Error('MATCH_CLOSED')

      const cap = capacityFor(fresh.mode)
      if (fresh.participants.length >= cap) throw new Error('MATCH_FULL')

      // Ensure ledger account exists
      const acct = await tx.ledgerAccount.upsert({
        where: { userId },
        update: {},
        create: { userId, available: 0, locked: 0 },
        select: { available: true, locked: true },
      })

      const stake = fresh.stakeWT
      if (acct.available < stake) throw new Error('INSUFFICIENT_FUNDS')

      // Balance teams
      const aCount = fresh.participants.filter(p => p.team === Team.A).length
      const bCount = fresh.participants.filter(p => p.team === Team.B).length
      const team = aCount <= bCount ? Team.A : Team.B

      // Move funds: ledger available -> ledger locked
      const updatedAcct = await tx.ledgerAccount.update({
        where: { userId },
        data: { available: { decrement: stake }, locked: { increment: stake } },
        select: { available: true, locked: true },
      })

      // Mirror to simple wallet (compat)
      await tx.user.update({
        where: { id: userId },
        data: { availableWT: { decrement: stake }, lockedWT: { increment: stake } },
        select: { id: true },
      })

      // Create participant
      const participant = await tx.matchParticipant.create({
        data: { matchId: fresh.id, userId, role: Role.PLAYER, team },
        select: { id: true, userId: true, role: true, team: true },
      })

      // Maybe mark FULL
      const newCount = fresh.participants.length + 1
      const newState = newCount >= cap ? MatchState.FULL : MatchState.OPEN
      const updatedMatch =
        newState !== fresh.state
          ? await tx.match.update({
              where: { id: fresh.id },
              data: { state: newState },
              include: { participants: { select: { id: true, userId: true, role: true, team: true } } },
            })
          : await tx.match.findUnique({
              where: { id: fresh.id },
              include: { participants: { select: { id: true, userId: true, role: true, team: true } } },
            })

      // Audit entries
      await tx.ledgerEntry.create({
        data: { userId, delta: -stake, kind: 'ESCROW_LOCK', refId: fresh.id, meta: { team } },
      })
      await tx.ledgerEntry.create({
        data: { userId, delta: +stake, kind: 'ESCROW_LOCKED', refId: fresh.id, meta: { team } },
      })

      return { updatedAcct, updatedMatch: updatedMatch!, participant, stake }
    })

    return NextResponse.json(
      {
        ok: true,
        match: {
          id: out.updatedMatch.id,
          state: out.updatedMatch.state,
          mode: out.updatedMatch.mode,
          stakeWT: out.stake,
        },
        joined: out.participant,
        balances: {
          availableWT: out.updatedAcct.available,
          lockedWT: out.updatedAcct.locked,
        },
        participants: out.updatedMatch.participants,
      },
      { status: 201, headers: { 'Cache-Control': 'no-store' } }
    )
  } catch (e: any) {
    const msg = String(e?.message || '')
    if (msg.includes('P2002') || msg.includes('Unique constraint')) {
      return NextResponse.json({ ok: true, idempotent: true }, { headers: { 'Cache-Control': 'no-store' } })
    }
    const status =
      msg === 'MATCH_FULL' ? 409 :
      msg === 'MATCH_CLOSED' ? 409 :
      msg === 'INSUFFICIENT_FUNDS' ? 402 :
      msg.includes('MATCH_NOT_FOUND') ? 404 :
      500
    console.error('JOIN_ESCROW_ERROR', e)
    return bad(status, msg || 'JOIN_FAIL')
  }
}