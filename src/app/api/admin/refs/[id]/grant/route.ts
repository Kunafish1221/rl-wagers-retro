// src/app/api/admin/refs/[id]/revoke/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/app/server/prisma'
import { requireSession } from '@/app/server/session'

export const dynamic = 'force-dynamic'
export const revalidate = 0
const noStore = (j:any,i?:number|ResponseInit)=>NextResponse.json(j, typeof i==='number'?{status:i,headers:{'Cache-Control':'no-store'}}:{...(i||{}),headers:{...((i||{} as any).headers||{}),'Cache-Control':'no-store'}})
const bad=(s:number,m:string)=>noStore({ok:false,error:m},s)

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const gate = await requireSession(req)
  if (!gate.ok) return gate.response
  const { session } = gate
  if (!session.user.isOwner) return bad(403, 'FORBIDDEN')

  const { id } = await ctx.params
  const user = await prisma.user.update({
    where: { id },
    data: { isRef: false },
    select: { id: true, handle: true, isRef: true },
  }).catch(() => null)
  if (!user) return bad(404, 'USER_NOT_FOUND')
  return noStore({ ok: true, user })
}