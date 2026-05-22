/**
 * HomeView — Pure Void + Orb
 * 
 * The orb is the interface.
 * Everything emerges from the orb.
 * No dashboard. No navbar. No panels.
 * 
 * States:
 * - dormant: void + orb breathing (prompt to activate)
 * - activated: demo sequence (listing through TAE states)
 * - runtime: full system ready (UI emerges from orb on command)
 */

import { useState, useEffect, useRef } from "react";
import { motion } from "framer-motion";
import type { SIOSIdentity } from "../lib/identity";
import { playTransitionTone } from "../lib/audio";
import { useVoiceActivation } from "../hooks/useVoiceActivation";
import { tae, type TAEState } from "../runtime/TAE";
import { OrbViewer } from "./OrbViewer";
import { LiquidReveal } from "./LiquidReveal";
import { getCurrentTier, type SubscriptionTier } from "../lib/subscriptions";

interface HomeViewProps {
  identity: SIOSIdentity;
  demoMode?: boolean;
  onDemoRequest?: () => void;
}

export function HomeView({ identity, demoMode = false, onDemoRequest }: HomeViewProps) {
  const [activated, setActivated] = useState(demoMode);
  const [demoSequenceComplete, setDemoSequenceComplete] = useState(false);
  const [listeningActive, setListeningActive] = useState(false);
  const [prompt, setPrompt] = useState("TAE, enter Demo Mode");
  const [taeState, setTaeState] = useState<TAEState>('dormant');
  const [tier, setTier] = useState<SubscriptionTier>('free');
  const inputRef = useRef<HTMLInputElement>(null);

  const { isListening, startListening, stopListening, isSupported: voiceSupported } =
    useVoiceActivation((voiceCmd) => {
      if (voiceCmd.toLowerCase().includes("demo")) {
        handleDemoActivation();
      }
    });

  // Watch TAE state for demo sequence completion
  useEffect(() => {
    const unsub = tae.onStateChange((state) => {
      setTaeState(state);
      if (state === 'owner_mode') {
        setDemoSequenceComplete(true);
      }
    });
    return unsub;
  }, []);

  // Load subscription tier
  useEffect(() => {
    setTier(getCurrentTier());
  }, []);

  const handleDemoActivation = () => {
    setActivated(true);
    playTransitionTone();
    tae.queueCommand('demo mode');
    setPrompt("");
  };

  return (
    <div 
      className="relative w-full h-screen overflow-hidden bg-black text-white"
      style={{ 
        touchAction: 'manipulation',
        background: 'radial-gradient(circle at 50% 12%, rgba(120,180,255,0.12), transparent 18%), radial-gradient(circle at 50% 50%, rgba(120,180,255,0.06), transparent 40%), radial-gradient(ellipse at 50% 80%, rgba(80,140,220,0.04), transparent 60%), linear-gradient(180deg, #000000 0%, #0a0f1a 40%, #050a15 100%)'
      }}
    >
      {/* Breathing ambient glow (when activated) */}
      {activated && (
        <motion.div
          className="absolute inset-x-0 top-1/4 h-[48vh] bg-[radial-gradient(ellipse_at_center,rgba(120,180,255,0.12),transparent_64%)]"
          animate={{ opacity: [0.3, 0.6, 0.3] }}
          transition={{ duration: 6, repeat: Infinity, ease: "easeInOut" }}
        />
      )}

      {/* Centered orb: sole interface */}
      <div className="absolute inset-0 flex items-center justify-center">
        <motion.div
          initial={{ opacity: 0, scale: 0.88 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 1.4, ease: "easeOut" }}
          className="relative"
        >
          {/* Orb interior glow */}
          <motion.div
            className="absolute inset-0 -inset-8 rounded-full bg-[radial-gradient(circle,rgba(180,210,255,0.18),transparent_72%)] blur-2xl"
            animate={{ opacity: [0.4, 1, 0.4], scale: [1, 1.06, 1] }}
            transition={{ duration: 3.8, repeat: Infinity, ease: "easeInOut" }}
          />

          {/* The orb */}
          <OrbViewer 
            size={280} 
            breath={1.2}
            distort={0.8}
            intensity={1.1}
            glowPulse={1.2}
            state={activated ? taeState : 'dormant'}
            tier={tier}
          />

          {/* Expansion ring (shows during activation sequence) */}
          {activated && (
            <motion.div
              className="absolute inset-0 -inset-24 rounded-full border border-cyan-300/12"
              animate={{
                scale: [1, 1.3, 1],
                borderColor: ["rgba(120,180,255,0.2)", "rgba(120,180,255,0.4)", "rgba(120,180,255,0.2)"],
                opacity: [0.3, 0.6, 0.3]
              }}
              transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
            />
          )}
        </motion.div>
      </div>

      {/* Minimal prompt (pre-activation) */}
      {!activated && prompt && (
        <motion.div
          className="absolute bottom-12 left-1/2 -translate-x-1/2 text-center"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 1.2, duration: 0.8 }}
        >
          <p className="text-[11px] sios-mono text-white/40 uppercase tracking-widest">
            {prompt}
          </p>
          {voiceSupported && (
            <p className="text-[9px] text-white/20 mt-2 uppercase tracking-widest">
              or press ◉ to speak
            </p>
          )}
        </motion.div>
      )}

      {/* Voice activation button (minimal) */}
      {voiceSupported && (
        <motion.button
          onClick={isListening ? stopListening : startListening}
          className={`fixed bottom-6 right-6 w-14 h-14 rounded-full flex items-center justify-center text-lg transition-all z-50 ${
            isListening
              ? 'bg-cyan-400/20 text-cyan-300 border border-cyan-400'
              : 'bg-white/5 text-white/40 border border-white/10 hover:bg-white/10 hover:text-white/60'
          }`}
          whileHover={{ scale: 1.1 }}
          whileTap={{ scale: 0.95 }}
          animate={isListening ? { opacity: [0.7, 1] } : { opacity: 1 }}
          transition={isListening ? { duration: 0.4, repeat: Infinity } : { duration: 0.2 }}
        >
          ◉
        </motion.button>
      )}

      {/* Demo sequence completion message */}
      {demoSequenceComplete && (
        <motion.div
          className="absolute top-1/3 left-1/2 -translate-x-1/2 text-center pointer-events-none"
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8 }}
        >
          <p className="text-2xl sios-mono text-white/90 font-light tracking-widest mb-2">
            This is not an app.
          </p>
          <p className="text-2xl sios-mono text-white/90 font-light tracking-widest mb-6">
            This is me.
          </p>

