// src/app/wallet/page.tsx
'use client'

import { useEffect, useMemo, useState } from 'react'

type Link = { chain: 'solana'; provider: 'solflare' | 'coinbase'; address: string; createdAt?: string }
type GetResp = { userId: string; wallets: Link[] } | { error: string }
type PostResp =
  | { ok: true; userId: string; linked: Array<{ chain: 'solana'; provider: 'solflare' | 'coinbase'; address: string }> }
  | { error: string; detail?: any }

type MeOk = { ok: true; user: { id: string } & Record<string, any> }
type MeErr = { ok: false; error: string }
type MeResp = MeOk | MeErr

type WalletRespOk = { ok: true; wallet: { availableWT: number; lockedWT: number } }
type WalletRespErr = { ok: false; error: string }
type WalletResp = WalletRespOk | WalletRespErr

const BUY_PRESETS = [10, 25, 50, 75, 100] as const
const WITHDRAW_PRESETS = [10, 25, 50, 75, 100] as const

declare global {
  interface Window {
    solflare?: {
      isSolflare?: boolean
      publicKey?: { toString: () => string }
      connect: () => Promise<void>
      disconnect?: () => Promise<void>
    }
  }
}

// --- tiny toast ---
function toast(msg: string, danger = false) {
  let root = document.getElementById('toast-root')
  if (!root) {
    root = document.createElement('div')
    root.id = 'toast-root'
    root.className = 'fixed bottom-4 right-4 z-50 flex flex-col gap-2'
    document.body.appendChild(root)
  }
  const t = document.createElement('div')
  t.className =
    'rounded-lg px-3 py-2 text-sm shadow-lg ring-1 ring-black/10 bg-white/90 text-black' +
    (danger ? ' !bg-rose-500 !text-white' : '')
  t.textContent = msg
  root.appendChild(t)
  setTimeout(() => t.remove(), 1800)
}

async function safeJson(res: Response) {
  const ct = res.headers.get('content-type') || ''
  let data: any = {}
  try {
    if (ct.includes('application/json')) data = await res.json()
    else {
      const txt = await res.text()
      data = txt ? JSON.parse(txt) : {}
    }
  } catch {
    data = {}
  }
  return { ok: res.ok, status: res.status, data }
}

const Chip = ({
  active,
  children,
  onClick,
}: {
  active?: boolean
  children: React.ReactNode
  onClick?: () => void
}) => (
  <button
    type="button"
    onClick={onClick}
    className={`rounded-xl px-3 py-1.5 text-sm transition ${
      active ? 'bg-rl-neon text-black font-bold' : 'border border-white/15 text-white/80 hover:bg-white/5'
    }`}
  >
    {children}
  </button>
)

const Label = ({ children }: { children: React.ReactNode }) => (
  <label className="text-xs subtle select-none">{children}</label>
)

function formatUSD(n: number) {
  return n.toFixed(2)
}

export default function WalletPage() {
  const [userId, setUserId] = useState<string | null>(null)

  // banners
  const [error, setError] = useState<string | null>(null)
  const [msg, setMsg] = useState<string | null>(null)

  // balances
  const [loadingBalances, setLoadingBalances] = useState(false)
  const [availableWT, setAvailableWT] = useState(0)
  const [lockedWT, setLockedWT] = useState(0)

  // linked wallets
  const [loadingLinks, setLoadingLinks] = useState(false)
  const [wallets, setWallets] = useState<Link[]>([])
  const [manualAddr, setManualAddr] = useState('')
  const [manualProvider, setManualProvider] = useState<'solflare' | 'coinbase'>('solflare')

  // buy
  const [buyUSD, setBuyUSD] = useState<number>(50)
  const [buyCustom, setBuyCustom] = useState<string>('')
  const [purchasing, setPurchasing] = useState(false)

  // withdraw
  const [wdUSD, setWdUSD] = useState<number>(25)
  const [wdCustom, setWdCustom] = useState<string>('')
  const [wdTo, setWdTo] = useState<string>('') // destination
  const [wdProvider, setWdProvider] = useState<'solflare' | 'coinbase'>('solflare')
  const [withdrawing, setWithdrawing] = useState(false)

  // linking
  const [linking, setLinking] = useState(false)

  const hasSolflare = useMemo(() => typeof window !== 'undefined' && !!window.solflare?.isSolflare, [])
  const showDev = useMemo(() => {
    const env = typeof process !== 'undefined' && process.env.NEXT_PUBLIC_SHOW_DEV_TOOLS === '1'
    const isLocal = typeof window !== 'undefined' && /^localhost(:\d+)?$/.test(window.location.hostname)
    return env || isLocal
  }, [])

  // guess provider from first linked wallet (fallback solflare)
  const providerGuess: 'solflare' | 'coinbase' = (wallets[0]?.provider as any) || 'solflare'

  // session → userId
  useEffect(() => {
    ;(async () => {
      const r = await fetch('/api/auth/me', { cache: 'no-store' })
      const { ok, data } = await safeJson(r)
      if (ok && (data as MeResp)?.ok && (data as MeOk).user?.id) setUserId((data as MeOk).user.id)
      else setUserId(null)
    })()
  }, [])

  // load balances
  async function loadBalances() {
    setLoadingBalances(true)
    setError(null)
    try {
      const r = await fetch('/api/wallet/me', { cache: 'no-store' }).catch(() => null as any)
      if (r) {
        const { ok, data, status } = await safeJson(r)
        if (ok && (data as WalletRespOk)?.ok && (data as WalletRespOk).wallet) {
          setAvailableWT((data as WalletRespOk).wallet.availableWT ?? 0)
          setLockedWT((data as WalletRespOk).wallet.lockedWT ?? 0)
          setLoadingBalances(false)
          return
        }
        if (status && status !== 404 && (data as WalletRespErr)?.error) throw new Error((data as any).error)
      }
      // fallback via /api/auth/me if you later include balances there
      const m = await fetch('/api/auth/me', { cache: 'no-store' })
      const { ok: mok, data: mdata } = await safeJson(m)
      if (mok && (mdata as MeResp)?.ok && (mdata as any).user) {
        if (typeof (mdata as any).user.availableWT === 'number') setAvailableWT((mdata as any).user.availableWT)
        if (typeof (mdata as any).user.lockedWT === 'number') setLockedWT((mdata as any).user.lockedWT)
      }
    } catch (e: any) {
      setError(e?.message || 'Failed to load balances')
    } finally {
      setLoadingBalances(false)
    }
  }

  // load links
  async function loadLinks(uid = userId) {
    if (!uid) return
    setLoadingLinks(true)
    setError(null)
    try {
      const r = await fetch(`/api/users/${uid}/wallets`, { cache: 'no-store' })
      const { ok, data } = await safeJson(r)
      if (!ok || (data as GetResp as any)?.error) throw new Error((data as any)?.error || 'Failed to load wallets')
      const j = data as GetResp
      if ('wallets' in j) {
        setWallets(j.wallets ?? [])
        if (!wdTo && j.wallets?.[0]) setWdTo(j.wallets[0].address)
      }
    } catch (e: any) {
      setError(e?.message || 'Failed to load wallets')
    } finally {
      setLoadingLinks(false)
    }
  }

  useEffect(() => {
    if (!userId) return
    loadBalances()
    loadLinks(userId)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId])

  // --------- Actions ----------
  // Confirm purchase -> directly create a Deposit (credits WT immediately)
  async function confirmPurchase() {
    setPurchasing(true)
    setError(null)
    setMsg(null)
    try {
      const usd = buyCustom.trim() ? Number(buyCustom) : buyUSD
      if (!Number.isFinite(usd) || usd <= 0) throw new Error('Enter a valid USD amount')

      const amountWT = Math.floor(usd * 10) // 10 WT = $1
      const txHash = `OFFRAMP_${crypto.randomUUID()}`

      const r = await fetch('/api/deposits', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          provider: providerGuess, // enum on server
          txHash,
          amountWT,
        }),
      })
      const { ok, data } = await safeJson(r)
      if (!ok || !data?.ok) throw new Error(data?.error || 'Purchase failed')

      await loadBalances()
      setMsg(`+${amountWT} WT credited`)
      setBuyCustom('')
      toast('Purchase confirmed')
    } catch (e: any) {
      setError(e?.message || 'Purchase failed')
      toast('Purchase failed', true)
    } finally {
      setPurchasing(false)
    }
  }

  async function requestWithdrawal() {
    setWithdrawing(true)
    setError(null)
    setMsg(null)
    try {
      const usd = wdCustom.trim() ? Number(wdCustom) : wdUSD
      if (!Number.isFinite(usd) || usd < 10) throw new Error('Minimum withdrawal is $10')
      const dest = wdTo.trim()
      if (!dest) throw new Error('Enter a destination address')
      const wt = Math.floor(usd * 10)

      // client-side guard vs current balance
      if (wt > availableWT) throw new Error('Insufficient balance')

      const r = await fetch('/api/withdrawals/request', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ provider: wdProvider, address: dest, amountWT: wt }),
      })
      const { ok, data } = await safeJson(r)
      if (!ok || !data?.ok) throw new Error(data?.error || 'Withdrawal failed')

      await loadBalances()
      setMsg(`−${wt} WT withdrawn instantly (id ${data.withdrawal?.id ?? '…'})`)
      toast('Withdrawal sent')
      setWdCustom('')
    } catch (e: any) {
      setError(e?.message || 'Withdrawal failed')
      toast('Withdrawal failed', true)
    } finally {
      setWithdrawing(false)
    }
  }

  async function linkViaSolflare() {
    if (!userId) return
    setLinking(true)
    setError(null)
    setMsg(null)
    try {
      if (!window.solflare?.connect) throw new Error('Solflare extension not detected')
      await window.solflare.connect()
      const pub = window.solflare.publicKey?.toString()
      if (!pub) throw new Error('Failed to read Solflare public key')

      const body = { wallets: [{ chain: 'solana', provider: 'solflare', address: pub }] }
      const r = await fetch(`/api/users/${userId}/wallets`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      })
      const { ok, data } = await safeJson(r)
      if (!ok || (data as PostResp as any)?.error) throw new Error((data as any)?.error || 'Failed to link Solflare')
      toast('Solflare linked')
      setMsg('Solflare linked')
      await loadLinks(userId)
    } catch (e: any) {
      setError(e?.message || 'Failed to link Solflare')
      toast('Failed to link Solflare', true)
    } finally {
      setLinking(false)
    }
  }

  async function linkManual() {
    if (!userId) return
    setLinking(true)
    setError(null)
    setMsg(null)
    try {
      const addr = manualAddr.trim()
      if (!addr) throw new Error('Enter a Solana address')
      const body = { wallets: [{ chain: 'solana', provider: manualProvider, address: addr }] }
      const r = await fetch(`/api/users/${userId}/wallets`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      })
      const { ok, data } = await safeJson(r)
      if (!ok || (data as PostResp as any)?.error) throw new Error((data as any)?.error || 'Failed to link wallet')
      setManualAddr('')
      toast('Wallet linked')
      setMsg('Wallet linked')
      await loadLinks(userId)
    } catch (e: any) {
      setError(e?.message || 'Failed to link wallet')
      toast('Failed to link wallet', true)
    } finally {
      setLinking(false)
    }
  }

  const availableUSD = availableWT / 10
  const lockedUSD = lockedWT / 10

  if (userId === null) {
    return (
      <main className="mx-auto max-w-5xl px-4 py-8">
        <header className="mb-6 flex items-center justify-between">
          <h1 className="h1">WALLET</h1>
          <div className="flex gap-3">
            <a href="/discovery" className="btn btn-ghost">Discovery</a>
            <a href="/profile" className="btn btn-ghost">Profile</a>
          </div>
        </header>
        <div className="panel p-5 max-w-md">
          <p className="mb-4 text-white/80">Please log in to access your wallet.</p>
          <a href="/auth" className="btn btn-primary">Go to Login</a>
        </div>
      </main>
    )
  }

  return (
    <main className="mx-auto max-w-5xl px-4 py-8">
      {/* Header */}
      <header className="mb-6 flex items-center justify-between">
        <h1 className="h1">WALLET</h1>
        <div className="flex items-center gap-2">
          <button onClick={loadBalances} disabled={loadingBalances} className="btn btn-ghost disabled:opacity-60">
            {loadingBalances ? 'Refreshing…' : 'Refresh'}
          </button>
          <a href="/discovery" className="btn btn-ghost">Discovery</a>
          <a href="/profile" className="btn btn-ghost">Profile</a>
        </div>
      </header>

      {(error || msg) && (
        <div
          className={`panel p-3 mb-6 ${
            error ? 'border border-red-400/60 text-red-200' : 'border border-emerald-500/50 text-emerald-300'
          }`}
        >
          {error || msg}
        </div>
      )}

      {/* Stats row */}
      <section className="mb-6 grid grid-cols-2 gap-4">
        <div className="panel p-4">
          <div className="text-xs subtle">AVAILABLE</div>
          <div className="mt-1 text-3xl font-extrabold leading-tight">
            {availableWT} <span className="text-base font-normal">WT</span>
          </div>
          <div className="text-xs subtle mt-1">≈ ${formatUSD(availableUSD)} USD</div>
        </div>
        <div className="panel p-4">
          <div className="text-xs subtle">LOCKED</div>
          <div className="mt-1 text-3xl font-extrabold leading-tight">
            {lockedWT} <span className="text-base font-normal">WT</span>
          </div>
          <div className="text-xs subtle mt-1">≈ ${formatUSD(lockedUSD)} USD</div>
        </div>
      </section>

      {/* Main grid: Buy / Withdraw / Linked */}
      <section className="grid gap-4 lg:grid-cols-3">
        {/* BUY */}
        <div className="panel p-4 lg:col-span-1">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-semibold">Buy WT</h3>
          </div>
          <p className="subtle text-xs mt-1">10 WT = $1</p>

          <div className="mt-3 flex flex-wrap gap-2">
            {BUY_PRESETS.map((v) => (
              <Chip key={v} active={v === buyUSD} onClick={() => { setBuyUSD(v); setBuyCustom('') }}>
                ${v} · {v * 10} WT
              </Chip>
            ))}
          </div>

          <div className="mt-3 grid gap-2">
            <Label>Custom (USD)</Label>
            <input
              value={buyCustom}
              onChange={(e) => setBuyCustom(e.target.value)}
              placeholder="e.g. 12.50"
              inputMode="decimal"
              className="input"
            />
          </div>

          <button
            onClick={confirmPurchase}
            disabled={purchasing}
            className="btn btn-primary mt-4 w-full disabled:opacity-60"
          >
            {purchasing ? 'Confirming…' : 'Confirm purchase'}
          </button>
        </div>

        {/* WITHDRAW */}
        <div className="panel p-4 lg:col-span-1">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-semibold">Withdraw</h3>
            <select
              value={wdProvider}
              onChange={(e) => setWdProvider(e.target.value as 'solflare' | 'coinbase')}
              className="input !h-8 !py-1 !text-xs !px-2 w-[120px]"
            >
              <option value="solflare">Solflare</option>
              <option value="coinbase">Coinbase</option>
            </select>
          </div>
          <p className="subtle text-xs mt-1">Instant · Min $10 · 10 WT = $1</p>

          <div className="mt-3 flex flex-wrap gap-2">
            {WITHDRAW_PRESETS.map((v) => (
              <Chip key={v} active={v === wdUSD} onClick={() => { setWdUSD(v); setWdCustom('') }}>
                ${v} · {v * 10} WT
              </Chip>
            ))}
          </div>

          <div className="mt-3 grid gap-2">
            <Label>Custom (USD)</Label>
            <input
              value={wdCustom}
              onChange={(e) => setWdCustom(e.target.value)}
              placeholder="e.g. 25"
              inputMode="decimal"
              className="input"
            />
          </div>

          <div className="mt-3 grid gap-2">
            <Label>Destination</Label>
            <select
              value={wdTo ? `linked:${wdTo}` : 'custom'}
              onChange={(e) => {
                const val = e.target.value
                if (val.startsWith('linked:')) setWdTo(val.replace('linked:', ''))
                else setWdTo('')
              }}
              className="input"
            >
              {wallets.map((w) => (
                <option key={w.address} value={`linked:${w.address}`}>
                  {w.provider.toUpperCase()} · {w.address.slice(0, 6)}…{w.address.slice(-6)}
                </option>
              ))}
              <option value="custom">Custom address…</option>
            </select>
            {!wdTo && (
              <input
                value={wdTo}
                onChange={(e) => setWdTo(e.target.value)}
                placeholder="Paste Solana address"
                className="input font-mono"
              />
            )}
          </div>

          <button
            onClick={requestWithdrawal}
            disabled={withdrawing}
            className="btn btn-outline mt-4 w-full disabled:opacity-60"
            title={availableWT <= 0 ? 'No WT available' : undefined}
          >
            {withdrawing ? 'Sending…' : 'Withdraw instantly'}
          </button>
        </div>

        {/* LINKED WALLETS */}
        <div className="panel p-4 lg:col-span-1">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-semibold">Linked Wallets</h3>
            <button onClick={() => loadLinks(userId!)} className="btn btn-ghost !px-3 !py-1 text-xs" disabled={loadingLinks}>
              {loadingLinks ? '…' : 'Refresh'}
            </button>
          </div>

          <div className="mt-3 grid gap-2">
            {wallets.length === 0 ? (
              <div className="text-sm subtle">No wallets linked yet.</div>
            ) : (
              wallets.slice(0, 4).map((w) => (
                <div key={w.address} className="rounded-xl border border-white/10 p-2">
                  <div className="text-[10px] subtle">
                    {w.provider.toUpperCase()} • {w.chain.toUpperCase()}
                  </div>
                  <div className="font-mono text-xs break-all">{w.address}</div>
                </div>
              ))
            )}
          </div>

          <details className="mt-4">
            <summary className="cursor-pointer text-sm text-white/80 hover:text-white">Add wallet</summary>
            <div className="mt-3 grid gap-3">
              <button
                onClick={linkViaSolflare}
                disabled={linking || !hasSolflare || !userId}
                className="btn btn-primary disabled:opacity-60"
              >
                {hasSolflare ? (linking ? 'Linking…' : 'Connect Solflare') : 'Solflare not detected'}
              </button>

              <div className="grid gap-2">
                <div className="flex gap-2">
                  <select
                    value={manualProvider}
                    onChange={(e) => setManualProvider(e.target.value as 'solflare' | 'coinbase')}
                    className="input w-[120px]"
                  >
                    <option value="solflare">Solflare</option>
                    <option value="coinbase">Coinbase</option>
                  </select>
                  <input
                    value={manualAddr}
                    onChange={(e) => setManualAddr(e.target.value)}
                    placeholder="Enter Solana address"
                    className="input flex-1 font-mono"
                  />
                </div>
                <button onClick={linkManual} disabled={linking || !userId} className="btn btn-outline disabled:opacity-60">
                  {linking ? 'Linking…' : 'Link Manually'}
                </button>
                <p className="text-[11px] subtle">Address must be valid Solana base58.</p>
              </div>

              {showDev && (
                <div className="mt-2">
                  <div className="text-xs subtle mb-2">Dev credit</div>
                  <div className="flex gap-2">
                    <button
                      onClick={async () => {
                        const res = await fetch('/api/deposits/mock-credit', {
                          method: 'POST',
                          headers: { 'content-type': 'application/json' },
                          body: JSON.stringify({ provider: 'solflare', amountUSD: 10 }),
                        })
                        const { ok } = await safeJson(res)
                        if (ok) {
                          toast('+100 WT')
                          loadBalances()
                        }
                      }}
                      className="btn btn-ghost !px-3 !py-1 text-xs"
                    >
                      +100 WT
                    </button>
                    <button
                      onClick={async () => {
                        const res = await fetch('/api/deposits/mock-credit', {
                          method: 'POST',
                          headers: { 'content-type': 'application/json' },
                          body: JSON.stringify({ provider: 'solflare', amountUSD: 25 }),
                        })
                        const { ok } = await safeJson(res)
                        if (ok) {
                          toast('+250 WT')
                          loadBalances()
                        }
                      }}
                      className="btn btn-ghost !px-3 !py-1 text-xs"
                    >
                      +250 WT
                    </button>
                  </div>
                </div>
              )}
            </div>
          </details>
        </div>
      </section>

      <div id="toast-root" />
    </main>
  )
}