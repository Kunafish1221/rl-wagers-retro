'use client'

import { useEffect } from 'react'

type Props = {
  show: boolean
  onClose?: () => void
  autoHideMs?: number
}

/**
 * Floating banner that tells users:
 * "We’re new — this might take a while."
 * Use after a successful /join call.
 */
export default function JoinQueueNotice({ show, onClose, autoHideMs = 6000 }: Props) {
  useEffect(() => {
    if (!show || !autoHideMs) return
    const t = setTimeout(() => onClose?.(), autoHideMs)
    return () => clearTimeout(t)
  }, [show, autoHideMs, onClose])

  if (!show) return null

  return (
    <div className="fixed inset-x-0 top-4 z-50 flex justify-center">
      <div className="rounded-2xl border border-rl-stroke/50 bg-black/60 px-5 py-3 shadow-xl backdrop-blur">
        <p className="text-center text-sm tracking-widest text-white">
          <span className="mr-2 text-rl-amber">⏳</span>
          <span className="font-semibold text-rl-neon">We’re new</span> — this might take a while.
        </p>
      </div>
    </div>
  )
}