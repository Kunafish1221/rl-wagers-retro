// src/app/api/system/matches/expire/route.ts
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/app/server/prisma";
import { env } from "@/app/server/env";
import { MatchState, GameMode } from "@prisma/client";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const noStore = (json: any, init?: number | ResponseInit) => {
  const base: ResponseInit = typeof init === "number" ? { status: init } : init || {};
  return NextResponse.json(json, {
    ...base,
    headers: { ...(base.headers || {}), "Cache-Control": "no-store" },
  });
};
const bad = (status: number, msg: string) => noStore({ ok: false, error: msg }, status);

function isAuthed(req: NextRequest): boolean {
  // Preferred: Authorization: Bearer <SYSTEM_CRON_SECRET>
  const auth = req.headers.get("authorization") || "";
  const bearer = auth.replace(/^Bearer\s+/i, "");
  if (env.SYSTEM_CRON_SECRET && bearer === env.SYSTEM_CRON_SECRET) return true;

  // Legacy/compat: x-admin-secret header (MATCH_EXPIRE_SECRET or ADMIN_SECRET)
  const x = req.headers.get("x-admin-secret") || "";
  const legacy = process.env.MATCH_EXPIRE_SECRET || process.env.ADMIN_SECRET || "";
  if (legacy && x === legacy) return true;

  return false;
}

const REQ_PARTICIPANTS: Record<GameMode, number> = {
  ONE_V_ONE: 2,
  TWO_V_TWO: 4,
  THREE_V_THREE: 6,
};

const LEDGER_UNLOCK_KIND = "ESCROW_UNLOCK";

/**
 * POST /api/system/matches/expire
 * Auth (either):
 *   - Authorization: Bearer <SYSTEM_CRON_SECRET>
 *   - x-admin-secret: <MATCH_EXPIRE_SECRET or ADMIN_SECRET>  // legacy
 *
 * Body (all optional):
 * {
 *   dryRun?: boolean,       // default false — if true, only preview
 *   max?: number,           // default 50 — cap processed per run
 *   idleOpenMins?: number,  // default 30 — OPEN older than this cancelled
 *   idleFullMins?: number   // default 15 — FULL older than this cancelled
 * }
 */
export async function POST(req: NextRequest) {
  try {
    if (!isAuthed(req)) return bad(401, "UNAUTHORIZED");

    const body = (await req.json().catch(() => ({}))) as Partial<{
      dryRun: boolean;
      max: number;
      idleOpenMins: number;
      idleFullMins: number;
    }>;

    const dryRun = !!body.dryRun;
    const max = clampInt(body.max, 1, 200, 50);
    const idleOpenMins = clampInt(body.idleOpenMins, 1, 24 * 60, 30);
    const idleFullMins = clampInt(body.idleFullMins, 1, 24 * 60, 15);

    const now = new Date();
    const openCutoff = new Date(now.getTime() - idleOpenMins * 60_000);
    const fullCutoff = new Date(now.getTime() - idleFullMins * 60_000);

    // Fetch candidates (OPEN first, then FULL)
    const openMatches = await prisma.match.findMany({
      where: { state: MatchState.OPEN, updatedAt: { lt: openCutoff } },
      select: {
        id: true,
        mode: true,
        stakeWT: true,
        state: true,
        updatedAt: true,
        participants: { select: { userId: true } },
      },
      orderBy: { updatedAt: "asc" },
      take: max,
    });

    const remaining = Math.max(0, max - openMatches.length);
    const fullMatches =
      remaining > 0
        ? await prisma.match.findMany({
            where: { state: MatchState.FULL, updatedAt: { lt: fullCutoff } },
            select: {
              id: true,
              mode: true,
              stakeWT: true,
              state: true,
              updatedAt: true,
              participants: { select: { userId: true } },
            },
            orderBy: { updatedAt: "asc" },
            take: remaining,
          })
        : [];

    const candidates = [...openMatches, ...fullMatches];

    if (candidates.length === 0) {
      return noStore({ ok: true, updated: 0, results: [] });
    }

    if (dryRun) {
      const preview = candidates.map((m) => ({
        id: m.id,
        state: m.state,
        mode: m.mode,
        stakeWT: m.stakeWT,
        participants: m.participants.length,
        required: REQ_PARTICIPANTS[m.mode as GameMode] ?? null,
        updatedAt: m.updatedAt,
        refundWTTotal: Math.max(0, m.stakeWT || 0) * m.participants.length,
      }));
      return noStore({ ok: true, dryRun: true, count: preview.length, matches: preview });
    }

    const results: Array<{ id: string; refundedWT: number; participants: number; actions: string[] }> = [];

    for (const m of candidates) {
      const actions: string[] = [];

      await prisma.$transaction(async (tx) => {
        // Re-check state within tx
        const current = await tx.match.findUnique({
          where: { id: m.id },
          select: {
            id: true,
            state: true,
            stakeWT: true,
            participants: { select: { userId: true } },
          },
        });

        if (!current) {
          actions.push("SKIP:NOT_FOUND");
          return;
        }
        if (current.state === MatchState.CANCELLED || current.state === MatchState.COMPLETE) {
          actions.push(`SKIP:STATE:${current.state}`);
          return;
        }

        const curStake = Math.max(0, current.stakeWT || 0);
        const userIds = current.participants.map((p) => p.userId);

        // Mark cancelled (idempotent)
        await tx.match.update({ where: { id: current.id }, data: { state: MatchState.CANCELLED } });
        actions.push("CANCELLED");

        // Refund escrow to each participant (idempotent via ledger guard)
        for (const uid of userIds) {
          const already = await tx.ledgerEntry.count({
            where: { userId: uid, kind: LEDGER_UNLOCK_KIND, refId: current.id },
          });
          if (already > 0) {
            actions.push(`SKIP_UNLOCK:${uid}`);
            continue;
          }

          if (curStake > 0) {
            const acct = await tx.ledgerAccount.findUnique({ where: { userId: uid } });
            if (!acct) {
              await tx.ledgerAccount.create({
                data: { userId: uid, available: curStake, locked: 0 },
              });
            } else {
              const dec = Math.min(acct.locked, curStake);
              await tx.ledgerAccount.update({
                where: { userId: uid },
                data: { available: { increment: curStake }, locked: { decrement: dec } },
              });
            }

            // Mirror counters on User (best-effort; will go negative only if drift existed)
            await tx.user.update({
              where: { id: uid },
              data: { availableWT: { increment: curStake }, lockedWT: { decrement: curStake } },
            });

            await tx.ledgerEntry.create({
              data: {
                userId: uid,
                delta: curStake,
                kind: LEDGER_UNLOCK_KIND,
                refId: current.id,
                meta: { reason: "MATCH_EXPIRE_CANCEL" },
              },
            });

            actions.push(`UNLOCK:${uid}:${curStake}`);
          }
        }
      });

      const refundedWT = Math.max(0, m.stakeWT || 0) * m.participants.length;
      results.push({ id: m.id, refundedWT, participants: m.participants.length, actions });
    }

    return noStore({ ok: true, updated: results.length, results });
  } catch (e) {
    console.error("MATCHES_EXPIRE_ERR", e);
    return bad(500, "EXPIRE_FAILED");
  }
}

function clampInt(n: unknown, min: number, max: number, def: number): number {
  const v = Number.isFinite(Number(n)) ? Math.floor(Number(n)) : def;
  return Math.max(min, Math.min(max, v));
}