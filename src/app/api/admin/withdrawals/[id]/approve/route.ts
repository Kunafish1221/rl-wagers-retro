// src/app/api/admin/withdrawals/[id]/approve/route.ts
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
function ok(json: any) {
  return noStore({ ok: true, ...json })
}

function checkAdmin(req: NextRequest) {
  const secret = process.env.WITHDRAWALS_ADMIN_SECRET || process.env.ADMIN_SECRET
  if (!secret) return false
  return req.headers.get('x-admin-secret') === secret
}

/**
 * POST /api/admin/withdrawals/:id/approve
 * Headers: x-admin-secret: <WITHDRAWALS_ADMIN_SECRET | ADMIN_SECRET>
 * Body: { txHash: string }
 */
export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  try {
    if (!checkAdmin(req)) return bad(401, 'UNAUTHORIZED')

    const { id } = await ctx.params
    const body = await req.json().catch(() => ({} as any))
    const txHash = String(body?.txHash || '').trim()
    if (!txHash) return bad(400, 'txHash required')

    // Load target withdrawal
    const wd = await prisma.withdrawal.findUnique({
      where: { id },
      select: {
        id: true, userId: true, provider: true, address: true,
        amountWT: true, status: true, txHash: true, createdAt: true,
      },
    })
    if (!wd) return bad(404, 'NOT_FOUND')

    // Idempotency: already PAID and txHash matches
    if (wd.status === 'PAID' && wd.txHash === txHash) {
      return ok({ idempotent: true, withdrawal: wd })
    }
    if (wd.status === 'PAID' && wd.txHash && wd.txHash !== txHash) {
      // Already paid with a different hash — treat as idempotent, surface info
      return ok({ idempotent: true, withdrawal: wd, note: 'ALREADY_PAID_DIFFERENT_TX' })
    }

    // Approve + settle payout atomically
    const result = await prisma.$transaction(async (tx) => {
      // Ensure there are enough locked funds to release
      const acct = await tx.ledgerAccount.findUnique({
        where: { userId: wd.userId },
        select: { available: true, locked: true },
      })
      const locked = acct?.locked ?? 0
      if (locked < wd.amountWT) {
        throw Object.assign(new Error('LOCKED_MISMATCH'), { code: 'LOCKED_MISMATCH' })
      }

      // Set withdrawal to PAID (+txHash)
      const updatedWd = await tx.withdrawal.update({
        where: { id: wd.id },
        data: { status: 'PAID', txHash },
        select: {
          id: true, userId: true, provider: true, address: true,
          amountWT: true, status: true, txHash: true, createdAt: true,
        },
      })

      // Reduce locked balance (funds leave system)
      const acctAfter = await tx.ledgerAccount.update({
        where: { userId: wd.userId },
        data: { locked: { decrement: wd.amountWT } },
        select: { available: true, locked: true },
      })

      // Mirror simple wallet
      const walletAfter = await tx.user.update({
        where: { id: wd.userId },
        data: { lockedWT: { decrement: wd.amountWT } },
        select: { availableWT: true, lockedWT: true },
      })

      // Audit entry — payout
      await tx.ledgerEntry.create({
        data: {
          userId: wd.userId,
          // NOTE: If you treat the earlier "lock" as the negative delta, keep this 0.
          // If you prefer net-out on payout, set delta: -wd.amountWT and make the lock delta 0.
          delta: 0,
          kind: 'WITHDRAW_PAYOUT',
          refId: wd.id,
          meta: {
            provider: wd.provider,
            address: wd.address,
            txHash,
            amountWT: wd.amountWT,
            after: acctAfter,
          },
        },
      })

      return { withdrawal: updatedWd, wallet: walletAfter }
    })

    return ok(result)
  } catch (e: any) {
    if (e?.code === 'P2002') return bad(409, 'TX_HASH_ALREADY_USED')
    if (e?.code === 'LOCKED_MISMATCH' || e?.message === 'LOCKED_MISMATCH') {
      return bad(409, 'LOCKED_FUNDS_MISMATCH')
    }
    console.error('ADMIN_WITHDRAW_APPROVE_ERR', e)
    return bad(500, 'APPROVE_FAILED')
  }
}