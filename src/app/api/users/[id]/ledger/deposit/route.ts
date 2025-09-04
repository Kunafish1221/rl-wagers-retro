import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/app/server/prisma'

type Body = { amountWT: number; note?: string }

function toUSD(wt: number) {
  // 1 USD = 10 WT
  return Math.round((wt / 10) * 100) / 100
}

export async function POST(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id: userId } = await context.params
    const { amountWT, note } = (await req.json()) as Partial<Body>

    // basic validation
    if (typeof amountWT !== 'number' || !Number.isInteger(amountWT) || amountWT <= 0) {
      return NextResponse.json({ error: 'amountWT must be a positive integer (WT units)' }, { status: 400 })
    }

    // ensure the user exists
    const user = await prisma.user.findUnique({ where: { id: userId }, select: { id: true } })
    if (!user) return NextResponse.json({ error: 'USER_NOT_FOUND' }, { status: 404 })

    // ensure a ledger account exists, then credit available
    const acct = await prisma.$transaction(async (tx) => {
      // create account if missing
      await tx.ledgerAccount.upsert({
        where: { userId },
        update: {},
        create: { userId, available: 0, locked: 0 },
      })

      // credit available balance
      const updated = await tx.ledgerAccount.update({
        where: { userId },
        data: { available: { increment: amountWT } },
        select: { userId: true, available: true, locked: true },
      })

      // try to record a ledger entry (schema may vary in your project)
      try {
        await (tx as any).ledgerEntry.create({
          data: {
            userId,
            delta: amountWT,            // +credit in WT
            kind: 'DEPOSIT',            // free-form string in your schema
            note: note ?? 'DEV_DEPOSIT',
          },
        })
      } catch {
        // if your schema doesn't include LedgerEntry or field names differ, skip silently
      }

      return updated
    })

    return NextResponse.json({
      ok: true,
      userId: acct.userId,
      availableWT: acct.available,
      lockedWT: acct.locked,
      availableUSD: toUSD(acct.available),
      lockedUSD: toUSD(acct.locked),
      creditedWT: amountWT,
      creditedUSD: toUSD(amountWT),
    })
  } catch (e: any) {
    console.error('[deposit.POST]', e)
    return NextResponse.json({ error: e?.message ?? 'Server error' }, { status: 500 })
  }
}