// src/app/api/_dev/seed/route.ts
import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/app/server/prisma"

export const dynamic = "force-dynamic"
export const revalidate = 0

function noStore(json: any, init?: number | ResponseInit) {
  const base: ResponseInit =
    typeof init === "number" ? { status: init } : init || {}
  return NextResponse.json(json, {
    ...base,
    headers: { ...(base.headers || {}), "Cache-Control": "no-store" },
  })
}

/**
 * POST /api/_dev/seed
 * Body:
 *   {
 *     userId?: string,         // default "Kuna"
 *     handle?: string,         // default "Kuna"
 *     epicId?: string,         // optional; will be generated if missing
 *     available?: number,      // default 10000
 *     locked?: number          // default 0
 *   }
 */
export async function POST(req: NextRequest) {
  try {
    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>

    const userId = String((body.userId ?? "Kuna")).trim()
    const handleInput = String((body.handle ?? "Kuna")).trim()
    const handle = handleInput.toLowerCase()

    // number parsing with sane defaults
    const availableRaw = Number((body as any).available)
    const lockedRaw = Number((body as any).locked)
    const available = Number.isFinite(availableRaw) ? Math.max(0, Math.floor(availableRaw)) : 10000
    const locked = Number.isFinite(lockedRaw) ? Math.max(0, Math.floor(lockedRaw)) : 0

    // epicId handling (required by schema)
    let epicId = (body.epicId != null ? String(body.epicId) : "").trim()
    if (!epicId) {
      const short = userId.replace(/[^a-z0-9]/gi, "").slice(0, 6) || "USER"
      epicId = `${handle.toUpperCase()}_${short}`
    }

    // Upsert user (epicId is REQUIRED on create)
    const user = await prisma.user.upsert({
      where: { id: userId },
      update: {
        handle,
        // Avoid overwriting existing epicId on update unless explicitly provided
        ...(body.epicId ? { epicId } : {}),
      },
      create: {
        id: userId,
        handle,
        epicId, // required
      },
      select: {
        id: true,
        handle: true,
        epicId: true,
        availableWT: true,
        lockedWT: true,
        createdAt: true,
      },
    })

    // Ensure ledger account & mirror the simple fields on User
    const acct = await prisma.$transaction(async (tx) => {
      const account = await tx.ledgerAccount.upsert({
        where: { userId: user.id },
        create: { userId: user.id, available, locked },
        update: { available, locked },
        select: { userId: true, available: true, locked: true },
      })

      // Keep User mirror fields in sync with ledger
      const mirror = await tx.user.update({
        where: { id: user.id },
        data: { availableWT: available, lockedWT: locked },
        select: { availableWT: true, lockedWT: true },
      })

      return { account, mirror }
    })

    return noStore({ ok: true, user: { ...user, ...acct.mirror }, account: acct.account })
  } catch (err: any) {
    console.error("DEV_SEED_ERR", err)
    return noStore(
      { ok: false, error: err?.message ?? "UNKNOWN_ERROR" },
      500
    )
  }
}