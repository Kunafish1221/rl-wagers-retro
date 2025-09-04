// src/app/status/page.tsx
import type { Metadata } from 'next'

export const dynamic = 'force-dynamic'
export const revalidate = 0

type Health = {
  ok: boolean
  time: string
  db: { ok: boolean; latencyMs: number | null }
  version: string | null
  env: string | null
}

function StatusDot({ ok }: { ok: boolean }) {
  return (
    <span
      className={[
        'inline-block h-2.5 w-2.5 rounded-full align-middle',
        ok ? 'bg-emerald-400 shadow-[0_0_10px_rgba(16,185,129,0.8)]' : 'bg-rose-500 shadow-[0_0_10px_rgba(244,63,94,0.7)]',
      ].join(' ')}
      aria-hidden
    />
  )
}

async function getHealth(): Promise<Health | null> {
  try {
    const res = await fetch(`${process.env.NEXT_PUBLIC_BASE_URL || ''}/api/health`, {
      cache: 'no-store',
      headers: { 'x-status': '1' },
    })
    if (!res.ok) return null
    return (await res.json()) as Health
  } catch {
    return null
  }
}

export const metadata: Metadata = {
  title: 'Status · WAGER RL',
}

export default async function StatusPage() {
  const health = await getHealth()

  return (
    <main className="min-h-screen bg-[#0b0e13] text-white">
      {/* subtle glow */}
      <div className="pointer-events-none fixed inset-0 -z-10">
        <div className="absolute inset-0 bg-[radial-gradient(60%_40%_at_50%_0%,rgba(62,255,208,0.06),transparent_60%)]" />
      </div>

      <header className="border-b border-rl-stroke/40">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-6">
          <a href="/" className="group inline-flex items-center gap-3">
            <span className="inline-block h-2 w-2 rounded-full bg-rl-neon shadow-[0_0_12px_var(--rl-neon)]" />
            <span className="tracking-widest text-white/80 group-hover:text-white">HOME</span>
          </a>
          <nav className="hidden items-center gap-10 text-xs md:text-sm font-semibold tracking-widest md:flex">
            <a href="/matches" className="text-white/80 hover:text-white">MY MATCHES</a>
            <a href="/wallet" className="text-rl-neon hover:text-rl-amber">WALLET</a>
          </nav>
        </div>
      </header>

      <section className="mx-auto max-w-5xl px-6 py-10 md:py-14">
        <h1
          className="mx-auto mb-2 inline-block text-center font-extrabold tracking-widest
                     text-rl-neon text-[clamp(26px,5vw,48px)] leading-tight
                     drop-shadow-[0_0_10px_var(--rl-neon)]"
          style={{ textRendering: 'optimizeLegibility' }}
        >
          SERVICE STATUS
        </h1>
        <p className="mx-auto mb-8 max-w-2xl text-center text-sm tracking-widest text-white/70">
          Live view of platform health. Page is always fresh (no caching).
        </p>

        <div className="grid gap-4 md:grid-cols-2">
          {/* Overall */}
          <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-5 shadow-[0_0_0_1px_rgba(255,255,255,0.03),0_10px_30px_rgba(0,0,0,0.35)]">
            <div className="mb-2 flex items-center justify-between">
              <h2 className="text-sm font-semibold tracking-widest text-white/90">Overall</h2>
              <StatusDot ok={!!health?.ok} />
            </div>
            <p className="text-sm text-white/70">
              {health ? (health.ok ? 'All systems nominal.' : 'Degraded.') : 'Unavailable.'}
            </p>
          </div>

          {/* Database */}
          <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-5 shadow-[0_0_0_1px_rgba(255,255,255,0.03),0_10px_30px_rgba(0,0,0,0.35)]">
            <div className="mb-2 flex items-center justify-between">
              <h2 className="text-sm font-semibold tracking-widest text-white/90">Database</h2>
              <StatusDot ok={!!health?.db?.ok} />
            </div>
            <p className="text-sm text-white/70">
              {health?.db?.ok
                ? `Reachable • ${health.db.latencyMs ?? '—'} ms`
                : 'Unreachable'}
            </p>
          </div>

          {/* Build / Env */}
          <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-5 shadow-[0_0_0_1px_rgba(255,255,255,0.03),0_10px_30px_rgba(0,0,0,0.35)]">
            <div className="mb-2 flex items-center justify-between">
              <h2 className="text-sm font-semibold tracking-widest text-white/90">Build</h2>
            </div>
            <dl className="grid grid-cols-3 gap-2 text-[13px] text-white/75">
              <dt className="col-span-1 text-white/50">Commit</dt>
              <dd className="col-span-2 break-all">{health?.version ?? 'n/a'}</dd>
              <dt className="col-span-1 text-white/50">Environment</dt>
              <dd className="col-span-2">{health?.env ?? 'n/a'}</dd>
              <dt className="col-span-1 text-white/50">Time</dt>
              <dd className="col-span-2">{health?.time ?? 'n/a'}</dd>
            </dl>
          </div>

          {/* Actions */}
          <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-5 shadow-[0_0_0_1px_rgba(255,255,255,0.03),0_10px_30px_rgba(0,0,0,0.35)]">
            <div className="mb-3 text-sm font-semibold tracking-widest text-white/90">Actions</div>
            <div className="flex flex-wrap gap-3">
              <a href="/api/health" className="btn btn-ghost">Ping API</a>
              <a href="/status" className="btn btn-ghost">Refresh</a>
              <a href="/tos" className="btn btn-ghost">Terms</a>
            </div>
          </div>
        </div>

        {/* Disclaimer footer */}
        <div className="mt-10 border-t border-white/10 pt-6 text-center text-[12px] tracking-widest text-white/50">
          Skill-based competition only. No gambling. Age restrictions apply.
        </div>
      </section>
    </main>
  )
}