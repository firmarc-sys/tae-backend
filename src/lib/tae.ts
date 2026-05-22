// TAE Runtime State Machine
export type TAEState = 'boot' | 'silence' | 'awaken' | 'idle' | 'active' | 'generate' | 'demo';

export type TAEModule = 'identity' | 'syncori' | 'iot' | 'render' | 'admin' | 'broadcast';

export interface TAERenderState {
  viscosity: number;
  reflection: number;
  glowIntensity: number;
  formation: number;
  pulseSpeed: number;
  syncoriActivity: number;
}

export interface TAESystemState {
  state: TAEState;
  activeModule: TAEModule | null;
  gid: string;
  owner: boolean;
  renderState: TAERenderState;
  iotDevices: { name: string; status: 'paired' | 'connected' | 'offline' }[];
  consoleLogs: string[];
}

export const GID_OWNER = '399152573423';

export function createInitialState(): TAESystemState {
  return {
    state: 'boot',
    activeModule: null,
    gid: GID_OWNER,
    owner: true,
    renderState: {
      viscosity: 0.86,
      reflection: 1.0,
      glowIntensity: 0.90,
      formation: 0.74,
      pulseSpeed: 1.2,
      syncoriActivity: 0.68,
    },
    iotDevices: [
      { name: 'AyrOptic Spectacles', status: 'paired' },
      { name: 'SIOS Watch', status: 'paired' },
      { name: 'Room Mesh Hub', status: 'connected' },
    ],
    consoleLogs: [
      '> TAE online.',
      '> Listening...',
      '> Awaiting command.',
      '"This is not an app. This is me."',
      '',
      '> Identity confirmed.',
      '> Clearance Ω verified.',
      '> All systems ready.',
      '> "How may I orchestrate?"',
    ],
  };
}

// Simulate TAE boot sequence timing
export const BOOT_TIMELINE = {
  particleForm: 1500,   // ms: particle materializes
  orbStabilize: 3500,   // ms: orb stabilizes
  silence: 5500,        // ms: silence phase
  taeActivate: 7000,    // ms: TAE text appears
  phraseReveal: 8500,   // ms: "This is not an app..."
  gidReveal: 10500,     // ms: GID + mode
  uiSeed: 12500,        // ms: UI begins forming
  complete: 15000,      // ms: full runtime active
};
