// src/app/api/discovery/matches/route.ts
import { NextResponse } from 'next/server'
import { prisma } from '@/app/server/prisma'
import { GameMode, MatchState } from '@prisma/client'

export const dynamic = 'force-dynamic'
export const revalidate = 0

type ModeQuery = '1v1' | '2v2' | '3v3'
const MODE_FROM_QUERY: Record<ModeQuery, GameMode> = {
  '1v1': GameMode.ONE_V_ONE,
  '2v2': GameMode.TWO_V_TWO,
  '3v3': GameMode.THREE_V_THREE,
}

const WT_PER_USD = 10

function parsePositiveInt(val: string | null, fallback: number, clampMax: number) {
  const n = Number(val)
  if (!Number.isFinite(n) || n <= 0) return fallback
  return Math.min(Math.floor(n), clampMax)
}

function parseUsdToWT(val: string | null) {
  if (val == null) return null
  const n = Number(val)
  if (!Number.isFinite(n) || n < 0) return null
  // 10 WT = $1 → allow cents like 12.5 => 125 WT
  return Math.round(n * WT_PER_USD)
}

export async function GET(req: Request) {
  try {
    const url = new URL(req.url)
    const mode = url.searchParams.get('mode') as ModeQuery | null
    const stakeUsd = url.searchParams.get('stakeUsd')
    const take = parsePositiveInt(url.searchParams.get('take'), 20, 50)
    const cursor = url.searchParams.get('cursor') // match id

    const where: {
      state: MatchState
      mode?: GameMode
      stakeWT?: number
    } = { state: MatchState.OPEN }

    if (mode && MODE_FROM_QUERY[mode]) where.mode = MODE_FROM_QUERY[mode]
    const stakeWT = parseUsdToWT(stakeUsd)
    if (stakeWT !== null) where.stakeWT = stakeWT

    const matches = await prisma.match.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: take + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      include: {
        _count: { select: { participants: true } },
        ref: { select: { id: true, handle: true } },
      },
    })

    const hasMore = matches.length > take
    const slice = hasMore ? matches.slice(0, take) : matches

    const items = slice.map((m) => ({
      id: m.id,
      mode:
        m.mode === GameMode.ONE_V_ONE ? ('1v1' as const)
        : m.mode === GameMode.TWO_V_TWO ? ('2v2' as const)
        : ('3v3' as const),
      stakeUsd: m.stakeWT / WT_PER_USD,
      state: m.state, // 'OPEN' | 'FULL' | 'COMPLETE' | 'CANCELLED'
      createdAt: m.createdAt, // serialized to ISO by NextResponse.json
      playersCount: m._count.participants,
      ref: m.ref, // { id, handle }
    }))

    return NextResponse.json(
      { items, nextCursor: hasMore ? matches[take].id : null },
      { headers: { 'Cache-Control': 'no-store' } }
    )
  } catch (err) {
    console.error('[discovery/matches] error', err)
    return NextResponse.json(
      { error: 'Server error' },
      { status: 500, headers: { 'Cache-Control': 'no-store' } }
    )
  }
}