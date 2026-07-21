"""RuntimeStateRepository: load/save per-GID state.

The RuntimeEngine reads and writes through this repo.
DB is required in prod; in-memory fallback for dev only.
"""
import json
from typing import Any
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.repos.models import RuntimeState


class RuntimeStateRepository:
    """Per-GID runtime state repository."""

    async def load(self, session: AsyncSession, gid: str, user_id: str) -> dict | None:
        """Load runtime state for a GID. Returns None if not found."""
        result = await session.execute(
            select(RuntimeState).where(RuntimeState.gid == gid)
        )
        row = result.scalar_one_or_none()
        if row is None:
            return None
        return {
            "gid": row.gid,
            "render": row.render_state,
            "tae_state": row.tae_state,
            "devices": row.devices,
            "syncori_queue": row.syncori_queue,
            "syncori_index": row.syncori_index,
            "console_log": row.console_log,
            "system_events": row.system_events,
            "updated_at": row.updated_at.isoformat() if row.updated_at else None,
        }

    async def save(self, session: AsyncSession, gid: str, user_id: str, state: dict) -> None:
        """Save runtime state for a GID (upsert)."""
        result = await session.execute(
            select(RuntimeState).where(RuntimeState.gid == gid)
        )
        row = result.scalar_one_or_none()
        if row is None:
            row = RuntimeState(id=gid, gid=gid, user_id=user_id)  # id = gid for simplicity
            session.add(row)
        row.render_state = state.get("render", {})
        row.tae_state = state.get("tae_state", "ACTIVE")
        row.devices = state.get("devices", [])
        row.syncori_queue = state.get("syncori_queue", [])
        row.syncori_index = state.get("syncori_index", 0)
        row.console_log = state.get("console_log", [])
        row.system_events = state.get("system_events", [])
        await session.commit()
