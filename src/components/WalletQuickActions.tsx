'use client'

import { useState } from 'react'
import { useWallet } from '@solana/wallet-adapter-react'

type DepositIntent = {
  id: string
  amountUSD: number
  amountWT: number
  reference: string
  expiresAt: string
}
type DepositPay = {
  url: string
  recipient: string
  splToken: string
  reference: string
  amountToken: string
  rate: { usdPerWT: number; wtPerUsd: number }
  expiresAt: string
}

export default function WalletQuickActions() {
  const { publicKey, wallet, connected } = useWallet()

  // ---- DEPOSIT ----
  const [usdInput, setUsdInput] = useState<string>('10')
  const [depositLoading, setDepositLoading] = useState(false)
  const [intent, setIntent] = useState<DepositIntent | null>(null)
  const [pay, setPay] = useState<DepositPay | null>(null)
  const [scanLoading, setScanLoading] = useState(false)
  const [scanMsg, setScanMsg] = useState<string>('')

  // ---- WITHDRAW ----
  const [withdrawWT, setWithdrawWT] = useState<string>('100')
  const [withdrawLoading, setWithdrawLoading] = useState(false)
  const [withdrawMsg, setWithdrawMsg] = useState<string>('')

  const providerGuess = (() => {
    const name = (wallet?.adapter?.name || '').toLowerCase()
    if (name.includes('solflare')) return 'solflare'
    if (name.includes('coinbase')) return 'coinbase'
    return 'solflare' // default
  })()

  async function initiateDeposit() {
    const usd = Number(usdInput)
    if (!Number.isFinite(usd) || usd <= 0) {
      alert('Enter a valid USD amount')
      return
    }
    setDepositLoading(true)
    setIntent(null)
    setPay(null)
    try {
      const res = await fetch('/api/deposits/initiate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ usd }),
      })
      const j = await res.json()
      if (!res.ok || !j.ok) throw new Error(j?.error || 'Failed')
      setIntent(j.intent)
      setPay(j.pay)
    } catch (e: any) {
      alert(e?.message || 'Failed to create deposit intent')
    } finally {
      setDepositLoading(false)
    }
  }

  async function scanDeposits() {
    setScanLoading(true)
    setScanMsg('')
    try {
      const res = await fetch('/api/system/deposits/scan', { method: 'POST' })
      const j = await res.json()
      if (!res.ok || !j.ok) throw new Error(j?.error || 'Scan failed')
      setScanMsg('Scan complete ✅')
    } catch (e: any) {
      setScanMsg(e?.message || 'Scan failed')
    } finally {
      setScanLoading(false)
    }
  }

  async function requestWithdrawal() {
    const amt = Math.floor(Number(withdrawWT))
    if (!Number.isFinite(amt) || amt <= 0) {
      alert('Enter a positive WT amount')
      return
    }
    if (!connected || !publicKey) {
      alert('Connect your wallet first')
      return
    }
    setWithdrawLoading(true)
    setWithdrawMsg('')
    try {
      const res = await fetch('/api/withdrawals/request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          provider: providerGuess,                     // 'solflare' | 'coinbase'
          address: publicKey.toBase58(),              // send to linked wallet
          amountWT: amt,
        }),
      })
      const j = await res.json()
      if (!res.ok || !j.ok) throw new Error(j?.error || 'Withdraw failed')
      setWithdrawMsg(`Withdrawal requested: #${j.withdrawal.id} (${j.withdrawal.amountWT} WT)`)
    } catch (e: any) {
      setWithdrawMsg(e?.message || 'Withdraw failed')
    } finally {
      setWithdrawLoading(false)
    }
  }

  return (
    <div className="grid gap-8 md:grid-cols-2">
      {/* DEPOSIT */}
      <section className="rounded-2xl border border-white/10 p-5">
        <h3 className="mb-3 text-lg font-semibold">Deposit USDC → WT</h3>
        <div className="flex items-center gap-3">
          <label className="text-sm opacity-80" htmlFor="usd">USD</label>
          <input
            id="usd"
            value={usdInput}
            onChange={(e) => setUsdInput(e.target.value)}
            className="w-32 rounded-md border border-white/10 bg-transparent px-3 py-2 text-sm outline-none"
            placeholder="10"
            inputMode="decimal"
          />
          <button
            onClick={initiateDeposit}
            disabled={depositLoading}
            className="rounded-md px-4 py-2 text-sm shadow-sm ring-1 ring-white/15 hover:ring-white/30 disabled:opacity-50"
          >
            {depositLoading ? 'Creating…' : 'Get Solana Pay link'}
          </button>
        </div>

        {pay && (
          <div className="mt-4 space-y-2 text-sm">
            <div className="opacity-80">Send USDC from your <b>connected wallet</b> to credit WT automatically.</div>
            <div className="flex items-center gap-2">
              <a
                href={pay.url}
                className="rounded-md px-3 py-1 ring-1 ring-white/20 hover:ring-white/40"
              >
                Open in wallet (Solana Pay)
              </a>
              <button
                onClick={() => navigator.clipboard.writeText(pay.url)}
                className="rounded-md px-3 py-1 ring-1 ring-white/10 hover:ring-white/30"
              >
                Copy Link
              </button>
            </div>
            <div className="break-all opacity-80">
              <div>Recipient (USDC ATA): <code>{pay.recipient}</code></div>
              <div>Reference: <code>{pay.reference}</code></div>
              <div>Amount: <code>{pay.amountToken} USDC</code> (rate 1 USD = 10 WT)</div>
              <div>Expires: <code>{new Date(pay.expiresAt).toLocaleString()}</code></div>
            </div>

            <div className="mt-3 flex items-center gap-2">
              <button
                onClick={scanDeposits}
                disabled={scanLoading}
                className="rounded-md px-3 py-1 ring-1 ring-white/20 hover:ring-white/40 disabled:opacity-50"
              >
                {scanLoading ? 'Scanning…' : 'Check for deposit'}
              </button>
              <span className="text-xs opacity-70">{scanMsg}</span>
            </div>
          </div>
        )}
      </section>

      {/* WITHDRAW */}
      <section className="rounded-2xl border border-white/10 p-5">
        <h3 className="mb-3 text-lg font-semibold">Withdraw WT → USDC</h3>

        <div className="mb-2 text-xs opacity-70">
          {connected && publicKey ? (
            <>Sending to: <code>{publicKey.toBase58()}</code> ({providerGuess})</>
          ) : (
            <>Connect your wallet first</>
          )}
        </div>

        <div className="flex items-center gap-3">
          <label className="text-sm opacity-80" htmlFor="wt">WT</label>
          <input
            id="wt"
            value={withdrawWT}
            onChange={(e) => setWithdrawWT(e.target.value)}
            className="w-32 rounded-md border border-white/10 bg-transparent px-3 py-2 text-sm outline-none"
            placeholder="100"
            inputMode="numeric"
          />
          <button
            onClick={requestWithdrawal}
            disabled={withdrawLoading}
            className="rounded-md px-4 py-2 text-sm shadow-sm ring-1 ring-white/15 hover:ring-white/30 disabled:opacity-50"
          >
            {withdrawLoading ? 'Requesting…' : 'Request Withdrawal'}
          </button>
        </div>

        {withdrawMsg && (
          <div className="mt-3 text-sm opacity-80">{withdrawMsg}</div>
        )}
      </section>
    </div>
  )
}