// src/app/api/dev/ref/status/route.ts
import { NextRequest, NextResponse } from "next/server";
import { store } from "@/app/server/devRefStore";

/**
 * GET /api/dev/ref/status?refId=RL-TEST-3
 * Returns the in-memory match state for a ref code.
 */
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const refId = String(searchParams.get("refId") ?? "").trim();
    if (!refId) {
      return NextResponse.json(
        { ok: false, error: "BAD_REQUEST", details: "Provide refId in query" },
        { status: 400 }
      );
    }

    const matchId = store.byRef.get(refId);
    if (!matchId) {
      return NextResponse.json({ ok: false, error: "MATCH_NOT_FOUND" }, { status: 404 });
    }

    const match = store.byId.get(matchId);
    return NextResponse.json({ ok: true, match });
  } catch (err: any) {
    return NextResponse.json(
      { ok: false, error: err?.message ?? "UNKNOWN_ERROR" },
      { status: 500 }
    );
  }
}