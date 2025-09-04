// src/app/login/page.tsx
'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'

function toast(msg: string, danger = false) {
  let root = document.getElementById('toast-root')
  if (!root) {
    root = document.createElement('div')
    root.id = 'toast-root'
    document.body.appendChild(root)
  }
  const t = document.createElement('div')
  t.className = `toast ${danger ? 'bg-[var(--rl-danger)] text-white' : ''}`
  t.textContent = msg
  root.appendChild(t)
  setTimeout(() => t.remove(), 2200)
}

async function safeJson(res: Response) {
  const ct = res.headers.get('content-type') || ''
  let data: any = {}
  try {
    if (ct.includes('application/json')) data = await res.json()
    else {
      const txt = await res.text()
      data = txt ? JSON.parse(txt) : {}
    }
  } catch { data = {} }
  if (!res.ok) {
    const msg = (data?.error || data?.message) ?? `HTTP_${res.status}`
    throw new Error(msg)
  }
  return data
}

export default function LoginPage() {
  const router = useRouter()

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loggingIn, setLoggingIn] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [msg, setMsg] = useState<string | null>(null)

  const emailRef = useRef<HTMLInputElement>(null)

  // If already logged in, bounce to profile
  useEffect(() => {
    fetch('/api/auth/session', { cache: 'no-store' })
      .then((r) => r.json())
      .then((j) => {
        if (j?.ok) router.replace('/profile')
      })
      .catch(() => {})
  }, [router])

  async function login(e?: React.FormEvent) {
    e?.preventDefault()
    setError(null); setMsg(null); setLoggingIn(true)
    try {
      await safeJson(await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim().toLowerCase(), password: password.trim() }),
      }))
      setMsg('Logged in'); toast('Logged in')
      setTimeout(() => router.replace('/profile'), 300)
    } catch (e: any) {
      setError(e?.message || 'Login failed')
      toast('Login failed', true)
      emailRef.current?.focus()
    } finally {
      setLoggingIn(false); setTimeout(() => setMsg(null), 2000)
    }
  }

  return (
    <main className="min-h-screen px-6 py-8 md:px-10 lg:px-16">
      <header className="mb-6 flex items-center justify-between">
        <h1 className="h1">LOGIN</h1>
        <a href="/" className="btn btn-ghost">Home</a>
      </header>

      {error && <div className="panel mb-4 p-4 border border-red-400/60 text-red-200">{error}</div>}
      {msg &&   <div className="panel mb-4 p-4 border border-rl-stroke/40 text-rl-amber">{msg}</div>}

      <section className="panel mx-auto max-w-md p-6">
        <h2 className="mb-4 text-xl font-bold tracking-wider">Log in</h2>
        <form onSubmit={login} className="grid gap-3">
          <input
            ref={emailRef}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="Email"
            type="email"
            className="input"
            autoComplete="email"
          />
          <input
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Password"
            type="password"
            className="input"
            autoComplete="current-password"
          />
          <button
            type="submit"
            disabled={loggingIn}
            className="btn btn-primary disabled:opacity-60"
          >
            {loggingIn ? 'Logging in…' : 'Log in'}
          </button>
        </form>

        <p className="subtle mt-4 text-sm">
          Don’t have an account?{' '}
          <a href="/auth/register" className="link">Register</a>
        </p>
      </section>

      <div id="toast-root" />
    </main>
  )
}