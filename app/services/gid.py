"""GIDService: issue 12-digit GIDs, verify, manage clearance levels.

Replaces the hardcoded OWNER_GID constant.
"""
import random

# Clearance levels (mirror MCP permission tiers)
PERM_FREE = 0
PERM_BETA = 1
PERM_ALPHA = 2
PERM_OWNER = 3

ROLE_PERM = {
    "free": PERM_FREE,
    "beta": PERM_BETA,
    "alpha": PERM_ALPHA,
    "owner": PERM_OWNER,
}


class GIDService:
    """Issue and verify 12-digit Galactic IDs."""

    def issue(self) -> str:
        """Generate a unique 12-digit GID."""
        return "".join(str(random.randint(0, 9)) for _ in range(12))

    def format_display(self, gid: str) -> str:
        """Format as xxxx-xxxx-xxxx for display."""
        if len(gid) == 12:
            return f"{gid[:4]}-{gid[4:8]}-{gid[8:]}"
        return gid

    def get_clearance(self, role: str) -> int:
        """Map a role string to a clearance level."""
        return ROLE_PERM.get(role, PERM_FREE)

    def can_use_tool(self, role: str, min_perm: int) -> bool:
        """Check if a role has sufficient clearance for a tool."""
        return self.get_clearance(role) >= min_perm


gid_service = GIDService()
