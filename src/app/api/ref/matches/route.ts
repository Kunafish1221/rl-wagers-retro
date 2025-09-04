// src/app/api/ref/matches/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/app/server/prisma'
import { requireSession } from '@/app/server/session'
import { GameMode, MatchState } from '@prisma/client'

export const dynamic = 'force-dynamic'
export const revalidate = 0

type Body = {
  refId: string
  mode: '1v1' | '2v2' | '3v3'
  stakeUsd: 10 | 20 | 50 | 75 | 100
}

const MODE_MAP: Record<Body['mode'], GameMode> = {
  '1v1': GameMode.ONE_V_ONE,
  '2v2': GameMode.TWO_V_TWO,
  '3v3': GameMode.THREE_V_THREE,
}
const ALLOWED_WAGERS = new Set<Body['stakeUsd']>([10, 20, 50, 75, 100])
const WT_PER_USD = 10 // 10 WT = $1

function noStore(json: any, init?: number | ResponseInit) {
  const base: ResponseInit = typeof init === 'number' ? { status: init } : init || {}
  return NextResponse.json(json, { ...base, headers: { ...(base.headers || {}), 'Cache-Control': 'no-store' } })
}
const bad = (s: number, m: string) => noStore({ ok: false, error: m }, s)

export async function POST(req: NextRequest) {
  try {
    // Auth
    const gate = await requireSession(req)
    if (!gate.ok) return gate.response
    const { session } = gate

    const { refId, mode, stakeUsd } = (await req.json().catch(() => ({} as any))) as Partial<Body>
    if (!refId || !mode || typeof stakeUsd !== 'number') {
      return bad(400, 'Missing refId, mode, or stakeUsd')
    }
    if (!(mode in MODE_MAP)) return bad(400, 'Invalid mode (use 1v1, 2v2, 3v3)')
    if (!ALLOWED_WAGERS.has(stakeUsd as Body['stakeUsd'])) return bad(400, 'Invalid stakeUsd (10, 20, 50, 75, 100)')

    // Role check
    const me = await prisma.user.findUnique({
      where: { id: session.userId },
      select: { id: true, isRef: true, isOwner: true },
    })
    if (!me) return bad(401, 'Unauthorized')

    // Refs can only create for themselves; owner may create for anyone
    if (!me.isOwner) {
      if (!me.isRef) return bad(403, 'REF_ONLY')
      if (refId !== me.id) return bad(403, 'REF_ID_MISMATCH')
    }

    // Ensure target ref exists (and isRef if not owner impersonation is allowed)
    const refUser = await prisma.user.findUnique({
      where: { id: refId },
      select: { id: true, isRef: true, isOwner: true },
    })
    if (!refUser) return bad(404, 'Ref not found')
    if (!refUser.isRef && !me.isOwner) return bad(403, 'TARGET_NOT_REF')

    const stakeWT = Math.max(0, Math.floor(stakeUsd * WT_PER_USD))

    const match = await prisma.match.create({
      data: {
        refId,
        mode: MODE_MAP[mode],
        stakeWT,
        state: MatchState.OPEN,
      },
      select: { id: true, state: true },
    })

    return noStore({ ok: true, id: match.id, state: match.state })
  } catch (err) {
    console.error('REF_CREATE_MATCH_ERR', err)
    return bad(500, 'CREATE_FAILED')
  }
}