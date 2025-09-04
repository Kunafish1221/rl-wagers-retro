// src/app/api/dev/ref/join/route.ts
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/app/server/prisma";
import { store, type RefMatch } from "@/app/server/devRefStore";

/**
 * POST /api/dev/ref/join
 * Body: { refId: string, userId: string }
 *
 * - Validates match exists & is OPEN/READY (not full).
 * - Locks stake from user's LedgerAccount (available -> locked).
 * - Adds player; sets state to READY when full.
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const refId = String(body.refId ?? "").trim();
    const userId = String(body.userId ?? "").trim();

    if (!refId || !userId) {
      return NextResponse.json(
        { ok: false, error: "BAD_REQUEST", details: "Provide refId and userId" },
        { status: 400 }
      );
    }

    const matchId = store.byRef.get(refId);
    if (!matchId) return NextResponse.json({ ok: false, error: "MATCH_NOT_FOUND" }, { status: 404 });

    const match = store.byId.get(matchId)!;
    if (match.state === "CANCELLED" || match.state === "SETTLED") {
      return NextResponse.json({ ok: false, error: "MATCH_FINAL" }, { status: 409 });
    }
    if (match.players.includes(userId)) {
      return NextResponse.json({ ok: true, match }, { status: 200 }); // idempotent
    }
    if (match.players.length >= match.maxPlayers) {
      return NextResponse.json({ ok: false, error: "MATCH_FULL" }, { status: 409 });
    }

    // Lock funds in a tx
    const stake = match.stake;
    const account = await prisma.$transaction(async (tx) => {
      const acct = await tx.ledgerAccount.findUnique({ where: { userId } });
      if (!acct) throw new Error("ACCOUNT_NOT_FOUND");
      if (acct.available < stake) throw new Error("INSUFFICIENT_FUNDS");

      return tx.ledgerAccount.update({
        where: { userId },
        data: { available: acct.available - stake, locked: acct.locked + stake },
        select: { userId: true, available: true, locked: true },
      });
    });

    // Update in-memory store
    match.players.push(userId);
    match.lockedByUser[userId] = (match.lockedByUser[userId] ?? 0) + stake;
    if (match.players.length >= match.maxPlayers) match.state = "READY";

    return NextResponse.json({ ok: true, match, account });
  } catch (err: any) {
    const msg = (err?.message as string) ?? "UNKNOWN_ERROR";
    const code =
      ["BAD_REQUEST","MATCH_NOT_FOUND","MATCH_FINAL","MATCH_FULL","ACCOUNT_NOT_FOUND","INSUFFICIENT_FUNDS"].includes(msg)
        ? 400
        : 500;
    return NextResponse.json({ ok: false, error: msg }, { status: code });
  }
}