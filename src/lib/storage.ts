import type { SIOSIdentity, OnboardingData, UploadRef } from './identity';

const KEY_IDENTITY  = 'sios_identity_v2';
const KEY_ONBOARD   = 'sios_onboard_draft';
const KEY_SESSION   = 'sios_session_v2';

// ── Persist full identity ─────────────────────────────────────
export function saveIdentity(identity: SIOSIdentity): void {
  try {
    localStorage.setItem(KEY_IDENTITY, JSON.stringify(identity));
  } catch { /* quota */ }
}

export function loadIdentity(): SIOSIdentity | null {
  try {
    const raw = localStorage.getItem(KEY_IDENTITY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as SIOSIdentity;
    // Update lastActive
    parsed.lastActive = new Date().toISOString();
    saveIdentity(parsed);
    return parsed;
  } catch { return null; }
}

export function clearIdentity(): void {
  localStorage.removeItem(KEY_IDENTITY);
  localStorage.removeItem(KEY_ONBOARD);
  localStorage.removeItem(KEY_SESSION);
}

// ── Persist onboarding draft (so user can resume) ─────────────
export function saveOnboardDraft(data: Partial<OnboardingData>): void {
  try {
    localStorage.setItem(KEY_ONBOARD, JSON.stringify(data));
  } catch { /* quota */ }
}

export function loadOnboardDraft(): Partial<OnboardingData> | null {
  try {
    const raw = localStorage.getItem(KEY_ONBOARD);
    return raw ? (JSON.parse(raw) as Partial<OnboardingData>) : null;
  } catch { return null; }
}

// ── Upload reference persistence ──────────────────────────────
// Store upload refs in the identity; only keep URL/name (not full binary in LS)
export function addUploadToIdentity(identity: SIOSIdentity, upload: UploadRef): SIOSIdentity {
  const updated: SIOSIdentity = {
    ...identity,
    uploads: [...identity.uploads, upload],
  };
  saveIdentity(updated);
  return updated;
}

// ── Session token (lightweight) ───────────────────────────────
export function saveSession(gid: string, role: string): void {
  localStorage.setItem(KEY_SESSION, JSON.stringify({ gid, role, ts: Date.now() }));
}

export function loadSession(): { gid: string; role: string; ts: number } | null {
  try {
    const raw = localStorage.getItem(KEY_SESSION);
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}

// ── Has valid identity on device ──────────────────────────────
export function hasIdentity(): boolean {
  return !!localStorage.getItem(KEY_IDENTITY);
}
