// src/app/api/withdrawals/self/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/app/server/prisma'
import { requireSession } from '@/app/server/session'
import { PublicKey } from '@solana/web3.js'
import type { DepositProvider } from '@prisma/client'

type Body = {
  provider?: DepositProvider | 'solflare' | 'coinbase'
  address?: string            // destination address (Solana pubkey)
  amountWT?: number           // prefer WT
  amountUSD?: number          // or USD (10 WT = $1)
  note?: string | null
}

function bad(status: number, msg: string) {
  return NextResponse.json({ ok: false, error: msg }, { status })
}

const ALLOWED_PROVIDERS = new Set<DepositProvider>(['solflare', 'coinbase'])
const MIN_WITHDRAW_WT = 100 // $10

export async function POST(req: NextRequest) {
  // ---- Auth ----
  const gate = await requireSession(req)
  if (!gate.ok) return gate.response
  const { session } = gate
  const userId = session.userId

  // ---- Parse ----
  const body = (await req.json().catch(() => ({}))) as Body
  const provider = (body.provider ?? 'solflare') as DepositProvider
  const rawAddress = (body.address ?? '').trim()

  // ---- Validate inputs ----
  if (!ALLOWED_PROVIDERS.has(provider)) return bad(400, 'Invalid provider')
  if (!rawAddress) return bad(400, 'address is required')

  // Strong Solana address check
  try { new PublicKey(rawAddress) } catch { return bad(400, 'Invalid Solana address') }

  // Amount: prefer WT, else derive from USD (10 WT = $1)
  let amountWT: number | undefined
  if (typeof body.amountWT === 'number') {
    amountWT = Math.floor(body.amountWT)
  } else if (typeof body.amountUSD === 'number') {
    amountWT = Math.floor(body.amountUSD * 10)
  }
  if (!amountWT || !Number.isFinite(amountWT) || amountWT <= 0) {
    return bad(400, 'amountWT (or amountUSD) must be a positive number')
  }
  if (amountWT < MIN_WITHDRAW_WT) {
    return bad(400, `Minimum withdrawal is ${MIN_WITHDRAW_WT} WT ($${(MIN_WITHDRAW_WT / 10).toFixed(0)})`)
  }

  try {
    const result = await prisma.$transaction(async (tx) => {
      // Funds check
      const user = await tx.user.findUnique({
        where: { id: userId },
        select: { availableWT: true, lockedWT: true },
      })
      if (!user) throw new Error('USER_NOT_FOUND')
      if (user.availableWT < amountWT!) throw new Error('INSUFFICIENT_FUNDS')

      // Create withdrawal (instant/self-service -> PAID)
      const withdrawal = await tx.withdrawal.create({
        data: {
          userId,
          provider,
          address: rawAddress,
          amountWT: amountWT!,
          status: 'PAID',
          txHash: `self_${Date.now()}_${Math.random().toString(36).slice(2)}`, // optional tracking
        },
        select: {
          id: true, userId: true, provider: true, address: true,
          amountWT: true, status: true, txHash: true, createdAt: true,
        },
      })

      // Debit user wallet
      const updatedUser = await tx.user.update({
        where: { id: userId },
        data: { availableWT: { decrement: amountWT! } },
        select: { availableWT: true, lockedWT: true },
      })

      // Ledger account + entry
      await tx.ledgerAccount.upsert({
        where: { userId },
        update: { available: { decrement: amountWT! } },
        // If it doesn't exist yet, start it with the debit applied
        create: { userId, available: 0 - amountWT!, locked: 0 },
      })
      await tx.ledgerEntry.create({
        data: {
          userId,
          delta: -amountWT!,
          kind: 'WITHDRAWAL',
          refId: withdrawal.id,
          meta: { provider, address: rawAddress, note: body.note ?? null },
        },
      })

      return { withdrawal, updatedUser }
    })

    return NextResponse.json({
      ok: true,
      withdrawal: result.withdrawal,
      wallet: {
        availableWT: result.updatedUser.availableWT,
        lockedWT: result.updatedUser.lockedWT,
      },
    })
  } catch (e: any) {
    const msg = String(e?.message || e)
    if (msg === 'USER_NOT_FOUND') return bad(404, 'User not found')
    if (msg === 'INSUFFICIENT_FUNDS') return bad(400, 'Insufficient funds')
    console.error('WITHDRAW_SELF_ERR', e)
    return bad(500, 'Withdrawal failed')
  }
}