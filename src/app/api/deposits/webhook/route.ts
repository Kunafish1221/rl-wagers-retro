// src/app/api/deposits/webhook/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/app/server/prisma'
import { DepositProvider } from '@prisma/client'

export const dynamic = 'force-dynamic'
export const revalidate = 0

function noStore(json: any, init?: number | ResponseInit) {
  const base: ResponseInit = typeof init === 'number' ? { status: init } : init || {}
  return NextResponse.json(json, { ...base, headers: { ...(base.headers || {}), 'Cache-Control': 'no-store' } })
}
const bad = (s: number, m: string, detail?: any) => noStore({ ok: false, error: m, detail }, s)

function toPlainObject(v: unknown): Record<string, any> {
  return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, any>) : {}
}

function normalizeProvider(v: unknown): DepositProvider | null {
  const s = String(v ?? '').toLowerCase()
  if (s === 'solflare') return DepositProvider.solflare
  if (s === 'coinbase') return DepositProvider.coinbase
  if (s === 'phantom') return DepositProvider.phantom
  if (s === 'other') return DepositProvider.other
  return null
}

// 1 USDC = 1_000_000 micro-USDC; 1 USDC = 10 WT  →  1 WT = 100_000 micro-USDC
const MICRO_PER_USDC = 1_000_000
const MICRO_PER_WT = 100_000
const WT_PER_USDC = 10

/**
 * Expected JSON body:
 * {
 *   reference: string,                // required: DepositIntent.reference
 *   txHash: string,                   // required: unique on-chain/processor id
 *   provider: 'solflare'|'coinbase'|'phantom'|'other',
 *   fromAddr: string,                 // required: on-chain sender
 *   toAddr: string,                   // required: must be your DEPOSIT_ADDRESS
 *   amountUSDC: number,               // required: micro-USDC integer
 *   overrideExpired?: boolean,        // optional
 *   overrideAmount?: boolean,         // optional: allow credit even if amount differs from intent
 *   meta?: any                        // optional: extra details
 * }
 *
 * Auth header:
 *   x-webhook-secret: <DEPOSIT_WEBHOOK_SECRET>
 */
export async function POST(req: NextRequest) {
  try {
    const secret = process.env.DEPOSIT_WEBHOOK_SECRET
    if (!secret) return bad(500, 'WEBHOOK_SECRET_UNSET')

    const got = req.headers.get('x-webhook-secret')
    if (!got || got !== secret) return bad(401, 'UNAUTHORIZED_WEBHOOK')

    const body = await req.json().catch(() => ({} as any))
    const reference = String(body?.reference || '').trim()
    const txHash = String(body?.txHash || '').trim()
    const providerEnum = normalizeProvider(body?.provider)
    const fromAddr = String(body?.fromAddr || '').trim()
    const toAddr = String(body?.toAddr || '').trim()
    const amountUSDC = Number.isFinite(body?.amountUSDC) ? Math.trunc(body.amountUSDC) : NaN
    const overrideExpired = Boolean(body?.overrideExpired)
    const overrideAmount = Boolean(body?.overrideAmount)
    const extraMeta = body?.meta ?? null

    if (!reference || !txHash || !providerEnum) return bad(400, 'reference, txHash, provider are required')
    if (!fromAddr || fromAddr.length < 20) return bad(400, 'Invalid fromAddr')
    if (!toAddr || toAddr.length < 20) return bad(400, 'Invalid toAddr')
    if (!Number.isFinite(amountUSDC) || amountUSDC <= 0) return bad(400, 'Invalid amountUSDC (micro)')

    // Idempotency on txHash
    const existingDeposit = await prisma.deposit.findUnique({ where: { txHash } })
    if (existingDeposit) {
      const intentLink = await prisma.depositIntent.findFirst({
        where: { creditedDepositId: existingDeposit.id },
        select: { id: true, reference: true, status: true },
      })
      return noStore({ ok: true, idempotent: true, deposit: existingDeposit, intent: intentLink ?? null })
    }

    // Load intent by reference
    const intent = await prisma.depositIntent.findUnique({
      where: { reference },
      include: { user: { select: { id: true } } },
    })
    if (!intent) return bad(404, 'INTENT_NOT_FOUND')

    // Already credited?
    if (intent.status === 'CREDITED' && intent.creditedDepositId) {
      const dep = await prisma.deposit.findUnique({ where: { id: intent.creditedDepositId } })
      return noStore({
        ok: true,
        idempotent: true,
        deposit: dep,
        intent: { id: intent.id, reference: intent.reference, status: intent.status },
      })
    }

    // TTL check
    const now = new Date()
    if (!overrideExpired && intent.expiresAt <= now) return bad(409, 'INTENT_EXPIRED')

    // Derive WT from actual paid micro-USDC
    const creditedWT = Math.floor(amountUSDC / MICRO_PER_WT) // conservative: floor to whole WT
    if (creditedWT <= 0) return bad(400, 'Amount too small to credit WT')

    // Compare to requested intent
    const diffWT = creditedWT - intent.amountWT
    const mismatch = Math.abs(diffWT) > 1 // allow ±1 WT tolerance
    if (mismatch && !overrideAmount) {
      return bad(422, 'AMOUNT_MISMATCH', {
        intentWT: intent.amountWT,
        paidMicros: amountUSDC,
        creditedWT,
        diffWT,
      })
    }

    // Atomic credit
    const result = await prisma.$transaction(async (tx) => {
      // Create the deposit record with full on-chain snapshot
      const deposit = await tx.deposit.create({
        data: {
          userId: intent.userId,
          provider: providerEnum,
          txHash,
          fromAddr,
          toAddr,
          amountUSDC,                 // micro-USDC actually received
          amountWT: creditedWT,       // WT snapshot credited
          status: 'CREDITED',
        },
      })

      // Update ledger source of truth
      const acct = await tx.ledgerAccount.upsert({
        where: { userId: intent.userId },
        create: { userId: intent.userId, available: creditedWT, locked: 0 },
        update: { available: { increment: creditedWT } },
        select: { available: true, locked: true },
      })

      // Mirror simple wallet fields
      const userAfter = await tx.user.update({
        where: { id: intent.userId },
        data: { availableWT: { increment: creditedWT } },
        select: { availableWT: true, lockedWT: true },
      })

      // Audit entry
      await tx.ledgerEntry.create({
        data: {
          userId: intent.userId,
          delta: creditedWT,
          kind: 'DEPOSIT',
          refId: deposit.id,
          meta: {
            reference: intent.reference,
            intentId: intent.id,
            provider: providerEnum,
            txHash,
            fromAddr,
            toAddr,
            amountUSDC,
            creditedWT,
            intentWT: intent.amountWT,
            diffWT,
            after: { available: acct.available, locked: acct.locked },
            extra: extraMeta ?? null,
          },
        },
      })

      // Merge meta & mark intent credited
      const webhookMeta = {
        ...toPlainObject(intent.meta),
        webhook: {
          provider: providerEnum,
          txHash,
          fromAddr,
          toAddr,
          amountUSDC,
          creditedWT,
          at: now.toISOString(),
          extra: extraMeta ?? null,
        },
      }

      const updatedIntent = await tx.depositIntent.update({
        where: { id: intent.id },
        data: {
          status: 'CREDITED',
          creditedDepositId: deposit.id,
          txHash,
          meta: webhookMeta,
        },
        select: { id: true, reference: true, status: true, creditedDepositId: true },
      })

      return { deposit, intent: updatedIntent, wallet: userAfter }
    })

    return noStore({ ok: true, ...result })
  } catch (e) {
    console.error('DEPOSITS_WEBHOOK_ERR', e)
    return bad(500, 'WEBHOOK_FAILED')
  }
}