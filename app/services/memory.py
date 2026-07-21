"""Memory system — per-GID event + fact store.

Provides context assembly for the orchestrator:
last N console entries + persistent facts.
"""
from typing import Any


class MemoryService:
    """Per-GID memory management."""

    def __init__(self):
        self._facts: dict[str, list[dict]] = {}  # gid -> [{content, category, ts}]
        self._events: dict[str, list[dict]] = {}  # gid -> [{text, level, ts}]

    def save_fact(self, gid: str, content: str, category: str = "fact") -> None:
        if gid not in self._facts:
            self._facts[gid] = []
        self._facts[gid].append({"content": content, "category": category, "ts": time.time()})

    def get_facts(self, gid: str, limit: int = 20) -> list[dict]:
        return self._facts.get(gid, [])[-limit:]

    def log_event(self, gid: str, text: str, level: str = "info") -> None:
        if gid not in self._events:
            self._events[gid] = []
        self._events[gid].append({"text": text, "level": level, "ts": time.time()})
        self._events[gid] = self._events[gid][-100:]

    def get_recent_events(self, gid: str, limit: int = 10) -> list[dict]:
        return self._events.get(gid, [])[-limit:]

    def assemble_context(self, gid: str) -> str:
        """Assemble memory context for the orchestrator prompt."""
        facts = self.get_facts(gid)
        events = self.get_recent_events(gid, 5)
        parts = []
        if facts:
            parts.append("Known facts:\n" + "\n".join(f"- {f['content']}" for f in facts))
        if events:
            parts.append("Recent activity:\n" + "\n".join(f"- {e['text']}" for e in events))
        return "\n\n".join(parts) if parts else ""


import time
memory_service = MemoryService()
