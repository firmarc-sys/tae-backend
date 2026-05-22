import { motion } from "framer-motion";

interface IdentityBadgeProps {
  gid: string;
  trust: number;
  clearance: string;
  sessionCount?: number;
  isOwner?: boolean;
}

export function IdentityBadge({ gid, trust, clearance, sessionCount = 1, isOwner = false }: IdentityBadgeProps) {
  // Extract last 8 chars of GID for display
  const shortGid = gid.slice(-8);
  
  // Owner gets special color treatment
  const glowColor = isOwner 
    ? "rgba(120,180,255,0.4)" 
    : "rgba(120,180,255,0.2)";

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.7 }}
      className="relative inline-block"
    >
      {/* Ambient glow (owner only) */}
      {isOwner && (
        <motion.div
          className="absolute -inset-2 rounded-[1.4rem] blur-md"
          style={{ background: glowColor }}
          animate={{ opacity: [0.3, 0.6, 0.3] }}
          transition={{ duration: 3, repeat: Infinity }}
        />
      )}

      {/* Badge container */}
      <div className={`
        relative rounded-[1.2rem] px-3 py-2 text-[9px] sios-mono
        ${isOwner
          ? "bg-[linear-gradient(135deg,rgba(120,180,255,0.2),rgba(80,140,220,0.1))] border border-cyan-300/32 shadow-[inset_0_1px_0_rgba(120,180,255,0.2),0_8px_20px_rgba(120,180,255,0.16)]"
          : "bg-[linear-gradient(135deg,rgba(120,180,255,0.12),rgba(80,140,220,0.06))] border border-cyan-400/16 shadow-[inset_0_1px_0_rgba(120,180,255,0.12)]"
        }
      `}>
        <div className="flex items-center gap-2">
          <span className="text-cyan-300/80 font-light">◆</span>
          <span className="text-white/75">{shortGid}</span>
        </div>
        <div className="flex gap-2 mt-1.5 text-[8px]">
          <span className="text-cyan-200/70">{clearance}</span>
          <span className="text-white/45">Trust {trust}%</span>
          {sessionCount > 1 && (
            <motion.span 
              className="text-cyan-300/60"
              animate={{ opacity: [0.5, 1] }}
              transition={{ duration: 2, repeat: Infinity }}
            >
              ◉ x{sessionCount}
            </motion.span>
          )}
        </div>
      </div>
    </motion.div>
  );
}

interface TrustMeterProps {
  trust: number;
  isOwner?: boolean;
}

export function TrustMeter({ trust, isOwner = false }: TrustMeterProps) {
  return (
    <motion.div className="w-full space-y-1">
      <div className="flex items-center justify-between text-[8px] sios-mono text-white/50">
        <span>TRUST MATRIX</span>
        <span className={isOwner ? "text-cyan-200" : "text-cyan-200/70"}>{trust}%</span>
      </div>
      <div className="h-1 rounded-full bg-cyan-400/8 overflow-hidden">
        <motion.div
          className={`h-full rounded-full ${
            isOwner
              ? "bg-[linear-gradient(90deg,rgba(120,180,255,0.6),rgba(180,220,255,0.8))]"
              : "bg-[linear-gradient(90deg,rgba(120,180,255,0.4),rgba(180,220,255,0.6))]"
          }`}
          initial={{ width: "0%" }}
          animate={{ width: `${trust}%` }}
          transition={{ duration: 1.2, ease: "easeOut" }}
        />
      </div>
    </motion.div>
  );
}
