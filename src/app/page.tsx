// src/app/page.tsx
"use client"

import { useEffect } from "react"
import WalletConnect from "@/components/WalletConnect"

export default function Page() {
  const mockUserId = "demo-user-id"

  // Scrub any stray "Save failed" debug text some extensions inject
  useEffect(() => {
    const killMsgs = () => {
      const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT)
      const bag: Text[] = []
      while (walker.nextNode()) {
        const t = walker.currentNode as Text
        if (/\bsave failed\b/i.test(t.nodeValue || "")) bag.push(t)
      }
      bag.forEach(t => (t.nodeValue = ""))
    }
    killMsgs()
    const id = setInterval(killMsgs, 500)
    return () => clearInterval(id)
  }, [])

  return (
    <main className="relative flex min-h-screen flex-col items-center justify-center bg-[#0b0e13] text-center">
      {/* Neon title */}
      <h1
        className={`neon-title mb-10 font-extrabold tracking-widest text-rl-neon text-[clamp(46px,7vw,88px)] leading-[0.9]`}
        style={{ textRendering: "optimizeLegibility" }}
      >
        WAGER RL
      </h1>

      {/* Menu */}
      <nav aria-label="Main" className="flex w-full max-w-[720px] flex-col items-stretch gap-5 px-6">
        {[
          { href: "/profile", label: "PROFILE" },
          { href: "/discovery", label: "DISCOVERY" },
          { href: "/matches", label: "MY MATCHES" },
          { href: "/wallet", label: "WALLET" },
          { href: "/tos", label: "TOS" },
        ].map((item) => (
          <a
            key={item.href}
            href={item.href}
            className="group relative inline-flex w-full items-center justify-center rounded-2xl border-2 border-[#c02583] bg-[#10131a] py-4 sm:py-5 text-[clamp(18px,3.1vw,34px)] font-extrabold tracking-widest text-rl-neon shadow-[0_0_28px_rgba(255,47,146,.35)] transition hover:border-rl-amber hover:text-rl-amber focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rl-amber/60"
          >
            <span
              aria-hidden
              className="pointer-events-none absolute inset-0 rounded-2xl opacity-30 blur-[2px] shadow-[inset_0_0_20px_rgba(255,47,146,.45)]"
            />
            <span className="relative">{item.label}</span>
          </a>
        ))}
      </nav>

      {/* Connect (breathing room) */}
      <div className="mt-10">
        <WalletConnect userId={mockUserId} />
      </div>

      {/* Footer note below buttons */}
      <p className="mt-6 text-[11px] tracking-widest text-white/50">
        visit <a href="/tos" className="underline hover:text-rl-amber">TOS</a> to see how it works
      </p>

      {/* Decorative frame */}
      <div aria-hidden className="pointer-events-none absolute inset-6 -z-10 hidden rounded-3xl border border-white/5 sm:block" />

      {/* Plain CSS for the neon pulse */}
      <style>{`
        @keyframes neonPulse {
          0%, 100% {
            transform: scale(1);
            text-shadow:
              0 0 10px rgba(255, 47, 146, 0.65),
              0 0 22px rgba(255, 47, 146, 0.35),
              0 0 50px rgba(255, 47, 146, 0.25);
            filter: drop-shadow(0 0 22px rgba(255, 47, 146, 0.25));
          }
          50% {
            transform: scale(1.02);
            text-shadow:
              0 0 14px rgba(255, 47, 146, 0.85),
              0 0 34px rgba(255, 47, 146, 0.55),
              0 0 70px rgba(255, 47, 146, 0.40);
            filter: drop-shadow(0 0 34px rgba(255, 47, 146, 0.45));
          }
        }
        .neon-title {
          animation: neonPulse 2.6s ease-in-out infinite;
        }
      `}</style>
    </main>
  )
}