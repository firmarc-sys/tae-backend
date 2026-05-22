"""
SIOS Runtime State Manager
Single source of truth for all live system state.
Persists to Neon via SQLAlchemy when available. Broadcasts deltas via WebSocket.
"""
import os
import time
import json
import asyncio
from typing import Any
from dataclasses import dataclass, asdict, field

try:
    from sqlalchemy import create_engine, text
except Exception:
    create_engine = None
    text = None

# ── Schema ─────────────────────────────────────────────────────

OWNER_GID = "399152573423"

@dataclass
class RenderState:
    viscosity: float       = 0.86
    reflection: float      = 1.00
    glow_intensity: float  = 0.90
    formation: float       = 0.74
    pulse_speed: float     = 1.20
    syncori_activity: float= 0.68
    active_module: str     = "SYNCORI"
    tae_state: str         = "ACTIVE"   # IDLE | ACTIVE | GENERATE | DEMO

@dataclass
class DeviceRecord:
    name:   str
    type:   str
    status: str   # paired | connected | offline
    online: bool
    last_seen: float = field(default_factory=time.time)
    metadata: dict = field(default_factory=dict)

@dataclass
class SyncoriTrack:
    id: str
    title: str
    artist: str
    album: str
    duration: str
    added_at: float = field(default_factory=time.time)

@dataclass
class SIOSRuntimeState:
    gid: str                    = OWNER_GID
    tae_state: str              = "ACTIVE"
    render: RenderState         = field(default_factory=RenderState)
    devices: list               = field(default_factory=list)
    syncori_queue: list         = field(default_factory=list)
    syncori_index: int          = 0
    console_log: list           = field(default_factory=list)
    system_events: list         = field(default_factory=list)
    updated_at: float           = field(default_factory=time.time)


# ── Neon persistence ───────────────────────────────────────────

def _get_db_engine():
    if create_engine is None:
        return None
    url = os.environ.get("DBBDD3B46D_DATABASE_URL")
    if not url:
        return None
    # Keep runtime boot fast and resilient in dev; DB is optional.
    if os.environ.get("SIOS_ENABLE_DB", "0") != "1":
        return None
    try:
        # psycopg2 requires postgresql:// scheme
        if url.startswith("postgres://"):
            url = url.replace("postgres://", "postgresql://", 1)
        engine = create_engine(url, pool_pre_ping=True, connect_args={"connect_timeout": 5})
        return engine
    except Exception:
        return None


def _ensure_tables(engine):
    if text is None:
        return
    ddl = """
    CREATE TABLE IF NOT EXISTS sios_runtime_state (
        gid         TEXT PRIMARY KEY,
        state_json  JSONB NOT NULL,
        updated_at  DOUBLE PRECISION NOT NULL
    );
    CREATE TABLE IF NOT EXISTS sios_tae_log (
        id          SERIAL PRIMARY KEY,
        gid         TEXT NOT NULL,
        direction   TEXT NOT NULL,
        content     TEXT NOT NULL,
        tool_calls  JSONB,
        ts          DOUBLE PRECISION NOT NULL
    );
    CREATE TABLE IF NOT EXISTS sios_devices (
        id          SERIAL PRIMARY KEY,
        gid         TEXT NOT NULL,
        name        TEXT NOT NULL,
        type        TEXT NOT NULL,
        status      TEXT NOT NULL,
        online      BOOLEAN NOT NULL,
        last_seen   DOUBLE PRECISION NOT NULL,
        metadata    JSONB
    );
    """
    try:
        with engine.begin() as conn:
            for stmt in ddl.strip().split(";"):
                stmt = stmt.strip()
                if stmt:
                    conn.execute(text(stmt))
    except Exception as e:
        print(f"[SIOS DB] Table creation warning: {e}")


# ── RuntimeEngine singleton ────────────────────────────────────

class RuntimeEngine:
    _instance: "RuntimeEngine | None" = None

    def __new__(cls):
        if cls._instance is None:
            cls._instance = super().__new__(cls)
            cls._instance._initialized = False
        return cls._instance

    def __init__(self):
        if self._initialized:
            return
        self._initialized = True

        self.state = SIOSRuntimeState()
        self._db = _get_db_engine()
        self._change_callbacks: list = []

        # Seed default devices
        self.state.devices = [
            asdict(DeviceRecord("AyrOptic Spectacles", "ar_glasses",  "paired",    True)),
            asdict(DeviceRecord("SIOS Watch",          "wearable",    "paired",    True)),
            asdict(DeviceRecord("Room Mesh Hub",       "mesh_router", "connected", True)),
        ]

        # Seed default Syncori queue
        self.state.syncori_queue = [
            asdict(SyncoriTrack("s1", "Hawk Em 02",     "Hawk Em",    "BACKGROUND MUSIC",    "04:37")),
            asdict(SyncoriTrack("s2", "Orb Frequency",  "SIOS Engine","Spatial Sessions",    "06:12")),
            asdict(SyncoriTrack("s3", "Chrome Drift",   "Liquid Arc", "Ambient Spatial",     "05:44")),
        ]

        # Seed console
        self.state.console_log = [
            {"role": "tae",  "msg": "TAE online.", "ts": _ts()},
            {"role": "tae",  "msg": "Listening...", "ts": _ts()},
            {"role": "tae",  "msg": "Identity confirmed. Clearance Ω verified.", "ts": _ts()},
            {"role": "tae",  "msg": '"This is not an app. This is me."', "ts": _ts()},
        ]

        # Seed system events
        self.state.system_events = [
            {"time": _hms(), "level": "SYS",  "msg": "TAE runtime heartbeat OK"},
            {"time": _hms(), "level": "SYNC", "msg": "Syncori node online"},
            {"time": _hms(), "level": "GID",  "msg": f"Identity confirmed. GID {OWNER_GID}"},
            {"time": _hms(), "level": "IOT",  "msg": "Device mesh active — 3 nodes"},
        ]

        # Try to load persisted state from DB
        if self._db:
            _ensure_tables(self._db)
            self._load_from_db()

    # ── State mutation ─────────────────────────────────────────

    def patch_render(self, **kwargs):
        """Update render state fields and broadcast."""
        r = self.state.render
        for k, v in kwargs.items():
            if hasattr(r, k):
                setattr(r, k, v)
        self.state.updated_at = time.time()
        self._persist_async()
        self._broadcast({"type": "render_update", "render": asdict(r)})

    def add_console_entry(self, role: str, msg: str):
        entry = {"role": role, "msg": msg, "ts": _ts()}
        self.state.console_log.append(entry)
        if len(self.state.console_log) > 100:
            self.state.console_log = self.state.console_log[-100:]
        self._broadcast({"type": "console_entry", "entry": entry})

    def add_system_event(self, level: str, msg: str):
        entry = {"time": _hms(), "level": level, "msg": msg}
        self.state.system_events.insert(0, entry)
        if len(self.state.system_events) > 50:
            self.state.system_events = self.state.system_events[:50]
        self._broadcast({"type": "system_event", "event": entry})

    def set_tae_state(self, new_state: str):
        self.state.tae_state = new_state
        self.state.render.tae_state = new_state
        self._broadcast({"type": "tae_state", "state": new_state})

    def update_device(self, name: str, **kwargs):
        for d in self.state.devices:
            if d["name"] == name:
                d.update(kwargs)
                d["last_seen"] = time.time()
                break
        else:
            # New device — register it
            rec = {"name": name, "type": kwargs.get("type","unknown"),
                   "status": kwargs.get("status","offline"),
                   "online": kwargs.get("online", False),
                   "last_seen": time.time(), "metadata": {}}
            self.state.devices.append(rec)
        self._broadcast({"type": "device_update", "devices": self.state.devices})

    def add_syncori_track(self, track: dict):
        self.state.syncori_queue.append(track)
        self._broadcast({"type": "syncori_update", "queue": self.state.syncori_queue,
                         "index": self.state.syncori_index})

    def log_tae(self, gid: str, direction: str, content: str, tool_calls: list | None = None):
        if not self._db:
            return
        try:
            with self._db.begin() as conn:
                conn.execute(text(
                    "INSERT INTO sios_tae_log(gid,direction,content,tool_calls,ts) VALUES(:g,:d,:c,:t,:ts)"
                ), {"g": gid, "d": direction, "c": content,
                    "t": json.dumps(tool_calls or []), "ts": time.time()})
        except Exception:
            pass

    # ── Snapshot ───────────────────────────────────────────────

    def snapshot(self) -> dict:
        r = asdict(self.state)
        r["system_time"] = _hms()
        return r

    # ── DB persistence ─────────────────────────────────────────

    def _load_from_db(self):
        try:
            with self._db.connect() as conn:
                row = conn.execute(text(
                    "SELECT state_json FROM sios_runtime_state WHERE gid=:g"
                ), {"g": OWNER_GID}).fetchone()
                if row:
                    saved = row[0]
                    # Restore render state
                    if "render" in saved:
                        for k, v in saved["render"].items():
                            if hasattr(self.state.render, k):
                                setattr(self.state.render, k, v)
                    # Restore syncori queue if present
                    if "syncori_queue" in saved and saved["syncori_queue"]:
                        self.state.syncori_queue = saved["syncori_queue"]
        except Exception as e:
            print(f"[SIOS DB] Load warning: {e}")

    def _persist_async(self):
        try:
            loop = asyncio.get_event_loop()
            if loop.is_running():
                loop.create_task(self._persist())
        except RuntimeError:
            pass

    async def _persist(self):
        if not self._db:
            return
        try:
            snap = asdict(self.state)
            with self._db.begin() as conn:
                conn.execute(text("""
                    INSERT INTO sios_runtime_state(gid, state_json, updated_at)
                    VALUES(:g, :s, :t)
                    ON CONFLICT (gid) DO UPDATE
                      SET state_json=EXCLUDED.state_json,
                          updated_at=EXCLUDED.updated_at
                """), {"g": OWNER_GID, "s": json.dumps(snap), "t": time.time()})
        except Exception as e:
            print(f"[SIOS DB] Persist warning: {e}")

    # ── Change callbacks (for WS manager) ─────────────────────

    def on_change(self, cb):
        self._change_callbacks.append(cb)

    def _broadcast(self, payload: dict):
        for cb in list(self._change_callbacks):
            try:
                cb(payload)
            except Exception:
                pass


# ── Helpers ────────────────────────────────────────────────────

def _ts() -> float:
    return time.time()

def _hms() -> str:
    return time.strftime("%H:%M:%S")


# Module-level singleton accessor
_engine: RuntimeEngine | None = None

def get_engine() -> RuntimeEngine:
    global _engine
    if _engine is None:
        _engine = RuntimeEngine()
    return _engine
