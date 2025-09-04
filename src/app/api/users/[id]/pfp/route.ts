// src/app/api/users/[id]/pfp/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/app/server/prisma'
import path from 'path'
import fs from 'fs/promises'

export const runtime = 'nodejs' // needed to use the filesystem

const MAX_BYTES = 5 * 1024 * 1024 // 5 MB
const ALLOWED = new Set(['image/jpeg', 'image/png', 'image/webp'])

function extFor(mime: string, fallbackName?: string) {
  if (mime === 'image/jpeg') return 'jpg'
  if (mime === 'image/png') return 'png'
  if (mime === 'image/webp') return 'webp'
  // try to grab extension from original name as a last resort
  if (fallbackName && fallbackName.includes('.')) {
    return fallbackName.split('.').pop() || 'bin'
  }
  return 'bin'
}

export async function POST(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const { id: userId } = await context.params

    const form = await req.formData()
    const file = form.get('file')

    if (!(file instanceof File)) {
      return NextResponse.json({ ok: false, error: 'NO_FILE' }, { status: 400 })
    }

    // Basic validation
    const type = file.type || 'application/octet-stream'
    const size = (file as any).size as number
    if (!ALLOWED.has(type)) {
      return NextResponse.json({ ok: false, error: 'UNSUPPORTED_TYPE' }, { status: 415 })
    }
    if (size > MAX_BYTES) {
      return NextResponse.json({ ok: false, error: 'TOO_LARGE' }, { status: 413 })
    }

    // Ensure user exists (and fail fast)
    const user = await prisma.user.findUnique({ where: { id: userId }, select: { id: true } })
    if (!user) {
      return NextResponse.json({ ok: false, error: 'USER_NOT_FOUND' }, { status: 404 })
    }

    // Save file to /public/u/pfp
    const uploadDir = path.join(process.cwd(), 'public', 'u', 'pfp')
    await fs.mkdir(uploadDir, { recursive: true })

    const originalName = (file as any).name as string | undefined
    const ext = extFor(type, originalName)
    const filename = `${userId}-${Date.now()}.${ext}`
    const filepath = path.join(uploadDir, filename)

    const arrayBuffer = await file.arrayBuffer()
    const buffer = Buffer.from(arrayBuffer)
    await fs.writeFile(filepath, buffer)

    // Public URL (served by Next static from /public)
    const url = `/u/pfp/${filename}`

    await prisma.user.update({
      where: { id: userId },
      data: { avatarUrl: url },
    })

    return NextResponse.json({ ok: true, url })
  } catch (err) {
    console.error('[POST /api/users/[id]/pfp] error:', err)
    return NextResponse.json({ ok: false, error: 'INTERNAL_ERROR' }, { status: 500 })
  }
}