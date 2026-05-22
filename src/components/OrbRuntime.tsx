/**
 * OrbRuntime — Liquid Chrome Orb with Organic UI Emission
 * 
 * Orb as sole origin point. UI structures emerge, breathe, and dissolve
 * from the liquid surface. Reflective mercury behavior with physical ripples.
 * Responsive to TAE state and identity rendering.
 */

import React, { useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import type { TAEState, TAERenderConfig } from '../runtime/TAE';
import type { IdentityRenderConfig } from '../runtime/IdentityRender';
import type { EnvironmentalRenderData } from '../runtime/VideoSampler';

interface OrbRuntimeProps {
  taeConfig: TAERenderConfig;
  identityConfig: IdentityRenderConfig | null;
  taeState: TAEState;
  environmentalData?: EnvironmentalRenderData | null;
  onSpawnUI?: (uiType: string) => void;
}

export const OrbRuntime: React.FC<OrbRuntimeProps> = ({
  taeConfig,
  identityConfig,
  taeState,
  environmentalData,
  onSpawnUI,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [orbScale, setOrbScale] = useState(1);
  const [orbIntensity, setOrbIntensity] = useState(0.5);
  const [envBlendHue, setEnvBlendHue] = useState(identityConfig?.primaryHue ?? 213);

  // Update environmental blend hue
  useEffect(() => {
    if (environmentalData && identityConfig) {
      // 70% identity + 30% environmental
      const blended = identityConfig.primaryHue * 0.7 + environmentalData.dominantHue * 0.3;
      setEnvBlendHue(blended % 360);
    }
  }, [environmentalData, identityConfig]);

  // Breathing animation
  useEffect(() => {
    let frame = 0;
    const breatheFrame = () => {
      frame += 1;
      const cycle = (frame % 120) / 120; // 2 second cycle at 60fps
      const ease = Math.sin(cycle * Math.PI * 2) * 0.5 + 0.5; // smooth 0-1-0

      const [minScale, maxScale] = taeConfig.orbScaleRange;
      const scale = minScale + (maxScale - minScale) * ease;
      setOrbScale(scale);

      const baseIntensity = taeConfig.orbReflectionIntensity;
      // Environmental motion modulates intensity
      const motionMod = environmentalData?.motionIntensity ?? 0;
      const pulsed = baseIntensity + Math.sin(cycle * Math.PI * 2) * 0.1 + motionMod * 0.05;
      setOrbIntensity(Math.max(0, Math.min(1, pulsed)));

      requestAnimationFrame(breatheFrame);
    };

    const id = requestAnimationFrame(breatheFrame);
    return () => cancelAnimationFrame(id);
  }, [taeConfig, environmentalData]);

  // Canvas rendering for orb + ripples
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const width = canvas.width;
    const height = canvas.height;
    const centerX = width / 2;
    const centerY = height / 2;
    const orbRadius = 60 * orbScale;

    let time = 0;
    const renderFrame = () => {
      time += 0.016; // 60fps

      // Clear with slight trail
      ctx.fillStyle = 'rgba(0, 5, 20, 0.05)';
      ctx.fillRect(0, 0, width, height);

      // Background void
      const gradient = ctx.createRadialGradient(centerX, centerY, 0, centerX, centerY, width / 2);
      gradient.addColorStop(0, `rgba(120, 180, 255, ${0.08 * orbIntensity})`);
      gradient.addColorStop(1, 'rgba(0, 5, 20, 0)');
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, width, height);

      // Orb liquid surface
      const orbGradient = ctx.createRadialGradient(
        centerX - orbRadius * 0.3,
        centerY - orbRadius * 0.3,
        0,
        centerX,
        centerY,
        orbRadius
      );

      const saturation = 80 + orbIntensity * 20;
      const lightness = 50 + orbIntensity * 15;
      // Use blended hue (identity + environmental)
      const envLuminance = environmentalData?.luminance ?? 0.5;

      orbGradient.addColorStop(0, `hsla(${envBlendHue}, ${saturation}%, ${lightness}%, 0.95)`);
      orbGradient.addColorStop(0.6, `hsla(${hue}, 60%, 40%, 0.8)`);
      orbGradient.addColorStop(1, `hsla(${hue}, 40%, 20%, 0.4)`);

      ctx.fillStyle = orbGradient;
      ctx.beginPath();
      ctx.arc(centerX, centerY, orbRadius, 0, Math.PI * 2);
      ctx.fill();

      // Chrome reflections (3 moving spots)
      for (let i = 0; i < 3; i++) {
        const angle = (time * 0.5 + (i / 3) * Math.PI * 2) % (Math.PI * 2);
        const reflectX = centerX + Math.cos(angle) * orbRadius * 0.6;
        const reflectY = centerY + Math.sin(angle) * orbRadius * 0.6;

        const reflectGradient = ctx.createRadialGradient(reflectX, reflectY, 0, reflectX, reflectY, orbRadius * 0.3);
        reflectGradient.addColorStop(0, `rgba(255, 255, 255, ${0.6 * orbIntensity})`);
        reflectGradient.addColorStop(1, `rgba(255, 255, 255, 0)`);

        ctx.fillStyle = reflectGradient;
        ctx.beginPath();
        ctx.arc(reflectX, reflectY, orbRadius * 0.3, 0, Math.PI * 2);
        ctx.fill();
      }

      // Ripple pool beneath orb
      const rippleY = centerY + orbRadius + 20;
      const rippleAmount = Math.max(0, taeConfig.rippleAmplitude);

      for (let r = 1; r < 4; r++) {
        const ripplePhase = (time * taeConfig.rippleFrequency - r * 0.3) % (Math.PI * 2);
        const rippleRadius = 20 + r * 30;
        const rippleHeight = Math.sin(ripplePhase) * rippleAmount * 10;

        ctx.strokeStyle = `rgba(120, 180, 255, ${(0.3 - r * 0.08) * orbIntensity})`;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(centerX, rippleY + rippleHeight, rippleRadius, 0, Math.PI * 2);
        ctx.stroke();
      }

      // Upward energy flow particles
      if (taeConfig.particleOpacity > 0.1) {
        for (let p = 0; p < 8; p++) {
          const pPhase = (time * 0.3 + p * Math.PI * 2 / 8) % (Math.PI * 2);
          const pRadius = 20 + Math.sin(pPhase) * 30;
          const pHeight = centerY - orbRadius - (time * 30 + p * 20) % 100;

          if (pHeight > -50) {
            const pAlpha = 1 - (centerY - pHeight) / 150;
            ctx.fillStyle = `rgba(120, 180, 255, ${pAlpha * taeConfig.particleOpacity * 0.5})`;
            ctx.beginPath();
            ctx.arc(centerX + Math.cos(pPhase) * pRadius, pHeight, 3, 0, Math.PI * 2);
            ctx.fill();
          }
        }
      }

      requestAnimationFrame(renderFrame);
    };

    const id = requestAnimationFrame(renderFrame);
    return () => cancelAnimationFrame(id);
  }, [taeConfig, orbIntensity, orbScale, identityConfig?.primaryHue, envBlendHue]);

  return (
    <motion.div
      className="absolute inset-0 flex items-center justify-center"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 1.5 }}
    >
      {/* Orb canvas */}
      <canvas
        ref={canvasRef}
        width={400}
        height={500}
        className="absolute"
        style={{
          filter: `blur(${Math.max(0, 2 - taeConfig.orbReflectionIntensity)}px)`,
        }}
      />

      {/* Chrome bands (UI emergence) */}
      {taeConfig.chromeBandAlpha > 0.1 && (
        <motion.div
          className="absolute inset-0 pointer-events-none"
          initial={{ opacity: 0 }}
          animate={{ opacity: taeConfig.chromeBandAlpha }}
          transition={{ duration: 0.8 }}
        >
          <div
            className="absolute top-1/3 left-1/2 -translate-x-1/2 h-1 -translate-y-1/2 rounded-full"
            style={{
              width: '60%',
              background: `linear-gradient(90deg, transparent, hsla(${identityConfig?.primaryHue ?? 213}, 100%, 60%, ${taeConfig.chromeBandAlpha}), transparent)`,
              filter: 'blur(2px)',
            }}
          />
          <div
            className="absolute top-1/2 left-1/2 -translate-x-1/2 h-1 -translate-y-1/2 rounded-full"
            style={{
              width: '70%',
              background: `linear-gradient(90deg, transparent, hsla(${(identityConfig?.accentHue ?? 190)}, 80%, 55%, ${taeConfig.chromeBandAlpha * 0.7}), transparent)`,
              filter: 'blur(3px)',
            }}
          />
        </motion.div>
      )}

      {/* State indicator text */}
      <motion.div
        className="absolute bottom-20 text-center text-white/60 text-xs uppercase tracking-widest"
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: taeState !== 'dormant' ? 1 : 0.3, y: 0 }}
        transition={{ duration: 0.6 }}
      >
        <div className="font-mono text-cyan-200/70">{taeState}</div>
        {identityConfig && (
          <div className="text-white/40 mt-1 text-[10px]">{identityConfig.gid}</div>
        )}
      </motion.div>
    </motion.div>
  );
};
