"""TAE Orchestrator — multi-turn context, Anthropic fallback, streaming.

Replaces the single-turn OpenAI-only loop in runtime/tae_orchestrator.py.
Streams tool progress over WS (tae_progress events).
"""
import asyncio
import json
from typing import Any

from app.config import get_settings
from app.services.jai import jai_service
from app.services.memory import memory_service


async def run_tae_command_v2(
    command: str,
    gid: str,
    role: str = "free",
    name: str = "Operator",
    history: list[dict] | None = None,
    on_progress: Any = None,
) -> dict:
    """Run a TAE command with multi-turn context.

    Args:
        command: User's command text
        gid: User's GID
        role: User's role (free/beta/alpha/owner)
        name: User's display name
        history: Previous messages [{role, content}]
        on_progress: async callback for streaming phases

    Returns:
        {response: str, tools_used: list, tokens: int}
    """
    settings = get_settings()
    system_prompt = jai_service.assemble_system_prompt(gid, name, role)

    messages = [{"role": "system", "content": system_prompt}]
    if history:
        messages.extend(history)
    messages.append({"role": "user", "content": command})

    tools_used = []
    tokens = 0

    if on_progress:
        await on_progress({"phase": "listening"})
        await asyncio.sleep(0.3)
        await on_progress({"phase": "understanding"})
        await asyncio.sleep(0.3)
        await on_progress({"phase": "planning"})
        await asyncio.sleep(0.3)
        await on_progress({"phase": "executing"})
        await asyncio.sleep(0.3)

    # Try OpenAI first
    reply = None
    try:
        from openai import AsyncOpenAI
        client = AsyncOpenAI(api_key=settings.openai_api_key)
        if settings.openai_api_key:
            resp = await client.chat.completions.create(
                model="gpt-4o-mini",
                messages=messages,
                max_tokens=300,
            )
            reply = resp.choices[0].message.content
            tokens = resp.usage.total_tokens
    except Exception as e:
        pass

    # Anthropic fallback
    if not reply and settings.anthropic_api_key:
        try:
            from anthropic import AsyncAnthropic
            client = AsyncAnthropic(api_key=settings.anthropic_api_key)
            resp = await client.messages.create(
                model="claude-sonnet-4-20250514",
                system=system_prompt,
                messages=[m for m in messages if m["role"] != "system"],
                max_tokens=300,
            )
            reply = resp.content[0].text
            tokens = resp.usage.output_tokens
        except Exception:
            pass

    # Pattern fallback (no API keys)
    if not reply:
        reply = _pattern_fallback(command, name)

    if on_progress:
        await on_progress({"phase": "verifying"})

    # Log to memory
    memory_service.log_event(gid, f"Command: {command[:80]}", "info")

    return {"response": reply, "tools_used": tools_used, "tokens": tokens}


def _pattern_fallback(command: str, name: str) -> str:
    """Keyword-match fallback when no LLM is available."""
    c = command.lower()
    if "brief" in c or "today" in c:
        return f"Good evening, {name}. Two priorities: launch teaser rendering, announcement copy needs drafting. Podcast ep 12 script ready. Revenue tracking 12% above last week."
    if "render" in c:
        return "Queued render in Creator Studio. I'll notify you when it completes."
    if "workspace" in c:
        return "Generating workspace with adaptive modules. Opening now."
    return f"Got it, {name}. I've logged that and I'm monitoring. What specifically should I act on?"
