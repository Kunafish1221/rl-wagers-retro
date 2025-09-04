'use client'

import WalletConnect from '@/components/WalletConnect'

type Props = {
  userId: string
}

export default function HeaderWallet({ userId }: Props) {
  return (
    <header className="sticky top-0 z-50 mb-8 border-b border-rl-stroke/40 bg-rl-bg/80 backdrop-blur-sm">
      <div className="mx-auto flex w-full max-w-7xl items-center justify-between px-8 py-4">
        <h1 className="text-lg tracking-widest">
          WAGER <span className="text-rl-neon">RL</span>
        </h1>
        <div className="flex items-center gap-4">
          {/* Connect / show short address + linked status */}
          <WalletConnect userId={userId} />
        </div>
      </div>
    </header>
  )
}