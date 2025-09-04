// src/app/api/_dev/seed/route.ts
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/app/server/prisma";

/**
 * POST /api/_dev/seed
 * Body: { userId?: string, handle?: string, available?: number, locked?: number }
 * Defaults: id="Kuna", handle="Kuna", available=10000, locked=0
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const userId = (body.userId as string) ?? "Kuna";
    const handle = (body.handle as string) ?? "Kuna";
    const available = Number.isFinite(body.available) ? Number(body.available) : 10000;
    const locked = Number.isFinite(body.locked) ? Number(body.locked) : 0;

    const user = await prisma.user.upsert({
      where: { id: userId },
      update: { handle },
      create: { id: userId, handle },
      select: { id: true, handle: true, createdAt: true },
    });

    const acct = await prisma.ledgerAccount.upsert({
      where: { userId: user.id },
      update: { available, locked },
      create: { userId: user.id, available, locked },
      select: { userId: true, available: true, locked: true },
    });

    return NextResponse.json({ ok: true, user, account: acct });
  } catch (err: any) {
    return NextResponse.json(
      { ok: false, error: err?.message ?? "UNKNOWN_ERROR" },
      { status: 500 }
    );
  }
}