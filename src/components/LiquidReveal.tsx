import { motion } from "framer-motion";
import { ReactNode } from "react";

interface LiquidRevealProps {
  children: ReactNode;
  delay?: number;
  duration?: number;
  className?: string;
}

export function LiquidReveal({ children, delay = 0, duration = 0.8, className = "" }: LiquidRevealProps) {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.92, filter: "blur(12px)" }}
      animate={{ opacity: 1, scale: 1, filter: "blur(0px)" }}
      transition={{
        delay,
        duration,
        ease: [0.22, 1, 0.36, 1],
      }}
      className={className}
    >
      <motion.div
        initial={{ background: "radial-gradient(circle at 50% 50%, rgba(120,180,255,0.4), transparent 70%)" }}
        animate={{ background: "radial-gradient(circle at 50% 50%, transparent, transparent 0%)" }}
        transition={{ delay: delay + 0.2, duration: 0.6 }}
        className="absolute inset-0 rounded-[inherit] pointer-events-none"
      />
      {children}
    </motion.div>
  );
}

export function MeltReveal({ children, delay = 0, className = "" }: { children: ReactNode; delay?: number; className?: string }) {
  return (
    <motion.div
      initial={{ opacity: 1, filter: "blur(0px)" }}
      animate={{ opacity: 0, filter: "blur(8px)", scale: 0.96 }}
      transition={{ delay, duration: 0.4, ease: "easeIn" }}
      className={className}
    >
      {children}
    </motion.div>
  );
}

export function ReformReveal({ children, delay = 0, className = "" }: { children: ReactNode; delay?: number; className?: string }) {
  return (
    <motion.div
      initial={{ opacity: 0, filter: "blur(12px)", scale: 0.88 }}
      animate={{ opacity: 1, filter: "blur(0px)", scale: 1 }}
      transition={{ delay, duration: 0.9, ease: [0.22, 1, 0.36, 1] }}
      className={className}
    >
      {children}
    </motion.div>
  );
}
