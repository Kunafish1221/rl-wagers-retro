// src/app/api/withdrawals/[id]/route.ts
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
 * GET /api/withdrawals/:id
 * Returns status for the owner.
 */
export async function GET(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  try {
    const gate = await requireSession(req)
    if (!gate.ok) return gate.response
    const { session } = gate

    const { id } = await ctx.params
    const wd = await prisma.withdrawal.findUnique({
      where: { id },
      select: {
        id: true, userId: true, provider: true, address: true,
        amountWT: true, status: true, txHash: true, createdAt: true,
      },
    })
    if (!wd) return bad(404, 'NOT_FOUND')
    if (wd.userId !== session.userId) return bad(403, 'FORBIDDEN')

    return noStore({ ok: true, withdrawal: wd })
  } catch (e) {
    console.error('WITHDRAW_STATUS_ERR', e)
    return bad(500, 'STATUS_FAILED')
  }
}