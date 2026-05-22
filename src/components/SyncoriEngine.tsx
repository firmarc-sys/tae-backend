import { motion } from "framer-motion";
import { OrbViewer } from "./OrbViewer";
import { useRuntime } from "../contexts/RuntimeContext";

const slideUp = {
  hidden: { opacity: 0, y: 24, filter: "blur(8px)" },
  visible: { opacity: 1, y: 0, filter: "blur(0px)", transition: { duration: 0.9, ease: [0.22, 1, 0.36, 1] } },
};

export function SyncoriEngine() {
  const { runtime } = useRuntime();

  return (
    <div className="relative w-full h-screen overflow-hidden bg-black text-white sios-void">
      {/* Background void + ambient ripples */}
      <div className="absolute inset-0 opacity-90 [background:radial-gradient(circle_at_50%_14%,rgba(255,255,255,0.08),transparent_14%),radial-gradient(circle_at_50%_48%,rgba(120,180,255,0.08),transparent_24%),radial-gradient(circle_at_50%_76%,rgba(255,255,255,0.04),transparent_34%)]" />
      <div className="absolute inset-x-0 top-[26%] h-[64vh] sios-ripple blur-[74px] opacity-100" />
      <div className="absolute inset-x-0 top-[36%] h-[36vh] bg-[radial-gradient(ellipse_at_center,rgba(255,255,255,0.38),rgba(180,210,255,0.28)_28%,rgba(0,0,0,0)_76%)] blur-3xl opacity-100" />

      {/* System bar: exotic minimal, floating */}
      <motion.div
        initial={{ opacity: 0, y: -12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.8 }}
        className="absolute top-3 left-4 right-4 z-20 flex items-center justify-between text-[9px] sios-mono text-cyan-300/50"
      >
        <div>◆ MEDIA LATTICE</div>
        <div className="flex items-center gap-6">
          <motion.div className="text-cyan-300/60" animate={{ opacity: [0.4, 0.8, 0.4] }} transition={{ duration: 4, repeat: Infinity }}>FLOW ACTIVE</motion.div>
        </div>
      </motion.div>

      {/* Primary focal zone: MASSIVE ORB in center */}
      <div className="absolute inset-0 flex items-center justify-center">
        <motion.div
          initial={{ opacity: 0, scale: 0.85 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 1.4, ease: "easeOut" }}
          className="relative"
        >
          {/* Orb interior glow - pulsing with media flow */}
          <motion.div
            className="absolute inset-0 -inset-12 rounded-full bg-[radial-gradient(circle,rgba(180,210,255,0.24),transparent_64%)] blur-2xl"
            animate={{ opacity: [0.3, 0.9, 0.3] }}
            transition={{ duration: 4.2, repeat: Infinity, ease: "easeInOut" }}
          />
          
          {/* Massive orb */}
          <OrbViewer size={300} breath={1.4} distort={0.6} intensity={1.3} glowPulse={1.4} />
        </motion.div>
      </div>

      {/* Left tool rail: emerges from left of orb */}
      <motion.div
        initial={{ opacity: 0, x: -16 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ duration: 0.8, delay: 0.5 }}
        className="absolute left-4 top-1/2 -translate-y-1/2 w-[11%] max-w-[100px] space-y-2 pointer-events-auto z-10"
      >
        <div className="text-[7px] sios-mono text-cyan-300/35 mb-2">INGEST</div>
        {['Image', 'Audio', 'Video', 'Archive'].map((item) => (
          <motion.div
            key={item}
            initial={{ opacity: 0, x: -12 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.6 }}
            className="rounded-[1rem] bg-[linear-gradient(135deg,rgba(120,180,255,0.12),rgba(80,140,220,0.06))] border border-cyan-400/14 px-2 py-2.5 text-[8px] sios-mono text-cyan-200/70 hover:bg-[linear-gradient(135deg,rgba(120,180,255,0.2),rgba(80,140,220,0.1))] hover:border-cyan-300/24 transition-all cursor-pointer shadow-[inset_0_1px_0_rgba(120,180,255,0.12)]"
          >
            {item}
          </motion.div>
        ))}
      </motion.div>

      {/* Right status rail: emerges from right of orb */}
      <motion.div
        initial={{ opacity: 0, x: 16 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ duration: 0.8, delay: 0.5 }}
        className="absolute right-4 top-1/2 -translate-y-1/2 w-[11%] max-w-[100px] space-y-2 pointer-events-auto z-10"
      >
        <div className="text-[7px] sios-mono text-cyan-300/35 mb-2">OUTPUT</div>
        {['Flow', 'Sync', 'Media', 'Queue'].map((item) => (
          <motion.div
            key={item}
            initial={{ opacity: 0, x: 12 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.6 }}
            className="rounded-[1rem] bg-[linear-gradient(135deg,rgba(120,180,255,0.12),rgba(80,140,220,0.06))] border border-cyan-400/14 px-2 py-2.5 text-[8px] sios-mono text-cyan-200/70 hover:bg-[linear-gradient(135deg,rgba(120,180,255,0.2),rgba(80,140,220,0.1))] hover:border-cyan-300/24 transition-all cursor-pointer shadow-[inset_0_1px_0_rgba(120,180,255,0.12)]"
          >
            {item}
          </motion.div>
        ))}
      </motion.div>

      {/* Bottom playback controls: liquid emergence - exotic */}
      <motion.div
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.8, delay: 0.8 }}
        className="absolute bottom-16 left-1/2 -translate-x-1/2 z-10 pointer-events-auto"
      >
        <div className="rounded-[1.4rem] bg-[linear-gradient(135deg,rgba(120,180,255,0.12),rgba(80,140,220,0.06))] border border-cyan-400/16 px-6 py-3 shadow-[inset_0_2px_0_rgba(120,180,255,0.16),0_12px_32px_rgba(120,180,255,0.14)]">
          <div className="flex items-center justify-center gap-6">
            <button className="text-[10px] sios-mono text-cyan-200/65 hover:text-cyan-200/88 transition-colors">◀</button>
            <button className="text-[10px] sios-mono text-cyan-300/80 hover:text-cyan-200 transition-colors">⏸</button>
            <button className="text-[10px] sios-mono text-cyan-200/65 hover:text-cyan-200/88 transition-colors">▶</button>
            <div className="w-56 h-0.5 rounded-full bg-cyan-400/12 overflow-hidden">
              <motion.div
                className="h-full bg-[linear-gradient(90deg,rgba(120,180,255,0.8),rgba(180,220,255,0.6))]"
                animate={{ width: ["0%", "68%", "0%"] }}
                transition={{ duration: 7.2, repeat: Infinity }}
              />
            </div>
            <button className="text-[10px] sios-mono text-cyan-200/65 hover:text-cyan-200/88 transition-colors">🔁</button>
          </div>
        </div>
      </motion.div>

      {/* Bottom dock: exotic floating navigation */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.8, delay: 1 }}
        className="absolute bottom-3 left-1/2 -translate-x-1/2 z-20 flex items-center justify-center gap-2 text-[8px] sios-mono text-cyan-300/40 pointer-events-auto"
      >
        {['◆', '◇', '◉', '⬡'].map((icon, idx) => (
          <motion.div 
            key={idx} 
            className="rounded-full bg-transparent border border-cyan-400/16 px-2.5 py-1.5 hover:border-cyan-300/32 hover:bg-cyan-400/8 transition-all cursor-pointer"
            whileHover={{ scale: 1.12 }}
          >
            {icon}
          </motion.div>
        ))}
      </motion.div>

      {/* Flow indicator: exotic pulsing indicator */}
      <motion.div
        animate={{ opacity: [0.3, 0.7, 0.3] }}
        transition={{ duration: 3.6, repeat: Infinity }}
        className="absolute top-20 right-20 flex items-center gap-2 text-[7px] sios-mono text-cyan-300/60 z-10"
      >
        <motion.div className="w-1.5 h-1.5 rounded-full bg-cyan-300/70" animate={{ scale: [1, 1.3, 1] }} transition={{ duration: 1.8, repeat: Infinity }} />
        <span>LATTICE ACTIVE</span>
      </motion.div>
    </div>
  );
}
