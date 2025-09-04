'use client'

import { useEffect, useMemo, useState } from 'react'

type MatchLite = {
  id: string
  mode: '1v1' | '2v2' | '3v3'
  stakeUsd: number
  state: 'OPEN' | 'FULL' | 'COMPLETE' | 'CANCELLED'
  createdAt: string
  playersCount: number
  ref: { id: string; handle: string | null }
}

// robust JSON (so weird responses don’t crash)
async function safeJson(res: Response) {
  const ct = res.headers.get('content-type') || ''
  let data: any = {}
  try {
    if (ct.includes('application/json')) data = await res.json()
    else {
      const txt = await res.text()
      data = txt ? JSON.parse(txt) : {}
    }
  } catch { data = {} }
  if (!res.ok) {
    const msg = (data?.error || data?.message) ?? `HTTP ${res.status}`
    throw new Error(msg)
  }
  return data
}

export default function RefBoardPage() {
  // --- shared ---
  const [refId, setRefId] = useState('') // paste your ref user id (auto-filled from session below)
  const [toast, setToast] = useState<string | null>(null)

  // --- create lobby ---
  const [mode, setMode] = useState<'1v1' | '2v2' | '3v3'>('1v1')
  const [stakeUsd, setStakeUsd] = useState<10 | 20 | 50 | 75 | 100>(10)
  const [creating, setCreating] = useState(false)

  // --- settle ---
  const [settleMatchId, setSettleMatchId] = useState('')
  const [winnerUserId, setWinnerUserId] = useState('')
  const [settling, setSettling] = useState(false)

  // --- cancel ---
  const [cancelMatchId, setCancelMatchId] = useState('')
  const [cancelling, setCancelling] = useState(false)

  // --- list (helper so ref can copy matchId) ---
  const [items, setItems] = useState<MatchLite[]>([])
  const [loadingList, setLoadingList] = useState(false)

  const listQuery = useMemo(() => {
    const params = new URLSearchParams()
    params.set('take', '20')
    return `/api/discovery/matches?${params.toString()}`
  }, [])

  // optional: auto-fill refId from session (still editable; keeps same look)
  useEffect(() => {
    ;(async () => {
      try {
        const j = await safeJson(await fetch('/api/auth/me', { cache: 'no-store' }))
        if (j?.ok && j?.user?.id) setRefId(j.user.id)
      } catch { /* ignore */ }
    })()
  }, [])

  async function refreshList() {
    try {
      setLoadingList(true)
      const res = await fetch(listQuery, { cache: 'no-store' })
      const json = await res.json()
      setItems(json.items ?? [])
    } catch {
      /* ignore */
    } finally {
      setLoadingList(false)
    }
  }

  useEffect(() => {
    refreshList()
  }, [listQuery])

  async function createLobby() {
    if (!refId) {
      alert('Enter your refId first.')
      return
    }
    try {
      setCreating(true)
      const res = await fetch('/api/ref/matches', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refId, mode, stakeUsd }),
      })
      const j = await safeJson(res)
      setToast(`Created: ${j.id}`)
      refreshList()
    } catch (e: any) {
      alert(e?.message ?? 'Failed')
    } finally {
      setCreating(false)
      setTimeout(() => setToast(null), 3000)
    }
  }

  async function settle() {
    if (!refId || !settleMatchId || !winnerUserId) {
      alert('Enter refId, matchId, and winnerUserId.')
      return
    }
    try {
      setSettling(true)
      const res = await fetch(`/api/matches/${settleMatchId}/settle`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refId, winnerUserId }),
      })
      const j = await safeJson(res)
      setToast(`Settled. Payout: ${j.payout} WT • Fee: ${j.fee} WT`)
      refreshList()
    } catch (e: any) {
      alert(e?.message ?? 'Failed')
    } finally {
      setSettling(false)
      setTimeout(() => setToast(null), 3000)
    }
  }

  async function cancelLobby() {
    if (!refId || !cancelMatchId) {
      alert('Enter refId and matchId.')
      return
    }
    try {
      setCancelling(true)
      const res = await fetch(`/api/matches/${cancelMatchId}/cancel`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refId }),
      })
      const j = await safeJson(res)
      setToast(`Cancelled. Unlocked WT: ${j.unlockedForPlayers}`)
      refreshList()
    } catch (e: any) {
      alert(e?.message ?? 'Failed')
    } finally {
      setCancelling(false)
      setTimeout(() => setToast(null), 3000)
    }
  }

  return (
    <div style={{ maxWidth: 900, margin: '40px auto', padding: 16, fontFamily: 'system-ui, sans-serif' }}>
      <h1 style={{ fontSize: 28, marginBottom: 12 }}>RefBoard</h1>

      {toast && (
        <div style={{ padding: 10, background: '#e6ffed', border: '1px solid #bde5c8', borderRadius: 6, marginBottom: 12 }}>
          {toast}
        </div>
      )}

      {/* Ref ID */}
      <div style={{ marginBottom: 16 }}>
        <label style={{ display: 'block', fontSize: 12, marginBottom: 6 }}>Your Ref User ID</label>
        <input
          value={refId}
          onChange={(e) => setRefId(e.target.value)}
          placeholder="paste your ref user id"
          style={{ width: '100%', padding: 8 }}
        />
      </div>

      {/* Create lobby */}
      <div style={{ border: '1px solid #333', borderRadius: 8, padding: 12, marginBottom: 16 }}>
        <div style={{ fontWeight: 700, marginBottom: 10 }}>Create Lobby</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr auto', gap: 12, alignItems: 'end' }}>
          <div>
            <label style={{ display: 'block', fontSize: 12, marginBottom: 6 }}>Mode</label>
            <select value={mode} onChange={(e) => setMode(e.target.value as any)} style={{ width: '100%', padding: 8 }}>
              <option value="1v1">1v1</option>
              <option value="2v2">2v2</option>
              <option value="3v3">3v3</option>
            </select>
          </div>
          <div>
            <label style={{ display: 'block', fontSize: 12, marginBottom: 6 }}>Wager (USD)</label>
            <select
              value={String(stakeUsd)}
              onChange={(e) => setStakeUsd(Number(e.target.value) as any)}
              style={{ width: '100%', padding: 8 }}
            >
              <option value="10">$10</option>
              <option value="20">$20</option>
              <option value="50">$50</option>
              <option value="75">$75</option>
              <option value="100">$100</option>
            </select>
          </div>
          <button
            onClick={createLobby}
            disabled={creating || !refId}
            style={{ padding: '10px 14px', borderRadius: 6, border: '1px solid #222', height: 40 }}
          >
            {creating ? 'Creating…' : 'Create'}
          </button>
        </div>
      </div>

      {/* Settle match */}
      <div style={{ border: '1px solid #333', borderRadius: 8, padding: 12, marginBottom: 16 }}>
        <div style={{ fontWeight: 700, marginBottom: 10 }}>Settle Match</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr auto', gap: 12, alignItems: 'end' }}>
          <div>
            <label style={{ display: 'block', fontSize: 12, marginBottom: 6 }}>Match ID</label>
            <input
              value={settleMatchId}
              onChange={(e) => setSettleMatchId(e.target.value)}
              placeholder="match id"
              style={{ width: '100%', padding: 8 }}
            />
          </div>
          <div>
            <label style={{ display: 'block', fontSize: 12, marginBottom: 6 }}>Winner User ID</label>
            <input
              value={winnerUserId}
              onChange={(e) => setWinnerUserId(e.target.value)}
              placeholder="winner user id"
              style={{ width: '100%', padding: 8 }}
            />
          </div>
          <button
            onClick={settle}
            disabled={settling || !refId}
            style={{ padding: '10px 14px', borderRadius: 6, border: '1px solid #222', height: 40 }}
          >
            {settling ? 'Settling…' : 'Confirm Winner'}
          </button>
        </div>
        <div style={{ fontSize: 12, opacity: 0.75, marginTop: 8 }}>
          Tip: copy a Match ID from the list below. You must be the ref who created that match.
        </div>
      </div>

      {/* Cancel lobby */}
      <div style={{ border: '1px solid #333', borderRadius: 8, padding: 12, marginBottom: 16 }}>
        <div style={{ fontWeight: 700, marginBottom: 10 }}>Cancel Lobby</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 12, alignItems: 'end' }}>
          <div>
            <label style={{ display: 'block', fontSize: 12, marginBottom: 6 }}>Match ID</label>
            <input
              value={cancelMatchId}
              onChange={(e) => setCancelMatchId(e.target.value)}
              placeholder="match id"
              style={{ width: '100%', padding: 8 }}
            />
          </div>
          <button
            onClick={cancelLobby}
            disabled={cancelling || !refId}
            style={{ padding: '10px 14px', borderRadius: 6, border: '1px solid #222', height: 40 }}
          >
            {cancelling ? 'Cancelling…' : 'Cancel'}
          </button>
        </div>
        <div style={{ fontSize: 12, opacity: 0.75, marginTop: 8 }}>
          Cancels an open/full lobby and unlocks all players’ WT back to available.
        </div>
      </div>

      {/* Quick list so ref can copy match IDs */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
        <div style={{ fontWeight: 700 }}>Recent Lobbies</div>
        <button
          onClick={refreshList}
          disabled={loadingList}
          style={{ padding: '6px 10px', borderRadius: 6, border: '1px solid #222' }}
        >
          {loadingList ? 'Refreshing…' : 'Refresh'}
        </button>
      </div>
      <div style={{ display: 'grid', gap: 10 }}>
        {items.map((m) => (
          <div key={m.id} style={{ border: '1px solid #333', borderRadius: 8, padding: 10 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
              <div>
                <div style={{ fontWeight: 700 }}>
                  {m.mode.toUpperCase()} • ${m.stakeUsd} • {m.state}
                </div>
                <div style={{ fontSize: 12, opacity: 0.8 }}>
                  Match ID: <code>{m.id}</code>
                </div>
                <div style={{ fontSize: 12, opacity: 0.8 }}>
                  Ref: {m.ref?.handle ?? m.ref?.id?.slice(0, 6)} • Players: {m.playersCount}
                </div>
              </div>
              <button
                onClick={() => {
                  navigator.clipboard.writeText(m.id).then(() => setToast('Copied match id'))
                  setTimeout(() => setToast(null), 2000)
                }}
                style={{ padding: '8px 12px', borderRadius: 6, border: '1px solid #222', height: 36 }}
              >
                Copy ID
              </button>
            </div>
          </div>
        ))}
        {items.length === 0 && (
          <div style={{ fontSize: 12, opacity: 0.7 }}>No lobbies yet. Create one above.</div>
        )}
      </div>
    </div>
  )
}