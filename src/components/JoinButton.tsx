'use client'

import { useState } from 'react'

type JoinResult = {
  ok?: boolean
  idempotent?: boolean
  match?: { id: string; state: string; mode: string; stakeWT: number }
  joined?: { id: string; userId: string; role: string; team: string }
  balances?: { availableWT: number; lockedWT: number }
  participants?: Array<{ id: string; userId: string; role: string; team: string }>
  error?: string
  detail?: any
}

export default function JoinButton({
  matchId,
  userId = 'demo-user-id',
  className = '',
  onJoined,
}: {
  matchId: string
  userId?: string
  className?: string
  onJoined?: (res: JoinResult) => void // parent can refresh lobby + balance
}) {
  const [loading, setLoading] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)
  const [err, setErr] = useState<string | null>(null)

  async function doJoin() {
    setLoading(true)
    setErr(null)
    setMsg(null)
    try {
      const r = await fetch(`/api/matches/${matchId}/join`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ userId }),
      })
      const j: JoinResult = await r.json()

      if (!r.ok || j?.error) {
        // Map common API errors to user-friendly text
        const code = j?.error ?? r.statusText
        let friendly = code
        if (code.includes('INSUFFICIENT_WT')) friendly = 'Not enough WT to join this match.'
        if (code.includes('MATCH_FULL')) friendly = 'This match is already full.'
        if (code.includes('MATCH_CLOSED')) friendly = 'This match is closed.'
        if (code.includes('USER_NOT_FOUND')) friendly = 'User not found.'
        setErr(friendly)
        return
      }

      if (j.idempotent) setMsg('You’re already in this match.')
      else setMsg('Joined! Stake locked in escrow ✅')

      onJoined?.(j)
    } catch (e: any) {
      setErr(e?.message || 'Failed to join match')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className={`inline-flex flex-col gap-2 ${className}`}>
      <button
        onClick={doJoin}
        disabled={loading}
        className="rounded-xl border border-rl-stroke/60 px-4 py-2 font-semibold tracking-wider hover:border-rl-amber disabled:opacity-50 transition"
      >
        {loading ? 'Joining…' : 'Join'}
      </button>
      {(msg || err) && (
        <div className={`text-sm ${err ? 'text-red-300' : 'text-emerald-300'}`}>
          {err || msg}
        </div>
      )}
    </div>
  )
}