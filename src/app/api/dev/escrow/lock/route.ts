// src/app/api/dev/escrow/lock/route.ts
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/app/server/prisma";

/**
 * POST /api/dev/escrow/lock
 * Body: { userId: string, amount: number, refId?: string }
 *
 * Moves WT from available -> locked for the user.
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const userId = String(body.userId ?? "");
    const amount = Number(body.amount ?? NaN);
    const refId = (body.refId as string) ?? "DEV_TEST";

    if (!userId || !Number.isFinite(amount) || amount <= 0) {
      return NextResponse.json(
        { ok: false, error: "BAD_REQUEST", details: "Provide userId and positive amount" },
        { status: 400 }
      );
    }

    const result = await prisma.$transaction(async (tx) => {
      const acct = await tx.ledgerAccount.findUnique({ where: { userId } });
      if (!acct) throw new Error("ACCOUNT_NOT_FOUND");
      if (acct.available < amount) throw new Error("INSUFFICIENT_FUNDS");

      const updated = await tx.ledgerAccount.update({
        where: { userId },
        data: {
          available: acct.available - amount,
          locked: acct.locked + amount,
        },
        select: { userId: true, available: true, locked: true },
      });

      return updated;
    });

    return NextResponse.json({ ok: true, userId, refId, account: result });
  } catch (err: any) {
    const msg = (err?.message as string) ?? "UNKNOWN_ERROR";
    const code = (msg === "ACCOUNT_NOT_FOUND" || msg === "INSUFFICIENT_FUNDS") ? 400 : 500;
    return NextResponse.json({ ok: false, error: msg }, { status: code });
  }
}