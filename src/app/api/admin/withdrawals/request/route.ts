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
function ok(json: any) {
  return noStore({ ok: true, ...json })
}

type Body = {
  provider: 'solflare' | 'coinbase'
  address: string
  amountWT: number        // integer WT; 10 WT = $1
  note?: string
}

const WITHDRAW_LOCK_KIND = 'WITHDRAW_LOCK' // audit taxonomy

export async function POST(req: NextRequest) {
  const gate = await requireSession(req)
  if (!gate.ok) return gate.response
  const { session } = gate
  const userId = (session as any).userId ?? session.userId

  try {
    const body = (await req.json().catch(() => ({}))) as Partial<Body>
    const provider = body.provider
    const addressRaw = String(body.address ?? '').trim()
    const amountWT = Number(body.amountWT)

    if (provider !== 'solflare' && provider !== 'coinbase') return bad(400, 'INVALID_PROVIDER')
    if (!addressRaw) return bad(400, 'ADDRESS_REQUIRED')
    if (!Number.isInteger(amountWT) || amountWT <= 0) return bad(400, 'INVALID_AMOUNT')

    const out = await prisma.$transaction(async (tx) => {
      // Ensure user exists
      const user = await tx.user.findUnique({ where: { id: userId }, select: { id: true } })
      if (!user) throw new Error('USER_NOT_FOUND')

      // Check funds
      const acct = await tx.ledgerAccount.upsert({
        where: { userId },
        create: { userId, available: 0, locked: 0 },
        update: {},
      })
      if (acct.available < amountWT) throw new Error('INSUFFICIENT_FUNDS')

      // Move funds: available → locked
      await tx.ledgerAccount.update({
        where: { userId },
        data: { available: { decrement: amountWT }, locked: { increment: amountWT } },
      })
      await tx.user.update({
        where: { id: userId },
        data: { availableWT: { decrement: amountWT }, lockedWT: { increment: amountWT } },
      })

      // Audit lock (no net delta to total balance)
      await tx.ledgerEntry.create({
        data: {
          userId,
          delta: 0,
          kind: WITHDRAW_LOCK_KIND,
          refId: undefined,
          meta: {
            provider,
            address: addressRaw,
            amountWT,
            note: body.note ?? null,
          },
        },
      })

      // Create withdrawal record (String status in schema; use "REQUESTED")
      const wd = await tx.withdrawal.create({
        data: {
          userId,
          provider: provider as any,
          address: addressRaw,
          amountWT,
          status: 'REQUESTED',
        },
        select: { id: true, userId: true, provider: true, address: true, amountWT: true, status: true, createdAt: true },
      })

      return wd
    })

    return ok({ withdrawal: out })
  } catch (e: any) {
    const msg = String(e?.message || e)
    if (msg === 'INSUFFICIENT_FUNDS') return bad(400, msg)
    if (msg === 'USER_NOT_FOUND') return bad(404, msg)
    console.error('[withdrawals/request] error', e)
    return bad(500, 'SERVER_ERROR')
  }
}