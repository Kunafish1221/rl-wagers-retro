// src/app/api/deposits/initiate/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/app/server/prisma'
import { requireSession } from '@/app/server/session'
import {
  buildSolanaPayUrl,
  DEPOSIT_ADDRESS,
  USDC_MINT,
} from '@/app/server/solana'
import { PublicKey, Keypair } from '@solana/web3.js'

export const dynamic = 'force-dynamic'
export const revalidate = 0

const WT_PER_USD = 10         // 1 USD = 10 WT
const DEFAULT_TTL_MIN = 15    // minutes
const MIN_USD = 1             // $1 min for sanity
const MAX_USD = 5_000         // $5k per intent (tune later)

function bad(status: number, msg: string) {
  return NextResponse.json({ ok: false, error: msg }, { status, headers: { 'Cache-Control': 'no-store' } })
}

function noStore(json: any, init?: number | ResponseInit) {
  const base: ResponseInit = typeof init === 'number' ? { status: init } : init || {}
  return NextResponse.json(json, { ...base, headers: { ...(base.headers || {}), 'Cache-Control': 'no-store' } })
}

function dollarsToCents(v: number) {
  // Avoid float drift; round to nearest cent
  return Math.round(v * 100)
}

export async function POST(req: NextRequest) {
  try {
    const gate = await requireSession(req)
    if (!gate.ok) return gate.response
    const { session } = gate

    const body = await req.json().catch(() => ({} as any))
    // Accept either { usd: number } in dollars or { wt: number } in WT units
    const usdDollarsRaw = typeof body.usd === 'number' ? body.usd : undefined
    const wtRaw = typeof body.wt === 'number' ? Math.floor(body.wt) : undefined

    if (usdDollarsRaw == null && wtRaw == null) {
      return bad(400, 'Provide usd (dollars) or wt (units)')
    }

    // Normalize amounts
    let amountUSD: number // cents (int)
    let amountWT: number  // units (int)

    if (usdDollarsRaw != null) {
      if (!isFinite(usdDollarsRaw)) return bad(400, 'Invalid usd amount')
      if (usdDollarsRaw < MIN_USD) return bad(400, `Minimum deposit is $${MIN_USD}`)
      if (usdDollarsRaw > MAX_USD) return bad(400, `Maximum per intent is $${MAX_USD}`)
      amountUSD = dollarsToCents(usdDollarsRaw)
      amountWT = Math.round((amountUSD / 100) * WT_PER_USD)
    } else {
      // WT path
      if (!isFinite(wtRaw!)) return bad(400, 'Invalid wt amount')
      if (wtRaw! <= 0) return bad(400, 'Amount must be positive')
      amountWT = wtRaw!
      const usdFloat = amountWT / WT_PER_USD
      if (usdFloat < MIN_USD) return bad(400, `Minimum deposit is $${MIN_USD}`)
      if (usdFloat > MAX_USD) return bad(400, `Maximum per intent is $${MAX_USD}`)
      amountUSD = dollarsToCents(usdFloat)
    }

    // Use a proper PublicKey as the Solana Pay reference
    const referencePk = Keypair.generate().publicKey
    const now = new Date()
    const expiresAt = new Date(now.getTime() + DEFAULT_TTL_MIN * 60 * 1000)

    // Create intent
    const intent = await prisma.depositIntent.create({
      data: {
        userId: session.userId,
        amountUSD,
        amountWT,
        reference: referencePk.toBase58(), // store base58 string
        status: 'PENDING',
        createdAt: now,
        expiresAt,
        meta: body?.meta ?? null,
      },
      select: {
        id: true,
        userId: true,
        amountUSD: true,
        amountWT: true,
        reference: true,
        status: true,
        createdAt: true,
        expiresAt: true,
      },
    })

    // Build Solana Pay URL (amount in token units = USD for USDC)
    const amountUsdTokens = intent.amountUSD / 100 // e.g. 1250 -> 12.5
    const payUrl = buildSolanaPayUrl({
      recipient: DEPOSIT_ADDRESS,
      amountUsd: amountUsdTokens,
      reference: new PublicKey(intent.reference),
      label: 'WAGER RL',
      message: 'Deposit USDC to credit WT',
      splToken: USDC_MINT,
    })

    // Response includes both the intent (DB) and pay payload (UX)
    return noStore({
      ok: true,
      intent,
      pay: {
        url: payUrl,
        recipient: DEPOSIT_ADDRESS.toBase58(),
        splToken: USDC_MINT.toBase58(),
        reference: intent.reference,
        amountToken: amountUsdTokens.toFixed(2), // "12.50"
        rate: { usdPerWT: 0.1, wtPerUsd: 10 },
        expiresAt: intent.expiresAt,
      },
    })
  } catch (e) {
    console.error('DEPOSITS_INITIATE_ERR', e)
    return bad(500, 'INITIATE_FAILED')
  }
}