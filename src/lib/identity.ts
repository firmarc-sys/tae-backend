// ── SIOS Identity Engine ──────────────────────────────────────
// GID, role detection, render profile derivation

export type UserRole = 'owner' | 'alpha' | 'beta' | 'free' | 'unverified';

export const OWNER_EMAILS = ['thatwhorehey@icloud.com', '5150mhz.space@gmail.com', 'jorge@sios.website', 'Jorge.delgado@firmcollectiveos.tech', 'Jorge.delgado.thefirm51@gmail.com'] as const;
export const OWNER_EMAIL = OWNER_EMAILS[0];
export const OWNER_GID   = '399152573423';

// ── Types ─────────────────────────────────────────────────────
export interface UploadRef {
  id: string;
  name: string;
  type: string;
  url: string;       // object URL or base64 data URL
  uploadedAt: string;
}

export interface OnboardingData {
  email: string;
  name: string;
  alias?: string;
  birthdate: string; // YYYY-MM-DD
  favoriteNumber: number;
  perfectLife: string;
  goals: string[];
  uploads: UploadRef[];
  subscriptionTier?: 'alpha' | 'beta' | 'free';
}

export interface RenderProfile {
  primaryHue: number;        // 0-360
  accentHue: number;
  orbPulseSpeed: number;
  orbIntensity: number;
  orbDistortion: number;
  glowPulse: number;
  activeModules: string[];
  colorPalette: string[];    // CSS hsl strings
  tagline: string;
  lifePathNumber: number;
  lifePathSum: number;
}

export interface SIOSIdentity extends OnboardingData {
  gid: string;
  role: UserRole;
  mode: string;
  authority: string;
  renderProfile: RenderProfile;
  createdAt: string;
  lastActive: string;
}

// ── Owner identity (hardcoded master) ─────────────────────────
export const OWNER_IDENTITY: SIOSIdentity = {
  email: OWNER_EMAIL,
  name: 'Jorge Delgado',
  alias: 'Prime Orchestrator',
  birthdate: '1990-01-01',
  favoriteNumber: 9,
  perfectLife: 'Prime Orchestrator of a living intelligence system.',
  goals: ['identity', 'creativity', 'wealth', 'freedom', 'technology'],
  uploads: [],
  subscriptionTier: 'alpha',
  gid: OWNER_GID,
  role: 'owner',
  mode: 'Prime Orchestrator',
  authority: 'Owner Architect',
  renderProfile: {
    primaryHue: 213,
    accentHue: 190,
    orbPulseSpeed: 1.2,
    orbIntensity: 1.05,
    orbDistortion: 1.0,
    glowPulse: 1.5,
    activeModules: ['TAE COMMAND', 'SYNCORI', 'IDENTITY', 'IOT MESH', 'RENDER STATE', 'ALPHA/BETA', 'SUBSCRIPTIONS', 'ADMIN', 'USER WORLDS', 'SYSTEM LOGS'],
    colorPalette: ['hsl(213,100%,65%)', 'hsl(190,80%,55%)', 'hsl(213,60%,30%)'],
    tagline: 'This is not an app. This is me.',
    lifePathNumber: 9,
    lifePathSum: 29,
  },
  createdAt: '2024-01-01T00:00:00Z',
  lastActive: new Date().toISOString(),
};

// ── Owner detection ────────────────────────────────────────────
export function isOwner(email: string, gid?: string): boolean {
  const normalizedEmail = email.trim().toLowerCase();
  return (
    OWNER_EMAILS.some((ownerEmail) => normalizedEmail === ownerEmail.toLowerCase()) ||
    (!!gid && gid.trim() === OWNER_GID)
  );
}

// ── Numerology helpers ─────────────────────────────────────────
function sumDigits(n: number): number {
  return String(n).split('').reduce((a, d) => a + Number(d), 0);
}

function reduceLifePath(n: number): number {
  // Master numbers are NOT reduced
  if (n <= 9 || n === 11 || n === 22 || n === 33) return n;
  return reduceLifePath(sumDigits(n));
}

// GID = [birthdate-digits-reversed][pre-reduction-sum][life-path][fav-num]
export function generateGID(birthdate: string, favoriteNumber: number): {
  gid: string; lifePathSum: number; lifePathNumber: number;
} {
  const digits = birthdate.replace(/[-/]/g, '');
  const reversed = digits.split('').reverse().join('');
  const digitArr = digits.split('').map(Number);
  const lifePathSum = digitArr.reduce((a, b) => a + b, 0);
  const lifePathNumber = reduceLifePath(lifePathSum);
  const gid = `${reversed}${lifePathSum}${lifePathNumber}${favoriteNumber}`;
  return { gid, lifePathSum, lifePathNumber };
}

// ── Life path → color hue mapping ─────────────────────────────
const LIFE_PATH_HUES: Record<number, [number, number]> = {
  1:  [35,  55],    // Gold / Amber  — leadership
  2:  [210, 190],   // Blue / Cyan   — diplomacy
  3:  [45,  30],    // Yellow / Orange — creativity
  4:  [130, 150],   // Green / Earth — stability
  5:  [280, 305],   // Purple / Magenta — freedom
  6:  [340, 0],     // Pink / Rose   — nurturing
  7:  [250, 220],   // Violet / Indigo — spirituality
  8:  [30,  50],    // Amber / Gold  — power
  9:  [200, 180],   // Cyan / Silver — completion
  11: [220, 200],   // Blue / White  — master intuition
  22: [60,  120],   // Gold / Green  — master builder
  33: [330, 280],   // Rose / Violet — master teacher
};

// Goal → module mapping
const GOAL_MODULES: Record<string, string[]> = {
  wealth:     ['NOVAFIN', 'TAE COMMAND'],
  health:     ['NOVALIFE', 'SYNCORI'],
  connection: ['IOT MESH', 'SYNCORI'],
  creativity: ['SYNCORI', 'AUG. AUDIO'],
  identity:   ['GALACTIC ID', 'TAE COMMAND'],
  freedom:    ['NULGATA', 'NOVAFIN'],
  technology: ['TAE COMMAND', 'IOT MESH', 'RENDER STATE'],
  wellness:   ['NOVALIFE', 'AUG. AUDIO'],
};

// Taglines driven by life path mod
const TAGLINES = [
  'The system knows me. The orb renders me.',
  'Identity is frequency. You are the signal.',
  'I did not find SIOS. SIOS found me.',
  'The orb does not load. It remembers.',
  'This is not an interface. This is my reality.',
  'TAE sees my truth. The orb becomes it.',
  'My world is rendering now.',
  'Every surface reflects who I am.',
  'Not logged in. Recognized.',
  'SIOS does not have users. It has identities.',
];

// ── Derive render profile from onboarding data ─────────────────
export function deriveRenderProfile(data: OnboardingData): RenderProfile {
  const { birthdate, favoriteNumber, goals, name } = data;
  const { lifePathSum, lifePathNumber } = generateGID(birthdate, favoriteNumber);
  const hues = LIFE_PATH_HUES[lifePathNumber] ?? [210, 190];
  const favMod = ((favoriteNumber - 1) % 9) + 1; // 1-9

  const orbPulseSpeed  = 0.65 + (favMod / 9) * 0.85;
  const orbIntensity   = 0.82 + (lifePathNumber / 33) * 0.25;
  const orbDistortion  = 0.75 + (favMod / 9) * 0.55;
  const glowPulse      = 0.9 + (favMod / 9) * 0.9;

  let activeModules: string[] = ['TAE COMMAND', 'SYNCORI', 'IOT MESH'];
  goals.forEach(g => {
    const mods = GOAL_MODULES[g] ?? [];
    activeModules = [...new Set([...activeModules, ...mods])];
  });

  const tagline = TAGLINES[lifePathNumber % TAGLINES.length];

  return {
    primaryHue: hues[0],
    accentHue: hues[1],
    orbPulseSpeed,
    orbIntensity,
    orbDistortion,
    glowPulse,
    activeModules,
    colorPalette: [
      `hsl(${hues[0]}, 80%, 65%)`,
      `hsl(${hues[1]}, 60%, 55%)`,
      `hsl(${hues[0]}, 45%, 28%)`,
    ],
    tagline,
    lifePathNumber,
    lifePathSum,
  };
}

// ── Build full identity from onboarding data ───────────────────
export function buildIdentity(data: OnboardingData): SIOSIdentity {
  if (isOwner(data.email)) return { ...OWNER_IDENTITY, uploads: data.uploads };

  const { gid } = generateGID(data.birthdate, data.favoriteNumber);
  const renderProfile = deriveRenderProfile(data);
  const role = getRoleFromTier(data.subscriptionTier);

  const modeMap: Record<UserRole, string> = {
    owner:       'Prime Orchestrator',
    alpha:       'Alpha Operator',
    beta:        'Beta Explorer',
    free:        'Identity Preview',
    unverified:  'Awaiting Verification',
  };

  return {
    ...data,
    gid,
    role,
    mode: modeMap[role],
    authority: role === 'alpha' ? 'Alpha Command' : role === 'beta' ? 'Beta Access' : 'Free Tier',
    renderProfile,
    createdAt: new Date().toISOString(),
    lastActive: new Date().toISOString(),
  };
}

export function getRoleFromTier(tier?: string): UserRole {
  if (tier === 'alpha') return 'alpha';
  if (tier === 'beta')  return 'beta';
  if (tier === 'free')  return 'free';
  return 'free';
}

// ── Available goals ────────────────────────────────────────────
export const GOALS: { id: string; label: string; icon: string }[] = [
  { id: 'wealth',     label: 'Wealth',     icon: '▲' },
  { id: 'health',     label: 'Health',     icon: '✦' },
  { id: 'connection', label: 'Connection', icon: '⊕' },
  { id: 'creativity', label: 'Creativity', icon: '∿' },
  { id: 'identity',   label: 'Identity',   icon: '◉' },
  { id: 'freedom',    label: 'Freedom',    icon: '◌' },
  { id: 'technology', label: 'Technology', icon: '⊛' },
  { id: 'wellness',   label: 'Wellness',   icon: '⊙' },
];

// ── Apply identity colors to CSS vars ─────────────────────────
export function applyIdentityColors(profile: RenderProfile): void {
  const root = document.documentElement;
  root.style.setProperty('--user-primary',    `hsl(${profile.primaryHue}, 80%, 60%)`);
  root.style.setProperty('--user-accent',     `hsl(${profile.accentHue}, 65%, 55%)`);
  root.style.setProperty('--user-dim',        `hsl(${profile.primaryHue}, 40%, 30%)`);
  root.style.setProperty('--user-glow',       `hsl(${profile.primaryHue}, 80%, 55%)`);
  root.style.setProperty('--user-border',     `hsla(${profile.primaryHue}, 70%, 60%, 0.22)`);
  root.style.setProperty('--user-panel-bg',   `hsla(${profile.primaryHue}, 60%, 8%, 0.75)`);
}
