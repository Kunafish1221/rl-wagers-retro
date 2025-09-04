// src/app/api/deposits/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/app/server/prisma'
import { DEPOSIT_ADDRESS } from '@/app/server/solana'
import { DepositProvider } from '@prisma/client' // 👈 import the enum here

export const dynamic = 'force-dynamic'
export const revalidate = 0

function noStore(json: any, init?: number | ResponseInit) {
  const base: ResponseInit = typeof init === 'number' ? { status: init } : init || {}
  return NextResponse.json(json, { ...base, headers: { ...(base.headers || {}), 'Cache-Control': 'no-store' } })
}
const bad = (s: number, m: string) => noStore({ ok: false, error: m }, s)

// Normalize provider string → Prisma enum (solflare|coinbase in your schema)
function normalizeProvider(v: unknown): DepositProvider {
  const str = String(v || '').toLowerCase()
  if (str.includes('solflare')) return DepositProvider.solflare
  return DepositProvider.coinbase
}

// WT → micro-USDC (1 USDC = 10 WT; 1 USDC = 1_000_000 micro)
function wtToMicros(wt: number): number {
  return Math.floor((wt / 10) * 1_000_000)
}

/**
 * POST /api/deposits
 * Body: {
 *   userId: string,
 *   provider: 'solflare' | 'coinbase',
 *   txHash: string,
 *   amountWT?: number,
 *   fromAddr?: string
 * }
 */
export async function POST(req: NextRequest) {
  let body: any = {}
  try {
    body = await req.json().catch(() => ({}))
    const userId = String(body.userId ?? '')
    const provider = normalizeProvider(body.provider)
    const txHash = String(body.txHash ?? '').trim()
    const amountWTRaw = body.amountWT
    const fromAddr = typeof body.fromAddr === 'string' ? body.fromAddr.trim() : ''

    if (!userId) return bad(400, 'MISSING_USER_ID')
    if (!txHash) return bad(400, 'MISSING_TX_HASH')

    const user = await prisma.user.findUnique({ where: { id: userId } })
    if (!user) return bad(404, 'USER_NOT_FOUND')

    // Idempotent on txHash
    const existing = await prisma.deposit.findUnique({ where: { txHash } })
    if (existing) {
      const fresh = await prisma.user.findUnique({ where: { id: userId } })
      return noStore({
        ok: true,
        idempotent: true,
        deposit: existing,
        balances: { availableWT: fresh?.availableWT ?? 0, lockedWT: fresh?.lockedWT ?? 0 },
      })
    }

    const amountWT =
      typeof amountWTRaw === 'number' && Number.isFinite(amountWTRaw) && Number.isInteger(amountWTRaw) && amountWTRaw > 0
        ? amountWTRaw
        : 0

    const toAddr = DEPOSIT_ADDRESS.toBase58()
    const amountUSDC = wtToMicros(amountWT) // micro-USDC

    const result = await prisma.$transaction(async (txdb) => {
      const deposit = await txdb.deposit.create({
        data: {
          userId,
          provider,          // 👈 correct enum type
          txHash,
          fromAddr,          // '' if unknown
          toAddr,
          amountUSDC,        // micro-USDC
          amountWT,
          status: 'CREDITED',
        },
        select: {
          id: true,
          userId: true,
          provider: true,
          txHash: true,
          fromAddr: true,
          toAddr: true,
          amountUSDC: true,
          amountWT: true,
          status: true,
          createdAt: true,
        },
      })

      let balances = { availableWT: user.availableWT, lockedWT: user.lockedWT }
      if (amountWT > 0) {
        balances = await txdb.user.update({
          where: { id: userId },
          data: { availableWT: { increment: amountWT } },
          select: { availableWT: true, lockedWT: true },
        })
      }

      return { deposit, balances }
    })

    return noStore({ ok: true, ...result })
  } catch (err: any) {
    if (err?.code === 'P2002') {
      const txHash = String(body?.txHash ?? '').trim()
      const dep = txHash ? await prisma.deposit.findUnique({ where: { txHash } }) : null
      const uid = dep?.userId
      const fresh = uid ? await prisma.user.findUnique({ where: { id: uid } }) : null
      return noStore({
        ok: true,
        idempotent: true,
        deposit: dep,
        balances: { availableWT: fresh?.availableWT ?? 0, lockedWT: fresh?.lockedWT ?? 0 },
      })
    }

    console.error('DEPOSIT_ERROR', err)
    return bad(500, 'INTERNAL_ERROR')
  }
}