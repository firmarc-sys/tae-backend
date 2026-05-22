import { motion } from "framer-motion";
import { OrbViewer } from "./OrbViewer";
import type { SIOSIdentity } from "../lib/identity";
import { useRuntime } from "../contexts/RuntimeContext";
import { useIdentityMemory, getIdentityClearance, getIdentityTrust } from "../hooks/useIdentityMemory";

interface GalacticIDProps {
  identity?: SIOSIdentity;
}

const slideUp = {
  hidden: { opacity: 0, y: 24, filter: "blur(8px)" },
  visible: { opacity: 1, y: 0, filter: "blur(0px)", transition: { duration: 0.9, ease: [0.22, 1, 0.36, 1] } },
};

const TIERS = ["Guest", "Initiate", "Explorer", "Operator", "Commander"];

export function GalacticID({ identity }: GalacticIDProps) {
  const { runtime, sendCommand } = useRuntime();
  const gid = identity?.gid ?? runtime.lastCommand ?? "399152573423";
  const role = identity?.role ?? "owner";
  const isOwner = gid === "399152573423";
  
  // Load identity memory for persistent personalization
  const { memory, updateMemory } = useIdentityMemory(gid);
  const clearance = getIdentityClearance(memory, isOwner);
  const trust = getIdentityTrust(memory);

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
        <div>◇ IDENTITY MATRIX</div>
        <div className="flex items-center gap-6">
          <motion.div className="text-cyan-300/60" animate={{ opacity: [0.4, 0.8, 0.4] }} transition={{ duration: 4, repeat: Infinity }}>LIVE</motion.div>
        </div>
      </motion.div>

      {/* Primary focal zone: MASSIVE ORB as centerpiece */}
      <div className="absolute inset-0 flex items-center justify-center">
        <motion.div
          initial={{ opacity: 0, scale: 0.85 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 1.4, ease: "easeOut" }}
          className="relative"
        >
          {/* Orb interior glow */}
          <motion.div
            className="absolute inset-0 -inset-12 rounded-full bg-[radial-gradient(circle,rgba(180,210,255,0.22),transparent_68%)] blur-2xl"
            animate={{ opacity: [0.2, 1, 0.2] }}
            transition={{ duration: 6.8, repeat: Infinity, ease: "easeInOut" }}
          />
          
          {/* Massive orb */}
          <OrbViewer size={320} breath={1.3} distort={0.7} intensity={1.2} glowPulse={1.3} />
        </motion.div>
      </div>

      {/* Identity panels: liquid emergence FROM orb, not beside it */}
      <motion.div
        initial={{ opacity: 0, scale: 0.94 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 1.1, delay: 0.4 }}
        className="absolute inset-0 pointer-events-none"
      >
        {/* Left identity panel: emerges from left of orb */}
        <div className="absolute left-4 top-1/2 -translate-y-1/2 w-[16%] max-w-[130px] space-y-2.5">
          <motion.div
            initial={{ opacity: 0, x: -16 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.8, delay: 0.6 }}
            className="rounded-[1.4rem] bg-[linear-gradient(135deg,rgba(120,180,255,0.12),rgba(80,140,220,0.06))] border border-cyan-400/14 px-3 py-3 text-[8px] sios-mono text-cyan-200/70 pointer-events-auto shadow-[inset_0_1px_0_rgba(120,180,255,0.16),0_8px_20px_rgba(120,180,255,0.12)]"
          >
            <div className="text-cyan-300/40 mb-1.5 text-[7px]">TRUST MATRIX</div>
            <div className="text-[10px] text-cyan-200/88 tracking-[0.08em]">{trust}%</div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, x: -16 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.8, delay: 0.7 }}
            className="rounded-[1.4rem] bg-[linear-gradient(135deg,rgba(120,180,255,0.12),rgba(80,140,220,0.06))] border border-cyan-400/14 px-3 py-3 text-[8px] sios-mono text-cyan-200/70 pointer-events-auto shadow-[inset_0_1px_0_rgba(120,180,255,0.16),0_8px_20px_rgba(120,180,255,0.12)]"
          >
            <div className="text-cyan-300/40 mb-1.5 text-[7px]">CLEARANCE</div>
            <div className="text-[10px] text-cyan-300/90 tracking-[0.08em]">{clearance}</div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, x: -16 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.8, delay: 0.8 }}
            className="rounded-[1.4rem] bg-[linear-gradient(135deg,rgba(120,180,255,0.12),rgba(80,140,220,0.06))] border border-cyan-400/14 px-3 py-3 text-[8px] sios-mono text-cyan-200/70 pointer-events-auto shadow-[inset_0_1px_0_rgba(120,180,255,0.16),0_8px_20px_rgba(120,180,255,0.12)]"
          >
            <div className="text-cyan-300/40 mb-1.5 text-[7px]">STATUS</div>
            <motion.div className="text-[10px] text-cyan-200/88 tracking-[0.08em]" animate={{ opacity: [0.5, 1] }} transition={{ duration: 2.4, repeat: Infinity }}>◆ LIVE</motion.div>
          </motion.div>
        </div>

        {/* Right clearance tier system: exotic visual hierarchy */}
        <div className="absolute right-4 top-1/2 -translate-y-1/2 flex flex-col items-center gap-2.5">
          {TIERS.map((tier, idx) => {
            const isActive = (clearance === "Commander" && idx === 4) || (clearance === "Operator" && idx === 3) || (clearance === "Explorer" && idx === 2);
            return (
              <motion.div
                key={tier}
                initial={{ opacity: 0, x: 16, scale: 0.85 }}
                animate={{ opacity: 1, x: 0, scale: isActive ? 1.12 : 1 }}
                transition={{ duration: 0.7, delay: 0.6 + idx * 0.1 }}
                className={`w-14 h-14 rounded-full flex items-center justify-center text-[7px] sios-mono font-light transition-all pointer-events-auto ${
                  isActive
                    ? "bg-[linear-gradient(135deg,rgba(120,180,255,0.28),rgba(180,210,255,0.12))] border border-cyan-300/48 shadow-[inset_0_2px_0_rgba(120,180,255,0.4),0_12px_36px_rgba(120,180,255,0.32)]"
                    : "bg-[linear-gradient(135deg,rgba(120,180,255,0.08),rgba(80,140,220,0.04))] border border-cyan-400/12 text-cyan-200/45 shadow-[inset_0_1px_0_rgba(120,180,255,0.12)]"
                }`}
              >
                <div className="text-center leading-tight">{tier}</div>
              </motion.div>
            );
          })}
        </div>
      </motion.div>

      {/* Bottom emergence: action buttons - exotic styling */}
      <motion.div
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.8, delay: 0.8 }}
        className="absolute bottom-16 left-4 right-4 z-10 pointer-events-auto"
      >
        <div className="space-y-2 max-w-xs">
          <button className="w-full rounded-[1.2rem] bg-[linear-gradient(135deg,rgba(120,180,255,0.14),rgba(80,140,220,0.08))] border border-cyan-400/16 px-4 py-2 text-[9px] sios-mono text-cyan-200/75 hover:bg-[linear-gradient(135deg,rgba(120,180,255,0.22),rgba(80,140,220,0.14))] hover:border-cyan-300/28 hover:shadow-[0_8px_24px_rgba(120,180,255,0.18)] transition-all">
            ◆ Permissions
          </button>
          <button className="w-full rounded-[1.2rem] bg-[linear-gradient(135deg,rgba(120,180,255,0.14),rgba(80,140,220,0.08))] border border-cyan-400/16 px-4 py-2 text-[9px] sios-mono text-cyan-300/80 hover:bg-[linear-gradient(135deg,rgba(120,180,255,0.22),rgba(80,140,220,0.14))] hover:border-cyan-300/28 hover:shadow-[0_8px_24px_rgba(120,180,255,0.18)] transition-all">
            ◆ Ascend
          </button>
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

      {/* Owner-only advanced controls (minimal, no identity display) */}
      {isOwner && memory && (
        <motion.div
          initial={{ opacity: 0, x: 12 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.8, delay: 1.2 }}
          className="absolute top-16 right-4 z-20"
        >
          <div className="rounded-[1.2rem] bg-[linear-gradient(135deg,rgba(120,180,255,0.08),rgba(80,140,220,0.04))] border border-cyan-400/12 px-3 py-2 text-[7px] sios-mono space-y-0.5 text-cyan-200/50">
            <motion.div animate={{ opacity: [0.5, 1] }} transition={{ duration: 3, repeat: Infinity }}>◆ MASTER</motion.div>
            <div className="text-[6px] text-white/25 mt-1">Sessions: {memory.sessionCount}</div>
            <div className="text-[6px] text-white/25">Runtime: {Math.round((Date.now() - memory.firstSeen) / (1000 * 60 * 60))}h</div>
          </div>
        </motion.div>
      )}
    </div>
  );
}
