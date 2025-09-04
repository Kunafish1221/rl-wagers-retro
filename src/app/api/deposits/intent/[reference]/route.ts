// src/app/api/deposits/intent/[reference]/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/app/server/prisma'
import { requireSession } from '@/app/server/session'

export const dynamic = 'force-dynamic'
export const revalidate = 0

function noStore(json: any, init?: number | ResponseInit) {
  const base: ResponseInit = typeof init === 'number' ? { status: init } : init || {}
  return NextResponse.json(json, { ...base, headers: { ...(base.headers || {}), 'Cache-Control': 'no-store' } })
}
function bad(status: number, msg: string) {
  return noStore({ ok: false, error: msg }, status)
}

export async function GET(
  req: NextRequest,
  ctx: { params: Promise<{ reference: string }> } // typed-routes style
) {
  try {
    const gate = await requireSession(req)
    if (!gate.ok) return gate.response
    const { session } = gate

    const { reference } = await ctx.params
    const intent = await prisma.depositIntent.findUnique({
      where: { reference },
      select: {
        id: true,
        userId: true,
        amountUSD: true,
        amountWT: true,
        reference: true,
        status: true,
        createdAt: true,
        expiresAt: true,
        creditedDepositId: true,
        txHash: true,
        meta: true,
      },
    })
    if (!intent) return bad(404, 'INTENT_NOT_FOUND')
    if (intent.userId !== session.userId) return bad(403, 'FORBIDDEN')

    // Compute remaining seconds (never negative)
    const now = Date.now()
    const remainMs = Math.max(0, new Date(intent.expiresAt).getTime() - now)
    const remainingSeconds = Math.floor(remainMs / 1000)

    // If still pending but past TTL, surface `wouldExpire: true`
    const hasExpired = intent.status === 'PENDING' && remainingSeconds === 0

    return noStore({
      ok: true,
      intent: {
        id: intent.id,
        reference: intent.reference,
        status: intent.status,
        amountUSD: intent.amountUSD,
        amountWT: intent.amountWT,
        createdAt: intent.createdAt,
        expiresAt: intent.expiresAt,
        creditedDepositId: intent.creditedDepositId ?? null,
        txHash: intent.txHash ?? null,
        remainingSeconds,
        hasExpired,
        meta: intent.meta ?? null,
      },
    })
  } catch (e) {
    console.error('DEPOSIT_INTENT_STATUS_ERR', e)
    return bad(500, 'STATUS_FAILED')
  }
}