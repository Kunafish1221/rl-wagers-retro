// src/hooks/useMatch.ts
'use client'

import { useEffect, useMemo, useState, useCallback } from 'react'

export type MatchParticipantDTO = {
  userId: string
  handle?: string | null
  team?: 'A' | 'B' | null
}

export type MatchDTO = {
  id: string
  state: 'PENDING' | 'COMPLETE' | 'CANCELLED'
  stakeWT: number
  mode: string
  refId: string
  participants: MatchParticipantDTO[]
}

type ApiError = { error: string }

export function useMatch(matchId?: string) {
  const [data, setData] = useState<MatchDTO | null>(null)
  const [loading, setLoading] = useState<boolean>(!!matchId)
  const [error, setError] = useState<string | null>(null)

  const fetchMatch = useCallback(async () => {
    if (!matchId) return
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/matches/${encodeURIComponent(matchId)}`, { cache: 'no-store' })
      if (!res.ok) {
        const j = (await res.json().catch(() => null)) as ApiError | null
        throw new Error(j?.error ?? `HTTP_${res.status}`)
      }
      const j = (await res.json()) as MatchDTO
      setData(j)
    } catch (e: any) {
      setError(e?.message ?? 'Failed to load match')
      setData(null)
    } finally {
      setLoading(false)
    }
  }, [matchId])

  useEffect(() => {
    fetchMatch()
  }, [fetchMatch])

  const participants = useMemo(() => data?.participants ?? [], [data])

  return {
    match: data,
    participants,
    loading,
    error,
    refresh: fetchMatch,
  }
}