import { useEffect, useRef, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'

interface OpeningCinematicProps {
  active: boolean
  onComplete: () => void
}

const BOOT_LINES = [
  'Initializing spatial identity field...',
  'Calibrating orbital coherence...',
  'Establishing neural handshake...',
  'Verifying galactic access tier...',
]

export function OpeningCinematic({ active, onComplete }: OpeningCinematicProps) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const [lineIndex, setLineIndex] = useState(0)
  const [showEnter, setShowEnter] = useState(false)
  const [countdown, setCountdown] = useState<number | null>(null)

  useEffect(() => {
    if (!active) return
    const video = videoRef.current
    if (video) {
      video.currentTime = 0
      video.play().catch(() => {})
    }
    setLineIndex(0)
    setShowEnter(false)
    setCountdown(null)

    const timers = [
      window.setTimeout(() => setLineIndex(1), 700),
      window.setTimeout(() => setLineIndex(2), 1600),
      window.setTimeout(() => setLineIndex(3), 2500),
      window.setTimeout(() => setShowEnter(true), 3600),
      window.setTimeout(() => setCountdown(8), 4200),
      window.setTimeout(() => setCountdown(7), 5200),
      window.setTimeout(() => setCountdown(6), 6200),
      window.setTimeout(() => setCountdown(5), 7200),
      window.setTimeout(() => setCountdown(4), 8200),
      window.setTimeout(() => setCountdown(3), 9200),
      window.setTimeout(() => setCountdown(2), 10200),
      window.setTimeout(() => setCountdown(1), 11200),
      window.setTimeout(onComplete, 12200),
    ]

    return () => timers.forEach(window.clearTimeout)
  }, [active, onComplete])

  const handleEnter = () => {
    setCountdown(0)
    onComplete()
  }

  return (
    <AnimatePresence>
      {active && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="absolute inset-0 z-50 bg-black"
        >
          <video ref={videoRef} src="/orb-background.mp4" className="h-full w-full object-cover" muted playsInline loop />
          <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(0,0,0,0.28),rgba(0,0,0,0.78))]" />
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,transparent_20%,rgba(0,0,0,0.55)_78%)]" />
          <div className="absolute inset-x-0 top-0 h-24 bg-[linear-gradient(180deg,rgba(0,0,0,0.85),transparent)]" />
          <div className="absolute inset-x-0 bottom-0 h-32 bg-[linear-gradient(0deg,rgba(0,0,0,0.9),transparent)]" />

          <div className="absolute left-1/2 top-10 w-[min(92vw,420px)] -translate-x-1/2 rounded-[1.5rem] border border-white/10 bg-black/35 px-4 py-3 backdrop-blur-xl">
            <div className="flex items-center justify-between text-[10px] uppercase tracking-[0.35em] text-white/55">
              <span>SIOS</span>
              <span>LIVE</span>
            </div>
            <div className="mt-3 space-y-1 text-[11px] uppercase tracking-[0.22em] text-cyan-100/85">
              {BOOT_LINES.map((line, index) => (
                <div key={line} className={index <= lineIndex ? 'opacity-100' : 'opacity-20'}>{line}</div>
              ))}
            </div>
          </div>

          {showEnter && (
            <motion.button
              initial={{ opacity: 0, y: 18 }}
              animate={{ opacity: 1, y: 0 }}
              onClick={handleEnter}
              className="absolute bottom-10 left-1/2 -translate-x-1/2 rounded-full border border-cyan-300/35 bg-cyan-300/10 px-6 py-3 text-[11px] uppercase tracking-[0.35em] text-cyan-100 backdrop-blur-xl"
            >
              {countdown && countdown > 0 ? `ENTER PORTAL ${countdown}` : 'ENTER PORTAL'}
            </motion.button>
          )}
        </motion.div>
      )}
    </AnimatePresence>
  )
}
