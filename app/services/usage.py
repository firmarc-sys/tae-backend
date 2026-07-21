"""Usage tracking — meter real orchestrator tokens against plan limits."""
from app.config import get_settings

PLAN_LIMITS = {
    "demo": 5000,
    "starter": 50000,
    "pro": 200000,
    "enterprise": 1000000,
}


class UsageService:
    """Track and enforce token usage per user."""

    def __init__(self):
        self._usage: dict[str, int] = {}  # gid -> tokens used this period

    def record(self, gid: str, tokens: int) -> None:
        self._usage[gid] = self._usage.get(gid, 0) + tokens

    def check_limit(self, gid: str, plan: str = "demo") -> tuple[bool, int]:
        """Returns (allowed, remaining)."""
        limit = PLAN_LIMITS.get(plan, PLAN_LIMITS["demo"])
        used = self._usage.get(gid, 0)
        remaining = limit - used
        return (remaining > 0, remaining)

    def get_usage(self, gid: str) -> int:
        return self._usage.get(gid, 0)


usage_service = UsageService()
