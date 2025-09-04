// src/app/server/solana.ts
import { Connection, PublicKey } from '@solana/web3.js'

/**
 * ENV EXPECTED:
 * - SOLANA_RPC_URL            -> RPC endpoint (Helius/devnet/mainnet)
 * - SOLANA_USDC_MINT          -> USDC mint for your network
 * - SOLANA_DEPOSIT_ADDRESS    -> Your USDC receiving address (prefer the USDC ATA)
 */
export function requireEnv(name: string): string {
  const v = process.env[name]
  if (!v) throw new Error(`Missing env ${name}`)
  return v
}

export const SOLANA_RPC_URL = requireEnv('SOLANA_RPC_URL')
export const USDC_MINT = new PublicKey(requireEnv('SOLANA_USDC_MINT'))
export const DEPOSIT_ADDRESS = new PublicKey(requireEnv('SOLANA_DEPOSIT_ADDRESS'))

/** 1 USDC = 1_000_000 micro-units */
export const USDC_MICROS_PER_USDC = 1_000_000n

/** WT rate: $1 = 10 WT (integer math only) */
export const WT_PER_USD = 10

export function getConnection() {
  // 'confirmed' is fine for UX; swap to 'finalized' for stricter settlement
  return new Connection(SOLANA_RPC_URL, 'confirmed')
}

/**
 * Build a Solana Pay URL (USDC → your deposit address with a unique reference).
 * Spec: solana:<recipient>?amount=<tokenAmount>&spl-token=<mint>&reference=<pubkey>[&reference=...]&label&message
 *
 * NOTE: `amount` is in token units (e.g., "12.50" USDC), not minor units.
 */
export function buildSolanaPayUrl(opts: {
  recipient: PublicKey
  amountUsd: number // e.g. 12.5
  reference: PublicKey | PublicKey[] // allow multiple refs
  label?: string
  message?: string
  splToken: PublicKey
}) {
  const { recipient, amountUsd, reference, label, message, splToken } = opts
  const params = new URLSearchParams()

  // Fixed 2 decimals for USDC token units (USDC has 6 on-chain; Solana Pay uses human token units here)
  params.set('amount', amountUsd.toFixed(2))
  params.set('spl-token', splToken.toBase58())

  const refs = Array.isArray(reference) ? reference : [reference]
  for (const ref of refs) params.append('reference', ref.toBase58())

  if (label) params.set('label', label)
  if (message) params.set('message', message)

  return `solana:${recipient.toBase58()}?${params.toString()}`
}

/** Convert USD cents -> micro-USDC (1 USDC = 1_000_000 micro) */
export function centsToUsdcMicros(cents: number): bigint {
  // $0.01 = 10_000 micro-USDC (100 cents per USD → 1_000_000 / 100)
  return BigInt(cents) * (USDC_MICROS_PER_USDC / 100n) // 10_000n
}

/** Convert WT -> micro-USDC using $1 = 10 WT */
export function wtToUsdcMicros(wt: number): bigint {
  // WT / 10 = USDC → * 1_000_000 to get micro-USDC
  if (!Number.isFinite(wt) || wt <= 0) return 0n
  const usdc = wt / WT_PER_USD
  // Use rounding down to stay conservative on payouts
  return BigInt(Math.floor(usdc * 1_000_000))
}

/** Convert micro-USDC -> WT using $1 = 10 WT */
export function usdcMicrosToWT(micros: bigint): number {
  // (micros / 1_000_000) USDC * 10 WT per USD
  if (micros <= 0n) return 0
  // Do integer math carefully to avoid float drift
  const wtTimes1e6 = Number(micros) * WT_PER_USD
  return Math.floor(wtTimes1e6 / 1_000_000)
}