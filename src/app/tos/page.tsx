// src/app/tos/page.tsx
'use client'

import { useEffect, useMemo, useState } from 'react'

type Item = { id: string; title: string; content: React.ReactNode }

function Divider() {
  return <div className="my-10 h-px w-full bg-white/10" />
}

function SectionTitle({
  children,
  className = '',
}: {
  children: React.ReactNode
  className?: string
}) {
  return (
    <h2 className={`text-center text-2xl md:text-3xl font-extrabold tracking-widest ${className}`}>
      {children}
    </h2>
  )
}

function Kicker({
  children,
  className = '',
}: {
  children: React.ReactNode
  className?: string
}) {
  return (
    <p className={`mx-auto mt-3 max-w-3xl text-center text-[13px] md:text-sm tracking-widest text-white/70 ${className}`}>
      {children}
    </p>
  )
}

function Chevron({ open }: { open: boolean }) {
  return (
    <svg
      aria-hidden="true"
      className={`h-4 w-4 transition-transform duration-300 ${open ? 'rotate-180' : ''}`}
      viewBox="0 0 24 24"
      fill="none"
    >
      <path d="M6 9l6 6 6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function Accordion({ items, defaultOpen = 0 }: { items: Item[]; defaultOpen?: number | null }) {
  const [open, setOpen] = useState<number | null>(defaultOpen)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(null)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  return (
    <div className="mx-auto max-w-4xl space-y-2 md:space-y-3">
      {items.map((it, idx) => {
        const expanded = open === idx
        return (
          <section
            key={it.id}
            id={it.id}
            className="rounded-xl md:rounded-2xl border border-white/8 bg-white/[0.02] shadow-[0_0_0_1px_rgba(255,255,255,0.03),0_10px_30px_rgba(0,0,0,0.35)] overflow-hidden"
          >
            <button
              className="group w-full px-4 md:px-5 py-3.5 md:py-4 text-left outline-none flex items-center justify-between gap-4 md:gap-6 hover:bg-white/[0.03] focus-visible:ring-2 focus-visible:ring-rl-neon/60"
              aria-controls={`sect-${idx}`}
              aria-expanded={expanded}
              onClick={() => setOpen(expanded ? null : idx)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault()
                  setOpen(expanded ? null : idx)
                }
                if (e.key === 'ArrowDown') setOpen(Math.min(items.length - 1, (open ?? -1) + 1))
                if (e.key === 'ArrowUp') setOpen(Math.max(0, (open ?? items.length) - 1))
              }}
            >
              <span className="text-sm md:text-base font-semibold tracking-widest text-white/90 group-hover:text-white">
                {it.title}
              </span>
              <span className="text-white/70">
                <Chevron open={expanded} />
              </span>
            </button>

            <div
              id={`sect-${idx}`}
              role="region"
              aria-label={it.title}
              className={`grid transition-[grid-template-rows] duration-300 ease-out ${
                expanded ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'
              }`}
            >
              <div className="overflow-hidden">
                <div className="px-4 md:px-5 pb-5 md:pb-6 text-[13px] md:text-sm leading-relaxed text-white/85">
                  {it.content}
                </div>
              </div>
            </div>
          </section>
        )
      })}
    </div>
  )
}

export default function TosPage() {
  const lastUpdated = 'September 2, 2025'

  const sections: Item[] = useMemo(
    () => [
      {
        id: 'overview',
        title: 'Overview — Skill-Based Wagering Only',
        content: (
          <div className="space-y-3">
            <p>
              WAGER RL is a <span className="text-rl-amber">skill-based</span> head-to-head platform for Rocket League
              players. Create a profile, deposit to receive <strong>WT (Wager Tokens)</strong>, join or create lobbies,
              and compete. Outcomes are decided by gameplay skill, not chance.
            </p>
            <p>
              WT is an internal accounting unit (1&nbsp;$ = 10&nbsp;WT by default) used to simplify balances, fees, and
              payouts. WT is <em>not</em> a blockchain token and has no standalone monetary value outside the platform.
            </p>
          </div>
        ),
      },
      {
        id: 'eligibility',
        title: 'Eligibility',
        content: (
          <ul className="list-disc space-y-2 pl-6">
            <li>You must be of legal age of majority in your jurisdiction.</li>
            <li>You must not be located in, a resident of, or accessing from any prohibited region.</li>
            <li>Provide accurate registration info (handle, display name, Epic ID, avatar URL).</li>
          </ul>
        ),
      },
      {
        id: 'accounts',
        title: 'Accounts & Profiles',
        content: (
          <div className="space-y-2">
            <p>
              One account per player. Keep credentials secure. We may suspend or terminate for fraud, multi-accounting,
              sandbagging, or other violations.
            </p>
            <p>
              Profiles include public info (handle, display name, basic stats) and gameplay identifiers (e.g., Epic ID)
              for matchmaking and disputes.
            </p>
          </div>
        ),
      },
      {
        id: 'deposits',
        title: 'Deposits, WT, Fees',
        content: (
          <div className="space-y-2">
            <p>
              Deposits convert to WT at the posted rate (e.g., $1 → 10 WT). A platform fee may apply to matches and/or
              payouts (e.g., <strong>FEE_BPS</strong>), disclosed at creation or settlement.
            </p>
            <p>
              Your WT wallet shows <strong>availableWT</strong> (spendable) and <strong>lockedWT</strong> (escrowed for
              active matches).
            </p>
          </div>
        ),
      },
      {
        id: 'settlement',
        title: 'Matches, Escrow & Settlement',
        content: (
          <div className="space-y-2">
            <p>
              When a lobby fills, each side’s stake is <strong>locked</strong> in escrow. After the result is confirmed,
              the pot is settled: fees (if any) are deducted and winners receive WT. Cancellations unlock funds back to
              participants.
            </p>
            <p>
              We may show a join-queue notice when a match takes longer to fill: <em>“We’re new — this might take a
              while.”</em>
            </p>
          </div>
        ),
      },
      {
        id: 'refs',
        title: 'Referees, Evidence & Disputes',
        content: (
          <div className="space-y-2">
            <p>
              Certain lobbies may be <strong>ref-managed</strong>. In disputes, referees can request evidence (screens,
              replays, lobby codes) and make binding rulings.
            </p>
            <p>Failure to provide requested evidence can result in a forfeit. Refs may settle, cancel, or restart a match in rare cases.</p>
          </div>
        ),
      },
      {
        id: 'conduct',
        title: 'Fair Play & Conduct',
        content: (
          <ul className="list-disc space-y-2 pl-6">
            <li>No cheating, scripting, boosting, win-trading, or colluding.</li>
            <li>No harassment, hate speech, or threats in chat or DMs.</li>
            <li>No impersonation of other players, referees, or staff.</li>
            <li>Follow posted lobby rules (mode, region, server, mutators, etc.).</li>
          </ul>
        ),
      },
      {
        id: 'withdrawals',
        title: 'Withdrawals & Payouts',
        content: (
          <div className="space-y-2">
            <p>
              Payouts are made from your <strong>availableWT</strong> to supported providers/wallets listed in the
              wallet page. Risk/identity checks may be required prior to release.
            </p>
            <p>Chargebacks, payment fraud, or disputed deposits can result in account holds or clawbacks.</p>
          </div>
        ),
      },
      {
        id: 'prohibited',
        title: 'Prohibited Uses',
        content: (
          <ul className="list-disc space-y-2 pl-6">
            <li>Money laundering or attempting to obscure the source of funds.</li>
            <li>Automating gameplay or interfering with platform services.</li>
            <li>Accessing the platform from banned/prohibited locations.</li>
          </ul>
        ),
      },
      {
        id: 'risk',
        title: 'Risk Disclosure',
        content: (
          <div className="space-y-2">
            <p>You may lose your stake. WAGER RL does not guarantee profits. Outcomes depend on player skill and server conditions we do not control.</p>
            <p>Only deposit what you can afford to lose.</p>
          </div>
        ),
      },
      {
        id: 'ip',
        title: 'IP & Branding',
        content: <p>All platform branding, UI, copy, and code are protected. Do not copy, scrape, or re-host without written permission.</p>,
      },
      {
        id: 'suspension',
        title: 'Suspension & Termination',
        content: <p>We may suspend or terminate for ToS violations, fraud risk, or regulatory reasons. Remaining balances may be held pending investigation or returned subject to policy and law.</p>,
      },
      {
        id: 'jurisdiction',
        title: 'Jurisdiction & Compliance',
        content: <p>You are responsible for local law compliance. Access may be restricted in certain jurisdictions. Use of the platform constitutes acceptance that disputes may be governed by our chosen venue and law, disclosed at registration or on this page.</p>,
      },
      {
        id: 'changes',
        title: 'Changes to These Terms',
        content: <p>We may update these Terms as the product evolves. We’ll post the effective date here. Continued use after changes constitutes acceptance.</p>,
      },
      {
        id: 'contact',
        title: 'Contact',
        content: <p>Questions or issues? Visit <span className="text-rl-amber">/contact</span> (coming soon) or use the Support link in your wallet/profile when available.</p>,
      },
    ],
    []
  )

  return (
    <main className="min-h-screen bg-[#0b0e13] text-white">
      {/* Subtle radial glow behind the hero */}
      <div className="pointer-events-none fixed inset-0 -z-10">
        <div className="absolute inset-0 bg-[radial-gradient(60%_40%_at_50%_0%,rgba(62,255,208,0.06),transparent_60%)]" />
      </div>

      {/* Top bar */}
      <header className="border-b border-rl-stroke/40">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-6">
          <a href="/" className="group inline-flex items-center gap-3">
            <span className="inline-block h-2 w-2 rounded-full bg-rl-neon shadow-[0_0_12px_var(--rl-neon)]" />
            <span className="tracking-widest text-white/80 group-hover:text-white">HOME</span>
          </a>

          <nav className="site-nav hidden items-center gap-10 text-xs md:text-sm font-semibold tracking-widest md:flex">
            <a href="/discovery" className="text-white/80 hover:text-white">DISCOVERY</a>
            <a href="/matches" className="text-white/80 hover:text-white">MY MATCHES</a>
            <a href="/wallet" className="text-rl-neon hover:text-rl-amber">WALLET</a>
          </nav>
        </div>
      </header>

      {/* Hero */}
      <section className="relative mx-auto max-w-5xl px-6 pb-12 pt-10 md:pt-14 text-center">
        <h1
          className="neon-title mx-auto mb-3 inline-block font-extrabold tracking-widest
                     text-rl-neon text-[clamp(28px,5vw,54px)] leading-[1.05]
                     drop-shadow-[0_0_10px_var(--rl-neon)]"
          style={{ textRendering: 'optimizeLegibility' }}
        >
          TERMS OF SERVICE
        </h1>

        <Kicker>Last updated: {lastUpdated}</Kicker>
        <Kicker className="mt-2 text-white/80">
          Skill-based Rocket League wagering with WT escrow & fair play.
        </Kicker>

        <Divider />
        <SectionTitle>Agreement</SectionTitle>
        <Kicker>By using WAGER RL, you agree to these Terms and any future updates.</Kicker>
      </section>

      {/* Accordion */}
      <section className="px-4 md:px-6 pb-24">
        <Accordion items={sections} />
      </section>

      {/* Back to top */}
      <footer className="pb-14 text-center">
        <a
          href="#top"
          onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
          className="text-xs tracking-widest text-white/60 hover:text-white"
        >
          BACK TO TOP
        </a>
      </footer>
    </main>
  )
}