"""
SIOS WebSocket Connection Manager
Maintains a pool of active WebSocket connections.
RuntimeEngine broadcasts deltas → this manager fans out to all clients.
Clients identify by GID; owner can observe all connections.
"""
import json
import asyncio
from typing import Any
from fastapi import WebSocket, WebSocketDisconnect


class ConnectionManager:
    def __init__(self):
        # gid → list of WebSocket connections (one user may have multiple tabs)
        self._connections: dict[str, list[WebSocket]] = {}
        self._all: list[WebSocket] = []

    async def connect(self, ws: WebSocket, gid: str):
        await ws.accept()
        self._connections.setdefault(gid, []).append(ws)
        self._all.append(ws)

    def disconnect(self, ws: WebSocket, gid: str):
        self._connections.get(gid, [])
        try:
            self._connections[gid].remove(ws)
        except (KeyError, ValueError):
            pass
        try:
            self._all.remove(ws)
        except ValueError:
            pass

    async def send_to(self, gid: str, payload: dict):
        dead = []
        for ws in list(self._connections.get(gid, [])):
            try:
                await ws.send_text(json.dumps(payload))
            except Exception:
                dead.append((ws, gid))
        for ws, g in dead:
            self.disconnect(ws, g)

    async def broadcast(self, payload: dict):
        """Broadcast to ALL connected clients."""
        dead = []
        for ws in list(self._all):
            try:
                await ws.send_text(json.dumps(payload))
            except Exception:
                dead.append(ws)
        for ws in dead:
            # Remove from all connection lists
            for gid, lst in self._connections.items():
                if ws in lst:
                    lst.remove(ws)
            if ws in self._all:
                self._all.remove(ws)

    def connection_count(self) -> int:
        return len(self._all)

    def connections_by_gid(self) -> dict:
        return {g: len(lst) for g, lst in self._connections.items() if lst}


# ── Singleton ───────────────────────────────────────────────────
_manager: ConnectionManager | None = None

def get_manager() -> ConnectionManager:
    global _manager
    if _manager is None:
        _manager = ConnectionManager()
    return _manager


def wire_runtime_to_ws():
    """
    Called once at app startup.
    Registers a callback on RuntimeEngine so every state delta
    is immediately fanned out to all WebSocket clients.
    """
    from runtime.state import get_engine
    eng = get_engine()
    mgr = get_manager()

    def _on_change(payload: dict):
        # Schedule broadcast in the running event loop
        try:
            loop = asyncio.get_event_loop()
            if loop.is_running():
                loop.create_task(mgr.broadcast(payload))
        except RuntimeError:
            pass

    eng.on_change(_on_change)
