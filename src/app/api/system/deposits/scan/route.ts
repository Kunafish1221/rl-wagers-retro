// src/app/api/system/deposits/scan/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/app/server/prisma'
import { getConnection, DEPOSIT_ADDRESS, USDC_MINT } from '@/app/server/solana'

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
 * Scans recent transactions involving the DEPOSIT_ADDRESS (USDC token account),
 * finds incoming USDC credits, identifies the sender owner, and credits WT:
 *   1 USDC = 10 WT  =>  microUSDC / 1_000_000 * 10
 *
 * Notes:
 * - Assumes DEPOSIT_ADDRESS is the **USDC token account (ATA)** for your house wallet.
 * - Uses parsed transaction token balances to compute deltas.
 * - Links the sender by `Wallet.address` == token owner (solana wallet address).
 */
export async function POST(_req: NextRequest) {
  try {
    const conn = getConnection()
    const depositAta = DEPOSIT_ADDRESS.toBase58()
    const usdcMint = USDC_MINT.toBase58()

    // Recent signatures for the deposit token account
    const sigs = await conn.getSignaturesForAddress(DEPOSIT_ADDRESS, { limit: 40 })

    for (const s of sigs) {
      if (!s.signature || s.err) continue

      // Skip if we already recorded this tx
      const already = await prisma.deposit.findUnique({ where: { txHash: s.signature } })
      if (already) continue

      const tx = await conn.getParsedTransaction(s.signature, { maxSupportedTransactionVersion: 0 })
      if (!tx) continue

      const preToken = tx.meta?.preTokenBalances || []
      const postToken = tx.meta?.postTokenBalances || []
      if (!postToken.length) continue

      // Map accountIndex -> account address string
      const keyList = tx.transaction.message.accountKeys
      const accountAddr = (idx: number) => {
        const k = keyList[idx] as any
        return typeof k === 'string' ? k : (k?.pubkey?.toString?.() ?? k?.pubkey ?? '').toString()
      }

      // Find token balance entry for OUR deposit ATA & USDC mint
      const oursPost = postToken.find(
        (b) => b.mint === usdcMint && accountAddr(b.accountIndex) === depositAta
      )
      if (!oursPost) continue

      const oursPre = preToken.find(
        (b) => b.mint === usdcMint && b.accountIndex === oursPost.accountIndex
      )

      const preAmt = Number(oursPre?.uiTokenAmount?.amount || '0')
      const postAmt = Number(oursPost.uiTokenAmount?.amount || '0')
      const delta = postAmt - preAmt
      if (delta <= 0) continue // not a credit into our ATA

      // Identify a sender owner whose balance decreased for USDC
      let fromOwner: string | null = null
      for (const pre of preToken.filter((b) => b.mint === usdcMint)) {
        const post = postToken.find((pb) => pb.accountIndex === pre.accountIndex && pb.mint === usdcMint)
        const preN = Number(pre.uiTokenAmount?.amount || '0')
        const postN = Number(post?.uiTokenAmount?.amount || '0')
        if (postN < preN && pre.owner) {
          fromOwner = pre.owner
          break
        }
      }
      if (!fromOwner) continue

      // Link to a user via Wallet
      const linked = await prisma.wallet.findFirst({
        where: { chain: 'solana', address: fromOwner },
        select: { userId: true },
      })
      if (!linked) continue

      // Convert micro-USDC (delta is already in "amount" units, i.e., raw 10^decimals = 1e6)
      const amountUSDC = Math.floor(delta)                    // micro-USDC (int)
      const amountWT = Math.floor((amountUSDC / 1_000_000) * 10) // 1 USDC = 10 WT

      if (amountWT <= 0) continue

      await prisma.$transaction(async (txdb) => {
        await txdb.deposit.create({
          data: {
            userId: linked.userId,
            provider: 'other', // we don't know exact wallet app from-chain; default to 'other'
            txHash: s.signature,
            fromAddr: fromOwner,
            toAddr: depositAta,
            amountUSDC,
            amountWT,
            status: 'CREDITED',
          },
        })

        await txdb.user.update({
          where: { id: linked.userId },
          data: { availableWT: { increment: amountWT } },
        })
      })
    }

    return noStore({ ok: true })
  } catch (e) {
    console.error('DEPOSIT_SCAN_ERROR', e)
    return bad(500, 'DEPOSIT_SCAN_ERROR')
  }
}