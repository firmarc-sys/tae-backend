/**
 * SIOS Runtime Context
 * Global React context holding the live runtime state received from the backend.
 * Components subscribe to slices — render state, console, devices, Syncori queue.
 * TAE commands are dispatched through this context.
 */
import { createContext, useContext, useEffect, useReducer, useRef, useCallback } from "react";
import type { ReactNode } from "react";
import { getWSClient, destroyWSClient } from "../lib/ws";
import type { RenderStateWS, ConsoleEntry, SystemEvent, DeviceRecord, SyncoriTrack, WSMessage } from "../lib/ws";
import type { SIOSIdentity } from "../lib/identity";
import { api } from "../lib/api";

// ── State shape ─────────────────────────────────────────────────

export interface RuntimeState {
  connected: boolean;
  taeState: string;         // IDLE | ACTIVE | GENERATE | DEMO
  renderState: RenderStateWS;
  consoleLog: ConsoleEntry[];
  systemEvents: SystemEvent[];
  devices: DeviceRecord[];
  syncoriQueue: SyncoriTrack[];
  syncoriIndex: number;
  systemTime: string;
  wsCount: number;
  lastCommand: string | null;
  taeResponding: boolean;   // true while waiting for TAE response
}

const DEFAULT_RENDER: RenderStateWS = {
  viscosity: 0.86, reflection: 1.00, glow_intensity: 0.90,
  formation: 0.74, pulse_speed: 1.20, syncori_activity: 0.68,
  active_module: "SYNCORI", tae_state: "ACTIVE",
};

const INITIAL_STATE: RuntimeState = {
  connected: false,
  taeState: "ACTIVE",
  renderState: DEFAULT_RENDER,
  consoleLog: [],
  systemEvents: [],
  devices: [],
  syncoriQueue: [],
  syncoriIndex: 0,
  systemTime: "--:--:--",
  wsCount: 0,
  lastCommand: null,
  taeResponding: false,
};

// ── Reducer ─────────────────────────────────────────────────────

type Action =
  | { type: "SET_CONNECTED"; connected: boolean }
  | { type: "APPLY_SNAPSHOT"; snapshot: Record<string, unknown> }
  | { type: "SET_RENDER"; render: RenderStateWS }
  | { type: "ADD_CONSOLE"; entry: ConsoleEntry }
  | { type: "ADD_EVENT"; event: SystemEvent }
  | { type: "SET_DEVICES"; devices: DeviceRecord[] }
  | { type: "SET_SYNCORI"; queue: SyncoriTrack[]; index: number }
  | { type: "SET_TAE_STATE"; state: string }
  | { type: "SET_HEARTBEAT"; time: string; wsCount: number; taeState: string }
  | { type: "SET_RESPONDING"; responding: boolean }
  | { type: "SET_LAST_COMMAND"; command: string };

function reducer(state: RuntimeState, action: Action): RuntimeState {
  switch (action.type) {
    case "SET_CONNECTED":
      return { ...state, connected: action.connected };

    case "APPLY_SNAPSHOT": {
      const s = action.snapshot as Record<string, unknown>;
      return {
        ...state,
        taeState:    (s.tae_state as string) || state.taeState,
        renderState: (s.render as RenderStateWS) || state.renderState,
        consoleLog:  (s.console_log as ConsoleEntry[]) || state.consoleLog,
        systemEvents:(s.system_events as SystemEvent[]) || state.systemEvents,
        devices:     (s.devices as DeviceRecord[]) || state.devices,
        syncoriQueue:(s.syncori_queue as SyncoriTrack[]) || state.syncoriQueue,
        syncoriIndex:(s.syncori_index as number) ?? state.syncoriIndex,
        systemTime:  (s.system_time as string) || state.systemTime,
      };
    }

    case "SET_RENDER":
      return { ...state, renderState: action.render };

    case "ADD_CONSOLE": {
      const log = [...state.consoleLog, action.entry];
      return { ...state, consoleLog: log.slice(-100), taeResponding: false };
    }

    case "ADD_EVENT": {
      const events = [action.event, ...state.systemEvents].slice(0, 50);
      return { ...state, systemEvents: events };
    }

    case "SET_DEVICES":
      return { ...state, devices: action.devices };

    case "SET_SYNCORI":
      return { ...state, syncoriQueue: action.queue, syncoriIndex: action.index };

    case "SET_TAE_STATE":
      return { ...state, taeState: action.state };

    case "SET_HEARTBEAT":
      return { ...state, systemTime: action.time, wsCount: action.wsCount,
               taeState: action.taeState };

    case "SET_RESPONDING":
      return { ...state, taeResponding: action.responding };

    case "SET_LAST_COMMAND":
      return { ...state, lastCommand: action.command };

    default:
      return state;
  }
}

// ── Context ─────────────────────────────────────────────────────

interface RuntimeContextValue {
  runtime: RuntimeState;
  sendCommand: (cmd: string) => void;
  directCommand: (cmd: string) => Promise<void>;  // REST fallback
  pingDevice: (device: string) => void;
  skipTrack: () => void;
  setTaeState: (state: "IDLE" | "ACTIVE" | "GENERATE" | "DEMO") => void;
}

const RuntimeContext = createContext<RuntimeContextValue>({
  runtime: INITIAL_STATE,
  sendCommand: () => {},
  directCommand: async () => {},
  pingDevice: () => {},
  skipTrack: () => {},
  setTaeState: () => {},
});

// ── Provider ─────────────────────────────────────────────────────

interface RuntimeProviderProps {
  identity: SIOSIdentity | null;
  children: ReactNode;
}

export function RuntimeProvider({ identity, children }: RuntimeProviderProps) {
  const [runtime, dispatch] = useReducer(reducer, INITIAL_STATE);
  const wsRef = useRef<ReturnType<typeof getWSClient> | null>(null);

  useEffect(() => {
    if (!identity) return;

    const gid  = identity.gid;
    const role = identity.role;

    // Create WebSocket connection
    const ws = getWSClient(gid, role);
    wsRef.current = ws;

    const offMsg = ws.onMessage((msg: WSMessage) => {
      switch (msg.type) {
        case "state_snapshot":
          dispatch({ type: "APPLY_SNAPSHOT", snapshot: msg as Record<string, unknown> });
          break;
        case "render_update":
          dispatch({ type: "SET_RENDER", render: msg.render });
          break;
        case "console_entry":
          dispatch({ type: "ADD_CONSOLE", entry: msg.entry });
          break;
        case "system_event":
          dispatch({ type: "ADD_EVENT", event: msg.event });
          break;
        case "device_update":
          dispatch({ type: "SET_DEVICES", devices: msg.devices });
          break;
        case "syncori_update":
          dispatch({ type: "SET_SYNCORI", queue: msg.queue, index: msg.index });
          break;
        case "orb_spawn":
          // Handled by consumers via runtime.renderState.active_module
          break;
        case "tae_state":
          dispatch({ type: "SET_TAE_STATE", state: msg.state });
          break;
        case "tae_result":
          dispatch({ type: "SET_TAE_STATE", state: msg.tae_state });
          dispatch({ type: "SET_RESPONDING", responding: false });
          break;
        case "heartbeat":
          dispatch({ type: "SET_HEARTBEAT", time: msg.system_time,
                     wsCount: msg.ws_count, taeState: msg.tae_state });
          break;
      }
    });

    const offStatus = ws.onStatus((connected: boolean) => {
      dispatch({ type: "SET_CONNECTED", connected });
    });

    return () => {
      offMsg();
      offStatus();
      destroyWSClient();
    };
  }, [identity?.gid]);

  const sendCommand = useCallback((cmd: string) => {
    if (!cmd.trim()) return;
    dispatch({ type: "SET_LAST_COMMAND", command: cmd });
    dispatch({ type: "SET_RESPONDING", responding: true });
    // Add user entry optimistically
    dispatch({ type: "ADD_CONSOLE", entry: { role: "user", msg: cmd, ts: Date.now() / 1000 } });
    wsRef.current?.sendCommand(cmd);
  }, []);

  const directCommand = useCallback(async (cmd: string) => {
    if (!cmd.trim() || !identity) return;
    dispatch({ type: "SET_LAST_COMMAND", command: cmd });
    dispatch({ type: "SET_RESPONDING", responding: true });
    dispatch({ type: "ADD_CONSOLE", entry: { role: "user", msg: cmd, ts: Date.now() / 1000 } });
    try {
      const data = await api.taeCommand(cmd);
      dispatch({ type: "ADD_CONSOLE", entry: {
        role: "tae", msg: data.response || "Command processed.", ts: Date.now() / 1000,
      }});
      if (data.tokens_remaining !== undefined) {
        // Token usage tracking (optional display)
      }
    } catch {
      dispatch({ type: "ADD_CONSOLE", entry: {
        role: "tae", msg: "Connection issue. Fallback active.", ts: Date.now() / 1000,
      }});
    } finally {
      dispatch({ type: "SET_RESPONDING", responding: false });
    }
  }, [identity]);

  const pingDevice = useCallback((device: string) => {
    wsRef.current?.sendCommand(`ping device ${device}`);
  }, []);

  const skipTrack = useCallback(() => {
    wsRef.current?.sendCommand("skip track");
  }, []);

  const setTaeState = useCallback((state: "IDLE" | "ACTIVE" | "GENERATE" | "DEMO") => {
    wsRef.current?.sendCommand(`TAE, enter ${state.toLowerCase()} mode`);
  }, []);

  return (
    <RuntimeContext.Provider value={{ runtime, sendCommand, directCommand, pingDevice, skipTrack, setTaeState }}>
      {children}
    </RuntimeContext.Provider>
  );
}

export function useRuntime() {
  return useContext(RuntimeContext);
}
