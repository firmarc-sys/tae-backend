"""RuntimeSessionManager — per-GID runtime sessions.

Replaces the global RuntimeEngine singleton. Each GID gets its own
session with its own render state, devices, syncori queue, and log.
system_broadcast stays global (owner only).
"""
import time
import asyncio
from typing import Any
from dataclasses import dataclass, field, asdict


@dataclass
class RuntimeSession:
    """One user's runtime state — the multi-tenant replacement for SIOSRuntimeState."""
    gid: str
    role: str = "free"
    tae_state: str = "ACTIVE"
    render: dict = field(default_factory=lambda: {
        "viscosity": 0.86, "reflection": 1.0, "glow_intensity": 0.90,
        "formation": 0.74, "pulse_speed": 1.20, "syncori_activity": 0.68,
        "active_module": "SYNCORI",
    })
    devices: list = field(default_factory=list)
    syncori_queue: list = field(default_factory=list)
    syncori_index: int = 0
    console_log: list = field(default_factory=list)
    system_events: list = field(default_factory=list)
    updated_at: float = field(default_factory=time.time)

    def snapshot(self) -> dict:
        return {
            "type": "state_snapshot",
            "gid": self.gid,
            "tae_state": self.tae_state,
            "render": self.render,
            "devices": self.devices,
            "syncori_queue": self.syncori_queue,
            "syncori_index": self.syncori_index,
            "console_log": self.console_log[-50:],  # last 50 entries
            "system_events": self.system_events[-20:],
        }

    def patch_render(self, **updates) -> None:
        allowed = {"viscosity", "reflection", "glow_intensity", "formation",
                   "pulse_speed", "syncori_activity", "active_module"}
        for k, v in updates.items():
            if k in allowed:
                self.render[k] = v
        self.updated_at = time.time()

    def set_tae_state(self, state: str) -> None:
        self.tae_state = state.upper()
        self.updated_at = time.time()

    def add_system_event(self, source: str, msg: str) -> None:
        self.system_events.append({
            "source": source, "message": msg, "ts": time.time()
        })
        self.system_events = self.system_events[-50:]
        self.updated_at = time.time()

    def add_console(self, entry: str, level: str = "info") -> None:
        self.console_log.append({"text": entry, "level": level, "ts": time.time()})
        self.console_log = self.console_log[-100:]


class RuntimeSessionManager:
    """Manages per-GID runtime sessions."""

    def __init__(self):
        self._sessions: dict[str, RuntimeSession] = {}
        self._lock = asyncio.Lock()

    async def get_or_create(self, gid: str, role: str = "free") -> RuntimeSession:
        async with self._lock:
            if gid not in self._sessions:
                self._sessions[gid] = RuntimeSession(gid=gid, role=role)
            return self._sessions[gid]

    async def get(self, gid: str) -> RuntimeSession | None:
        return self._sessions.get(gid)

    async def remove(self, gid: str) -> None:
        async with self._lock:
            self._sessions.pop(gid, None)

    def all_gids(self) -> list[str]:
        return list(self._sessions.keys())

    async def broadcast_global(self, event: dict) -> None:
        """Owner-only global broadcast (system_broadcast equivalent)."""
        # The ws_manager handles the actual fan-out
        pass


# Singleton (but now it's a session manager, not a single state)
session_manager = RuntimeSessionManager()
