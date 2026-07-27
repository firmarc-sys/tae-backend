"""Canonical Agentic Mercury TimeRunner activation contract."""
import asyncio

from runtime.state import OWNER_GID
from runtime.tae_orchestrator import run_tae_command


def test_canonical_demo_mode_is_deterministic():
    result = asyncio.run(
        run_tae_command(
            command="TAE, enter Demo Mode",
            gid=OWNER_GID,
            role="owner",
        )
    )

    assert result["response"] == "This is not an app. This is me."
    assert result["tae_state"] == "DEMO"
    assert result["render_mutated"] is True
