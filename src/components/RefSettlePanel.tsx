// src/components/RefSettlePanel.tsx
'use client'

import { useMemo, useState } from 'react'
import { settleMatch, type TxResult, type TxOk } from '@/lib/api/settleMatch'

type Participant = {
  userId: string
  handle?: string | null
  team?: 'A' | 'B' | null
}

type Props = {
  matchId: string
  refId: string
  participants: Participant[]
}

export default function RefSettlePanel({ matchId, refId, participants }: Props) {
  const [selectedWinner, setSelectedWinner] = useState<string>('')
  const [submitting, setSubmitting] = useState(false)
  const [result, setResult] = useState<TxResult | null>(null)
  const [error, setError] = useState<string | null>(null)

  const teamsPresent = useMemo(() => participants.some(p => p.team != null), [participants])
  const grouped = useMemo(() => {
    if (!teamsPresent) return { A: participants, B: [] as Participant[] }
    return {
      A: participants.filter(p => p.team === 'A'),
      B: participants.filter(p => p.team === 'B'),
    }
  }, [participants, teamsPresent])

  async function onSettle() {
    setSubmitting(true)
    setError(null)
    setResult(null)
    try {
      const out = await settleMatch(matchId, { refId, winnerUserId: selectedWinner })
      setResult(out)
      if (!out.ok) setError(out.msg)
    } catch (e: any) {
      setError(e?.message ?? 'Request failed')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="rounded-2xl border p-4 space-y-4 bg-white/5">
      <h3 className="text-lg font-semibold">Referee: Settle Match</h3>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <TeamBlock
          title={teamsPresent ? 'Team A' : 'Players'}
          list={grouped.A}
          selected={selectedWinner}
          onChange={setSelectedWinner}
        />
        {teamsPresent && (
          <TeamBlock
            title="Team B"
            list={grouped.B}
            selected={selectedWinner}
            onChange={setSelectedWinner}
          />
        )}
      </div>

      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={onSettle}
          disabled={!selectedWinner || submitting}
          className={`px-4 py-2 rounded-xl border ${
            !selectedWinner || submitting
              ? 'opacity-50 cursor-not-allowed'
              : 'hover:opacity-90'
          }`}
        >
          {submitting ? 'Settling…' : 'Confirm Winner & Settle'}
        </button>
        <span className="text-sm text-gray-400">
          House fee and payouts calculated automatically.
        </span>
      </div>

      {error && (
        <div className="text-sm text-red-500 border border-red-500/50 rounded-md p-2">
          {error}
        </div>
      )}

      {result?.ok && <PayoutSummary ok={result as TxOk} />}
    </div>
  )
}

function TeamBlock({
  title,
  list,
  selected,
  onChange,
}: {
  title: string
  list: Participant[]
  selected: string
  onChange: (v: string) => void
}) {
  return (
    <div className="rounded-xl border p-3">
      <div className="font-medium mb-2">{title}</div>
      <div className="space-y-2">
        {list.length === 0 && <div className="text-sm text-gray-400">—</div>}
        {list.map((p) => (
          <label key={p.userId} className="flex items-center gap-2 cursor-pointer">
            <input
              type="radio"
              name="winner"
              value={p.userId}
              checked={selected === p.userId}
              onChange={() => onChange(p.userId)}
            />
            <span className="text-sm">
              {p.handle ?? p.userId}{p.team ? ` · Team ${p.team}` : ''}
            </span>
          </label>
        ))}
      </div>
    </div>
  )
}

function PayoutSummary({ ok }: { ok: TxOk }) {
  return (
    <div className="rounded-xl border p-3 text-sm">
      <div className="font-medium mb-1">Settled ✅</div>
      <div>Match: <span className="font-mono">{ok.match.id}</span></div>
      <div>Winner: <span className="font-mono">{ok.match.winnerUserId ?? '—'}</span></div>
      <div className="mt-2 grid grid-cols-2 gap-x-6 gap-y-1">
        <div>Pot</div><div className="font-mono">{ok.payout.pot}</div>
        <div>Fee (bps)</div><div className="font-mono">{ok.payout.feeBps}</div>
        <div>Fee to house</div><div className="font-mono">{ok.payout.feeToHouse}</div>
        <div>Per winner</div><div className="font-mono">{ok.payout.perWinner}</div>
        <div>Winners</div><div className="font-mono break-all">{ok.payout.winners.join(', ')}</div>
      </div>
    </div>
  )
}