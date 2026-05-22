import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useRuntime } from "../contexts/RuntimeContext";
import { LiquidReveal } from "./LiquidReveal";

const TAE_PRESETS = ["TAE, pulse orb", "TAE, activate Syncori", "TAE, open identity", "TAE, show devices"];

const TAE_STATE_INDICATORS = {
  IDLE: { label: "◆ IDLE", color: "text-white/50" },
  LISTENING: { label: "◉ LISTENING", color: "text-cyan-300/80" },
  THINKING: { label: "◆ THINKING", color: "text-cyan-200/80" },
  GENERATING: { label: "◉ GENERATING", color: "text-cyan-200/90" },
  EXPANDING: { label: "◇ EXPANDING", color: "text-cyan-300/70" },
  SYNCHRONIZING: { label: "⬡ SYNCHRONIZING", color: "text-cyan-200/60" },
};

export function CommandView() {
  const { runtime, sendCommand, directCommand, setTaeState } = useRuntime();
  const [input, setInput] = useState("");
  const [isExecuting, setIsExecuting] = useState(false);
  const logRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    logRef.current?.scrollTo({ top: logRef.current.scrollHeight, behavior: "smooth" });
  }, [runtime.consoleLog]);

  useEffect(() => {
    if (runtime.taeState === "GENERATING" || runtime.taeState === "THINKING") {
      setIsExecuting(true);
    } else {
      setIsExecuting(false);
    }
  }, [runtime.taeState]);

  const handleSend = async (cmd: string) => {
    const value = cmd.trim();
    if (!value) return;
    setInput("");
    setTaeState("LISTENING");
    
    if (value.toLowerCase().includes("demo mode")) {
      setTaeState("THINKING");
      await sendCommand(value);
      return;
    }
    
    setTaeState("THINKING");
    await directCommand(value);
  };

  const stateInfo = TAE_STATE_INDICATORS[runtime.taeState as keyof typeof TAE_STATE_INDICATORS] || TAE_STATE_INDICATORS.IDLE;

  return (
    <div className="relative w-full h-screen overflow-hidden bg-black px-4 pb-4 pt-4 text-white sios-void">
      <div className="absolute inset-0 opacity-90 [background:radial-gradient(circle_at_50%_14%,rgba(255,255,255,0.08),transparent_14%),radial-gradient(circle_at_50%_48%,rgba(120,180,255,0.08),transparent_24%),radial-gradient(circle_at_50%_76%,rgba(255,255,255,0.04),transparent_34%)]" />
      <div className="absolute inset-x-0 top-1/4 h-[48vh] sios-ripple blur-[68px] opacity-70" />

      <div className="relative z-10 flex h-screen flex-col gap-4">
        {/* System header with TAE state */}
        <LiquidReveal delay={0} duration={0.7}>
          <motion.div className="flex items-center justify-between text-[9px] sios-mono">
            <div className="text-cyan-300/50">◆ TAE CONSOLE</div>
            <motion.div 
              className={`${stateInfo.color} transition-colors duration-500`}
              animate={isExecuting ? { opacity: [0.6, 1] } : { opacity: 1 }}
              transition={isExecuting ? { duration: 0.8, repeat: Infinity } : { duration: 0.5 }}
            >
              {stateInfo.label}
            </motion.div>
          </motion.div>
        </LiquidReveal>

        {/* Console output with liquid reveals */}
        <LiquidReveal delay={0.2} duration={0.8} className="flex-1">
          <motion.div className="sios-chrome rounded-[2rem] p-4 h-full flex flex-col">
            <div className="mb-3 flex items-center justify-between text-[9px] sios-mono text-cyan-300/50">
              <span>RUNTIME LOG</span>
              <motion.span animate={{ opacity: [0.4, 0.8] }} transition={{ duration: 2, repeat: Infinity }}>
                {runtime.consoleLog.length} events
              </motion.span>
            </div>
            <div 
              ref={logRef} 
              className="flex-1 space-y-1.5 overflow-y-auto pr-2 text-[9px] leading-4 tracking-[0.06em] text-white/70 font-mono"
            >
              <AnimatePresence mode="popLayout">
                {runtime.consoleLog.slice(-16).map((entry, i) => (
                  <motion.div
                    key={`${i}-${entry.ts}`}
                    initial={{ opacity: 0, x: -12 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: 12 }}
                    transition={{ duration: 0.4 }}
                    className="flex gap-2"
                  >
                    <span className="text-cyan-400/40 flex-shrink-0">
                      {new Date(entry.ts * 1000).toLocaleTimeString([], { hour12: false })}
                    </span>
                    <span className={entry.role === "tae" ? "text-cyan-200/90" : "text-white/75"}>
                      {entry.role === "user" ? "› " : "◆ "}{entry.msg}
                    </span>
                  </motion.div>
                ))}
              </AnimatePresence>
              {runtime.consoleLog.length === 0 && (
                <div className="flex h-full items-center justify-center text-white/30 text-[10px]">
                  awaiting command
                </div>
              )}
            </div>
          </motion.div>
        </LiquidReveal>

        {/* Command input with liquid emergence */}
        <LiquidReveal delay={0.4} duration={0.8}>
          <motion.div className="sios-chrome rounded-[2rem] p-4 space-y-3">
            <div className="flex items-center gap-3 border-b border-cyan-400/12 pb-3">
              <span className="text-[10px] sios-mono text-cyan-300/80">›</span>
              <input 
                value={input} 
                onChange={(e) => setInput(e.target.value)} 
                onKeyDown={(e) => e.key === "Enter" && handleSend(input)} 
                placeholder="speak command" 
                disabled={isExecuting}
                className="flex-1 bg-transparent text-[11px] tracking-[0.1em] text-white/88 outline-none placeholder:text-white/28 disabled:opacity-50 disabled:cursor-not-allowed" 
              />
              <motion.button 
                onClick={() => handleSend(input)} 
                disabled={isExecuting}
                animate={isExecuting ? { opacity: [0.4, 0.8], scale: [0.95, 1.05] } : { opacity: 1, scale: 1 }}
                transition={isExecuting ? { duration: 0.6, repeat: Infinity } : { duration: 0.2 }}
                className="text-[10px] sios-mono text-cyan-300/80 hover:text-cyan-200 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                ◆
              </motion.button>
            </div>

            {/* Preset commands with staggered liquid reveals */}
            <div className="grid grid-cols-2 gap-2">
              {TAE_PRESETS.map((cmd, idx) => (
                <LiquidReveal key={cmd} delay={0.5 + idx * 0.1} duration={0.6}>
                  <motion.button
                    onClick={() => handleSend(cmd)}
                    disabled={isExecuting}
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                    className="sios-chrome-soft rounded-[1.2rem] px-3 py-2.5 text-left text-[9px] sios-mono text-cyan-200/70 hover:text-cyan-200/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed w-full"
                  >
                    {cmd}
                  </motion.button>
                </LiquidReveal>
              ))}
            </div>
          </motion.div>
        </LiquidReveal>

        {/* Device mesh with liquid reveals */}
        {runtime.devices.length > 0 && (
          <LiquidReveal delay={0.6} duration={0.8}>
            <motion.div className="grid grid-cols-2 gap-2 max-h-[20vh] overflow-y-auto pr-2">
              {runtime.devices.slice(0, 4).map((device, idx) => (
                <motion.div
                  key={device.name}
                  initial={{ opacity: 0, scale: 0.88 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ delay: 0.7 + idx * 0.08, duration: 0.5 }}
                  className="sios-chrome-soft rounded-[1.2rem] px-3 py-2.5 text-[9px] sios-mono"
                >
                  <motion.div 
                    className="text-cyan-200/80 font-light"
                    animate={device.status === "active" ? { opacity: [0.7, 1] } : { opacity: 0.6 }}
                    transition={{ duration: 1.5, repeat: Infinity }}
                  >
                    ◆ {device.name}
                  </motion.div>
                  <div className="mt-0.5 text-white/45 text-[8px]">{device.status}</div>
                </motion.div>
              ))}
            </motion.div>
          </LiquidReveal>
        )}
      </div>
    </div>
  );
}
