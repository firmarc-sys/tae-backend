import { useEffect, useState, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { startAmbient } from "../lib/audio";

interface BootScreenProps {
  onComplete: () => void;
}

const PHRASE = "Establishing neural handshake...";

function TypeWriter({ text, delay = 0, speed = 42, className = "", onDone }: {
  text: string; delay?: number; speed?: number; className?: string; onDone?: () => void;
}) {
  const [shown, setShown] = useState("");
  const [started, setStarted] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setStarted(true), delay);
    return () => clearTimeout(t);
  }, [delay]);

  useEffect(() => {
    if (!started) return;
    if (shown.length >= text.length) { onDone?.(); return; }
    const t = setTimeout(() => setShown(text.slice(0, shown.length + 1)), speed);
    return () => clearTimeout(t);
  }, [started, shown, text, speed, onDone]);

  return <span className={className}>{shown}<span className="opacity-50 animate-pulse">|</span></span>;
}

export function BootScreen({ onComplete }: BootScreenProps) {
  const [phase, setPhase] = useState(0);
  const audioStarted = useRef(false);

  useEffect(() => {
    const timers = [
      setTimeout(() => setPhase(1), 700),
      setTimeout(() => setPhase(2), 1900),
      setTimeout(() => {
        setPhase(3);
        if (!audioStarted.current) {
          audioStarted.current = true;
          startAmbient();
        }
      }, 3200),
      setTimeout(() => setPhase(4), 4700),
      setTimeout(() => setPhase(5), 6100),
      setTimeout(() => setPhase(6), 8200),
      setTimeout(() => setPhase(7), 9800),
      setTimeout(onComplete, 11200),
    ];
    return () => timers.forEach(clearTimeout);
  }, [onComplete]);

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-50 overflow-hidden bg-black text-white sios-void"
      >
        <div className="absolute inset-0 opacity-45 [background:radial-gradient(circle_at_center,rgba(255,255,255,0.08),transparent_55%)]" />

        <motion.div
          className="absolute left-1/2 top-[18%] h-[42vw] w-[42vw] max-h-[260px] max-w-[260px] -translate-x-1/2 rounded-full"
          animate={{
            scale: phase >= 2 ? [1, 1.03, 1] : [0.92, 1, 0.96],
            y: phase >= 2 ? [0, -4, 0] : [10, 0, 8],
          }}
          transition={{ duration: 5.5, repeat: Infinity, ease: "easeInOut" }}
          style={{
            background: "radial-gradient(circle at 35% 28%, rgba(255,255,255,0.95), rgba(220,230,245,0.72) 18%, rgba(120,140,170,0.28) 42%, rgba(20,24,32,0.08) 68%, rgba(0,0,0,0) 100%)",
            boxShadow: "0 0 40px rgba(255,255,255,0.12), inset 0 0 28px rgba(255,255,255,0.22), inset -18px -24px 40px rgba(0,0,0,0.55)",
          }}
        />

        <motion.div
          className="absolute left-1/2 top-[43%] h-[34vw] w-[72vw] max-h-[180px] max-w-[420px] -translate-x-1/2 rounded-full blur-2xl sios-ripple"
          animate={{ opacity: phase >= 1 ? [0.35, 0.55, 0.35] : 0.18, scale: [0.96, 1.02, 0.98] }}
          transition={{ duration: 4.8, repeat: Infinity, ease: "easeInOut" }}
        />

        <AnimatePresence>
          {phase >= 4 && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.8 }}
              className="absolute left-1/2 top-[56%] -translate-x-1/2 text-center"
            >
              <div className="text-[11px] sios-mono text-white/70">TAE, initialize spatial runtime</div>
            </motion.div>
          )}
        </AnimatePresence>

        <AnimatePresence>
          {phase >= 5 && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.6 }}
              className="absolute left-1/2 top-[63%] -translate-x-1/2 text-center px-8"
            >
              <div className="text-[clamp(18px,4vw,28px)] font-light tracking-[0.08em] text-white/92">
                <TypeWriter text={PHRASE} speed={42} />
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        <AnimatePresence>
          {phase >= 6 && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.9 }}
              className="absolute left-1/2 top-[72%] -translate-x-1/2 text-center space-y-1"
            >
              <div className="text-[11px] tracking-[0.28em] text-cyan-200/80">
                <TypeWriter text="ORBITAL COHERENCE" speed={34} delay={100} />
              </div>
              <div className="text-[11px] tracking-[0.22em] text-white/60">
                <TypeWriter text="CALIBRATED" speed={34} delay={900} />
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        <AnimatePresence>
          {phase >= 2 && (
            <motion.div initial={{ opacity: 0, y: -12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 1.0 }} className="absolute left-4 top-4">
              <div className="text-[12px] tracking-[0.42em] text-white/90">SIOS</div>
            </motion.div>
          )}
        </AnimatePresence>

        <AnimatePresence>
          {phase >= 2 && (
            <motion.div initial={{ opacity: 0, y: -12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 1.0 }} className="absolute right-4 top-4 text-right">
              <div className="text-[10px] tracking-[0.34em] text-white/70">LIVE</div>
              <div className="text-[10px] tracking-[0.34em] text-cyan-200/70">PRIME</div>
            </motion.div>
          )}
        </AnimatePresence>

        {phase >= 7 && <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 1.2 }} className="absolute inset-0 bg-black" />}
      </motion.div>
    </AnimatePresence>
  );
}
