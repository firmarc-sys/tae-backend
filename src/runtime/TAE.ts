/**
 * TAE — Temporal Alignment Engine
 * 
 * Master orchestration system controlling system state, rendering behavior,
 * audio intensity, module activation, orb deformation, and identity response.
 * 
 * States: dormant → idle → listening → awakening → active → generating → orchestrating → owner_mode
 */

export type TAEState = 'dormant' | 'idle' | 'listening' | 'awakening' | 'active' | 'generating' | 'orchestrating' | 'owner_mode';

export interface TAERenderConfig {
  orbPulseIntensity: number;      // 0-1: breathing intensity
  orbScaleRange: [number, number]; // min/max scale
  orbReflectionIntensity: number;  // chrome reflection strength
  orbDistortion: number;           // liquid deformation
  rippleAmplitude: number;         // pool ripple height
  rippleFrequency: number;         // ripples per second
  chromeBandAlpha: number;         // UI emergence fade
  particleOpacity: number;         // environmental particles
  ambientAudioGain: number;        // 0-1
  moduleActivationDelay: number;   // ms between module emergence
  uiEmergenceVelocity: number;     // how fast UI grows
}

export interface TAEStateConfig {
  [key: string]: TAERenderConfig;
}

const RENDER_CONFIGS: TAEStateConfig = {
  dormant: {
    orbPulseIntensity: 0.2,
    orbScaleRange: [0.92, 1.0],
    orbReflectionIntensity: 0.3,
    orbDistortion: 0.0,
    rippleAmplitude: 0.0,
    rippleFrequency: 0.0,
    chromeBandAlpha: 0.0,
    particleOpacity: 0.0,
    ambientAudioGain: 0.0,
    moduleActivationDelay: 100,
    uiEmergenceVelocity: 0.3,
  },
  idle: {
    orbPulseIntensity: 0.4,
    orbScaleRange: [0.95, 1.02],
    orbReflectionIntensity: 0.45,
    orbDistortion: 0.1,
    rippleAmplitude: 0.02,
    rippleFrequency: 0.3,
    chromeBandAlpha: 0.15,
    particleOpacity: 0.15,
    ambientAudioGain: 0.12,
    moduleActivationDelay: 120,
    uiEmergenceVelocity: 0.4,
  },
  listening: {
    orbPulseIntensity: 0.5,
    orbScaleRange: [0.96, 1.04],
    orbReflectionIntensity: 0.6,
    orbDistortion: 0.2,
    rippleAmplitude: 0.04,
    rippleFrequency: 0.6,
    chromeBandAlpha: 0.25,
    particleOpacity: 0.25,
    ambientAudioGain: 0.2,
    moduleActivationDelay: 80,
    uiEmergenceVelocity: 0.5,
  },
  awakening: {
    orbPulseIntensity: 0.65,
    orbScaleRange: [0.94, 1.08],
    orbReflectionIntensity: 0.75,
    orbDistortion: 0.35,
    rippleAmplitude: 0.08,
    rippleFrequency: 1.0,
    chromeBandAlpha: 0.4,
    particleOpacity: 0.35,
    ambientAudioGain: 0.35,
    moduleActivationDelay: 60,
    uiEmergenceVelocity: 0.6,
  },
  active: {
    orbPulseIntensity: 0.7,
    orbScaleRange: [0.93, 1.1],
    orbReflectionIntensity: 0.85,
    orbDistortion: 0.45,
    rippleAmplitude: 0.12,
    rippleFrequency: 1.4,
    chromeBandAlpha: 0.55,
    particleOpacity: 0.45,
    ambientAudioGain: 0.45,
    moduleActivationDelay: 50,
    uiEmergenceVelocity: 0.7,
  },
  generating: {
    orbPulseIntensity: 0.85,
    orbScaleRange: [0.9, 1.25],
    orbReflectionIntensity: 0.95,
    orbDistortion: 0.65,
    rippleAmplitude: 0.18,
    rippleFrequency: 2.0,
    chromeBandAlpha: 0.75,
    particleOpacity: 0.6,
    ambientAudioGain: 0.6,
    moduleActivationDelay: 30,
    uiEmergenceVelocity: 0.85,
  },
  orchestrating: {
    orbPulseIntensity: 0.9,
    orbScaleRange: [0.88, 1.35],
    orbReflectionIntensity: 1.0,
    orbDistortion: 0.8,
    rippleAmplitude: 0.24,
    rippleFrequency: 2.6,
    chromeBandAlpha: 0.9,
    particleOpacity: 0.75,
    ambientAudioGain: 0.75,
    moduleActivationDelay: 20,
    uiEmergenceVelocity: 1.0,
  },
  owner_mode: {
    orbPulseIntensity: 1.0,
    orbScaleRange: [0.85, 1.5],
    orbReflectionIntensity: 1.0,
    orbDistortion: 1.0,
    rippleAmplitude: 0.32,
    rippleFrequency: 3.2,
    chromeBandAlpha: 1.0,
    particleOpacity: 1.0,
    ambientAudioGain: 0.85,
    moduleActivationDelay: 10,
    uiEmergenceVelocity: 1.2,
  },
};

/**
 * TAE Orchestrator
 * Central runtime state machine controlling all system behavior
 */
export class TAEOrchestrator {
  private state: TAEState = 'dormant';
  private listeners: Array<(state: TAEState, config: TAERenderConfig) => void> = [];
  private activationTimestamp: number | null = null;
  private commandQueue: string[] = [];
  private isProcessing = false;

  constructor() {
    // Initialize in dormant state
    this.activateState('dormant');
  }

  /**
   * Transition to new state with render config broadcast
   */
  activateState(newState: TAEState): void {
    if (newState === this.state) return;

    const oldState = this.state;
    this.state = newState;

    if (newState === 'idle' || newState === 'awakening' || newState === 'active' || newState === 'owner_mode') {
      this.activationTimestamp = Date.now();
    }

    const config = RENDER_CONFIGS[newState];
    console.log(`[TAE] ${oldState} → ${newState}`);
    this.broadcast(newState, config);
  }

  /**
   * Queue a voice command or text input
   */
  queueCommand(input: string): void {
    this.commandQueue.push(input);
    this.processQueue();
  }

  private async processQueue(): Promise<void> {
    if (this.isProcessing || this.commandQueue.length === 0) return;

    this.isProcessing = true;
    const input = this.commandQueue.shift()!;

    // Demo mode trigger
    if (input.toLowerCase().includes('demo mode')) {
      this.enterDemoMode();
    } else if (input.toLowerCase().includes('enter demo')) {
      this.enterDemoMode();
    } else if (input.toLowerCase().includes('activate')) {
      this.activateState('active');
    } else if (input.toLowerCase().includes('generate')) {
      this.activateState('generating');
    } else if (input.toLowerCase().includes('orchestrate')) {
      this.activateState('orchestrating');
    } else if (input.toLowerCase().includes('listen')) {
      this.activateState('listening');
    } else if (input.toLowerCase().includes('sleep') || input.toLowerCase().includes('dormant')) {
      this.activateState('dormant');
    }

    this.isProcessing = false;
    if (this.commandQueue.length > 0) {
      setTimeout(() => this.processQueue(), 100);
    }
  }

  /**
   * Demo mode: sequence activation with ceremonial intensity
   */
  private enterDemoMode(): void {
    // Sequence: listening → awakening → active → generating → orchestrating → owner_mode
    const sequence: TAEState[] = ['listening', 'awakening', 'active', 'generating', 'orchestrating', 'owner_mode'];
    let index = 0;

    const advance = () => {
      if (index < sequence.length) {
        this.activateState(sequence[index]);
        index++;
        setTimeout(advance, 1200);
      }
    };

    this.activateState('listening');
    index = 1;
    setTimeout(advance, 1200);
  }

  /**
   * Get current state
   */
  getCurrentState(): TAEState {
    return this.state;
  }

  /**
   * Get current render config
   */
  getRenderConfig(): TAERenderConfig {
    return RENDER_CONFIGS[this.state];
  }

  /**
   * Register listener for state changes
   */
  onStateChange(callback: (state: TAEState, config: TAERenderConfig) => void): () => void {
    this.listeners.push(callback);
    return () => {
      this.listeners = this.listeners.filter(l => l !== callback);
    };
  }

  /**
   * Broadcast state change to all listeners
   */
  private broadcast(state: TAEState, config: TAERenderConfig): void {
    this.listeners.forEach(listener => listener(state, config));
  }

  /**
   * Get activation time in seconds
   */
  getActivationTime(): number {
    if (!this.activationTimestamp) return 0;
    return (Date.now() - this.activationTimestamp) / 1000;
  }

  /**
   * Export runtime state for API
   */
  exportState() {
    return {
      state: this.state,
      config: this.getRenderConfig(),
      activationTime: this.getActivationTime(),
      commandQueueLength: this.commandQueue.length,
      timestamp: Date.now(),
    };
  }
}

// Global singleton
export const tae = new TAEOrchestrator();

// Expose to window for demo mode activation
if (typeof window !== 'undefined') {
  (window as any).TAE = tae;
}
