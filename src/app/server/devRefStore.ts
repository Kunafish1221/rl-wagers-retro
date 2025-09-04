// src/app/server/devRefStore.ts
export type RefMatchState = 'OPEN' | 'READY' | 'SETTLED' | 'CANCELLED'

export type RefMatch = {
  id: string
  refId: string
  stake: number          // WT per player
  maxPlayers: number     // 2 by default (1v1)
  players: string[]      // userIds that joined
  lockedByUser: Record<string, number> // how much each player locked for THIS match
  state: RefMatchState
  winners?: string[]
  createdAt: string
  settledAt?: string
}

type Store = {
  byId: Map<string, RefMatch>
  byRef: Map<string, string> // refId -> matchId
}

const globalStore = globalThis as unknown as { __devRefStore?: Store }

function newStore(): Store {
  return { byId: new Map(), byRef: new Map() }
}

export const store: Store = globalStore.__devRefStore ?? newStore()
if (!globalStore.__devRefStore) globalStore.__devRefStore = store

// Simple id (timestamp + random)
export function newId(prefix = 'm_'): string {
  const rnd = Math.random().toString(36).slice(2, 8)
  return `${prefix}${Date.now().toString(36)}_${rnd}`
}