// src/app/api/dev/escrow/payout/route.ts
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/app/server/prisma";

/**
 * POST /api/dev/escrow/payout
 * Body:
 * {
 *   participants: string[],       // userIds whose LOCKED balances form the pot
 *   winners: string[],            // userIds who receive the pot (split evenly)
 *   feeBps?: number,              // basis points (default 1000 = 10%)
 *   feeUserId?: string            // who receives the fee (e.g., "HOUSE")
 * }
 *
 * - Sums locked WT of all participants -> pot
 * - Sets each participant.locked = 0
 * - Fee = floor(pot * feeBps / 10000) (default 10%)
 * - perWinner = floor((pot - fee) / winners.length)
 * - Credits perWinner to each winner.available
 * - Credits fee to feeUserId.available (if provided)
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const participants = Array.isArray(body.participants) ? body.participants.map(String) : [];
    const winners = Array.isArray(body.winners) ? body.winners.map(String) : [];
    const feeBps = Number.isFinite(body.feeBps) ? Number(body.feeBps) : 1000; // 10%
    const feeUserId = typeof body.feeUserId === "string" ? body.feeUserId : undefined;

    if (!participants.length || !winners.length) {
      return NextResponse.json(
        { ok: false, error: "BAD_REQUEST", details: "Provide participants[] and winners[]" },
        { status: 400 }
      );
    }

    const result = await prisma.$transaction(async (tx) => {
      // Load all participant accounts
      const accts = await tx.ledgerAccount.findMany({
        where: { userId: { in: participants } },
        select: { userId: true, available: true, locked: true },
      });

      if (accts.length !== participants.length) {
        throw new Error("MISSING_PARTICIPANT_ACCOUNT");
      }

      const pot = accts.reduce((sum, a) => sum + a.locked, 0);
      if (pot <= 0) throw new Error("POT_EMPTY");

      // Zero out participant locked balances
      for (const a of accts) {
        if (a.locked > 0) {
          await tx.ledgerAccount.update({
            where: { userId: a.userId },
            data: { locked: 0 },
          });
        }
      }

      // Compute fee and per-winner
      const fee = Math.floor((pot * Math.max(0, feeBps)) / 10000);
      const distributable = pot - fee;
      if (distributable < 0) throw new Error("NEGATIVE_DISTRIBUTABLE");

      const perWinner = Math.floor(distributable / winners.length);

      // Credit winners
      for (const w of winners) {
        // Ensure account exists
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

    return NextResponse.json({ ok: true, ...result });
  } catch (err: any) {
    const msg = (err?.message as string) ?? "UNKNOWN_ERROR";
    const code =
      ["BAD_REQUEST","MISSING_PARTICIPANT_ACCOUNT","POT_EMPTY","NEGATIVE_DISTRIBUTABLE"].includes(msg) ? 400 : 500;
    return NextResponse.json({ ok: false, error: msg }, { status: code });
  }
}