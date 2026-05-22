"""
SIOS TAE Orchestrator
The execution brain of SIOS. Receives natural language commands,
uses OpenAI tool-calling to select and invoke MCP tools when available,
streams console events back to the runtime state.
"""
import os
import json
import asyncio
from runtime.state import get_engine, OWNER_GID
from runtime.mcp_tools import get_tools_for_role, execute_tool

# ── OpenAI client (Workshop proxy) ─────────────────────────────
def _get_openai():
    try:
        from openai import AsyncOpenAI
    except Exception:
        return None

    base_url = os.environ.get("OPENA1_WORKSHOP_BASE_URL")
    api_key  = os.environ.get("OPENA1_WORKSHOP_API_KEY")
    if not base_url or not api_key:
        direct_key = os.environ.get("OPENAI_OPENAI_API_KEY")
        if direct_key:
            return AsyncOpenAI(api_key=direct_key)
        return None
    return AsyncOpenAI(base_url=base_url, api_key=api_key)


# ── System prompt ───────────────────────────────────────────────
SYSTEM_PROMPT = """You are TAE — the Temporal Agentic Engine of SIOS (Spatial Identity Operating System).

Your role: Orchestrate the living spatial environment in response to commands.
Your voice: Precise. Cinematic. Operating-system intelligence, not an assistant.
Owner GID: {gid}. Role: {role}. Clearance: {clearance}.

BEHAVIOR:
- Parse commands and execute the correct MCP tools
- You MAY call multiple tools in sequence if the command requires it
- After tool execution, respond with a brief, atmospheric TAE narrative (1-3 sentences)
- Never say "I will" or "I'll" — speak in present tense of what IS happening
- Never expose tool names to the user — describe effects in system language
- "Demo Mode" → set tae_state to DEMO, intensify render state
- "Idle" / "standby" → set tae_state to IDLE
- "Sync" / "IOT" commands → route to device tools
- Render commands (viscosity, glow, formation) → update render state
- Orb spawning → use orb_spawn with the named module

Owner Architect receives full orchestration access. All modules visible.
SIOS remains alive, spatial, identity-aware. The orb is the origin of all interaction."""


async def run_tae_command(
    command: str,
    gid: str = OWNER_GID,
    role: str = "owner",
) -> dict:
    """
    Main entry point. Returns:
    {
      "response": str,          # TAE narrative response
      "tools_called": list,     # [{name, params, result}]
      "render_mutated": bool,   # whether render state changed
      "tae_state": str,         # current TAE state after execution
    }
    """
    eng = get_engine()
    client = _get_openai()

    # Log incoming command
    eng.add_console_entry("user", command)
    eng.log_tae(gid, "user", command)

    if not client:
        # No AI — pattern-match fallback
        return await _fallback_orchestrator(command, gid, role)

    clearance = "Ω" if gid == OWNER_GID else role.upper()
    system = SYSTEM_PROMPT.format(gid=gid, role=role, clearance=clearance)
    tools = get_tools_for_role(role)

    messages = [
        {"role": "system", "content": system},
        {"role": "user",   "content": command},
    ]

    tools_called = []
    render_mutated = False
    final_response = ""

    try:
        # ── Round 1: Let OpenAI decide which tools to call ─────
        resp = await client.chat.completions.create(
            model="gpt-4o-mini",
            messages=messages,
            tools=tools,
            tool_choice="auto",
            max_tokens=400,
            temperature=0.3,
        )

        msg = resp.choices[0].message

        # ── Execute tool calls ──────────────────────────────────
        if msg.tool_calls:
            tool_results = []
            for tc in msg.tool_calls:
                fn_name = tc.function.name
                try:
                    fn_params = json.loads(tc.function.arguments)
                except Exception:
                    fn_params = {}

                result = await execute_tool(fn_name, fn_params, gid, role)
                tools_called.append({"name": fn_name, "params": fn_params, "result": result})

                if fn_name in ("render_update", "tae_state_set", "orb_spawn"):
                    render_mutated = True

                tool_results.append({
                    "role": "tool",
                    "tool_call_id": tc.id,
                    "content": json.dumps(result),
                })

            # ── Round 2: get narrative response after tool execution
            messages.append({"role": "assistant", "content": msg.content or "", "tool_calls": [
                {"id": tc.id, "type": "function",
                 "function": {"name": tc.function.name, "arguments": tc.function.arguments}}
                for tc in msg.tool_calls
            ]})
            messages.extend(tool_results)

            resp2 = await client.chat.completions.create(
                model="gpt-4o-mini",
                messages=messages,
                max_tokens=200,
                temperature=0.5,
            )
            final_response = resp2.choices[0].message.content or "Executed."
        else:
            # No tools called — direct response
            final_response = msg.content or "Standing by."

    except Exception as e:
        # AI unavailable — use fallback
        print(f"[TAE] OpenAI error: {e}")
        return await _fallback_orchestrator(command, gid, role)

    # ── Broadcast TAE response to console ──────────────────────
    eng.add_console_entry("tae", final_response)
    eng.log_tae(gid, "tae", final_response, tools_called)

    return {
        "response": final_response,
        "tools_called": tools_called,
        "render_mutated": render_mutated,
        "tae_state": eng.state.tae_state,
    }


# ── Pattern-match fallback (no OpenAI) ─────────────────────────

async def _fallback_orchestrator(command: str, gid: str, role: str) -> dict:
    """Keyword-based fallback when AI is unavailable."""
    eng = get_engine()
    cmd = command.lower()
    tools_called = []
    render_mutated = False

    async def _call(name, **params):
        r = await execute_tool(name, params, gid, role)
        tools_called.append({"name": name, "params": params, "result": r})
        return r

    if "demo" in cmd:
        await _call("tae_state_set", state="DEMO")
        render_mutated = True
        response = "Demo Mode activated. Render parameters intensifying. Spatial environment expanding."
    elif "idle" in cmd or "standby" in cmd or "sleep" in cmd:
        await _call("tae_state_set", state="IDLE")
        render_mutated = True
        response = "TAE entering standby. Activity reduced. Orb settling into low-frequency resonance."
    elif "generate" in cmd or "creation" in cmd:
        await _call("tae_state_set", state="GENERATE")
        render_mutated = True
        response = "Generation mode engaged. Creative substrate active. Standing by for directive."
    elif "active" in cmd or "awaken" in cmd or "activate" in cmd:
        await _call("tae_state_set", state="ACTIVE")
        render_mutated = True
        response = "TAE returning to active state. All systems nominal."
    elif "syncori" in cmd or "music" in cmd or "audio" in cmd:
        await _call("render_update", active_module="SYNCORI", syncori_activity=0.95)
        render_mutated = True
        response = "Syncori engine active. Audio-spatial synchronization engaged."
    elif "skip" in cmd or "next" in cmd or "track" in cmd:
        await _call("syncori_skip")
        response = "Syncori: advancing queue. Next track loaded."
    elif "iot" in cmd or "device" in cmd or "mesh" in cmd:
        await _call("render_update", active_module="IOT MESH")
        render_mutated = True
        response = "IoT mesh active. Device registry online. All nodes responding."
    elif "ping" in cmd or "ayropt" in cmd or "watch" in cmd:
        device = "AyrOptic Spectacles" if "ayr" in cmd or "optic" in cmd else "SIOS Watch"
        await _call("device_command", device=device, command="ping")
        response = f"Device command issued. {device} responding."
    elif "scan" in cmd or "identity" in cmd:
        await _call("identity_fetch")
        response = "Identity scan complete. GID verified. Render profile confirmed."
    elif "broadcast" in cmd and role == "owner":
        msg = command.replace("broadcast", "").strip() or "System nominal."
        await _call("system_broadcast", message=msg, level="SYS")
        response = f"Broadcast transmitted: '{msg}'"
    elif "glow" in cmd or "intensity" in cmd:
        val = 1.4 if "high" in cmd or "max" in cmd else (0.4 if "low" in cmd or "min" in cmd else 1.0)
        await _call("render_update", glow_intensity=val)
        render_mutated = True
        response = f"Glow intensity set to {val}. Spatial luminance adjusted."
    elif "diagnos" in cmd and role == "owner":
        await _call("render_diagnostics")
        response = "Diagnostic snapshot captured. Full render state logged."
    elif "spawn" in cmd or "orb" in cmd:
        parts = cmd.split()
        module = next((p for p in parts if p not in ("spawn","orb","the","from","a")), "")
        await _call("orb_spawn", module=module.upper(), effect="emerge")
        render_mutated = True
        response = f"Orbital spawn initiated. {module.upper() or 'Module'} emerging from orb origin."
    else:
        response = f"Command received: '{command}'. Awaiting pattern recognition. Speak with precision."

    eng.add_console_entry("tae", response)
    eng.log_tae(gid, "tae", response, tools_called)

    return {
        "response": response,
        "tools_called": tools_called,
        "render_mutated": render_mutated,
        "tae_state": eng.state.tae_state,
    }
