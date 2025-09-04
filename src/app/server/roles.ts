// src/app/server/roles.ts
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/app/server/prisma'
import { requireSession } from '@/app/server/session'

/**
 * Optional ref allowlist via env:
 * - REF_ALLOWLIST_IDS=ck123,ck456
 * - REF_ALLOWLIST_HANDLES=ref_alex,ref_maya
 */
function envList(name: string): Set<string> {
  const raw = process.env[name]?.trim()
  if (!raw) return new Set()
  return new Set(
    raw
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)
  )
}

const REF_ID_ALLOW = envList('REF_ALLOWLIST_IDS')
const REF_HANDLE_ALLOW = envList('REF_ALLOWLIST_HANDLES')

export type RoleGate =
  | { ok: true; user: { id: string; handle: string; isRef: boolean; isOwner: boolean } }
  | { ok: false; response: NextResponse }

function forbidden(msg: string) {
  return NextResponse.json({ ok: false, error: msg }, { status: 403 })
}
function unauthorized() {
  return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 })
}

/**
 * requireRole:
 *  - Ensures there is a valid session
 *  - Refreshes role flags from DB (source of truth)
 *  - Optionally enforces owner/ref role
 *  - Optionally enforces ref allowlist (if env provided)
 *
 * Usage:
 *   const gate = await requireRole(req, { owner: true })           // owner-only
 *   const gate = await requireRole(req, { ref: true })             // ref-only
 *   const gate = await requireRole(req, { ref: true, owner: true })// either role ok
 */
export async function requireRole(
  req: NextRequest,
  opts: { owner?: boolean; ref?: boolean } = {}
): Promise<RoleGate> {
  const gate = await requireSession(req)
  if (!gate.ok) return { ok: false, response: unauthorized() }

  const sessionUserId = (gate.session as any).userId ?? gate.session.userId

  // Pull fresh flags from DB
  const u = await prisma.user.findUnique({
    where: { id: sessionUserId },
    select: { id: true, handle: true, isRef: true, isOwner: true },
  })
  if (!u) return { ok: false, response: unauthorized() }

  // No role required, just return identity
  if (!opts.owner && !opts.ref) {
    return { ok: true, user: u }
  }

  // If both acceptable: pass if either is true
  if (opts.owner && opts.ref) {
    if (u.isOwner || u.isRef) {
      // If ref path, also check allowlist if present
      if (u.isRef && (REF_ID_ALLOW.size || REF_HANDLE_ALLOW.size)) {
        const allowed =
          REF_ID_ALLOW.has(u.id) || REF_HANDLE_ALLOW.has(u.handle.toLowerCase())
        if (!allowed) return { ok: false, response: forbidden('REF_NOT_ALLOWLISTED') }
      }
      return { ok: true, user: u }
    }
    return { ok: false, response: forbidden('ROLE_REQUIRED') }
  }

  // Owner-only
  if (opts.owner) {
    if (!u.isOwner) return { ok: false, response: forbidden('OWNER_ONLY') }
    return { ok: true, user: u }
  }

  // Ref-only
  if (opts.ref) {
    if (!u.isRef) return { ok: false, response: forbidden('REF_ONLY') }
    if (REF_ID_ALLOW.size || REF_HANDLE_ALLOW.size) {
      const allowed =
        REF_ID_ALLOW.has(u.id) || REF_HANDLE_ALLOW.has(u.handle.toLowerCase())
      if (!allowed) return { ok: false, response: forbidden('REF_NOT_ALLOWLISTED') }
    }
    return { ok: true, user: u }
  }

  // Shouldn't reach here
  return { ok: false, response: forbidden('ROLE_REQUIRED') }
}

/** Tiny sugar helpers if you like one-liners in routes */
export async function requireOwner(req: NextRequest) {
  return requireRole(req, { owner: true })
}
export async function requireRef(req: NextRequest) {
  return requireRole(req, { ref: true })
}