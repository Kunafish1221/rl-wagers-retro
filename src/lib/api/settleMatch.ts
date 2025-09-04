// src/lib/api/settleMatch.ts
export type TxOk = {
  ok: true
  match: { id: string; state: 'COMPLETE' | 'PENDING' | 'CANCELLED'; winnerUserId: string | null; stakeWT: number; mode: string }
  payout: { pot: number; feeBps: number; feeToHouse: number; winners: string[]; perWinner: number }
}
export type TxErr = { ok: false; code: number; msg: string }
export type TxResult = TxOk | TxErr

export async function settleMatch(matchId: string, params: { refId: string; winnerUserId: string }) {
  const res = await fetch(`/api/matches/${encodeURIComponent(matchId)}/settle`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    // Important: keep body keys exactly as API expects
    body: JSON.stringify(params),
    // Ensure we don't cache admin actions
    cache: 'no-store',
  })

  // The route returns {error:string} on non-OK; normalize to TxErr
  if (!res.ok) {
    let msg = `HTTP_${res.status}`
    try {
      const j = (await res.json()) as any
      if (j?.error) msg = j.error
    } catch {}
    const out: TxErr = { ok: false, code: res.status, msg }
    return out
  }

  const data = (await res.json()) as TxResult
  return data
}