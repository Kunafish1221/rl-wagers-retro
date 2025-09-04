// src/app/api/withdrawals/status/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/app/server/prisma'
import { requireSession } from '@/app/server/session'

export const dynamic = 'force-dynamic'
export const revalidate = 0

function noStore(json: any, init?: number | ResponseInit) {
  const base: ResponseInit = typeof init === 'number' ? { status: init } : init || {}
  return NextResponse.json(json, { ...base, headers: { ...(base.headers || {}), 'Cache-Control': 'no-store' } })
}
const bad = (s: number, m: string) => noStore({ ok: false, error: m }, s)

export async function GET(req: NextRequest) {
  const gate = await requireSession(req)
  if (!gate.ok) return gate.response

  const { searchParams } = new URL(req.url)
  const id = searchParams.get('id') || ''
  if (!id) return bad(400, 'id required')

  const wd = await prisma.withdrawal.findFirst({
    where: { id, userId: gate.session.userId },
    select: {
      id: true,
      userId: true,
      provider: true,
      address: true,
      amountWT: true,
      amountUSDC: true,
      status: true,
      txHash: true,     // ✅ correct field name
      createdAt: true,
    },
  })

  if (!wd) return bad(404, 'Not found')

  return noStore({ ok: true, withdrawal: wd })
}