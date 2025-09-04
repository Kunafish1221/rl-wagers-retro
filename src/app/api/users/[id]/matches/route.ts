// src/app/api/users/[id]/matches/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/app/server/prisma'
import { MatchState, GameMode } from '@prisma/client'

/**
 * GET /api/users/:id/matches?role=all|player|ref&state=OPEN|FULL|COMPLETE|CANCELLED&mode=...&limit=20&offset=0
 */
export async function GET(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id: userId } = await context.params
    const { searchParams } = new URL(req.url)

    const role = (searchParams.get('role') ?? 'all') as 'all' | 'player' | 'ref'
    const state = (searchParams.get('state') as MatchState | null) ?? null
    const mode = (searchParams.get('mode') as GameMode | null) ?? null
    const limit = Math.min(
      Math.max(parseInt(searchParams.get('limit') || '20', 10) || 20, 1),
      50
    )
    const offset = Math.max(parseInt(searchParams.get('offset') || '0', 10) || 0, 0)

    // Build base match filters
    const matchFilter: Record<string, unknown> = {}
    if (state) matchFilter.state = state
    if (mode) matchFilter.mode = mode

    // ------- Fetch as ref -------
    const refPromise =
      role === 'player'
        ? Promise.resolve([] as Array<typeof refShape>)
        : prisma.match.findMany({
            where: { refId: userId, ...matchFilter },
            orderBy: { createdAt: 'desc' },
            select: {
              id: true,
              mode: true,
              stakeWT: true,
              state: true,
              createdAt: true,
              refId: true,
              winnerUserId: true,
              participants: {
                select: { id: true, userId: true, role: true, team: true },
              },
            },
          })

    // ------- Fetch as player (via participation) -------
    // NOTE: order by the related `match.createdAt`, not on participant.
    const playerPromise =
      role === 'ref'
        ? Promise.resolve([] as Array<typeof refShape>)
        : prisma.matchParticipant
            .findMany({
              where: { userId },
              orderBy: { match: { createdAt: 'desc' } },
              select: {
                match: {
                  select: {
                    id: true,
                    mode: true,
                    stakeWT: true,
                    state: true,
                    createdAt: true,
                    refId: true,
                    winnerUserId: true,
                    participants: {
                      select: { id: true, userId: true, role: true, team: true },
                    },
                  },
                },
              },
            })
            .then((rows) =>
              rows
                .map((r) => r.match)
                .filter(
                  (m): m is NonNullable<typeof rows[number]['match']> =>
                    !!m && (!state || m.state === state) && (!mode || m.mode === mode)
                )
            )

    const [asRef, asPlayer] = await Promise.all([refPromise, playerPromise])

    // Merge, de-dupe, annotate roleView, then page
    type MatchShape = {
      id: string
      mode: GameMode
      stakeWT: number | null
      state: MatchState
      createdAt: Date
      refId: string | null
      winnerUserId: string | null
      participants: { id: string; userId: string; role: string; team: string | null }[]
    }
    const refShape = {} as MatchShape // only for typing in Promise.resolve above

    const mergedMap = new Map<string, MatchShape & { roleView: 'ref' | 'player' }>()
    for (const m of asRef) mergedMap.set(m.id, { ...m, roleView: 'ref' })
    for (const m of asPlayer) {
      if (!mergedMap.has(m.id)) mergedMap.set(m.id, { ...m, roleView: 'player' })
    }

    const merged = Array.from(mergedMap.values()).sort(
      (a, b) => +new Date(b.createdAt) - +new Date(a.createdAt)
    )

    const slice = merged.slice(offset, offset + limit)

    return NextResponse.json({
      ok: true,
      count: slice.length,
      items: slice,
      paging: { limit, offset, nextOffset: offset + slice.length, totalSeen: merged.length },
    })
  } catch (e) {
    console.error('USER_MATCHES_ERROR', e)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}