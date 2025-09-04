// src/app/api/deposits/solana/intent/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/app/server/prisma'
import { requireSession } from '@/app/server/session'
import { Keypair, PublicKey } from '@solana/web3.js'
import { buildSolanaPayUrl, DEPOSIT_ADDRESS, USDC_MINT } from '@/app/server/solana'

type Body = {
  usd?: number;          // dollars (preferred)
  amountUSD?: number;    // cents (alternate)
  label?: string;
  message?: string;
  ttlMinutes?: number;   // 3..60, default 20
}

function bad(status: number, msg: string) {
  return NextResponse.json({ ok: false, error: msg }, { status, headers: { 'Cache-Control': 'no-store' } })
}

export async function POST(req: NextRequest) {
  try {
    // auth
    const gate = await requireSession(req)
    if (!gate.ok) return gate.response
    const { session } = gate

    // env sanity
    if (!DEPOSIT_ADDRESS || !USDC_MINT) {
      return bad(500, 'Server missing Solana config')
    }

    const body = (await req.json().catch(() => ({}))) as Body

    // prefer `usd` (dollars); accept `amountUSD` in cents
    let cents: number | undefined
    if (typeof body.usd === 'number') {
      const usd = body.usd
      if (!Number.isFinite(usd) || usd <= 0) return bad(400, 'Invalid usd')
      cents = Math.round(usd * 100)
    } else if (typeof body.amountUSD === 'number') {
      cents = Math.round(body.amountUSD)
    } else {
      return bad(400, 'Provide usd or amountUSD')
    }

    if (!cents || cents <= 0) return bad(400, 'Invalid amountUSD')

    // 10 WT = $1
    const amountWT = Math.floor((cents / 100) * 10)

    // generate a unique Solana Pay reference
    const reference: PublicKey = Keypair.generate().publicKey

    const ttl = Math.min(Math.max((body.ttlMinutes ?? 20), 3), 60) // clamp 3..60
    const expiresAt = new Date(Date.now() + ttl * 60_000)

    const intent = await prisma.depositIntent.create({
      data: {
        userId: session.userId,
        amountUSD: cents,
        amountWT,
        reference: reference.toBase58(),
        expiresAt,
        status: 'PENDING',
        meta: {
          label: body.label ?? 'RL WAGER',
          message: body.message ?? 'Deposit to credit WT',
        },
      },
      select: {
        id: true,
        amountUSD: true,
        amountWT: true,
        reference: true,
        expiresAt: true,
        status: true,
        createdAt: true,
      },
    })

    const payUrl = buildSolanaPayUrl({
      recipient: DEPOSIT_ADDRESS,
      splToken: USDC_MINT,
      reference,
      amountUsd: intent.amountUSD / 100,
      label: body.label ?? 'RL WAGER',
      message: body.message ?? 'Deposit to credit WT',
    })

    return NextResponse.json(
      {
        ok: true,
        intent,
        payUrl,
        components: {
          recipient: DEPOSIT_ADDRESS.toBase58(),
          splToken: USDC_MINT.toBase58(),
          reference: reference.toBase58(),
          amount: (intent.amountUSD / 100).toFixed(2),
        },
      },
      { headers: { 'Cache-Control': 'no-store' } }
    )
  } catch (e: any) {
    console.error('CREATE_INTENT_ERROR', e)
    return bad(500, 'CREATE_INTENT_ERROR')
  }
}