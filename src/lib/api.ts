/**
 * Agentic OR — API Client
 * Centralized fetch wrapper for /api/v1 endpoints.
 * Handles JWT storage, refresh, and injection.
 */

const API_BASE = "/api/v1";
const TOKEN_KEY = "tae_access_token";
const REFRESH_KEY = "tae_refresh_token";

// ── Token management ─────────────────────────────────────────

export function getAccessToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function getRefreshToken(): string | null {
  return localStorage.getItem(REFRESH_KEY);
}

export function setTokens(access: string, refresh?: string): void {
  localStorage.setItem(TOKEN_KEY, access);
  if (refresh) localStorage.setItem(REFRESH_KEY, refresh);
}

export function clearTokens(): void {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(REFRESH_KEY);
}

// ── Fetch wrapper with auth ────────────────────────────────────

async function apiFetch(path: string, options: RequestInit = {}): Promise<Response> {
  const token = getAccessToken();
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(options.headers as Record<string, string>),
  };
  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }

  let resp = await fetch(`${API_BASE}${path}`, { ...options, headers });

  // Auto-refresh on 401
  if (resp.status === 401 && getRefreshToken()) {
    const refreshed = await tryRefresh();
    if (refreshed) {
      headers["Authorization"] = `Bearer ${getAccessToken()}`;
      resp = await fetch(`${API_BASE}${path}`, { ...options, headers });
    }
  }

  return resp;
}

async function tryRefresh(): Promise<boolean> {
  const refresh = getRefreshToken();
  if (!refresh) return false;

  try {
    const resp = await fetch(`${API_BASE}/auth/refresh`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refresh_token: refresh }),
    });
    if (!resp.ok) return false;
    const data = await resp.json();
    setTokens(data.access_token);
    return true;
  } catch {
    return false;
  }
}

// ── API methods ────────────────────────────────────────────────

export const api = {
  // ── Auth ──
  async register(email: string, password: string, display_name?: string) {
    const resp = await apiFetch("/auth/register", {
      method: "POST",
      body: JSON.stringify({ email, password, display_name }),
    });
    if (!resp.ok) throw new Error((await resp.json()).detail || "Registration failed");
    const data = await resp.json();
    setTokens(data.access_token, data.refresh_token);
    return data;
  },

  async login(email: string, password: string) {
    const resp = await apiFetch("/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    });
    if (!resp.ok) throw new Error((await resp.json()).detail || "Login failed");
    const data = await resp.json();
    setTokens(data.access_token, data.refresh_token);
    return data;
  },

  async demoSession() {
    const resp = await apiFetch("/auth/demo", { method: "POST" });
    if (!resp.ok) throw new Error("Demo session failed");
    const data = await resp.json();
    setTokens(data.access_token);
    return data;
  },

  async getMe() {
    const resp = await apiFetch("/auth/me");
    if (!resp.ok) return null;
    return resp.json();
  },

  // ── WS Ticket ──
  async getWsTicket(): Promise<string> {
    const resp = await apiFetch("/ws/ticket", { method: "POST" });
    if (!resp.ok) throw new Error("Failed to get WS ticket");
    const data = await resp.json();
    return data.ticket;
  },

  // ── TAE ──
  async taeCommand(command: string, history: Array<{ role: string; content: string }> = []) {
    const resp = await apiFetch("/tae/command", {
      method: "POST",
      body: JSON.stringify({ command, history }),
    });
    if (!resp.ok) {
      if (resp.status === 429) throw new Error("Token limit reached. Upgrade your plan to continue.");
      throw new Error("TAE command failed");
    }
    return resp.json();
  },

  // ── Billing ──
  async getUsage() {
    const resp = await apiFetch("/billing/usage");
    if (!resp.ok) return null;
    return resp.json();
  },

  async createCheckout(plan: string) {
    const resp = await apiFetch("/billing/checkout", {
      method: "POST",
      body: JSON.stringify({ plan }),
    });
    if (!resp.ok) throw new Error("Checkout failed");
    return resp.json();
  },

  // ── Admin ──
  async getStats() {
    const resp = await apiFetch("/admin/stats");
    if (!resp.ok) return null;
    return resp.json();
  },

  // ── Health ──
  async health() {
    const resp = await apiFetch("/health");
    return resp.json();
  },
};
