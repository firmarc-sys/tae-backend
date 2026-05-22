/**
 * SIOS Auth — Local Identity Only
 * Supabase removed. Auth is handled entirely by the local identity engine.
 * Magic link and session persistence use localStorage via storage.ts.
 */

export const SIOS_ORIGIN = "https://sios.website";
export const SIOS_AUTH_CALLBACK = `${SIOS_ORIGIN}/auth/callback`;

export async function sendMagicLink(_email: string): Promise<{ error: string | null }> {
  // No external auth — identity is created locally via Onboarding
  return { error: null };
}

export async function signOut(): Promise<void> {
  // Handled by clearIdentity() in storage.ts
}

export async function getSession(): Promise<null> {
  // No remote session — identity loaded from localStorage
  return null;
}

export function getRestoredSession(): null {
  return null;
}

export function onAuthChange(
  _callback: (
    event: "SIGNED_IN" | "SIGNED_OUT" | "TOKEN_REFRESHED" | "USER_UPDATED",
    email: string | null
  ) => void
): () => void {
  return () => {};
}
