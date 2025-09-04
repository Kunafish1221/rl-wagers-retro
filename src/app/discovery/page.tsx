// src/app/discovery/page.tsx
'use client'

import { useEffect, useMemo, useRef, useState } from 'react'

type Participant = { id: string; handle: string; avatarUrl: string | null }
type RefUser = { id: string; handle: string; avatarUrl: string | null }

type OpenMatch = {
  id: string
  refId: string
  ref: RefUser | null
  mode: 'ONE_V_ONE' | 'TWO_V_TWO' | 'THREE_V_THREE'
  stakeWT: number       // WT units (NOT cents)
  createdAt: string     // ISO
  current: number
  capacity: number
  slotsOpen: number
  joinable: boolean
  participants: Participant[]
}

type OpenMatchesResp =
  | { ok: true; matches: OpenMatch[] }
  | { ok: false; error: string }

// ---- Balance response (from /api/users/[id]/balance) ----
type BalanceResp =
  | {
      id: string
      handle: string | null
      availableWT: number // WT units
      lockedWT: number    // WT units
      availableUSD: number
      lockedUSD: number
    }
  | { error: string }

type ProfileResp =
  | { ok: true; user?: { epicId?: string | null; handle?: string | null } }
  | { ok: false; error: string }

type SessionResp = { ok: boolean; user: { id: string; epicId: string | null } | null }

// --- helpers (WT are integers; do NOT divide by 100) ---
function formatWTInt(wt?: number | null) {
  if (typeof wt !== 'number') return '0'
  return wt.toLocaleString()
}
function formatWhen(iso: string) {
  const d = new Date(iso)
  return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(d)
}

export default function DiscoveryPage() {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [matches, setMatches] = useState<OpenMatch[]>([])
  const [joiningId, setJoiningId] = useState<string | null>(null)
  const [leavingId, setLeavingId] = useState<string | null>(null)
  const [refreshing, setRefreshing] = useState(false)

  // ------- current user (from session) -------
  const [meUserId, setMeUserId] = useState<string>('')       // from /api/auth/session
  const [epicId, setEpicId] = useState<string | null>(null)  // from profile/session

  const [meLoading, setMeLoading] = useState(false)
  const [meError, setMeError] = useState<string | null>(null)
  const [availableWT, setAvailableWT] = useState<number | null>(null) // WT units
  const [lockedWT, setLockedWT] = useState<number | null>(null)       // WT units

  const booted = useRef(false)
  const inFlight = useRef<AbortController | null>(null)

  function toast(msg: string, danger = false) {
    let root = document.getElementById('toast-root')
    if (!root) {
      root = document.createElement('div')
      root.id = 'toast-root'
      document.body.appendChild(root)
    }
    const t = document.createElement('div')
    t.className = `toast ${danger ? 'bg-[var(--rl-danger)] text-white' : ''}`
    t.textContent = msg
    root.appendChild(t)
    setTimeout(() => t.remove(), 2200)
  }

  async function safeJson(res: Response) {
    const ct = res.headers.get('content-type') || ''
    if (ct.includes('application/json')) return res.json()
    const txt = await res.text()
    try { return JSON.parse(txt) } catch { return { raw: txt } }
  }

  async function loadOpenMatches() {
    inFlight.current?.abort()
    const ac = new AbortController()
    inFlight.current = ac

    setLoading(true)
    setError(null)
    try {
      // pull participants so we can show Join/Leave correctly
      const r = await fetch('/api/matches/open?with=participants', { cache: 'no-store', signal: ac.signal })
      const json = (await safeJson(r)) as OpenMatchesResp
      if (!r.ok || !('ok' in json) || !json.ok) {
        throw new Error(('error' in json && json.error) || `HTTP_${r.status}`)
      }
      setMatches(json.matches)
    } catch (e: any) {
      if (e?.name !== 'AbortError') setError(e?.message || 'Failed to load matches')
    } finally {
      setLoading(false)
    }
  }

  // Session -> userId -> balance + profile
  async function loadSessionThenUser() {
    try {
      const s = (await safeJson(await fetch('/api/auth/session', { cache: 'no-store' }))) as SessionResp
      const uid = s.ok && s.user ? s.user.id : ''
      setMeUserId(uid)
      setEpicId(s.ok && s.user ? s.user.epicId : null)
      if (uid) await loadMeByUserId(uid)
    } catch {
      setMeUserId('')
      setEpicId(null)
    }
  }

  async function loadMeByUserId(uid: string) {
    if (!uid) {
      setAvailableWT(null)
      setLockedWT(null)
      setMeError(null)
      return
    }
    setMeLoading(true)
    setMeError(null)
    try {
      const rb = await fetch(`/api/users/${uid}/balance`, { cache: 'no-store' })
      const jb = (await safeJson(rb)) as BalanceResp
      if (!rb.ok || 'error' in jb) throw new Error('BALANCE_FETCH_FAILED')

      setAvailableWT(jb.availableWT ?? 0) // WT units
      setLockedWT(jb.lockedWT ?? 0)

      const rp = await fetch(`/api/users/${uid}/profile`, { cache: 'no-store' })
      const jp = (await safeJson(rp)) as ProfileResp
      if (rp.ok && 'ok' in jp && jp.ok) {
        setEpicId(jp.user?.epicId ?? null)
      }
    } catch {
      setMeError('Could not load your profile/balance.')
      setAvailableWT(0)
      setLockedWT(0)
    } finally {
      setMeLoading(false)
    }
  }

  useEffect(() => {
    if (booted.current) return
    booted.current = true
    loadSessionThenUser()
    loadOpenMatches()
    return () => inFlight.current?.abort()
  }, [])

  async function join(matchId: string) {
    if (!meUserId || !epicId) {
      toast('Set your Epic IGN in Profile first.', true)
      return
    }
    setJoiningId(matchId)
    try {
      const r = await fetch(`/api/matches/${matchId}/join`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: meUserId }),
      })
      const json = await safeJson(r)
      if (!r.ok || (json && (json as any).error)) {
        throw new Error((json as any)?.error || `JOIN_HTTP_${r.status}`)
      }
      toast('Joined! WT locked in escrow.')
      setRefreshing(true)
      await Promise.all([loadOpenMatches(), loadMeByUserId(meUserId)])
    } catch (e: any) {
      toast(`Join failed: ${e?.message || 'Unknown error'}`, true)
    } finally {
      setJoiningId(null)
      setRefreshing(false)
    }
  }

  async function leave(matchId: string) {
    setLeavingId(matchId)
    try {
      // session-based leave route (no body)
      const r = await fetch(`/api/matches/${matchId}/leave`, { method: 'POST' })
      const json = await safeJson(r)
      if (!r.ok || (json as any)?.error) {
        throw new Error((json as any)?.error || `LEAVE_HTTP_${r.status}`)
      }
      toast('Left match. WT unlocked.')
      setRefreshing(true)
      await Promise.all([loadOpenMatches(), loadMeByUserId(meUserId)])
    } catch (e: any) {
      toast(`Leave failed: ${e?.message || 'Unknown error'}`, true)
    } finally {
      setLeavingId(null)
      setRefreshing(false)
    }
  }

  const empty = useMemo(() => !loading && matches.length === 0, [loading, matches])

  // --- UI bits ---
  const playerLine = (
    <div className="flex flex-wrap items-center gap-3">
      <span className="text-xs tracking-widest subtle">PLAYER</span>
      <span className="badge">{meLoading ? '…' : (epicId || '—')}</span>
      <span className="text-xs subtle ml-2">WT</span>
      <span className="badge">{meLoading ? '…' : `WT ${formatWTInt(availableWT)}`}</span>
      <span className="text-xs subtle ml-2">Locked</span>
      <span className="badge">{meLoading ? '…' : `WT ${formatWTInt(lockedWT)}`}</span>
      {!epicId && (
        <span className="text-xs subtle">
          No IGN set. Go to <a className="underline" href="/profile">Profile</a> to add your Epic IGN.
        </span>
      )}
    </div>
  )

  return (
    <main className="min-h-screen px-6 py-8 md:px-10 lg:px-16">
      <header className="mb-6 flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div>
          <h1 className="h1">DISCOVERY</h1>
          <p className="subtle mt-1">
            Join skill-based Rocket League lobbies. Your stake is locked in WT escrow on entry.
          </p>
          <div className="mt-3">{playerLine}</div>
        </div>

        <div className="flex flex-col gap-3 md:items-end">
          <div className="flex flex-wrap items-center gap-3">
            <button
              onClick={() => {
                setRefreshing(true)
                Promise.all([loadSessionThenUser(), loadOpenMatches()]).finally(() => setRefreshing(false))
              }}
              disabled={refreshing || loading}
              className="btn btn-ghost disabled:opacity-60"
              aria-busy={refreshing || loading}
            >
              {refreshing || loading ? 'Refreshing…' : 'Refresh'}
            </button>
            <a href="/" className="btn btn-ghost" aria-label="Go to Home">Home</a>
            <a href="/profile" className="btn btn-outline" aria-label="Go to Profile">Profile</a>
            <a href="/wallet" className="btn btn-outline" aria-label="Go to Wallet">Wallet</a>
          </div>
          {meError && <span className="text-xs text-red-300 mt-1">Couldn’t load your info.</span>}
        </div>
      </header>

      {loading && (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="panel p-5 skeleton h-[160px]" />
          ))}
        </div>
      )}

      {error && (
        <div className="panel p-4 border border-red-400/40 text-red-300">
          Failed to load: {error}
        </div>
      )}

      {empty && (
        <div className="panel p-6 subtle">
          No open matches yet. Ask a ref to create one with a refId.
        </div>
      )}

      {!loading && !error && matches.length > 0 && (
        <ul className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {matches.map((m) => {
            const spots = `${m.current}/${m.capacity}`
            const meInThis = !!meUserId && m.participants.some(p => p.id === meUserId)

            const isJoining = joiningId === m.id
            const isLeaving = leavingId === m.id

            const canJoin =
              m.joinable && !isJoining && !isLeaving && !!meUserId && !!epicId && !meInThis
            const canLeave =
              meInThis && !isJoining && !isLeaving

            return (
              <li key={m.id} className="panel p-5 hover-lift">
                <div className="mb-3 flex items-center justify-between">
                  <span className="text-xs tracking-widest subtle">REF • {m.refId}</span>
                  <span className="badge">{m.mode.replaceAll('_', ' ')}</span>
                </div>

                <div className="mb-4">
                  <div className="text-2xl font-bold text-white">
                    Stake: <span className="text-[var(--rl-neon-2)]">WT {formatWTInt(m.stakeWT)}</span>
                  </div>
                  <div className="mt-1 text-sm subtle">
                    Spots: {spots} • Created {formatWhen(m.createdAt)}
                  </div>
                </div>

                <div className="flex items-center justify-between">
                  <span className={`text-sm ${m.joinable ? 'text-[var(--rl-success)]' : 'subtle'}`}>
                    {m.joinable ? `${m.slotsOpen} slots open` : 'Full'}
                  </span>

                  {!meInThis ? (
                    <button
                      disabled={!canJoin || !m.joinable}
                      onClick={() => join(m.id)}
                      className={`btn ${m.joinable ? 'btn-primary' : 'btn-outline opacity-60 cursor-not-allowed'}`}
                      aria-disabled={!canJoin || !m.joinable}
                      aria-busy={isJoining}
                      title={!epicId ? 'Set IGN in Profile first' : undefined}
                    >
                      {isJoining ? 'Joining…' : 'Join'}
                    </button>
                  ) : (
                    <button
                      disabled={!canLeave}
                      onClick={() => leave(m.id)}
                      className="btn btn-outline"
                      aria-busy={isLeaving}
                    >
                      {isLeaving ? 'Leaving…' : 'Leave'}
                    </button>
                  )}
                </div>
              </li>
            )
          })}
        </ul>
      )}

      <div id="toast-root" />
    </main>
  )
}