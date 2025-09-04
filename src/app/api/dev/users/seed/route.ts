import { NextResponse } from 'next/server'
import { prisma } from '@/app/server/prisma'

export async function GET() {
  const id = 'demo-user-id'
  const handle = 'demo_user'

  const user = await prisma.user.upsert({
    where: { id },
    update: {},
    create: { id, handle }, // keep fields minimal to match your User model
    select: { id: true, handle: true },
  })

  return NextResponse.json({ ok: true, user })
}