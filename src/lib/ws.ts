/**
 * SIOS WebSocket Client
 * Connects to /api/ws with GID + role query params.
 * Handles: state snapshots, render updates, console entries,
 *          system events, device updates, Syncori updates,
 *          orb spawns, heartbeats.
 * Auto-reconnects with exponential backoff.
 */

export type WSMessage =
  | { type: "state_snapshot";  [key: string]: unknown }
  | { type: "render_update";   render: RenderStateWS }
  | { type: "console_entry";   entry: ConsoleEntry }
  | { type: "system_event";    event: SystemEvent }
  | { type: "device_update";   devices: DeviceRecord[] }
  | { type: "syncori_update";  queue: SyncoriTrack[]; index: number }
  | { type: "orb_spawn";       module: string; effect: string }
  | { type: "tae_state";       state: string }
  | { type: "tae_result";      response: string; tools_called: ToolCall[]; render_mutated: boolean; tae_state: string }
  | { type: "heartbeat";       ts: number; tae_state: string; system_time: string; ws_count: number }
  | { type: "pong";            ts: number; tae_state: string };

export interface RenderStateWS {
  viscosity: number;
  reflection: number;
  glow_intensity: number;
  formation: number;
  pulse_speed: number;
  syncori_activity: number;
  active_module: string;
  tae_state: string;
}

export interface ConsoleEntry {
  role: "user" | "tae";
  msg: string;
  ts: number;
}

export interface SystemEvent {
  time: string;
  level: string;
  msg: string;
}

export interface DeviceRecord {
  name: string;
  type: string;
  status: string;
  online: boolean;
  last_seen: number;
  metadata: Record<string, unknown>;
}

export interface SyncoriTrack {
  id: string;
  title: string;
  artist: string;
  album: string;
  duration: string;
  added_at: number;
}

export interface ToolCall {
  name: string;
  params: Record<string, unknown>;
  result: Record<string, unknown>;
}

export type MessageHandler = (msg: WSMessage) => void;
export type StatusHandler  = (connected: boolean) => void;

const BACKOFF_STEPS = [500, 1000, 2000, 5000, 10000];

export class SIOSWebSocket {
  private ws: WebSocket | null = null;
  private gid: string;
  private role: string;
  private handlers: MessageHandler[] = [];
  private statusHandlers: StatusHandler[] = [];
  private reconnectAttempt = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private destroyed = false;

  constructor(gid: string, role: string) {
    this.gid  = gid;
    this.role = role;
  }

  connect() {
    if (this.destroyed) return;
    const proto = window.location.protocol === "https:" ? "wss" : "ws";
    const host  = window.location.host;
    const url   = `${proto}://${host}/api/ws?gid=${encodeURIComponent(this.gid)}&role=${encodeURIComponent(this.role)}`;

    try {
      this.ws = new WebSocket(url);
    } catch {
      this._scheduleReconnect();
      return;
    }

    this.ws.onopen = () => {
      this.reconnectAttempt = 0;
      this._notifyStatus(true);
    };

    this.ws.onmessage = (ev) => {
      try {
        const msg = JSON.parse(ev.data) as WSMessage;
        this.handlers.forEach(h => h(msg));
      } catch { /* ignore malformed */ }
    };

    this.ws.onclose = () => {
      this._notifyStatus(false);
      this._scheduleReconnect();
    };

    this.ws.onerror = () => {
      this.ws?.close();
    };
  }

  disconnect() {
    this.destroyed = true;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.ws?.close();
    this.ws = null;
  }

  send(payload: object) {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(payload));
    }
  }

  sendCommand(command: string) {
    this.send({ type: "tae_command", command });
  }

  ping() {
    this.send({ type: "ping" });
  }

  onMessage(handler: MessageHandler): () => void {
    this.handlers.push(handler);
    return () => { this.handlers = this.handlers.filter(h => h !== handler); };
  }

  onStatus(handler: StatusHandler): () => void {
    this.statusHandlers.push(handler);
    return () => { this.statusHandlers = this.statusHandlers.filter(h => h !== handler); };
  }

  get connected(): boolean {
    return this.ws?.readyState === WebSocket.OPEN;
  }

  private _scheduleReconnect() {
    if (this.destroyed) return;
    const delay = BACKOFF_STEPS[Math.min(this.reconnectAttempt, BACKOFF_STEPS.length - 1)];
    this.reconnectAttempt++;
    this.reconnectTimer = setTimeout(() => this.connect(), delay);
  }

  private _notifyStatus(connected: boolean) {
    this.statusHandlers.forEach(h => h(connected));
  }
}

// ── Singleton factory ───────────────────────────────────────────
let _instance: SIOSWebSocket | null = null;

export function getWSClient(gid?: string, role?: string): SIOSWebSocket {
  if (!_instance && gid && role) {
    _instance = new SIOSWebSocket(gid, role);
    _instance.connect();
  }
  return _instance!;
}

export function destroyWSClient() {
  _instance?.disconnect();
  _instance = null;
}
