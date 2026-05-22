/**
 * Subscription Tier System
 * FREE | BETA ($25) | ALPHA ($100)
 * 
 * Stored in:
 * - Supabase auth.user.user_metadata.tier
 * - localStorage backup
 * - Feature gating via tiered access
 */

export type SubscriptionTier = 'free' | 'beta' | 'alpha' | 'owner';

export interface TierFeatures {
  tier: SubscriptionTier;
  name: string;
  price: number | null; // null for free/owner
  stripeLink: string | null;
  features: string[];
  orbIntensityMax: number;
  maxModules: number;
  voiceEnabled: boolean;
  persistenceEnabled: boolean;
  advancedRenderEnabled: boolean;
}

const TIER_CONFIG: Record<SubscriptionTier, TierFeatures> = {
  free: {
    tier: 'free',
    name: 'Free',
    price: null,
    stripeLink: null,
    features: [
      'Orb interaction',
      'Limited demo mode',
      'View profile',
      'Basic animations',
    ],
    orbIntensityMax: 0.5,
    maxModules: 2,
    voiceEnabled: false,
    persistenceEnabled: false,
    advancedRenderEnabled: false,
  },
  beta: {
    tier: 'beta',
    name: 'Beta',
    price: 25,
    stripeLink: 'https://buy.stripe.com/test/3cs4hT7sO...',  // Replace with real Stripe link
    features: [
      'Persistent profile',
      'Full demo mode',
      'Voice activation',
      'Identity rendering',
      'Module expansion',
      'Saved preferences',
      'Session persistence',
    ],
    orbIntensityMax: 0.85,
    maxModules: 6,
    voiceEnabled: true,
    persistenceEnabled: true,
    advancedRenderEnabled: false,
  },
  alpha: {
    tier: 'alpha',
    name: 'Alpha',
    price: 100,
    stripeLink: 'https://buy.stripe.com/test/5kA5kM3sO...',  // Replace with real Stripe link
    features: [
      'Owner-style runtime',
      'Experimental modules',
      'Syncori engine access',
      'Advanced orb rendering',
      'Priority feature access',
      'Direct orchestration',
      'Custom module ordering',
      'Live runtime debugging',
    ],
    orbIntensityMax: 1.0,
    maxModules: 10,
    voiceEnabled: true,
    persistenceEnabled: true,
    advancedRenderEnabled: true,
  },
  owner: {
    tier: 'owner',
    name: 'Prime Orchestrator',
    price: null,
    stripeLink: null,
    features: [
      'All features',
      'Full system access',
      'TAE orchestration',
      'Live runtime control',
      'Debug console',
    ],
    orbIntensityMax: 1.0,
    maxModules: 10,
    voiceEnabled: true,
    persistenceEnabled: true,
    advancedRenderEnabled: true,
  },
};

// ── Get tier from localStorage ───────────────────────────────
export function getLocalTier(): SubscriptionTier {
  try {
    const raw = localStorage.getItem('sios_tier');
    if (raw && Object.keys(TIER_CONFIG).includes(raw)) {
      return raw as SubscriptionTier;
    }
  } catch { /* quota */ }
  return 'free';
}

// ── Save tier to localStorage ────────────────────────────────
export function saveLocalTier(tier: SubscriptionTier): void {
  try {
    localStorage.setItem('sios_tier', tier);
  } catch { /* quota */ }
}

// ── Get tier features ────────────────────────────────────────
export function getTierFeatures(tier: SubscriptionTier): TierFeatures {
  return TIER_CONFIG[tier] || TIER_CONFIG.free;
}

// ── Check if tier has feature access ─────────────────────────
export function hasTierAccess(tier: SubscriptionTier, feature: string): boolean {
  const config = getTierFeatures(tier);
  return config.features.includes(feature);
}

// ── Get upgrade URL for tier ─────────────────────────────────
export function getUpgradeLink(targetTier: SubscriptionTier): string | null {
  return getTierFeatures(targetTier).stripeLink;
}

// ── Export all tier names ────────────────────────────────────
export function getAllTiers(): SubscriptionTier[] {
  return Object.keys(TIER_CONFIG) as SubscriptionTier[];
}

// ── Get current tier (with fallback) ─────────────────────────
export function getCurrentTier(): SubscriptionTier {
  return getLocalTier();
}
