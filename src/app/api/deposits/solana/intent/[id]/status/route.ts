// src/app/api/deposits/solana/intent/[id]/status/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/app/server/prisma'
import { getSession } from '@/app/server/session'
import { PublicKey } from '@solana/web3.js'
import { centsToUsdcMinor, DEPOSIT_ADDRESS, USDC_MINT, getConnection } from '@/app/server/solana'

function bad(status: number, msg: string) {
  return NextResponse.json({ ok: false, error: msg }, { status })
}

// --- BigInt helper (avoids `0n`, `1n`, etc.) ---
const BI = (v: number | string | bigint) => BigInt(v)

export async function GET(req: NextRequest, ctx: { params: { id: string } }) {
  try {
    const s = await getSession(req)
    if (!s) return bad(401, 'Unauthorized')

    const intent = await prisma.depositIntent.findUnique({
      where: { id: ctx.params.id },
      include: { user: true, deposit: true },
    })
    if (!intent) return bad(404, 'Intent not found')
    if (intent.userId !== s.user.id) return bad(403, 'Forbidden')

    // Already credited?
    if (intent.status === 'CREDITED') {
      // return balances too
      const user = await prisma.user.findUnique({ where: { id: s.user.id }, select: { availableWT: true, lockedWT: true } })
      return NextResponse.json({
        ok: true,
        status: 'CREDITED',
        txHash: intent.txHash,
        wallet: { availableWT: user?.availableWT ?? 0, lockedWT: user?.lockedWT ?? 0 },
      })
    }

    // Expired?
    const now = Date.now()
    if (intent.status === 'PENDING' && intent.expiresAt.getTime() < now) {
      await prisma.depositIntent.update({ where: { id: intent.id }, data: { status: 'EXPIRED' } })
      return NextResponse.json({ ok: true, status: 'EXPIRED' })
    }

    // If still pending → check chain using Solana Pay reference
    const connection = getConnection()
    const referenceKey = new PublicKey(intent.reference)

    // If the payer included the reference key in their tx, signatures will index by reference
    const sigs = await connection.getSignaturesForAddress(referenceKey, { limit: 1 })
    if (!sigs.length) {
      return NextResponse.json({ ok: true, status: 'PENDING' })
    }

    const sig = sigs[0].signature
    const tx = await connection.getTransaction(sig, {
      commitment: 'confirmed',
      maxSupportedTransactionVersion: 1,
    })

    if (!tx || !tx.meta) {
      // not available yet, keep polling
      return NextResponse.json({ ok: true, status: 'PENDING' })
    }

    // Verify USDC to your DEPOSIT_ADDRESS with expected amount
    // We compare pre/post token balances for owner=DEPOSIT_ADDRESS and mint=USDC_MINT
    const pre = tx.meta.preTokenBalances ?? []
    const post = tx.meta.postTokenBalances ?? []
    const expectedDelta = centsToUsdcMinor(intent.amountUSD) // micro USDC (bigint)
    let delta = BI(0)

    // Map accountIndex -> { pre, post } for the owner we're tracking
    const byIndex = new Map<number, { pre: string, post: string, owner?: string, mint?: string }>()
    for (const b of pre) {
      byIndex.set(b.accountIndex, {
        pre: b.uiTokenAmount?.amount ?? '0',
        post: '0',
        owner: b.owner,
        mint: b.mint,
      })
    }
    for (const b of post) {
      const prev = byIndex.get(b.accountIndex) ?? { pre: '0' }
      byIndex.set(b.accountIndex, {
        pre: prev.pre,
        post: b.uiTokenAmount?.amount ?? '0',
        owner: b.owner,
        mint: b.mint,
      })
    }

    for (const [, v] of byIndex) {
      if (v.owner === DEPOSIT_ADDRESS.toBase58() && v.mint === USDC_MINT.toBase58()) {
        // amount fields are string integers of micro-USDC (10^6)
        const preAmt = BigInt(v.pre || '0')
        const postAmt = BigInt(v.post || '0')
        const d = postAmt - preAmt
        if (d > BI(0)) delta += d
      }
    }

    if (delta < expectedDelta) {
      // We saw a tx referencing this intent, but not (yet) the full expected amount.
      // Keep polling.
      return NextResponse.json({ ok: true, status: 'PENDING' })
    }

    // Idempotency: if another poll already credited using this sig, just echo
    const existing = await prisma.deposit.findUnique({ where: { txHash: sig } })
    if (existing) {
      await prisma.depositIntent.update({
        where: { id: intent.id },
        data: { status: 'CREDITED', txHash: sig, creditedDepositId: existing.id },
      })
      const userNow = await prisma.user.findUnique({ where: { id: s.user.id }, select: { availableWT: true, lockedWT: true } })
      return NextResponse.json({
        ok: true,
        status: 'CREDITED',
        txHash: sig,
        wallet: { availableWT: userNow?.availableWT ?? 0, lockedWT: userNow?.lockedWT ?? 0 },
      })
    }

    // Credit WT and record deposit atomically
    const amountWT = intent.amountWT

    const [userAfter, dep] = await prisma.$transaction([
      prisma.user.update({
        where: { id: s.user.id },
        data: { availableWT: { increment: amountWT } },
        select: { availableWT: true, lockedWT: true },
      }),
      prisma.deposit.create({
        data: {
          userId: s.user.id,
          provider: 'solflare', // label not known from chain; choose a default or store in intent.meta
          txHash: sig,
          amountWT: amountWT,
          status: 'CREDITED',
        },
        select: { id: true },
      }),
    ])

    await prisma.$transaction([
      prisma.ledgerEntry.create({
        data: {
          userId: s.user.id,
          delta: amountWT,
          kind: 'DEPOSIT',
          refId: intent.id,
          meta: { txHash: sig, reference: intent.reference, usdcMinor: delta.toString() },
        },
      }),
      prisma.depositIntent.update({
        where: { id: intent.id },
        data: { status: 'CREDITED', txHash: sig, creditedDepositId: dep.id },
      }),
    ])

    return NextResponse.json({
      ok: true,
      status: 'CREDITED',
      txHash: sig,
      wallet: { availableWT: userAfter.availableWT, lockedWT: userAfter.lockedWT },
    })
  } catch (e: any) {
    console.error('INTENT_STATUS_ERROR', e)
    return bad(500, 'INTENT_STATUS_ERROR')
  }
}