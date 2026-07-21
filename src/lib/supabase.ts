/**
 * Agentic OR — Auth Bridge
 * Replaces Supabase with FastAPI /api/v1/auth endpoints.
 * Maintains the same interface so App.tsx doesn't need changes.
 */
import { api, getAccessToken, clearTokens } from "./api";
import type { SIOSIdentity } from "./identity";

export const SIOS_ORIGIN = "https://sios.website";
export const SIOS_AUTH_CALLBACK = `${SIOS_ORIGIN}/auth/callback`;

export async function sendMagicLink(email: string): Promise<{ error: string | null }> {
  // Demo session via API — no email verification in this phase
  try {
    await api.demoSession();
    return { error: null };
  } catch {
    return { error: "Failed to create demo session" };
  }
}

export async function signOut(): Promise<void> {
  clearTokens();
}

export async function getSession(): Promise<{ user: { email: string } } | null> {
  const token = getAccessToken();
  if (!token) return null;

  try {
    const me = await api.getMe();
    if (!me) return null;
    return { user: { email: me.email || me.gid } };
  } catch {
    return null;
  }
}

export function getRestoredSession(): null {
  return null;
}

export function onAuthChange(
  callback: (
    event: "SIGNED_IN" | "SIGNED_OUT" | "TOKEN_REFRESHED" | "USER_UPDATED",
    email: string | null
  ) => void
): () => void {
  // Poll for token changes (lightweight replacement for Supabase listener)
  let lastToken = getAccessToken();
  const interval = setInterval(() => {
    const currentToken = getAccessToken();
    if (currentToken !== lastToken) {
      if (currentToken && !lastToken) {
        // Token appeared — signed in
        api.getMe().then(me => {
          if (me) callback("SIGNED_IN", me.email || null);
        }).catch(() => {});
      } else if (!currentToken && lastToken) {
        // Token disappeared — signed out
        callback("SIGNED_OUT", null);
      }
      lastToken = currentToken;
    }
  }, 1000);

  return () => clearInterval(interval);
}

// ── Register/login helpers (new, not in old supabase.ts) ──

export async function registerWithEmail(email: string, password: string, name?: string) {
  const result = await api.register(email, password, name);
  return result;
}

export async function loginWithEmail(email: string, password: string) {
  const result = await api.login(email, password);
  return result;
}

export async function createDemoSession() {
  return api.demoSession();
}
