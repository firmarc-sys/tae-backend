import { useEffect } from 'react'
import { motion } from 'framer-motion'

interface RuntimeVerificationProps {
  active: boolean
  onDone: () => void
}

export function RuntimeVerification({ active, onDone }: RuntimeVerificationProps) {
  useEffect(() => {
    if (!active) return
    const timer = window.setTimeout(onDone, 1800)
    return () => window.clearTimeout(timer)
  }, [active, onDone])

  if (!active) return null

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="absolute inset-0 z-40 flex items-center justify-center bg-black/72 backdrop-blur-md"
    >
      <motion.div
        initial={{ opacity: 0, y: 18 }}
        animate={{ opacity: 1, y: 0 }}
        className="rounded-[2rem] border border-cyan-300/20 bg-black/70 px-8 py-6 text-center"
      >
        <div className="text-[10px] uppercase tracking-[0.45em] text-cyan-200/70">SIOS</div>
        <div className="mt-4 text-[18px] uppercase tracking-[0.28em] text-white/92">Prime Orchestrator Verified</div>
        <div className="mt-3 text-[11px] uppercase tracking-[0.18em] text-white/45">Liquid chrome runtime materializing</div>
      </motion.div>
    </motion.div>
  )
}
