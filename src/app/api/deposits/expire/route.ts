// src/app/api/deposits/expire/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/app/server/prisma'

export const dynamic = 'force-dynamic'
export const revalidate = 0

function noStore(json: any, init?: number | ResponseInit) {
  const base: ResponseInit = typeof init === 'number' ? { status: init } : init || {}
  return NextResponse.json(json, { ...base, headers: { ...(base.headers || {}), 'Cache-Control': 'no-store' } })
}
function bad(status: number, msg: string) {
  return noStore({ ok: false, error: msg }, status)
}

function authorized(req: NextRequest) {
  const adminSecret = process.env.DEPOSITS_SWEEPER_SECRET || process.env.ADMIN_SECRET
  if (!adminSecret) return false
  return req.headers.get('x-admin-secret') === adminSecret
}

/**
 * POST /api/deposits/expire
 * Headers: x-admin-secret: <DEPOSITS_SWEEPER_SECRET | ADMIN_SECRET>
 * Body (optional): { dryRun?: boolean, max?: number }
 */
export async function POST(req: NextRequest) {
  try {
    if (!authorized(req)) return bad(401, 'UNAUTHORIZED')

    const { dryRun = false, max = 250 } = (await req.json().catch(() => ({}))) as {
      dryRun?: boolean
      max?: number
    }

    const now = new Date()
    const stale = await prisma.depositIntent.findMany({
      where: { status: 'PENDING', expiresAt: { lt: now } },
      select: { id: true, reference: true, userId: true, amountWT: true, expiresAt: true },
      orderBy: { expiresAt: 'asc' },
      take: Math.max(1, Math.min(1000, Number(max) || 250)),
    })

    if (stale.length === 0) return noStore({ ok: true, updated: 0, intents: [] })

    if (dryRun) {
      return noStore({
        ok: true,
        dryRun: true,
        wouldUpdate: stale.length,
        intents: stale.map((i) => ({ id: i.id, reference: i.reference, expiresAt: i.expiresAt })),
      })
    }

    const ids = stale.map((i) => i.id)
    const updated = await prisma.depositIntent.updateMany({
      where: { id: { in: ids }, status: 'PENDING' },
      data: { status: 'EXPIRED' },
    })

    return noStore({
      ok: true,
      updated: updated.count,
      intents: stale.map((i) => ({ id: i.id, reference: i.reference })),
    })
  } catch (e) {
    console.error('DEPOSITS_EXPIRE_ERR', e)
    return bad(500, 'EXPIRE_FAILED')
  }
}