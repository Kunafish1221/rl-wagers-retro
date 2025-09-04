// src/app/profile/page.tsx
'use client'

import { useEffect, useState } from 'react'

type Profile = {
  id: string
  handle: string | null
  displayName: string | null
  epicId: string | null
  avatarUrl: string | null
  createdAt: string
}

type Ok<T>  = { ok: true } & T
type Err    = { ok: false; error: string }
type MeResp = Ok<{ user: Profile }> | Err
type GetResp = Ok<{ user: Profile }> | Err

// ---- tiny toast (same style as discovery) ----
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

// ---- robust JSON helper ----
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

export default function ProfilePage() {
  // session
  const [userId, setUserId] = useState<string | null>(null)
  const [checking, setChecking] = useState(true)

  // login form
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loggingIn, setLoggingIn] = useState(false)

  // profile data/ui
  const [profile, setProfile] = useState<Profile | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [msg, setMsg] = useState<string | null>(null)

  // editable: Epic IGN
  const [epicEdit, setEpicEdit] = useState('')
  const [savingEpic, setSavingEpic] = useState(false)

  // editable: password
  const [pwCurrent, setPwCurrent] = useState('')
  const [pwNew, setPwNew] = useState('')
  const [pwConfirm, setPwConfirm] = useState('')
  const [savingPw, setSavingPw] = useState(false)

  // --- session check (use /api/auth/me) ---
  useEffect(() => {
    (async () => {
      try {
        const j = (await safeJson(await fetch('/api/auth/me', { cache: 'no-store' }))) as MeResp
        if (j.ok && j.user) {
          setUserId(j.user.id)
          setProfile(j.user)
          setEpicEdit(j.user.epicId ?? '')
        } else {
          setUserId(null)
        }
      } catch {
        setUserId(null)
      } finally {
        setChecking(false)
      }
    })()
  }, [])

  // --- login ---
  async function login() {
    setError(null); setMsg(null); setLoggingIn(true)
    try {
      await safeJson(await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim().toLowerCase(), password: password.trim() }),
      }))
      const j = (await safeJson(await fetch('/api/auth/me', { cache: 'no-store' }))) as MeResp
      if (j.ok && j.user) {
        setUserId(j.user.id)
        setProfile(j.user)
        setEpicEdit(j.user.epicId ?? '')
        setMsg('Logged in')
        toast('Logged in')
      } else {
        setUserId(null)
      }
    } catch (e: any) {
      setError(e?.message || 'Login failed'); toast('Login failed', true)
    } finally {
      setLoggingIn(false); setTimeout(() => setMsg(null), 2000)
    }
  }

  // --- logout ---
  async function logout() {
    try { await safeJson(await fetch('/api/auth/logout', { method: 'POST' })) } catch {}
    setUserId(null)
    setProfile(null)
    setMsg('Logged out'); toast('Logged out')
    setTimeout(() => setMsg(null), 1500)
  }

  // --- load profile (read-only) ---
  async function load(id = userId) {
    if (!id) return
    setError(null); setMsg(null); setLoading(true)
    try {
      const r = await fetch(`/api/users/${encodeURIComponent(id)}/profile`, { cache: 'no-store' })
      const j = (await safeJson(r)) as GetResp
      if (!j.ok) throw new Error(j.error)
      setProfile(j.user)
      setEpicEdit(j.user.epicId ?? '')
      setMsg('Profile loaded'); toast('Profile loaded')
    } catch (e: any) {
      setError(e?.message || 'Failed to load'); setProfile(null)
    } finally {
      setLoading(false); setTimeout(() => setMsg(null), 2000)
    }
  }

  // --- save Epic IGN only ---
  async function saveEpicId() {
    if (!userId) return
    const next = epicEdit.trim()
    if (next.length < 3) {
      toast('Epic IGN must be at least 3 characters.', true)
      return
    }
    setSavingEpic(true); setError(null); setMsg(null)
    try {
      await safeJson(await fetch(`/api/users/${encodeURIComponent(userId)}/profile`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ epicId: next }),
      }))
      await load(userId)
      localStorage.setItem('rl.ign', next)
      setMsg('Epic IGN updated'); toast('Epic IGN updated')
    } catch (e: any) {
      setError(e?.message || 'Failed to update Epic IGN'); toast('Failed to update Epic IGN', true)
    } finally {
      setSavingEpic(false); setTimeout(() => setMsg(null), 2000)
    }
  }

  // --- change password only ---
  async function changePassword() {
    if (!userId) return
    const cur = pwCurrent.trim()
    const nxt = pwNew.trim()
    const conf = pwConfirm.trim()

    if (!cur || !nxt) {
      toast('Enter current and new password.', true)
      return
    }
    if (nxt.length < 8) {
      toast('New password must be at least 8 characters.', true)
      return
    }
    if (nxt !== conf) {
      toast('New password and confirmation do not match.', true)
      return
    }

    setSavingPw(true); setError(null); setMsg(null)
    try {
      await safeJson(await fetch('/api/auth/change-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ currentPassword: cur, newPassword: nxt }),
      }))
      setPwCurrent(''); setPwNew(''); setPwConfirm('')
      setMsg('Password changed'); toast('Password changed')
    } catch (e: any) {
      setError(e?.message || 'Failed to change password'); toast('Failed to change password', true)
    } finally {
      setSavingPw(false); setTimeout(() => setMsg(null), 2000)
    }
  }

  // ------- UI -------
  if (checking) {
    return (
      <main className="min-h-screen px-6 py-8 md:px-10 lg:px-16">
        <h1 className="h1">PROFILE</h1>
        <p className="subtle mt-3">Checking session…</p>
      </main>
    )
  }

  if (!userId) {
    // LOGIN ONLY
    return (
      <main className="min-h-screen px-6 py-8 md:px-10 lg:px-16">
        <header className="mb-6 flex items-center justify-between">
          <h1 className="h1">PROFILE</h1>
          <a href="/" className="btn btn-ghost">Home</a>
        </header>

        {error && <div className="panel p-4 border border-red-400/60 text-red-200 mb-4">{error}</div>}
        {msg &&   <div className="panel p-4 border border-rl-stroke/40 text-rl-amber mb-4">{msg}</div>}

        <section className="panel p-6 max-w-md mx-auto">
          <h2 className="text-xl font-bold tracking-wider mb-4">Log in</h2>
          <div className="grid gap-3">
            <input
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
              onClick={login}
              disabled={loggingIn}
              className="btn btn-primary disabled:opacity-60"
            >
              {loggingIn ? 'Logging in…' : 'Log in'}
            </button>
          </div>

          <p className="mt-4 text-sm subtle">
            Don’t have an account?{' '}
            <a href="/auth/register" className="link">Register</a>
          </p>
        </section>
      </main>
    )
  }

  // ACCOUNT INFO + LIMITED EDITS
  return (
    <main className="min-h-screen px-6 py-8 md:px-10 lg:px-16">
      <header className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="h1">PROFILE</h1>
          <p className="subtle mt-1">Manage your Epic IGN and password. Other fields are read-only.</p>
        </div>
        <div className="flex items-center gap-3">
          <a href="/discovery" className="btn btn-ghost">Discovery</a>
          <a href="/wallet" className="btn btn-ghost">Wallet</a>
          <button onClick={logout} className="btn btn-outline">Logout</button>
        </div>
      </header>

      {error && <div className="panel p-4 border border-red-400/60 text-red-200 mb-4">{error}</div>}
      {msg &&   <div className="panel p-4 border border-rl-stroke/40 text-rl-amber mb-4">{msg}</div>}

      <section className="panel p-5">
        <div className="grid gap-6 md:grid-cols-[160px,1fr] md:gap-8">
          {/* Avatar */}
          <div className="flex flex-col items-center gap-3">
            <div className="h-28 w-28 overflow-hidden rounded-2xl border border-white/10 bg-white/5">
              {profile?.avatarUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={profile.avatarUrl} alt="avatar" className="h-full w-full object-cover" />
              ) : (
                <div className="flex h-full w-full items-center justify-center text-sm text-white/50">
                  No Avatar
                </div>
              )}
            </div>
          </div>

          {/* Details + edits */}
          <div className="grid gap-6">
            {/* Read-only fields */}
            <div className="grid gap-4">
              <div>
                <div className="text-sm subtle">Handle</div>
                <div className="input !cursor-default select-text">@{profile?.handle ?? '—'}</div>
              </div>
              <div>
                <div className="text-sm subtle">Display name</div>
                <div className="input !cursor-default select-text">{profile?.displayName ?? '—'}</div>
              </div>
              <div>
                <div className="text-sm subtle">Joined</div>
                <div className="input !cursor-default select-text">
                  {profile ? new Date(profile.createdAt).toLocaleString() : '—'}
                </div>
              </div>
            </div>

            {/* Editable: Epic IGN */}
            <div className="border-t border-white/10 pt-4">
              <h3 className="text-lg font-semibold mb-3">Epic IGN</h3>
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                <input
                  value={epicEdit}
                  onChange={(e) => setEpicEdit(e.target.value)}
                  placeholder="Your Epic IGN"
                  className="input sm:w-[320px]"
                  aria-label="Epic IGN"
                  autoComplete="off"
                />
                <button
                  onClick={saveEpicId}
                  disabled={savingEpic}
                  className="btn btn-primary disabled:opacity-60"
                >
                  {savingEpic ? 'Saving…' : 'Save IGN'}
                </button>
              </div>
              <p className="text-xs subtle mt-2">Used for in-game invites and verification.</p>
            </div>

            {/* Editable: Password */}
            <div className="border-t border-white/10 pt-4">
              <h3 className="text-lg font-semibold mb-3">Change Password</h3>
              <div className="grid gap-3 sm:max-w-md">
                <input
                  value={pwCurrent}
                  onChange={(e) => setPwCurrent(e.target.value)}
                  placeholder="Current password"
                  type="password"
                  className="input"
                  autoComplete="current-password"
                />
                <input
                  value={pwNew}
                  onChange={(e) => setPwNew(e.target.value)}
                  placeholder="New password (min 8 chars)"
                  type="password"
                  className="input"
                  autoComplete="new-password"
                />
                <input
                  value={pwConfirm}
                  onChange={(e) => setPwConfirm(e.target.value)}
                  placeholder="Confirm new password"
                  type="password"
                  className="input"
                  autoComplete="new-password"
                />
                <div className="flex items-center gap-2">
                  <button
                    onClick={changePassword}
                    disabled={savingPw}
                    className="btn btn-outline disabled:opacity-60"
                  >
                    {savingPw ? 'Updating…' : 'Update Password'}
                  </button>
                  <button
                    onClick={() => { setPwCurrent(''); setPwNew(''); setPwConfirm('') }}
                    className="btn btn-ghost"
                  >
                    Clear
                  </button>
                </div>
              </div>
            </div>

            <div className="pt-2">
              <button onClick={() => load()} disabled={loading} className="btn btn-ghost disabled:opacity-60">
                {loading ? 'Reloading…' : 'Reload'}
              </button>
            </div>
          </div>
        </div>
      </section>

      <div id="toast-root" />
    </main>
  )
}