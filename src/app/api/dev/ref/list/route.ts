// src/app/api/dev/ref/list/route.ts
import { NextResponse } from "next/server";
import { store } from "@/app/server/devRefStore";

/**
 * GET /api/dev/ref/list
 * Returns all in-memory dev lobbies (OPEN/READY/SETTLED/CANCELLED).
 */
export async function GET() {
  const items = Array.from(store.byId.values()).map(m => ({
    id: m.id,
    refId: m.refId,
    stake: m.stake,
    maxPlayers: m.maxPlayers,
    players: m.players,
    state: m.state,
    createdAt: m.createdAt,
    settledAt: m.settledAt ?? null,
  }));
  // Sort newest first
  items.sort((a, b) => (b.createdAt > a.createdAt ? 1 : -1));
  return NextResponse.json({ ok: true, matches: items });
}
