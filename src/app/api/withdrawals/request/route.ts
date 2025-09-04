import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/app/server/prisma'
import { requireSession } from '@/app/server/session'
import { DepositProvider } from '@prisma/client'

export const dynamic = 'force-dynamic'
export const revalidate = 0

function noStore(json: any, init?: number | ResponseInit) {
  const base: ResponseInit = typeof init === 'number' ? { status: init } : init || {}
  return NextResponse.json(json, { ...base, headers: { ...(base.headers || {}), 'Cache-Control': 'no-store' } })
}
const bad = (s: number, m: string, detail?: any) => noStore({ ok: false, error: m, detail }, s)

// Normalize provider input → enum
function normalizeProvider(v: unknown): DepositProvider | null {
  const s = String(v ?? '').toLowerCase()
  if (s === 'solflare') return DepositProvider.solflare
  if (s === 'coinbase') return DepositProvider.coinbase
  if (s === 'phantom') return DepositProvider.phantom
  if (s === 'other') return DepositProvider.other
  return null
}

// WT → micro-USDC (1 USDC = 10 WT; 1 USDC = 1_000_000 micro)
function wtToMicros(wt: number): number {
  return Math.floor((wt / 10) * 1_000_000) // 1 WT = 100,000 micro-USDC
}

type Body = {
  provider: 'solflare' | 'coinbase' | 'phantom' | 'other'
  address: string
  amountWT: number
  note?: string
}

export async function POST(req: NextRequest) {
  try {
    const gate = await requireSession(req)
    if (!gate.ok) return gate.response
    const { session } = gate
    const userId = session.user.id // ← use the same shape as your other routes

    const body = (await req.json().catch(() => ({}))) as Partial<Body>
    const provider = normalizeProvider(body?.provider)
    const address = String(body?.address || '').trim()
    const amountWT = Math.floor(Number(body?.amountWT ?? 0))
    const note = (body?.note ?? '').toString().trim() || undefined

    if (!provider) return bad(400, 'Invalid provider')
    if (!address || address.length < 20) return bad(400, 'Invalid address')
    if (!Number.isFinite(amountWT) || amountWT <= 0) return bad(400, 'Amount must be a positive integer WT')

    const amountUSDC = wtToMicros(amountWT) // micro-USDC snapshot

    const result = await prisma.$transaction(async (tx) => {
      // Prefer ledger account if present; fall back to User.availableWT
      const [acct, user] = await Promise.all([
        tx.ledgerAccount.findUnique({ where: { userId }, select: { available: true, locked: true } }),
        tx.user.findUnique({ where: { id: userId }, select: { availableWT: true } }),
      ])
      const available = (acct?.available ?? 0) || user?.availableWT || 0
      if (amountWT > available) throw new Error('INSUFFICIENT_FUNDS')

      // 1) Deduct immediately (instant payout semantics)
      const userAfter = await tx.user.update({
        where: { id: userId },
        data: { availableWT: { decrement: amountWT } },
        select: { availableWT: true, lockedWT: true },
      })

      // Keep ledger account in sync if it exists (no locking, just decrement available)
      if (acct) {
        await tx.ledgerAccount.update({
          where: { userId },
          data: { available: { decrement: amountWT } },
        })
      }

      // 2) Audit entry
      await tx.ledgerEntry.create({
        data: {
          userId,
          delta: -amountWT,
          kind: 'WITHDRAWAL',
          refId: undefined,
          meta: { provider, address, note, amountUSDC },
        },
      })

      // 3) Create the Withdrawal as PAID (instant)
      const wd = await tx.withdrawal.create({
        data: {
          userId,
          provider,
          address,
          amountWT,
          amountUSDC,
          status: 'PAID', // explicit (matches your default)
          txHash: null,   // fill later if/when you broadcast on-chain
        },
        select: {
          id: true, userId: true, provider: true, address: true,
          amountWT: true, amountUSDC: true, status: true, txHash: true, createdAt: true,
        },
      })

      return { withdrawal: wd, wallet: userAfter }
    })

    return noStore({ ok: true, ...result })
  } catch (e: any) {
    if (e?.message === 'INSUFFICIENT_FUNDS') {
      return bad(409, 'INSUFFICIENT_FUNDS')
    }
    console.error('WITHDRAW_INSTANT_ERR', e)
    return bad(500, 'REQUEST_FAILED')
  }
}