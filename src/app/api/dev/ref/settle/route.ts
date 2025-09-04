// src/app/api/dev/ref/settle/route.ts
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/app/server/prisma";
import { store, type RefMatch } from "@/app/server/devRefStore";

/**
 * POST /api/dev/ref/settle
 * Body: { refId: string, winners: string[], feeBps?: number, feeUserId?: string }
 *
 * Uses in-memory match data (who locked what) to:
 *  - compute pot from lockedByUser
 *  - zero out each participant's locked (down to 0, never negative)
 *  - distribute (pot - fee) evenly to winners.available
 *  - credit fee to feeUserId.available (optional)
 *  - mark match SETTLED
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const refId = String(body.refId ?? "").trim();
    const winners = Array.isArray(body.winners) ? body.winners.map(String) : [];
    const feeBps = Number.isFinite(body.feeBps) ? Number(body.feeBps) : 1000; // 10% default
    const feeUserId = typeof body.feeUserId === "string" ? body.feeUserId : undefined;

    if (!refId || winners.length === 0) {
      return NextResponse.json(
        { ok: false, error: "BAD_REQUEST", details: "Provide refId and winners[]" },
        { status: 400 }
      );
    }

    const matchId = store.byRef.get(refId);
    if (!matchId) return NextResponse.json({ ok: false, error: "MATCH_NOT_FOUND" }, { status: 404 });

    const match = store.byId.get(matchId)!;
    if (match.state === "CANCELLED" || match.state === "SETTLED") {
      return NextResponse.json({ ok: false, error: "MATCH_FINAL" }, { status: 409 });
    }

    // Compute pot from lockedByUser
    const participants = match.players;
    const lockedByUser = match.lockedByUser ?? {};
    const pot = participants.reduce((sum, u) => sum + (lockedByUser[u] ?? 0), 0);
    if (pot <= 0) return NextResponse.json({ ok: false, error: "POT_EMPTY" }, { status: 400 });

    // Do the money moves
    const result = await prisma.$transaction(async (tx) => {
      // Load all participant accounts
      const accts = await tx.ledgerAccount.findMany({
        where: { userId: { in: participants } },
        select: { userId: true, available: true, locked: true },
      });
      if (accts.length !== participants.length) throw new Error("MISSING_PARTICIPANT_ACCOUNT");

      // Zero out each participant's locked by the match amount (cap at available locked)
      for (const uid of participants) {
        const lockAmt = lockedByUser[uid] ?? 0;
        if (lockAmt <= 0) continue;

        const acct = accts.find(a => a.userId === uid)!;
        const dec = Math.min(acct.locked, lockAmt); // defensive cap
        if (dec > 0) {
          await tx.ledgerAccount.update({
            where: { userId: uid },
            data: { locked: acct.locked - dec },
          });
        }
      }

      // Compute fee & per-winner
      const fee = Math.floor((pot * Math.max(0, feeBps)) / 10000);
      const distributable = pot - fee;
      if (distributable < 0) throw new Error("NEGATIVE_DISTRIBUTABLE");

      const perWinner = Math.floor(distributable / winners.length);

      // Credit winners
      for (const w of winners) {
        await tx.ledgerAccount.upsert({
          where: { userId: w },
          update: { available: { increment: perWinner } },
          create: { userId: w, available: perWinner, locked: 0 },
        });
      }

      // Credit fee (optional)
      if (feeUserId && fee > 0) {
        await tx.ledgerAccount.upsert({
          where: { userId: feeUserId },
          update: { available: { increment: fee } },
          create: { userId: feeUserId, available: fee, locked: 0 },
        });
      }

      // Return snapshots
      const updated = await tx.ledgerAccount.findMany({
        where: { userId: { in: [...participants, ...winners, ...(feeUserId ? [feeUserId] : [])] } },
        select: { userId: true, available: true, locked: true },
      });

      return { pot, feeBps, fee, perWinner, accounts: updated };
    });

    // Update in-memory match state
    match.state = "SETTLED";
    match.winners = winners;
    match.settledAt = new Date().toISOString();
    match.lockedByUser = {};
    store.byId.set(match.id, match);

    return NextResponse.json({ ok: true, match, ...result });
  } catch (err: any) {
    const msg = (err?.message as string) ?? "UNKNOWN_ERROR";
    const code = ["BAD_REQUEST","MATCH_NOT_FOUND","MATCH_FINAL","POT_EMPTY","NEGATIVE_DISTRIBUTABLE"].includes(msg)
      ? 400
      : 500;
    return NextResponse.json({ ok: false, error: msg }, { status: code });
  }
}