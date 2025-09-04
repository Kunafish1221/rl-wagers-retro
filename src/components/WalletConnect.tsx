// src/components/WalletConnect.tsx
'use client'

import { useEffect, useRef, useState } from 'react'
import dynamic from 'next/dynamic'
import { useWallet } from '@solana/wallet-adapter-react'
import type { PublicKey } from '@solana/web3.js'

// 👇 Render the actual button only on the client to avoid hydration drift
const WalletMultiButton = dynamic(
  async () => (await import('@solana/wallet-adapter-react-ui')).WalletMultiButton,
  { ssr: false }
)

type Props = {
  /** Logged-in user's id (required to link wallet) */
  userId?: string
  /** Hide the public address text next to the button (default: true) */
  hideAddress?: boolean
  /** Show a tiny status badge (Linked ✓ / Save failed) (default: true) */
  showStatus?: boolean
}

export default function WalletConnect({
  userId,
  hideAddress = true,
  showStatus = true,
}: Props) {
  const { publicKey, wallet, connected } = useWallet()
  const [mounted, setMounted] = useState(false)
  const [status, setStatus] = useState<'idle' | 'linking' | 'linked' | 'error'>('idle')
  const lastSavedRef = useRef<{ addr: string; provider: string } | null>(null)

  useEffect(() => setMounted(true), [])

  useEffect(() => {
    // Don’t attempt linking until we’re mounted (client) and all deps are present
    if (!mounted) return

    const save = async (pk: PublicKey | null) => {
      if (!pk || !wallet || !connected || !userId) return
      const addr = pk.toBase58()
      const name = (wallet.adapter?.name || '').toLowerCase()

      let provider: 'solflare' | 'coinbase' | 'phantom' | 'other' = 'other'
      if (name.includes('flare')) provider = 'solflare'
      else if (name.includes('coinbase')) provider = 'coinbase'
      else if (name.includes('phantom')) provider = 'phantom'

      const last = lastSavedRef.current
      if (last && last.addr === addr && last.provider === provider) return

      setStatus('linking')
      try {
        const res = await fetch(`/api/users/${encodeURIComponent(userId)}/wallets`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ wallets: [{ chain: 'solana', provider, address: addr }] }),
        })
        if (!res.ok) throw new Error(`HTTP_${res.status}`)
        lastSavedRef.current = { addr, provider }
        setStatus('linked')
      } catch {
        setStatus('error')
      }
    }

    save(publicKey)
  }, [mounted, publicKey, wallet, connected, userId])

  return (
    <div className="flex items-center gap-3">
      {/* SSR placeholder to keep server HTML stable */}
      {!mounted ? (
        <button
          type="button"
          className="wallet-adapter-button wallet-adapter-button-trigger opacity-70 cursor-default"
          aria-disabled="true"
        >
          Connect Wallet
        </button>
      ) : (
        <WalletMultiButton />
      )}

      {!hideAddress && publicKey ? (
        <span className="text-xs opacity-70">{publicKey.toBase58()}</span>
      ) : null}

      {showStatus && status === 'linked' && (
        <span className="text-[11px] tracking-widest text-emerald-300">Linked ✓</span>
      )}
      {showStatus && status === 'error' && (
        <span className="text-[11px] tracking-widest text-rose-300">Save failed</span>
      )}
    </div>
  )
}