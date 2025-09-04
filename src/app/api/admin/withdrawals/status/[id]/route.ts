import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/app/server/prisma'
import { requireSession } from '@/app/server/session'
import { requireOwner } from '@/app/server/roles'

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

export async function GET(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  const gate = await requireSession(req)
  if (!gate.ok) return gate.response
  const { session } = gate
  const me = (session as any).userId ?? session.userId

  try {
    const { id } = await ctx.params

    const wd = await prisma.withdrawal.findUnique({
      where: { id },
      select: {
        id: true,
        userId: true,
        provider: true,
        address: true,
        amountWT: true,
        status: true,
        txHash: true,
        createdAt: true,
      },
    })
    if (!wd) return bad(404, 'NOT_FOUND')

    // Allow owner to view any; otherwise enforce ownership
    const ownerGate = await requireOwner(req)
    const isOwner = ownerGate.ok ? ownerGate.user.isOwner : false
    if (!isOwner && wd.userId !== me) return bad(403, 'FORBIDDEN')

    return ok({ withdrawal: wd })
  } catch (e) {
    console.error('[withdrawals/status] error', e)
    return bad(500, 'SERVER_ERROR')
  }
}