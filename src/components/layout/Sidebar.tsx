// components/layout/Sidebar.tsx
'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useState, useEffect } from 'react'

type Item = { href: string; label: string; icon: React.ReactNode }

function Icon({ d }: { d: string }) {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2">
      <path d={d} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

const items: Item[] = [
  { href: '/',          label: 'Home',      icon: <Icon d="M3 10.5 12 3l9 7.5V21a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1v-10.5z" /> },
  { href: '/discovery', label: 'Discovery', icon: <Icon d="M12 3l3.5 7.5L23 12l-7.5 1.5L12 21l-3.5-7.5L1 12l7.5-1.5L12 3z" /> },
  { href: '/matches',   label: 'My Matches',icon: <Icon d="M7 8h10M7 12h10M7 16h6M4 5h16v14H4z" /> },
  { href: '/wallet',    label: 'Wallet',    icon: <Icon d="M3 7h18v10H3zM16 12h5" /> },
  { href: '/profile',   label: 'Profile',   icon: <Icon d="M12 12a4 4 0 1 0-4-4 4 4 0 0 0 4 4zm7 8a7 7 0 0 0-14 0" /> },
]

export default function Sidebar() {
  const pathname = usePathname()
  const [open, setOpen] = useState(true)

  // Auto-collapse on small screens
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 1024px)')
    const apply = () => setOpen(!mq.matches ? true : false)
    apply()
    mq.addEventListener('change', apply)
    return () => mq.removeEventListener('change', apply)
  }, [])

  return (
    <>
      {/* Toggle (mobile) */}
      <button
        className="fixed left-3 top-3 z-40 rounded-xl border border-[var(--rl-border)] bg-[#0b1321]/60 px-3 py-1 text-sm backdrop-blur-lg lg:hidden"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-controls="rl-sidebar"
      >
        Menu
      </button>

      {/* Sidebar */}
      <aside
        id="rl-sidebar"
        className={`fixed inset-y-0 left-0 z-30 w-[72px] lg:w-[220px] transform transition-transform duration-200
          ${open ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}
          border-r border-[var(--rl-border)]/70 bg-[color:var(--rl-panel)]/90 backdrop-blur-xl
        `}
      >
        <div className="flex h-14 items-center gap-2 px-4 lg:px-5 border-b border-[var(--rl-border)]/70">
          <span className="text-sm font-extrabold tracking-[0.2em] text-[var(--rl-heading)]">WAGER RL</span>
        </div>

        <nav className="p-2 lg:p-3">
          <ul className="flex flex-col gap-1">
            {items.map((item) => {
              const active = pathname === item.href
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    className={[
                      'group flex items-center gap-3 rounded-xl px-3 py-2 transition hover:bg-white/5',
                      active ? 'bg-white/5 text-white' : 'text-[var(--rl-muted)]',
                    ].join(' ')}
                    aria-current={active ? 'page' : undefined}
                  >
                    <span className="shrink-0 opacity-80 group-hover:opacity-100">{item.icon}</span>
                    <span className="hidden lg:inline text-sm font-semibold tracking-wide">{item.label}</span>
                  </Link>
                </li>
              )
            })}
          </ul>
        </nav>
      </aside>
    </>
  )
}