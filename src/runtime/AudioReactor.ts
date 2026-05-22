/**
 * AudioReactor — Reactive Ambient Audio Engine
 * 
 * Generates breathing ambient audio that responds to TAE state.
 * Smooth fade between gain levels. No abrupt starts/stops.
 * Uses Web Audio API for synthesis.
 */

import type { TAEState, TAERenderConfig } from './TAE';
import { tae } from './TAE';

export class AudioReactor {
  private audioContext: AudioContext | null = null;
  private oscillators: OscillatorNode[] = [];
  private gainNode: GainNode | null = null;
  private currentGain = 0;
  private targetGain = 0;
  private isRunning = false;
  private fadeSpeed = 0.02; // per frame
  private animationId: number | null = null;

  constructor() {
    this.initAudioContext();
    this.subscribeToTAE();
  }

  private initAudioContext(): void {
    try {
      const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
      this.audioContext = audioCtx;

      // Master gain
      this.gainNode = audioCtx.createGain();
      this.gainNode.connect(audioCtx.destination);
      this.gainNode.gain.value = 0;

      // Create base oscillators (low frequency breathing tone)
      const osc1 = audioCtx.createOscillator();
      osc1.type = 'sine';
      osc1.frequency.value = 55; // Low A
      osc1.connect(this.gainNode);
      osc1.start();
      this.oscillators.push(osc1);

      const osc2 = audioCtx.createOscillator();
      osc2.type = 'sine';
      osc2.frequency.value = 73.42; // D below middle C
      osc2.connect(this.gainNode);
      osc2.start();
      this.oscillators.push(osc2);

      this.isRunning = true;
      this.startFadeAnimation();
    } catch (e) {
      console.log('[Audio] WebAudio unavailable:', e);
    }
  }

  /**
   * Subscribe to TAE state changes
   */
  private subscribeToTAE(): void {
    tae.onStateChange((state: TAEState, config: TAERenderConfig) => {
      this.onTAEStateChange(state, config);
    });
  }

  /**
   * Handle TAE state changes
   */
  private onTAEStateChange(state: TAEState, config: TAERenderConfig): void {
    // Update target gain based on config
    this.targetGain = Math.max(0, Math.min(1, config.ambientAudioGain * 0.4)); // cap at 0.4 for safety

    // Vary oscillator frequencies slightly based on state intensity
    if (this.oscillators.length >= 2 && this.audioContext) {
      const variance = config.orbPulseIntensity * 15;
      this.oscillators[0].frequency.value = 55 + variance;
      this.oscillators[1].frequency.value = 73.42 + variance * 0.7;
    }

    console.log(`[Audio] State: ${state}, Target Gain: ${this.targetGain.toFixed(2)}`);
  }

  /**
   * Smooth fade animation
   */
  private startFadeAnimation(): void {
    const animate = () => {
      if (!this.gainNode) return;

      // Smooth fade to target
      const delta = this.targetGain - this.currentGain;
      if (Math.abs(delta) > 0.001) {
        this.currentGain += delta * this.fadeSpeed;
        this.gainNode.gain.value = Math.max(0, Math.min(1, this.currentGain));
      }

      this.animationId = requestAnimationFrame(animate);
    };

    this.animationId = requestAnimationFrame(animate);
  }

  /**
   * Resume audio context if suspended
   */
  resume(): void {
    if (this.audioContext && this.audioContext.state === 'suspended') {
      this.audioContext.resume().catch(() => {});
    }
  }

  /**
   * Shutdown
   */
  destroy(): void {
    if (this.animationId) cancelAnimationFrame(this.animationId);

    this.oscillators.forEach(osc => {
      try {
        osc.stop();
      } catch {}
    });
    this.oscillators = [];

    if (this.gainNode) {
      this.gainNode.gain.value = 0;
    }

    this.isRunning = false;
  }

  /**
   * Play a transient audio pulse
   */
  playPulse(frequency = 440, duration = 100): void {
    if (!this.audioContext || !this.gainNode) return;

    try {
      const now = this.audioContext.currentTime;
      const osc = this.audioContext.createOscillator();
      osc.frequency.value = frequency;
      osc.type = 'sine';

      const gain = this.audioContext.createGain();
      gain.gain.setValueAtTime(0.3, now);
      gain.gain.exponentialRampToValueAtTime(0.01, now + duration / 1000);
      gain.connect(this.gainNode);

      osc.connect(gain);
      osc.start(now);
      osc.stop(now + duration / 1000);
    } catch (e) {
      console.log('[Audio] Pulse failed:', e);
    }
  }

  /**
   * Get current audio context state
   */
  getState() {
    return {
      running: this.isRunning,
      currentGain: this.currentGain,
      targetGain: this.targetGain,
      contextState: this.audioContext?.state,
    };
  }
}

// Global audio reactor
export const audioReactor = new AudioReactor();

// Expose for user interaction
if (typeof window !== 'undefined') {
  (window as any).AudioReactor = audioReactor;
}
