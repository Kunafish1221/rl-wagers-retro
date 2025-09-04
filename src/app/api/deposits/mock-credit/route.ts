// src/app/api/deposits/mock-credit/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/app/server/prisma'
import { requireSession } from '@/app/server/session'
import type { DepositProvider } from '@prisma/client'

type Body = {
  provider?: DepositProvider | 'solflare' | 'coinbase'
  amountUSD?: number        // e.g. 5 => 50 WT (10 WT = $1)
  amountWT?: number         // alternative: send WT directly
  note?: string | null
}

function bad(status: number, msg: string) {
  return NextResponse.json({ error: msg }, { status })
}

/**
 * DEV ONLY — instantly credits a deposit.
 * - 10 WT = $1
 * - Creates Deposit row (status=CREDITED)
 * - Increments User.availableWT
 * - Upserts LedgerAccount, creates LedgerEntry(kind='DEPOSIT')
 */
export async function POST(req: NextRequest) {
  // Auth gate
  const gate = await requireSession(req)
  if (!gate.ok) return gate.response
  const { session } = gate
  const userId = session.userId

  // Parse & normalize body
  const body = (await req.json().catch(() => ({}))) as Body
  const provider = (body.provider === 'coinbase' ? 'coinbase' : 'solflare') as DepositProvider

  let amountWT: number | undefined
  if (typeof body.amountWT === 'number' && Number.isFinite(body.amountWT)) {
    amountWT = Math.floor(body.amountWT)
  } else if (typeof body.amountUSD === 'number' && Number.isFinite(body.amountUSD)) {
    amountWT = Math.floor(body.amountUSD * 10) // 10 WT = $1
  }

  if (!amountWT || amountWT <= 0) {
    return bad(400, 'Provide a positive amountUSD or amountWT')
  }

  const txHash = `dev_${Date.now()}_${Math.random().toString(36).slice(2)}`

  try {
    const result = await prisma.$transaction(async (tx) => {
      // ensure user exists
      const user = await tx.user.findUnique({ where: { id: userId }, select: { id: true } })
      if (!user) throw new Error('USER_NOT_FOUND')

      // create Deposit (status CREDITED)
      const deposit = await tx.deposit.create({
        data: {
          userId,
          provider,
          txHash,
          amountWT,
          status: 'CREDITED',
        },
        select: {
          id: true, userId: true, provider: true, txHash: true, amountWT: true, status: true, createdAt: true,
        },
      })

      // increment simple wallet on User
      const updatedUser = await tx.user.update({
        where: { id: userId },
        data: { availableWT: { increment: amountWT } },
        select: { id: true, availableWT: true, lockedWT: true },
      })

      // upsert ledger account & entry
      await tx.ledgerAccount.upsert({
        where: { userId },
        update: { available: { increment: amountWT } },
        create: { userId, available: amountWT, locked: 0 },
      })

      await tx.ledgerEntry.create({
        data: {
          userId,
          delta: amountWT,
          kind: 'DEPOSIT',
          refId: deposit.id,
          meta: { provider, amountUSD: body.amountUSD ?? null, note: body.note ?? null },
        },
      })

      return { deposit, updatedUser }
    })

    return NextResponse.json({
      ok: true,
      deposit: result.deposit,
      wallet: {
        availableWT: result.updatedUser.availableWT,
        lockedWT: result.updatedUser.lockedWT,
      },
    })
  } catch (e: any) {
    if (e?.message === 'USER_NOT_FOUND') return bad(404, 'User not found')
    console.error('DEPOSIT_MOCK_ERR', e)
    return bad(500, 'Deposit failed')
  }
}