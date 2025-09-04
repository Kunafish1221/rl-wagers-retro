// src/app/api/auth/register/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/app/server/prisma'
import bcrypt from 'bcryptjs'

type Body = {
  email?: string
  password?: string
  handle?: string
  displayName?: string
  epicId?: string       // Epic IGN (required)
}

const emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

function err(status: number, message: string, detail?: string) {
  return NextResponse.json(detail ? { error: message, detail } : { error: message }, { status })
}

const norm = (s?: string | null) => (s ?? '').trim()
const normEmail = (e: string) => e.trim().toLowerCase()

function sanitizeHandle(raw: string) {
  return raw
    .trim()
    .replace(/\s+/g, '_')
    .replace(/[^a-zA-Z0-9_]/g, '')
    .toLowerCase()
    .slice(0, 24) || 'player'
}

function baseHandleFrom(email: string) {
  const local = email.split('@')[0] || 'user'
  return sanitizeHandle(local).slice(0, 18) || 'user'
}

async function uniqueHandle(seed: string) {
  let candidate = sanitizeHandle(seed)
  if (!candidate) candidate = 'player'
  let i = 0
  while (true) {
    const exists = await prisma.user.findUnique({ where: { handle: candidate } })
    if (!exists) return candidate
    i += 1
    candidate = sanitizeHandle(`${seed}_${i + 1}`)
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as Body

    const email = normEmail(norm(body.email))
    const password = norm(body.password)
    const displayName = norm(body.displayName) || undefined
    const epicId = norm(body.epicId) // required
    const requestedHandle = sanitizeHandle(norm(body.handle))

    // Validate
    if (!email || !emailRe.test(email)) return err(400, 'Invalid email')
    if (!password || password.length < 8) return err(400, 'Password must be at least 8 characters')
    if (!epicId || epicId.length < 3) return err(400, 'Invalid Epic IGN')

    // Uniqueness on credentials
    const existingCred = await prisma.credentials.findUnique({ where: { email } })
    if (existingCred) return err(409, 'Email already registered')

    // Unique handle (prefer requested -> epicId -> derived from email)
    const base = requestedHandle || sanitizeHandle(epicId) || baseHandleFrom(email)
    const handle = await uniqueHandle(base)

    // Hash password
    const passwordHash = await bcrypt.hash(password, 12)

    // Transaction: create user + credentials (+ account)
    const { user } = await prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          handle,
          displayName,
          epicId,
          availableWT: 0,
          lockedWT: 0,
          account: {
            create: { available: 0, locked: 0 },
          },
        },
        select: {
          id: true,
          handle: true,
          displayName: true,
          epicId: true,
          createdAt: true,
        },
      })

      await tx.credentials.create({
        data: {
          userId: user.id,
          email,
          passwordHash,
        },
      })

      return { user }
    })

    return NextResponse.json({ ok: true, user })
  } catch (e: any) {
    const msg = String(e?.message || e)
    if (msg.includes('P2002')) {
      if (msg.includes('Credentials_email_key') || msg.includes('Credentials.email')) {
        return err(409, 'Email already registered')
      }
      if (msg.includes('User_handle_key') || msg.includes('User.handle')) {
        return err(409, 'Handle already taken')
      }
      if (msg.includes('User_epicId_key') || msg.includes('User.epicId')) {
        return err(409, 'Epic ID already linked')
      }
    }
    console.error('REGISTER_ERR', e)
    return err(500, 'Registration failed', msg)
  }
}