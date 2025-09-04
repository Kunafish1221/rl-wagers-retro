// src/components/layout/TopNav.tsx
'use client'

import Link from 'next/link'

const links = [
  { href: '/discovery', label: 'DISCOVERY' },
  { href: '/matches', label: 'MY MATCHES' },
  { href: '/wallet', label: 'WALLET' },
  { href: '/profile', label: 'PROFILE' },
]

export default function TopNav() {
  return (
    <header className="border-b border-rl-stroke/40 pb-6 mb-12">
      <div className="mx-auto flex max-w-7xl items-center justify-between px-8">
        <h1 className="text-3xl font-extrabold tracking-widest text-rl-neon">WAGER RL</h1>

        <nav className="flex items-center gap-12 text-lg font-semibold tracking-widest">
          {links.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              className="text-white/80 hover:text-rl-amber transition"
            >
              {l.label}
            </Link>
          ))}
        </nav>

        {/* Wallet button placeholder — replace with real provider */}
        <button className="rounded-lg bg-purple-600 px-4 py-2 font-bold text-white hover:bg-purple-700 transition">
          Select Wallet
        </button>
      </div>
    </header>
  )
}