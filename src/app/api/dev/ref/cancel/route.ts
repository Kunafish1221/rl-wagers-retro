// src/app/api/dev/ref/cancel/route.ts
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/app/server/prisma";
import { store } from "@/app/server/devRefStore";

/**
 * POST /api/dev/ref/cancel
 * Body: { refId: string }
 *
 * - Looks up the in-memory match.
 * - Unlocks each player's locked amount for THIS match (locked -> available).
 * - Marks match CANCELLED and clears lockedByUser.
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const refId = String(body.refId ?? "").trim();
    if (!refId) return NextResponse.json({ ok: false, error: "BAD_REQUEST" }, { status: 400 });

    const matchId = store.byRef.get(refId);
    if (!matchId) return NextResponse.json({ ok: false, error: "MATCH_NOT_FOUND" }, { status: 404 });

    const match = store.byId.get(matchId)!;
    if (match.state === "CANCELLED" || match.state === "SETTLED") {
      return NextResponse.json({ ok: false, error: "MATCH_FINAL" }, { status: 409 });
    }

    const participants = match.players;
    const lockedByUser = match.lockedByUser ?? {};

    // Unlock in a single transaction
    const result = await prisma.$transaction(async (tx) => {
      for (const uid of participants) {
        const amt = lockedByUser[uid] ?? 0;
        if (amt <= 0) continue;

        const acct = await tx.ledgerAccount.findUnique({ where: { userId: uid } });
        if (!acct) continue;

        const dec = Math.min(acct.locked, amt); // defensive cap
        if (dec > 0) {
          await tx.ledgerAccount.update({
            where: { userId: uid },
            data: {
              locked: acct.locked - dec,
              available: acct.available + dec,
            },
          });
        }
      }

      // Snapshot
      const updated = await tx.ledgerAccount.findMany({
        where: { userId: { in: participants } },
        select: { userId: true, available: true, locked: true },
      });

      return { accounts: updated };
    });

    // Update in-memory state
    match.state = "CANCELLED";
    match.lockedByUser = {};
    store.byId.set(match.id, match);

    return NextResponse.json({ ok: true, match, ...result });
  } catch (err: any) {
    const msg = (err?.message as string) ?? "UNKNOWN_ERROR";
    const code = ["BAD_REQUEST","MATCH_NOT_FOUND","MATCH_FINAL"].includes(msg) ? 400 : 500;
    return NextResponse.json({ ok: false, error: msg }, { status: code });
  }
}