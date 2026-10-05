// Tenancy must come from Supabase app_metadata (writable only with the server secret key).
// user_metadata is editable by the end user via PUT /auth/v1/user and must never decide the GID.
const GID_PATTERN = /^\d{12}$/;

export function trustedGidFromUser(user) {
  const gid = String(user?.app_metadata?.gid ?? "").trim();
  return GID_PATTERN.test(gid) ? gid : null;
}

export async function setTrustedGid({ supabaseUrl, serverKey, userId, gid }) {
  if (!supabaseUrl || !serverKey) throw Object.assign(new Error("Supabase admin is not configured"), { status: 503 });
  if (!GID_PATTERN.test(String(gid))) throw Object.assign(new Error("Invalid GID"), { status: 500 });
  const headers = { apikey: serverKey, "Content-Type": "application/json", Accept: "application/json" };
  if (!serverKey.startsWith("sb_secret_")) headers.Authorization = `Bearer ${serverKey}`;
  const response = await fetch(`${supabaseUrl}/auth/v1/admin/users/${encodeURIComponent(userId)}`, {
    method: "PUT",
    headers,
    body: JSON.stringify({ app_metadata: { gid: String(gid) } }),
    signal: AbortSignal.timeout(15000),
  });
  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw Object.assign(new Error(`Failed to bind GID to user (${response.status}) ${detail.slice(0, 200)}`), { status: 503 });
  }
  return response.json();
}
