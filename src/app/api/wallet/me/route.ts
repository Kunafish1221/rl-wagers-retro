// src/app/api/wallet/me/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { requireSession } from '@/app/server/session'
import { prisma } from '@/app/server/prisma'

export async function GET(req: NextRequest) {
  // Auth
  const gate = await requireSession(req)
  if (!gate.ok) return gate.response
  const { session } = gate

  // Prefer ledger (source of truth), fallback to simple User fields
  const [user, acct] = await Promise.all([
    prisma.user.findUnique({
      where: { id: session.userId },
      select: { id: true, availableWT: true, lockedWT: true },
    }),
    prisma.ledgerAccount.findUnique({
      where: { userId: session.userId },
      select: { available: true, locked: true },
    }),
  ])

  if (!user) {
    return NextResponse.json(
      { ok: false, error: 'User not found' },
      { status: 404, headers: { 'Cache-Control': 'no-store' } }
    )
  }

  const availableWT = typeof acct?.available === 'number' ? acct.available : (user.availableWT ?? 0)
  const lockedWT    = typeof acct?.locked === 'number'    ? acct.locked    : (user.lockedWT ?? 0)

  // 10 WT = $1
  const toUSD = (wt: number) => Number((wt / 10).toFixed(2))

  return NextResponse.json(
    {
      ok: true,
      wallet: {
        availableWT,
        lockedWT,
        availableUSD: toUSD(availableWT),
        lockedUSD: toUSD(lockedWT),
      },
    },
    { headers: { 'Cache-Control': 'no-store' } }
  )
}