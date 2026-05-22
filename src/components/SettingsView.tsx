import { motion } from "framer-motion";

const fadeUp = {
  hidden: { opacity: 0, y: 18, filter: "blur(8px)" },
  visible: { opacity: 1, y: 0, filter: "blur(0px)", transition: { duration: 0.7, ease: [0.22, 1, 0.36, 1] } },
};

export function SettingsView() {
  return (
    <div className="relative min-h-screen overflow-hidden bg-black text-white sios-void">
      <div className="relative z-10 flex min-h-screen flex-col px-4 pb-4 pt-4">
        <motion.div initial="hidden" animate="visible" variants={fadeUp} className="flex items-start justify-between text-[10px] sios-mono">
          <div className="text-white/92">SIOS</div>
          <div className="text-right text-white/70">
            <div>LIVE</div>
            <div className="text-cyan-200/80">PRIME</div>
          </div>
        </motion.div>
        <motion.div initial="hidden" animate="visible" variants={fadeUp} className="mt-4 rounded-[3rem] bg-[linear-gradient(180deg,rgba(255,255,255,0.08),rgba(255,255,255,0.01))] px-4 py-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.12),0_18px_60px_rgba(0,0,0,0.55)]">
          <div className="text-[10px] sios-mono text-white/45">SETTINGS</div>
          <div className="mt-3 text-[11px] tracking-[0.18em] text-white/70">Minimal runtime controls</div>
        </motion.div>
      </div>
    </div>
  );
}
