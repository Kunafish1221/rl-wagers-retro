// src/app/api/withdrawals/[id]/cancel/route.ts
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

/**
 * POST /api/withdrawals/:id/cancel
 * Only the owner can cancel. Allowed only while status === 'REQUESTED'.
 * Effect:
 *  - Set withdrawal.status = 'CANCELLED'
 *  - Unlock funds (ledger: available+=amount, locked-=amount)
 *  - Mirror simple wallet fields
 *  - Audit entry WITHDRAW_CANCEL_UNLOCK (delta 0)
 */
export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  try {
    const gate = await requireSession(req)
    if (!gate.ok) return gate.response
    const { session } = gate

    const { id } = await ctx.params

    // Load and authorize
    const wd = await prisma.withdrawal.findUnique({
      where: { id },
      select: {
        id: true, userId: true, amountWT: true, status: true, provider: true, address: true, txHash: true, createdAt: true,
      },
    })
    if (!wd) return bad(404, 'NOT_FOUND')
    if (wd.userId !== session.userId) return bad(403, 'FORBIDDEN')

    // Idempotency
    if (wd.status === 'CANCELLED') return noStore({ ok: true, idempotent: true, withdrawal: wd })
    if (wd.status === 'PAID')      return bad(409, 'ALREADY_PAID')

    if (wd.status !== 'REQUESTED') return bad(409, 'NOT_CANCELLABLE')

    // Cancel + unlock atomically
    const result = await prisma.$transaction(async (tx) => {
      // Flip status
      const updated = await tx.withdrawal.update({
        where: { id: wd.id },
        data: { status: 'CANCELLED' },
        select: {
          id: true, userId: true, amountWT: true, status: true, provider: true, address: true, txHash: true, createdAt: true,
        },
      })

      // Unlock funds (ledger)
      const acct = await tx.ledgerAccount.upsert({
        where: { userId: wd.userId },
        create: { userId: wd.userId, available: wd.amountWT, locked: 0 },
        update: { available: { increment: wd.amountWT }, locked: { decrement: wd.amountWT } },
        select: { available: true, locked: true },
      })

      // Mirror simple wallet
      const wallet = await tx.user.update({
        where: { id: wd.userId },
        data: { availableWT: { increment: wd.amountWT }, lockedWT: { decrement: wd.amountWT } },
        select: { availableWT: true, lockedWT: true },
      })

      // Audit
      await tx.ledgerEntry.create({
        data: {
          userId: wd.userId,
          delta: 0,
          kind: 'WITHDRAW_CANCEL_UNLOCK',
          refId: wd.id,
          meta: { amountWT: wd.amountWT, after: acct },
        },
      })

      return { withdrawal: updated, wallet }
    })

    return noStore({ ok: true, ...result })
  } catch (e) {
    console.error('WITHDRAW_CANCEL_ERR', e)
    return bad(500, 'CANCEL_FAILED')
  }
}