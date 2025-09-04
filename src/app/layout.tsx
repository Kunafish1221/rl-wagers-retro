// src/app/layout.tsx
import './globals.css'
import type { Metadata } from 'next'
import { Press_Start_2P } from 'next/font/google'
import SolanaWalletProvider from './providers/WalletProvider'
import FloatingNav from '@/components/ui/FloatingNav'

const pressStart = Press_Start_2P({
  subsets: ['latin'],
  weight: '400',
  variable: '--font-press',
})

export const metadata: Metadata = {
  title: 'WAGER RL',
  description: 'Retro Rocket League Wager site',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={pressStart.variable}>
      <body className={`${pressStart.className} min-h-screen bg-rl-bg text-white antialiased body-grid crt`}>
        <SolanaWalletProvider>
          {/* Page content */}
          <main className="mx-auto w-full max-w-7xl px-8 pt-16 pb-24">
            {children}
          </main>

          {/* Draggable floating nav (Discovery / Matches / Wallet / Profile) */}
          <FloatingNav />
        </SolanaWalletProvider>
      </body>
    </html>
  )
}