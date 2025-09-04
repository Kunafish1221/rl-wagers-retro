import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/app/server/prisma'
import { requireSession } from '@/app/server/session'
import type { DepositProvider } from '@prisma/client'

type Provider = 'solflare' | 'coinbase'
type Chain = 'solana'
type Link = { chain: Chain; provider: Provider; address: string }
type BodyArray = { wallets: Link[] }
type BodySingle = { provider: Provider; address: string }

function isBodyArray(v: any): v is BodyArray {
  return v && Array.isArray(v.wallets)
}

const BASE58_RE = /^[1-9A-HJ-NP-Za-km-z]+$/
function looksLikeSolanaAddress(addr: string) {
  const a = addr.trim()
  return a.length >= 32 && a.length <= 64 && BASE58_RE.test(a)
}

function bad(status: number, msg: string, detail?: any) {
  return NextResponse.json(detail ? { error: msg, detail } : { error: msg }, { status })
}

// POST /api/users/[id]/wallets
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: userId } = await params

  const gate = await requireSession(req)
  if (!gate.ok) return gate.response
  if (gate.session.userId !== userId) return bad(403, 'Forbidden')

  const user = await prisma.user.findUnique({ where: { id: userId }, select: { id: true } })
  if (!user) return bad(404, 'USER_NOT_FOUND')

  const json = await req.json().catch(() => ({} as any))

  let links: Link[] = []
  if (isBodyArray(json)) {
    links = json.wallets.map((w) => ({
      chain: (w.chain ?? 'solana') as Chain,
      provider: w.provider,
      address: String(w.address || '').trim(),
    }))
  } else {
    const { provider, address } = (json as Partial<BodySingle>) ?? {}
    links = [{ chain: 'solana', provider: (provider as Provider) ?? 'solflare', address: String(address || '').trim() }]
  }

  for (const w of links) {
    if (w.chain !== 'solana') return bad(400, 'UNSUPPORTED_CHAIN')
    if (w.provider !== 'solflare' && w.provider !== 'coinbase') {
      return bad(400, 'INVALID_PROVIDER', 'provider must be solflare or coinbase')
    }
    if (!w.address) return bad(400, 'ADDRESS_REQUIRED')
    if (!looksLikeSolanaAddress(w.address)) return bad(400, 'INVALID_ADDRESS_FORMAT')
  }

  const seen = new Set<string>()
  const unique = links.filter((w) => {
    const key = `${w.chain}:${w.address}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })

  try {
    const linked: Array<Pick<Link, 'chain' | 'provider' | 'address'>> = []

    for (const w of unique) {
      const existing = await prisma.wallet.findUnique({
        where: { chain_address: { chain: w.chain, address: w.address } },
        select: { userId: true },
      })
      if (existing && existing.userId !== userId) {
        return bad(409, 'ADDRESS_IN_USE', { address: w.address, byUserId: existing.userId })
      }

      await prisma.wallet.upsert({
        where: { chain_address: { chain: w.chain, address: w.address } },
        create: { userId, chain: w.chain, provider: w.provider as DepositProvider, address: w.address },
        update: { userId, provider: w.provider as DepositProvider },
      })

      linked.push({ chain: w.chain, provider: w.provider, address: w.address })
    }

    return NextResponse.json({ ok: true, userId, linked })
  } catch (e: any) {
    const code = String(e?.code || '')
    if (code === 'P2003') return bad(404, 'USER_NOT_FOUND')
    if (code === 'P2025') return bad(404, 'NOT_FOUND')
    if (code === 'P2002') return bad(409, 'ADDRESS_IN_USE')
    console.error('[wallets.POST]', e)
    return bad(500, 'Server error')
  }
}

// GET /api/users/[id]/wallets
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: userId } = await params

    const wallets = await prisma.wallet.findMany({
      where: { userId },
      select: { chain: true, provider: true, address: true, createdAt: true },
      orderBy: { createdAt: 'desc' },
    })

    return NextResponse.json({
      userId,
      wallets: wallets.map(w => ({
        chain: w.chain as Chain,
        provider: w.provider as Provider,
        address: w.address,
        createdAt: w.createdAt.toISOString(),
      })),
    })
  } catch (e: any) {
    console.error('[wallets.GET]', e)
    return bad(500, 'Server error')
  }
}