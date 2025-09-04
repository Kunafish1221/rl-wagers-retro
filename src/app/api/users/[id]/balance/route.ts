// src/app/api/users/[id]/balance/route.ts
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

const WT_PER_USD = 10 // 10 WT = $1

export async function GET(
  req: NextRequest,
  context: { params: Promise<{ id: string }> } // typed-routes Promise form
) {
  try {
    const { id: userId } = await context.params

    // Auth: only allow reading your own balance
    const gate = await requireSession(req)
    if (!gate.ok) return gate.response
    const { session } = gate
    if (session.userId !== userId) return bad(403, 'FORBIDDEN')

    // Fetch user (exists + handle + mirror wallet)
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, handle: true, availableWT: true, lockedWT: true },
    })
    if (!user) return bad(404, 'USER_NOT_FOUND')

    // Ledger is source of truth; fallback to mirror if ledger row not created yet
    const acct = await prisma.ledgerAccount.findUnique({
      where: { userId },
      select: { available: true, locked: true },
    })

    const useLedger = typeof acct?.available === 'number' && typeof acct?.locked === 'number'
    const availableWT = useLedger ? acct!.available : (user.availableWT ?? 0)
    const lockedWT    = useLedger ? acct!.locked    : (user.lockedWT ?? 0)

    const toUSD = (wt: number) => Math.round((wt / WT_PER_USD) * 100) / 100 // 2-dp without float noise

    return noStore({
      ok: true,
      user: { id: user.id, handle: user.handle },
      balance: {
        availableWT,
        lockedWT,
        availableUSD: toUSD(availableWT),
        lockedUSD: toUSD(lockedWT),
        source: useLedger ? 'ledger' : 'mirror',
      },
    })
  } catch (e) {
    console.error('[balance.GET]', e)
    return bad(500, 'SERVER_ERROR')
  }
}