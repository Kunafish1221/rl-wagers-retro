// src/app/api/admin/users/[id]/credit/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/app/server/prisma'
import { requireOwner } from '@/app/server/roles'

type Body = {
  deltaWT: number            // integer, positive (credit) or negative (debit)
  kind?: 'DEPOSIT' | 'WITHDRAWAL' | 'ADJUSTMENT'
  note?: string
  refId?: string             // optional correlation id (ticket, tx, etc.)
  clamp?: boolean            // if true, clamp debit to available; else reject on insufficient
}

type Ok = { ok: true; userId: string; newAvailableWT: number; newLockedWT: number }
type Err = { ok: false; error: string }

function bad(status: number, msg: string) {
  return NextResponse.json<Err>({ ok: false, error: msg }, { status })
}

export async function POST(
  req: NextRequest,
  context: { params: { id: string } }    // ✅ Next 15 style (no Promise)
) {
  const gate = await requireOwner(req)
  if (!gate.ok) return gate.response

  try {
    const { id: userId } = context.params
    const body = (await req.json().catch(() => ({}))) as Partial<Body>

    const delta = Number(body.deltaWT)
    if (!Number.isInteger(delta) || delta === 0) {
      return bad(400, 'deltaWT must be a non-zero integer')
    }
    const kind = body.kind ?? (delta > 0 ? 'DEPOSIT' : 'WITHDRAWAL')
    const note = (body.note ?? '').slice(0, 500)
    const refId = body.refId?.slice(0, 128) ?? null
    const clamp = Boolean(body.clamp)

    const out = await prisma.$transaction(async (tx) => {
      // Ensure user & account exist
      const user = await tx.user.findUnique({ where: { id: userId } })
      if (!user) throw new Error('USER_NOT_FOUND')

      const acct = await tx.ledgerAccount.upsert({
        where: { userId },
        create: { userId, available: 0, locked: 0 },
        update: {},
      })

      let applied = delta
      if (delta < 0) {
        const need = Math.abs(delta)
        if (acct.available < need) {
          if (!clamp) throw new Error('INSUFFICIENT_FUNDS')
          applied = -Math.min(acct.available, need)
          if (applied === 0) throw new Error('INSUFFICIENT_FUNDS')
        }
      }

      // Ledger entry (audit)
      await tx.ledgerEntry.create({
        data: {
          userId,
          delta: applied,
          kind,
          refId: refId ?? undefined,
          meta: note ? { note } : undefined,
        },
      })

      // Update account (source of truth)
      await tx.ledgerAccount.update({
        where: { userId },
        data: { available: { increment: applied } },
      })

      // Mirror simple fields on User
      const u2 = await tx.user.update({
        where: { id: userId },
        data: { availableWT: { increment: applied } },
        select: { availableWT: true, lockedWT: true },
      })

      return { newAvail: u2.availableWT, newLocked: u2.lockedWT }
    })

    return NextResponse.json<Ok>({
      ok: true,
      userId,
      newAvailableWT: out.newAvail,
      newLockedWT: out.newLocked,
    })
  } catch (e: any) {
    const msg = String(e?.message || e)
    if (msg === 'USER_NOT_FOUND') return bad(404, msg)
    if (msg === 'INSUFFICIENT_FUNDS') return bad(400, msg)
    console.error('[admin/users/credit] error', e)
    return bad(500, 'SERVER_ERROR')
  }
}