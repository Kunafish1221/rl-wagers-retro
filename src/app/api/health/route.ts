// src/app/api/health/route.ts
import { NextResponse } from "next/server";
import { prisma } from "@/app/server/prisma";

export const dynamic = "force-dynamic";
export const revalidate = 0;

function noStore<T>(json: T, init?: number | ResponseInit) {
  const base: ResponseInit =
    typeof init === "number" ? { status: init } : init || {};
  return NextResponse.json(json, {
    ...base,
    headers: { ...(base.headers || {}), "Cache-Control": "no-store" },
  });
}

export async function GET() {
  const started = Date.now();
  let dbOk = false;
  let dbLatency: number | null = null;
  let error: string | null = null;

  try {
    await prisma.$queryRaw`SELECT 1`;
    dbOk = true;
    dbLatency = Date.now() - started;
  } catch (err: any) {
    console.error("[health] DB check failed", err);
    dbOk = false;
    error = err?.message ?? "db error";
  }

  return noStore({
    ok: true,
    time: new Date().toISOString(),
    db: { ok: dbOk, latencyMs: dbLatency, error },
    version: process.env.NEXT_PUBLIC_COMMIT_SHA || null,
    env: process.env.NODE_ENV ?? null,
  });
}