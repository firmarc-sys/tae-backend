/**
 * IdentityRender — Identity-Responsive Rendering Engine
 * 
 * System renders differently per identity (GID).
 * Color palette, orb behavior, module activation, audio signature
 * all respond to identity characteristics.
 */

import type { SIOSIdentity } from '../lib/identity';
import type { EnvironmentalRenderData } from './VideoSampler';
import type { TAEState } from './TAE';

export interface IdentityRenderConfig {
  gid: string;
  primaryHue: number;        // identity primary color
  accentHue: number;         // identity secondary color
  orbScaleFactor: number;    // identity-specific orb size
  orbDistortionFactor: number;
  pulseSignature: number;    // unique rhythm
  textColor: string;         // CSS color
  glowColor: string;         // CSS color
  chromeBandColor: string;   // UI emergence color
  particleColor: string;     // environmental particle color
  moduleActivationSequence: string[]; // custom module order
  audioFrequencyShift: number; // pitch shift for audio signature
}

export class IdentityRender {
  private identity: SIOSIdentity | null = null;
  private renderConfig: IdentityRenderConfig | null = null;
  private environmentalData: EnvironmentalRenderData | null = null;
  private taeState: TAEState = 'dormant';
  private listeners: Array<(config: IdentityRenderConfig) => void> = [];

  constructor(identity: SIOSIdentity | null) {
    this.setIdentity(identity);
  }

  /**
   * Set or change identity
   */
  setIdentity(identity: SIOSIdentity | null): void {
    this.identity = identity;
    if (identity) {
      this.renderConfig = this.deriveRenderConfig(identity);
      this.broadcast();
    }
  }

  /**
   * Derive render config from identity
   */
  private deriveRenderConfig(identity: SIOSIdentity): IdentityRenderConfig {
    const baseHue = identity.renderProfile?.primaryHue ?? 213;
    const accentHue = identity.renderProfile?.accentHue ?? 190;

    // Convert hue to RGB hex for CSS
    const hslToCSS = (h: number, s = 100, l = 60) => `hsl(${h}, ${s}%, ${l}%)`;

    // Identity-specific scale factor (lifePathNumber influences orb size)
    const lifePathNum = identity.renderProfile?.lifePathNumber ?? 9;
    const orbScaleFactor = 0.8 + (lifePathNum / 9) * 0.4; // 0.8-1.2

    // Unique pulse signature based on GID
    const gidSum = identity.gid
      .split('')
      .reduce((acc, ch) => acc + parseInt(ch, 10), 0);
    const pulseSignature = 0.8 + ((gidSum % 10) / 10) * 0.4;

    // Audio frequency shift (semitones)
    const audioShift = (lifePathNum - 5) * 2; // -8 to +8 semitones

    // Module activation order (hashed from GID)
    const moduleSequence = this.generateModuleSequence(identity.gid);

    return {
      gid: identity.gid,
      primaryHue: baseHue,
      accentHue,
      orbScaleFactor,
      orbDistortionFactor: identity.renderProfile?.orbDistortion ?? 0.5,
      pulseSignature,
      textColor: hslToCSS(baseHue, 100, 85),
      glowColor: hslToCSS(accentHue, 80, 55),
      chromeBandColor: hslToCSS(baseHue, 90, 50, 0.8),
      particleColor: hslToCSS(accentHue, 70, 60),
      moduleActivationSequence: moduleSequence,
      audioFrequencyShift: audioShift,
    };
  }

  /**
   * Generate deterministic module activation sequence from GID
   */
  private generateModuleSequence(gid: string): string[] {
    const allModules = [
      'TAE COMMAND',
      'SYNCORI',
      'IDENTITY',
      'IOT MESH',
      'RENDER STATE',
      'ALPHA/BETA',
      'SUBSCRIPTIONS',
      'ADMIN',
      'USER WORLDS',
      'SYSTEM LOGS',
    ];

    // Hash GID to deterministic but varied order
    let hash = 0;
    for (let i = 0; i < gid.length; i++) {
      const char = gid.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32bit integer
    }

    // Fisher-Yates shuffle with seed
    const shuffled = [...allModules];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.abs(hash) % (i + 1);
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
      hash = Math.imul(hash, 1597334677); // LCG
    }

    return shuffled;
  }

  /**
   * Update with environmental data from video sampler
   */
  updateEnvironmental(envData: EnvironmentalRenderData): void {
    this.environmentalData = envData;

    // Blend identity hues with environmental dominant hue
    if (this.renderConfig && this.identity) {
      const identityWeight = 0.7;
      const envWeight = 0.3;

      const blendedHue =
        this.renderConfig.primaryHue * identityWeight + envData.dominantHue * envWeight;

      // Update CSS variables in real time
      this.updateCSSVariables(blendedHue);
    }
  }

  /**
   * Update TAE state
   */
  updateTAEState(state: TAEState): void {
    this.taeState = state;
  }

  /**
   * Update CSS variables for real-time rendering
   */
  private updateCSSVariables(primaryHue: number): void {
    if (typeof document === 'undefined') return;

    const root = document.documentElement;
    root.style.setProperty('--identity-hue', `${primaryHue}`);
    root.style.setProperty('--identity-primary', `hsl(${primaryHue}, 100%, 65%)`);
    root.style.setProperty('--identity-accent', `hsl(${(primaryHue + 30) % 360}, 80%, 55%)`);
  }

  /**
   * Get current render config
   */
  getRenderConfig(): IdentityRenderConfig | null {
    return this.renderConfig;
  }

  /**
   * Register listener for config changes
   */
  onChange(callback: (config: IdentityRenderConfig) => void): () => void {
    this.listeners.push(callback);
    return () => {
      this.listeners = this.listeners.filter(l => l !== callback);
    };
  }

  private broadcast(): void {
    if (!this.renderConfig) return;
    this.listeners.forEach(listener => listener(this.renderConfig!));
  }

  /**
   * Export state
   */
  exportState() {
    return {
      gid: this.identity?.gid,
      renderConfig: this.renderConfig,
      environmentalData: this.environmentalData,
      taeState: this.taeState,
      timestamp: Date.now(),
    };
  }
}

// Helper to create with identity
export function createIdentityRender(identity: SIOSIdentity | null): IdentityRender {
  return new IdentityRender(identity);
}
