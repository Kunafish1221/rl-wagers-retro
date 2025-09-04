// src/components/ui/FloatingNav.tsx
'use client'

import Link from 'next/link'
import { useEffect, useRef, useState } from 'react'

type Pos = { x: number; y: number }

const LINKS = [
  { href: '/discovery', label: 'Discovery' },
  { href: '/matches',   label: 'My Matches' },
  { href: '/wallet',    label: 'Wallet' },
  { href: '/profile',   label: 'Profile' },
]

export default function FloatingNav() {
  const key = 'rl.fnav.pos.v1'
  const btnRef = useRef<HTMLButtonElement | null>(null)
  const [open, setOpen] = useState(false)
  const [pos, setPos] = useState<Pos>({ x: 20, y: 80 })
  const drag = useRef<{ dx: number; dy: number; active: boolean }>({ dx: 0, dy: 0, active: false })

  // restore last position
  useEffect(() => {
    try {
      const raw = localStorage.getItem(key)
      if (raw) {
        const saved = JSON.parse(raw) as Pos
        setPos(saved)
      }
    } catch {}
  }, [])

  // save position
  useEffect(() => {
    try { localStorage.setItem(key, JSON.stringify(pos)) } catch {}
  }, [pos])

  // drag handlers (mouse + touch)
  useEffect(() => {
    function onMove(clientX: number, clientY: number) {
      if (!drag.current.active) return
      const x = clientX - drag.current.dx
      const y = clientY - drag.current.dy
      // keep inside viewport with 8px padding
      const pad = 8
      const w = window.innerWidth
      const h = window.innerHeight
      const el = btnRef.current
      const bw = el?.offsetWidth ?? 56
      const bh = el?.offsetHeight ?? 56
      const nx = Math.min(Math.max(x, pad), w - bw - pad)
      const ny = Math.min(Math.max(y, pad), h - bh - pad)
      setPos({ x: nx, y: ny })
    }

    const mm = (e: MouseEvent) => onMove(e.clientX, e.clientY)
    const tm = (e: TouchEvent) => {
      const t = e.touches[0]; if (t) onMove(t.clientX, t.clientY)
    }
    const up = () => (drag.current.active = false)

    window.addEventListener('mousemove', mm)
    window.addEventListener('touchmove', tm, { passive: false })
    window.addEventListener('mouseup', up)
    window.addEventListener('touchend', up)
    return () => {
      window.removeEventListener('mousemove', mm)
      window.removeEventListener('touchmove', tm)
      window.removeEventListener('mouseup', up)
      window.removeEventListener('touchend', up)
    }
  }, [])

  function startDrag(e: React.MouseEvent | React.TouchEvent) {
    const isTouch = 'touches' in e
    const rect = btnRef.current?.getBoundingClientRect()
    const startX = isTouch ? e.touches[0]?.clientX ?? 0 : (e as React.MouseEvent).clientX
    const startY = isTouch ? e.touches[0]?.clientY ?? 0 : (e as React.MouseEvent).clientY
    drag.current.active = true
    drag.current.dx = startX - (rect?.left ?? 0)
    drag.current.dy = startY - (rect?.top ?? 0)
  }

  return (
    <>
      {/* Floating button */}
      <button
        ref={btnRef}
        aria-label={open ? 'Close navigation' : 'Open navigation'}
        onClick={() => setOpen((v) => !v)}
        onMouseDown={startDrag}
        onTouchStart={startDrag}
        className="fixed z-50 flex h-14 w-14 items-center justify-center rounded-full border
                   border-[var(--rl-border)] bg-[#0b1321] text-white shadow-xl
                   hover:shadow-2xl transition active:scale-[0.98] select-none"
        style={{ left: pos.x, top: pos.y }}
      >
        {/* hamburger / close */}
        <div className="relative h-5 w-5">
          <span className={`absolute left-0 top-0 block h-0.5 w-5 bg-white transition ${open ? 'translate-y-2 rotate-45' : ''}`} />
          <span className={`absolute left-0 top-2 block h-0.5 w-5 bg-white transition ${open ? 'opacity-0' : ''}`} />
          <span className={`absolute left-0 top-4 block h-0.5 w-5 bg-white transition ${open ? '-translate-y-2 -rotate-45' : ''}`} />
        </div>
      </button>

      {/* Popup menu */}
      {open && (
        <div
          className="fixed z-50 min-w-[180px] rounded-2xl border border-[var(--rl-border)]
                     bg-[color:var(--rl-panel)] shadow-2xl p-2"
          style={{ left: pos.x + 60, top: pos.y - 6 }}
          role="menu"
        >
          <ul className="grid gap-1">
            {LINKS.map((l) => (
              <li key={l.href}>
                <Link
                  href={l.href}
                  className="flex items-center justify-between rounded-xl px-3 py-2 text-sm
                             text-[var(--rl-heading)] hover:bg-white/5"
                  onClick={() => setOpen(false)}
                >
                  {l.label}
                  <span className="text-[10px] text-[var(--rl-muted)]">↗</span>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}
    </>
  )
}