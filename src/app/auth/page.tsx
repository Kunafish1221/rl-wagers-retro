'use client'

import { useCallback, useMemo, useState } from 'react'

type SessionUser = {
  id: string
  handle: string
  displayName: string | null
  epicId: string
  avatarUrl: string | null
  createdAt: string
}

type MeResponse =
  | { ok: true; user: SessionUser }
  | { ok: false; error: string }

async function safeJson(res: Response) {
  const ct = res.headers.get('content-type') || ''
  if (ct.includes('application/json')) return res.json()
  const txt = await res.text()
  try { return JSON.parse(txt) } catch { return { ok: false, error: txt || res.statusText } }
}

export default function AuthPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPw, setShowPw] = useState(false)

  // notices
  const [msg, setMsg] = useState<string | null>(null)
  const [err, setErr] = useState<string | null>(null)

  // loaders
  const [loadingLogin, setLoadingLogin] = useState(false)
  const [loadingMe, setLoadingMe] = useState(false)
  const [loadingLogout, setLoadingLogout] = useState(false)

  // session (kept for Who Am I? / Logout buttons, but hidden viewer)
  const [me, setMe] = useState<MeResponse | null>(null)

  const emailOk = useMemo(() => /\S+@\S+\.\S+/.test(email.trim().toLowerCase()), [email])
  const pwOk = useMemo(() => password.trim().length >= 6, [password])
  const canSubmit = emailOk && pwOk && !loadingLogin

  function clearNotices() {
    if (msg) setMsg(null)
    if (err) setErr(null)
  }

  const login = useCallback(async () => {
    if (!canSubmit) return
    setMsg(null); setErr(null); setLoadingLogin(true)
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email: email.trim().toLowerCase(), password: password.trim() }),
      })
      const data = await safeJson(res)
      if (!res.ok) {
        const message = (data && (data.error || data.message)) || 'Login failed'
        setErr(message)
        return
      }
      // ✅ Redirect after successful login
      window.location.href = '/profile'
    } catch (e: any) {
      setErr(e?.message || 'Login error')
    } finally {
      setLoadingLogin(false)
    }
  }, [canSubmit, email, password])

  const whoAmI = useCallback(async () => {
    setErr(null); setMsg(null); setLoadingMe(true)
    try {
      const res = await fetch('/api/auth/me', { method: 'GET', cache: 'no-store' })
      const data = await safeJson(res)
      if (!res.ok || !data?.ok) {
        const message = (data && (data.error || data.message)) || 'Not authenticated'
        setErr(message)
        setMe({ ok: false, error: message })
        return
      }
      setMe({ ok: true, user: data.user as SessionUser })
      setMsg('Session active')
    } catch (e: any) {
      const message = e?.message || 'Failed to fetch /me'
      setErr(message)
      setMe({ ok: false, error: message })
    } finally {
      setLoadingMe(false)
    }
  }, [])

  const logout = useCallback(async () => {
    setErr(null); setMsg(null); setLoadingLogout(true)
    try {
      const res = await fetch('/api/auth/logout', { method: 'POST' })
      const data = await safeJson(res)
      if (!res.ok) {
        const message = (data && (data.error || data.message)) || 'Logout failed'
        setErr(message)
        setMe({ ok: false, error: message })
        return
      }
      setMsg('Logged out ✅')
      setMe(null)
    } catch (e: any) {
      const message = e?.message || 'Logout error'
      setErr(message)
      setMe({ ok: false, error: message })
    } finally {
      setLoadingLogout(false)
    }
  }, [])

  return (
    <main className="mx-auto w-full max-w-xl px-6 py-12">
      <header className="mb-6 space-y-2 text-center">
        <h1 className="text-4xl font-extrabold tracking-widest">Sign in</h1>
        <p className="text-sm">
          <a href="/register" className="text-rl-neon underline hover:text-rl-amber">
            Need an account? Create one
          </a>
        </p>
      </header>

      {(msg || err) && (
        <div
          role="status"
          aria-live="polite"
          className={`panel mb-4 p-3 ${
            err ? 'border border-red-400/60 text-red-200' : 'border border-emerald-500/50 text-emerald-300'
          }`}
        >
          {err || msg}
        </div>
      )}

      {/* Login panel */}
      <section className="panel grid gap-4 p-5">
        <label className="grid gap-2">
          <span className="text-xs subtle">Email</span>
          <input
            className={`input ${email && !emailOk ? '!border-rose-500/50' : ''}`}
            type="email"
            placeholder="you@example.com"
            value={email}
            onChange={(e) => { setEmail(e.target.value); clearNotices() }}
            autoComplete="email"
            inputMode="email"
          />
          {email && !emailOk && (
            <span className="text-[11px] text-rose-300/90">Enter a valid email.</span>
          )}
        </label>

        <label className="grid gap-2">
          <span className="text-xs subtle">Password</span>
          <div className="relative">
            <input
              className={`input pr-24 ${password && !pwOk ? '!border-rose-500/50' : ''}`}
              type={showPw ? 'text' : 'password'}
              placeholder="Your password"
              value={password}
              onChange={(e) => { setPassword(e.target.value); clearNotices() }}
              autoComplete="current-password"
              onKeyDown={(e) => { if (e.key === 'Enter') login() }}
            />
            <button
              type="button"
              onClick={() => setShowPw(v => !v)}
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded-lg border border-white/10 px-2 py-1 text-xs text-white/80 hover:bg-white/5"
              title={showPw ? 'Hide password' : 'Show password'}
            >
              {showPw ? 'Hide' : 'Show'}
            </button>
          </div>
          {password && !pwOk && (
            <span className="text-[11px] text-rose-300/90">Password must be at least 6 characters.</span>
          )}
        </label>

        <div className="mt-1 flex flex-wrap items-center gap-3">
          <button
            onClick={login}
            disabled={!canSubmit}
            className="btn btn-primary min-w-[9rem] disabled:opacity-50"
            title={!canSubmit ? 'Enter a valid email & password' : 'Sign in'}
          >
            {loadingLogin ? 'Signing in…' : 'Sign in'}
          </button>

          <button
            onClick={() => whoAmI()}
            disabled={loadingMe}
            className="btn btn-ghost"
            title="Get current session"
          >
            {loadingMe ? 'Checking…' : 'Who am I?'}
          </button>

          <button
            onClick={logout}
            disabled={loadingLogout}
            className="btn btn-outline border-red-500/40 text-red-300 hover:bg-red-500/10"
            title="Clear session"
          >
            {loadingLogout ? 'Logging out…' : 'Log out'}
          </button>
        </div>
      </section>

      <div className="mt-6 text-center">
        <a href="/" className="btn btn-ghost">Back home</a>
      </div>
    </main>
  )
}