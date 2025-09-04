// src/app/register/page.tsx
'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

type Ok<T> = { ok: true } & T
type Err = { ok: false; error: string }
type RegisterResp = Ok<{ user: {
  id: string; epicId: string | null; createdAt: string
} }> | Err

async function safeJson(res: Response) {
  const ct = res.headers.get('content-type') || ''
  let data: any = {}
  try {
    if (ct?.includes('application/json')) data = await res.json()
    else {
      const txt = await res.text()
      data = txt ? JSON.parse(txt) : {}
    }
  } catch { data = {} }
  if (!res.ok) {
    const msg = (data && (data.error || data.message)) || `HTTP_${res.status}`
    throw new Error(msg)
  }
  return data
}

export default function RegisterPage() {
  const r = useRouter()

  // required
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [epicId, setEpicId] = useState('')

  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [msg, setMsg] = useState<string | null>(null)

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null); setMsg(null)

    if (!email.trim()) return setError('Email is required.')
    if (!password.trim() || password.length < 8) return setError('Password must be at least 8 characters.')
    if (!epicId.trim()) return setError('Epic ID is required.')

    setSubmitting(true)
    try {
      // Create account (no handle/displayName)
      const res = await safeJson(await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: email.trim().toLowerCase(),
          password: password.trim(),
          epicId: epicId.trim(),
        }),
      })) as RegisterResp

      if (!res.ok) throw new Error(res.error)

      // Auto-login
      await safeJson(await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim().toLowerCase(), password: password.trim() }),
      }))

      setMsg('Account created! Redirecting…')
      r.push('/profile')
    } catch (e: any) {
      setError(e?.message || 'Registration failed')
    } finally {
      setSubmitting(false)
      setTimeout(() => setMsg(null), 2500)
    }
  }

  return (
    <main className="min-h-screen px-6 py-8 md:px-10 lg:px-16">
      <header className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="h1">REGISTER</h1>
          <p className="subtle mt-1">
            Your <span className="text-rl-amber">Epic in-game name</span> will be your identity across matches.
          </p>
        </div>
        <nav className="flex items-center gap-3">
          <a href="/discovery" className="btn btn-ghost">Discovery</a>
          <a href="/profile" className="btn btn-outline">Log in</a>
        </nav>
      </header>

      {error && (
        <div className="panel p-4 border border-red-400/60 text-red-200 mb-5">{error}</div>
      )}
      {msg && (
        <div className="panel p-4 border border-rl-stroke/40 text-rl-amber mb-5">{msg}</div>
      )}

      <section className="panel p-6 md:p-7 max-w-2xl">
        <form onSubmit={onSubmit} className="grid gap-5">
          {/* Required */}
          <div className="grid gap-1">
            <label className="text-sm text-white/80">Email *</label>
            <input
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              type="email"
              className="input"
            />
          </div>

          <div className="grid gap-1">
            <label className="text-sm text-white/80">Password *</label>
            <input
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Minimum 8 characters"
              type="password"
              className="input"
            />
          </div>

          <div className="grid gap-1">
            <label className="text-sm text-white/80">Epic ID (IGN) *</label>
            <input
              value={epicId}
              onChange={(e) => setEpicId(e.target.value)}
              placeholder="your Epic in-game name"
              className="input"
            />
            <p className="text-xs subtle">Used for invites / verification.</p>
          </div>

          <div className="pt-2">
            <button
              type="submit"
              disabled={submitting}
              className="btn btn-primary disabled:opacity-60"
            >
              {submitting ? 'Creating…' : 'Create account'}
            </button>
          </div>
        </form>

        <p className="mt-6 text-sm subtle">
          By continuing you agree to our <a href="/tos" className="link">Terms</a> and <a href="/privacy" className="link">Privacy</a>.
        </p>
      </section>
    </main>
  )
}