import { NextResponse } from 'next/server'
import { prisma } from '@/app/server/prisma'
import { GameMode, MatchState } from '@prisma/client'

type CreateBody = {
  refId: string
  mode: GameMode | 'ONE_V_ONE' | 'TWO_V_TWO' | 'THREE_V_THREE'
  stakeWT: number
}

/**
 * POST /api/matches
 * Create a lobby (ref-only)
 */
export async function POST(req: Request) {
  try {
    const body = (await req.json()) as Partial<CreateBody>
    const refId = String(body.refId ?? '')
    const modeRaw = String(body.mode ?? '')
    const stakeWT = Number(body.stakeWT ?? 0)

    if (!refId)   return NextResponse.json({ error: 'Missing refId' }, { status: 400 })
    if (!modeRaw) return NextResponse.json({ error: 'Missing mode' }, { status: 400 })
    if (!Number.isInteger(stakeWT) || stakeWT <= 0) {
      return NextResponse.json({ error: 'Invalid stakeWT' }, { status: 400 })
    }

    const ref = await prisma.user.findUnique({ where: { id: refId }, select: { id: true } })
    if (!ref) return NextResponse.json({ error: 'Ref user not found' }, { status: 404 })

    const allowed = new Set(['ONE_V_ONE', 'TWO_V_TWO', 'THREE_V_THREE'])
    if (!allowed.has(modeRaw)) return NextResponse.json({ error: 'Invalid mode' }, { status: 400 })
    const mode = modeRaw as GameMode

    const match = await prisma.match.create({
      data: { refId, mode, stakeWT, state: MatchState.OPEN },
      include: { participants: true },
    })

    return NextResponse.json({
      ok: true,
      match: {
        id: match.id,
        mode: match.mode,
        stakeWT: match.stakeWT,
        state: match.state,
        refId: match.refId,
        createdAt: match.createdAt,
      },
      participants: match.participants,
    }, { status: 201 })
  } catch (e) {
    console.error('CREATE_MATCH_ERROR', e)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}

/**
 * GET /api/matches?state=OPEN|FULL|COMPLETE|CANCELLED&mode=ONE_V_ONE|TWO_V_TWO|THREE_V_THREE&limit=20&offset=0
 * Discover list (defaults to OPEN only), newest first.
 */
export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url)

    const stateParam = (searchParams.get('state') ?? 'OPEN') as MatchState
    const modeParam = searchParams.get('mode') as GameMode | null
    const limit = Math.min(Math.max(parseInt(searchParams.get('limit') || '20', 10) || 20, 1), 50)
    const offset = Math.max(parseInt(searchParams.get('offset') || '0', 10) || 0, 0)

    const where: any = {}
    if (stateParam) where.state = stateParam
    if (modeParam) where.mode = modeParam

    const rows = await prisma.match.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: offset,
      take: limit,
      select: {
        id: true,
        mode: true,
        stakeWT: true,
        state: true,
        createdAt: true,
        refId: true,
        _count: { select: { participants: true } },
      },
    })

    return NextResponse.json({
      ok: true,
      count: rows.length,
      items: rows.map((m) => ({
        id: m.id,
        mode: m.mode,
        stakeWT: m.stakeWT,
        state: m.state,
        createdAt: m.createdAt,
        refId: m.refId,
        participantCount: m._count.participants,
      })),
      paging: { limit, offset, nextOffset: offset + rows.length },
    })
  } catch (e) {
    console.error('LIST_MATCHES_ERROR', e)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}