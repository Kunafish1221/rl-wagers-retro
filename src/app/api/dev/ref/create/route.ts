// src/app/api/dev/ref/create/route.ts
import { NextRequest, NextResponse } from "next/server";
import { store, newId, type RefMatch } from "@/app/server/devRefStore";

/**
 * POST /api/dev/ref/create
 * Body: { refId: string, stake: number, maxPlayers?: number }
 *
 * - Creates an OPEN match keyed by refId (unique).
 * - This does NOT lock any WT yet (players lock on /join).
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const refId = String(body.refId ?? "").trim();
    const stake = Number(body.stake ?? NaN);
    const maxPlayers = Number.isFinite(body.maxPlayers) ? Math.max(2, Number(body.maxPlayers)) : 2;

    if (!refId || !Number.isFinite(stake) || stake <= 0) {
      return NextResponse.json(
        { ok: false, error: "BAD_REQUEST", details: "Provide refId and positive stake" },
        { status: 400 }
      );
    }

    // Prevent duplicate refs
    if (store.byRef.has(refId)) {
      const existingId = store.byRef.get(refId)!;
      const existing = store.byId.get(existingId);
      return NextResponse.json(
        { ok: false, error: "REF_ID_TAKEN", match: existing },
        { status: 409 }
      );
    }

    const id = newId("match_");
    const match: RefMatch = {
      id,
      refId,
      stake,
      maxPlayers,
      players: [],
      lockedByUser: {},
      state: "OPEN",
      createdAt: new Date().toISOString(),
    };

    store.byId.set(id, match);
    store.byRef.set(refId, id);

    return NextResponse.json({ ok: true, match });
  } catch (err: any) {
    return NextResponse.json(
      { ok: false, error: err?.message ?? "UNKNOWN_ERROR" },
      { status: 500 }
    );
  }
}