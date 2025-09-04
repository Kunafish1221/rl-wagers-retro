import { NextRequest, NextResponse } from 'next/server'
import { loginAndSetCookie } from '@/app/server/session'

type Body = { email?: string; password?: string }

function bad(status: number, msg: string) {
  return NextResponse.json({ error: msg }, { status })
}

export async function POST(req: NextRequest) {
  try {
    const { email, password } = (await req.json().catch(() => ({}))) as Body
    const normalized = (email ?? '').trim().toLowerCase()
    const pw = (password ?? '').trim()
    if (!normalized || !pw) return bad(400, 'email and password required')

    // Uses Credentials table + creates DB session + sets HttpOnly cookie ('sid')
    return await loginAndSetCookie({ email: normalized, password: pw }, req)
  } catch (e) {
    console.error('LOGIN_ERR', e)
    return bad(500, 'Login failed')
  }
}