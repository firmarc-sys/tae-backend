"""
SIOS MCP Tool Registry
Defines all capabilities available to the TAE orchestrator.
Tools are grouped by domain: render, device, syncori, identity, system.
Each tool carries an identity-scoped permission level.
"""
from dataclasses import dataclass
from typing import Any, Callable, Awaitable
from runtime.state import get_engine, OWNER_GID
import time

# Permission tiers — mirrors frontend role hierarchy
PERM_FREE  = 0
PERM_BETA  = 1
PERM_ALPHA = 2
PERM_OWNER = 3

ROLE_PERM = {"free": PERM_FREE, "beta": PERM_BETA,
             "alpha": PERM_ALPHA, "owner": PERM_OWNER}


@dataclass
class MCPTool:
    name: str
    description: str
    params_schema: dict        # JSON Schema for params
    handler: Callable          # async fn(gid, role, **params) -> dict
    min_perm: int = PERM_FREE  # minimum permission level required


# ── Tool handlers ───────────────────────────────────────────────

async def _render_update(gid: str, role: str, **params) -> dict:
    """Mutate live render state parameters."""
    eng = get_engine()
    allowed = {
        "viscosity", "reflection", "glow_intensity",
        "formation", "pulse_speed", "syncori_activity", "active_module"
    }
    updates = {k: v for k, v in params.items() if k in allowed}
    if updates:
        eng.patch_render(**updates)
        eng.add_system_event("SYS", f"Render state updated: {', '.join(f'{k}={v}' for k,v in updates.items())}")
    return {"status": "ok", "updated": updates}


async def _tae_state_set(gid: str, role: str, state: str = "ACTIVE", **_) -> dict:
    """Switch TAE operational state: IDLE | ACTIVE | GENERATE | DEMO."""
    valid = {"IDLE", "ACTIVE", "GENERATE", "DEMO"}
    state = state.upper()
    if state not in valid:
        return {"error": f"Invalid state. Choose from {valid}"}
    eng = get_engine()
    eng.set_tae_state(state)
    eng.add_system_event("SYS", f"TAE state → {state}")
    # Demo mode also intensifies render
    if state == "DEMO":
        eng.patch_render(glow_intensity=1.4, viscosity=1.1, syncori_activity=1.0)
    elif state == "IDLE":
        eng.patch_render(glow_intensity=0.4, pulse_speed=0.5)
    elif state == "ACTIVE":
        eng.patch_render(glow_intensity=0.90, pulse_speed=1.20, viscosity=0.86)
    return {"status": "ok", "tae_state": state}


async def _device_command(gid: str, role: str, device: str = "", command: str = "ping", **_) -> dict:
    """Send a command to a registered IoT device."""
    eng = get_engine()
    devices = {d["name"].lower(): d for d in eng.state.devices}
    key = device.lower()
    match = next((d for n, d in devices.items() if key in n), None)
    if not match:
        return {"error": f"Device '{device}' not found in mesh"}

    # Simulate command execution
    responses = {
        "ping":       f"{match['name']} responded in 4ms",
        "pair":       f"{match['name']} pairing initiated",
        "unpair":     f"{match['name']} removed from mesh",
        "status":     f"{match['name']} — status: {match['status']}",
        "restart":    f"{match['name']} rebooting...",
        "brightness": f"{match['name']} brightness adjusted",
    }
    response = responses.get(command.lower(), f"{match['name']} ack: {command}")
    eng.update_device(match["name"], status="connected", online=True)
    eng.add_system_event("IOT", response)
    return {"status": "ok", "device": match["name"], "command": command, "response": response}


async def _device_register(gid: str, role: str, name: str = "", type: str = "unknown",
                            status: str = "offline", **_) -> dict:
    """Add a new device to the IoT mesh registry."""
    eng = get_engine()
    eng.update_device(name, type=type, status=status, online=(status != "offline"))
    eng.add_system_event("IOT", f"Device registered: {name} ({type})")
    return {"status": "ok", "registered": name}


async def _syncori_queue_add(gid: str, role: str, title: str = "", artist: str = "",
                              album: str = "", duration: str = "00:00", **_) -> dict:
    """Enqueue a track into the Syncori media engine."""
    import uuid
    eng = get_engine()
    track = {"id": str(uuid.uuid4())[:8], "title": title, "artist": artist,
             "album": album, "duration": duration, "added_at": time.time()}
    eng.add_syncori_track(track)
    eng.add_system_event("SYNC", f"Syncori: queued '{title}' by {artist}")
    return {"status": "ok", "track": track}


async def _syncori_skip(gid: str, role: str, **_) -> dict:
    """Skip to the next track in the Syncori queue."""
    eng = get_engine()
    q = eng.state.syncori_queue
    if not q:
        return {"error": "Queue is empty"}
    eng.state.syncori_index = (eng.state.syncori_index + 1) % len(q)
    current = q[eng.state.syncori_index]
    eng.add_system_event("SYNC", f"Syncori: now playing '{current['title']}'")
    eng._broadcast({"type": "syncori_update",
                    "queue": q, "index": eng.state.syncori_index})
    return {"status": "ok", "now_playing": current}


async def _identity_fetch(gid: str, role: str, target_gid: str = "", **_) -> dict:
    """Retrieve identity profile data for a GID. Owner can query any GID."""
    eng = get_engine()
    if role != "owner" and target_gid and target_gid != gid:
        return {"error": "Insufficient clearance to query other identities"}
    return {
        "gid": gid,
        "role": role,
        "clearance": "Ω" if gid == OWNER_GID else role.upper(),
        "render_state": {k: getattr(eng.state.render, k)
                         for k in ("viscosity","reflection","glow_intensity","formation","pulse_speed")},
        "system_time": time.strftime("%H:%M:%S"),
    }


async def _system_broadcast(gid: str, role: str, message: str = "", level: str = "SYS", **_) -> dict:
    """Broadcast a system event to all connected clients."""
    if role != "owner":
        return {"error": "Broadcast requires Owner Architect clearance"}
    eng = get_engine()
    eng.add_system_event(level.upper(), message)
    return {"status": "ok", "broadcast": message}


async def _render_diagnostics(gid: str, role: str, **_) -> dict:
    """Owner-only: full render state diagnostics snapshot."""
    if role != "owner":
        return {"error": "Diagnostics require Owner Architect clearance"}
    eng = get_engine()
    from dataclasses import asdict
    return {
        "render": asdict(eng.state.render),
        "devices": eng.state.devices,
        "tae_state": eng.state.tae_state,
        "syncori_queue_len": len(eng.state.syncori_queue),
        "console_entries": len(eng.state.console_log),
        "uptime_ts": eng.state.updated_at,
        "system_time": time.strftime("%H:%M:%S"),
    }


async def _orb_spawn(gid: str, role: str, module: str = "", effect: str = "emerge", **_) -> dict:
    """Spawn an orbital UI module — triggers animation in connected clients."""
    eng = get_engine()
    eng.patch_render(active_module=module.upper() if module else eng.state.render.active_module)
    eng.add_system_event("SYS", f"Orbital spawn: {module or 'default'} [{effect}]")
    eng._broadcast({"type": "orb_spawn", "module": module, "effect": effect})
    return {"status": "ok", "spawned": module, "effect": effect}


# ── Tool Registry ───────────────────────────────────────────────

TOOLS: dict[str, MCPTool] = {
    "render_update": MCPTool(
        name="render_update",
        description="Update live render state parameters (viscosity, reflection, glow_intensity, formation, pulse_speed, syncori_activity, active_module). Use to visually mutate the liquid chrome orb and spatial environment.",
        params_schema={
            "type": "object",
            "properties": {
                "viscosity":         {"type": "number", "description": "Fluid viscosity 0.0–2.0"},
                "reflection":        {"type": "number", "description": "Chrome reflection 0.0–2.0"},
                "glow_intensity":    {"type": "number", "description": "Ambient glow 0.0–2.0"},
                "formation":         {"type": "number", "description": "Orb formation density 0.0–1.0"},
                "pulse_speed":       {"type": "number", "description": "Pulse animation speed 0.0–3.0"},
                "syncori_activity":  {"type": "number", "description": "Syncori audio activity 0.0–1.0"},
                "active_module":     {"type": "string", "description": "Currently active module name"},
            },
        },
        handler=_render_update,
        min_perm=PERM_FREE,
    ),

    "tae_state_set": MCPTool(
        name="tae_state_set",
        description="Switch TAE operational state. DEMO intensifies all render parameters. IDLE reduces activity. GENERATE triggers creation mode. ACTIVE returns to default.",
        params_schema={
            "type": "object",
            "properties": {
                "state": {"type": "string", "enum": ["IDLE", "ACTIVE", "GENERATE", "DEMO"],
                          "description": "Target TAE state"},
            },
            "required": ["state"],
        },
        handler=_tae_state_set,
        min_perm=PERM_FREE,
    ),

    "device_command": MCPTool(
        name="device_command",
        description="Send a command to a registered IoT device in the mesh (AyrOptic Spectacles, SIOS Watch, Room Mesh Hub). Commands: ping, pair, unpair, status, restart, brightness.",
        params_schema={
            "type": "object",
            "properties": {
                "device":  {"type": "string", "description": "Device name or partial match"},
                "command": {"type": "string", "description": "Command to execute"},
            },
            "required": ["device", "command"],
        },
        handler=_device_command,
        min_perm=PERM_BETA,
    ),

    "device_register": MCPTool(
        name="device_register",
        description="Register a new device into the SIOS IoT mesh. Adds it to the live device registry.",
        params_schema={
            "type": "object",
            "properties": {
                "name":   {"type": "string"},
                "type":   {"type": "string", "description": "Device category (wearable, ar_glasses, mesh_router, etc.)"},
                "status": {"type": "string", "enum": ["paired","connected","offline"]},
            },
            "required": ["name"],
        },
        handler=_device_register,
        min_perm=PERM_ALPHA,
    ),

    "syncori_queue_add": MCPTool(
        name="syncori_queue_add",
        description="Add a track to the Syncori media engine queue.",
        params_schema={
            "type": "object",
            "properties": {
                "title":    {"type": "string"},
                "artist":   {"type": "string"},
                "album":    {"type": "string"},
                "duration": {"type": "string", "description": "Duration in mm:ss format"},
            },
            "required": ["title"],
        },
        handler=_syncori_queue_add,
        min_perm=PERM_FREE,
    ),

    "syncori_skip": MCPTool(
        name="syncori_skip",
        description="Skip to the next track in the Syncori queue.",
        params_schema={"type": "object", "properties": {}},
        handler=_syncori_skip,
        min_perm=PERM_FREE,
    ),

    "identity_fetch": MCPTool(
        name="identity_fetch",
        description="Retrieve identity profile and render state for a GID. Owner can query any GID.",
        params_schema={
            "type": "object",
            "properties": {
                "target_gid": {"type": "string", "description": "GID to query (owner only for others)"},
            },
        },
        handler=_identity_fetch,
        min_perm=PERM_FREE,
    ),

    "system_broadcast": MCPTool(
        name="system_broadcast",
        description="Broadcast a system event to all connected clients. Owner Architect only.",
        params_schema={
            "type": "object",
            "properties": {
                "message": {"type": "string"},
                "level":   {"type": "string", "enum": ["SYS","SYNC","IOT","GID","AUTH"]},
            },
            "required": ["message"],
        },
        handler=_system_broadcast,
        min_perm=PERM_OWNER,
    ),

    "render_diagnostics": MCPTool(
        name="render_diagnostics",
        description="Full render diagnostics snapshot. Owner Architect visibility only.",
        params_schema={"type": "object", "properties": {}},
        handler=_render_diagnostics,
        min_perm=PERM_OWNER,
    ),

    "orb_spawn": MCPTool(
        name="orb_spawn",
        description="Spawn an orbital UI module from the orb origin point, triggering spatial animation in all clients.",
        params_schema={
            "type": "object",
            "properties": {
                "module": {"type": "string", "description": "Module to spawn (SYNCORI, TAE COMMAND, IOT MESH, etc.)"},
                "effect": {"type": "string", "description": "Animation effect: emerge, collapse, pulse", "default": "emerge"},
            },
        },
        handler=_orb_spawn,
        min_perm=PERM_FREE,
    ),
}


def get_tools_for_role(role: str) -> list[dict]:
    """Return OpenAI-compatible tool definitions filtered by permission level."""
    perm = ROLE_PERM.get(role, PERM_FREE)
    result = []
    for t in TOOLS.values():
        if t.min_perm <= perm:
            result.append({
                "type": "function",
                "function": {
                    "name": t.name,
                    "description": t.description,
                    "parameters": t.params_schema,
                },
            })
    return result


async def execute_tool(name: str, params: dict, gid: str, role: str) -> dict:
    """Execute a named MCP tool with identity-scoped permissions."""
    if name not in TOOLS:
        return {"error": f"Unknown tool: {name}"}
    tool = TOOLS[name]
    perm = ROLE_PERM.get(role, PERM_FREE)
    if perm < tool.min_perm:
        return {"error": f"Insufficient clearance. {name} requires level {tool.min_perm}, you have {perm}"}
    return await tool.handler(gid=gid, role=role, **params)
