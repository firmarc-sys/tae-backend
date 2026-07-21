"""
SIOS API Routes — Live Runtime Architecture
All endpoints are backed by RuntimeEngine singleton state.
/ws  → WebSocket real-time stream (state deltas, console, events)
/api/* → REST endpoints for snapshots + mutations
"""
import os
import time
import uuid
import json
import asyncio
from dataclasses import asdict

from fastapi import FastAPI, APIRouter, Request, UploadFile, File, WebSocket, WebSocketDisconnect
from fastapi.responses import FileResponse, JSONResponse, StreamingResponse
from fastapi.staticfiles import StaticFiles


def create_app(static_dir: str) -> FastAPI:
    # ── Bootstrap runtime ───────────────────────────────────────
    from runtime.state import get_engine, OWNER_GID
    from runtime.ws_manager import get_manager, wire_runtime_to_ws
    from runtime.tae_orchestrator import run_tae_command
    from runtime.mcp_tools import execute_tool, get_tools_for_role, TOOLS

    eng = get_engine()
    mgr = get_manager()
    wire_runtime_to_ws()

    api = APIRouter()

    # ── Health ─────────────────────────────────────────────────
    @api.get("/health")
    def health():
        return {
            "ok": True,
            "runtime": "LIVE",
            "ws_connections": mgr.connection_count(),
            "tae_state": eng.state.tae_state,
            "system_time": time.strftime("%H:%M:%S"),
        }

    # ── WebSocket ──────────────────────────────────────────────
    # Client connects with ?gid=...&role=...
    # On connect: receives full state snapshot
    # Ongoing: receives delta events broadcast by RuntimeEngine

    @api.websocket("/ws")
    async def websocket_endpoint(ws: WebSocket):
        gid = ws.query_params.get("gid", OWNER_GID)
        role = ws.query_params.get("role", "free")
        await mgr.connect(ws, gid)
        eng.add_system_event("SYS", f"Client connected — GID {gid[:8]}... [{mgr.connection_count()} active]")
        try:
            # Send full state snapshot immediately on connect
            snapshot = eng.snapshot()
            snapshot["type"] = "state_snapshot"
            await ws.send_text(json.dumps(snapshot))

            # Keep alive — client may send commands here too
            while True:
                try:
                    raw = await asyncio.wait_for(ws.receive_text(), timeout=30.0)
                    data = json.loads(raw)
                    msg_type = data.get("type")

                    if msg_type == "tae_command":
                        # Handle TAE command over WebSocket
                        result = await run_tae_command(
                            command=data.get("command", ""),
                            gid=gid,
                            role=role,
                        )
                        await ws.send_text(json.dumps({"type": "tae_result", **result}))

                    elif msg_type == "ping":
                        await ws.send_text(json.dumps({"type": "pong",
                                                        "ts": time.time(),
                                                        "tae_state": eng.state.tae_state}))

                    elif msg_type == "subscribe_render":
                        # Client re-requests render state
                        await ws.send_text(json.dumps({"type": "render_update",
                                                        "render": asdict(eng.state.render)}))

                except asyncio.TimeoutError:
                    # Send heartbeat
                    await ws.send_text(json.dumps({
                        "type": "heartbeat",
                        "ts": time.time(),
                        "tae_state": eng.state.tae_state,
                        "system_time": time.strftime("%H:%M:%S"),
                        "ws_count": mgr.connection_count(),
                    }))

        except WebSocketDisconnect:
            pass
        except Exception as e:
            print(f"[WS] Error for GID {gid}: {e}")
        finally:
            mgr.disconnect(ws, gid)
            eng.add_system_event("SYS", f"Client disconnected — GID {gid[:8]}...")

    # ── TAE ────────────────────────────────────────────────────
    @api.get("/tae")
    def get_tae():
        return {
            "status": eng.state.tae_state,
            "mode": "Prime Orchestrator" if eng.state.gid == OWNER_GID else "User",
            "gid": eng.state.gid,
            "clearance": "OWNER" if eng.state.gid == OWNER_GID else "USER",
            "clearance_symbol": "Ω" if eng.state.gid == OWNER_GID else "·",
            "trust_score": 92,
            "system_time": time.strftime("%H:%M:%S"),
            "uptime": _uptime(),
            "tae_core": "ONLINE",
            "orbital_link": "STABLE",
            "ws_connections": mgr.connection_count(),
            "available_tools": len(TOOLS),
        }

    @api.post("/tae")
    async def post_tae(request: Request):
        body = await request.json()
        cmd  = body.get("command", "")
        gid  = body.get("gid", OWNER_GID)
        role = body.get("role", "owner" if gid == OWNER_GID else "free")

        if not cmd.strip():
            return {"error": "No command provided"}

        result = await run_tae_command(command=cmd, gid=gid, role=role)
        return {
            "received": True,
            "command":  cmd,
            "gid":      gid,
            "tae_state": result["tae_state"],
            "tae_response": result["response"],
            "tools_called": [t["name"] for t in result["tools_called"]],
            "render_mutated": result["render_mutated"],
            "system_time": time.strftime("%H:%M:%S"),
        }

    # ── Render State ───────────────────────────────────────────
    @api.get("/render-state")
    def get_render_state():
        r = eng.state.render
        return asdict(r) | {"system_time": time.strftime("%H:%M:%S")}

    @api.post("/render-state")
    async def post_render_state(request: Request):
        body = await request.json()
        allowed = {"viscosity","reflection","glow_intensity","formation","pulse_speed","syncori_activity","active_module"}
        updates = {k: v for k, v in body.items() if k in allowed}
        if updates:
            eng.patch_render(**updates)
        return asdict(eng.state.render) | {"updated": list(updates.keys())}

    # ── IoT Mesh ───────────────────────────────────────────────
    @api.get("/iot")
    def get_iot():
        devices = eng.state.devices
        return {
            "active_count": sum(1 for d in devices if d.get("online")),
            "total_count":  len(devices),
            "devices":      devices,
            "mesh_status":  "ACTIVE" if devices else "EMPTY",
            "system_time":  time.strftime("%H:%M:%S"),
        }

    @api.post("/iot")
    async def post_iot(request: Request):
        body    = await request.json()
        action  = body.get("action", "command")
        device  = body.get("device", "")
        command = body.get("command", "ping")
        gid     = body.get("gid", OWNER_GID)
        role    = body.get("role", "owner")

        if action == "register":
            result = await execute_tool("device_register", {
                "name": device, "type": body.get("type","unknown"),
                "status": body.get("status","offline")
            }, gid, role)
        else:
            result = await execute_tool("device_command",
                                        {"device": device, "command": command}, gid, role)
        return result | {"system_time": time.strftime("%H:%M:%S")}

    # ── Syncori ────────────────────────────────────────────────
    @api.get("/syncori")
    def get_syncori():
        q   = eng.state.syncori_queue
        idx = eng.state.syncori_index
        return {
            "status":       "ACTIVE",
            "queue":        q,
            "queue_length": len(q),
            "current_index":idx,
            "current_track": q[idx] if q else None,
            "syncori_activity": eng.state.render.syncori_activity,
            "system_time":  time.strftime("%H:%M:%S"),
        }

    @api.post("/syncori")
    async def post_syncori(request: Request):
        body   = await request.json()
        action = body.get("action", "status")
        gid    = body.get("gid", OWNER_GID)
        role   = body.get("role", "owner")

        if action == "add":
            result = await execute_tool("syncori_queue_add", {
                "title":    body.get("title","Unknown"),
                "artist":   body.get("artist","Unknown"),
                "album":    body.get("album",""),
                "duration": body.get("duration","00:00"),
            }, gid, role)
        elif action == "skip":
            result = await execute_tool("syncori_skip", {}, gid, role)
        elif action == "render_sync":
            # Sync render state syncori_activity with current track
            eng.patch_render(syncori_activity=min(1.0, eng.state.render.syncori_activity + 0.1))
            result = {"status": "ok", "syncori_activity": eng.state.render.syncori_activity}
        else:
            q   = eng.state.syncori_queue
            idx = eng.state.syncori_index
            result = {"status": "ok", "queue": q, "current": q[idx] if q else None}

        return result | {"system_time": time.strftime("%H:%M:%S")}

    # ── Identity ───────────────────────────────────────────────
    @api.get("/identity")
    def get_identity():
        return {
            "gid":        eng.state.gid,
            "role":       "owner" if eng.state.gid == OWNER_GID else "user",
            "clearance":  "Ω",
            "render_state": asdict(eng.state.render),
            "active_modules": [
                "TAE COMMAND","SYNCORI","IDENTITY","IOT MESH",
                "RENDER STATE","ALPHA/BETA","SUBSCRIPTIONS",
                "ADMIN","USER WORLDS","SYSTEM LOGS"
            ],
            "system_time": time.strftime("%H:%M:%S"),
        }

    @api.post("/identity")
    async def create_identity(request: Request):
        body  = await request.json()
        email = body.get("email","")
        gid   = body.get("gid", str(uuid.uuid4().int)[:12])
        role  = "owner" if gid == OWNER_GID else body.get("role","free")
        eng.state.gid = gid
        eng.add_system_event("GID", f"Identity registered — GID {gid[:8]}... role={role}")
        return {
            "status": "registered",
            "gid":    gid,
            "role":   role,
            "tae_handshake": "ACKNOWLEDGED",
            "message": f"Identity confirmed. GID {gid}. Clearance: {'Ω' if role=='owner' else role.upper()}.",
        }

    # ── Upload render reference ────────────────────────────────
    @api.post("/upload-render-reference")
    async def upload_render_reference(request: Request):
        # Accept either multipart or JSON body
        content_type = request.headers.get("content-type","")
        if "multipart" in content_type:
            form   = await request.form()
            file   = form.get("file")
            if file:
                contents = await file.read()
                size = len(contents)
            else:
                size = 0
        else:
            body = await request.body()
            size = len(body)

        file_id = str(uuid.uuid4())[:8]
        # Derive hue shift from file size (deterministic colour influence)
        hue_shift = (size % 360)
        eng.patch_render(glow_intensity=min(1.8, eng.state.render.glow_intensity + 0.05))
        eng.add_system_event("SYS", f"Render reference ingested [{file_id}] — orb calibrating")

        return {
            "status":     "processed",
            "file_id":    file_id,
            "size_bytes": size,
            "render_influence": {
                "hue_shift":       hue_shift,
                "saturation_boost": 0.2,
                "contrast":        0.1,
                "applied":         True,
            },
            "message": "Render reference ingested. Orb calibrating.",
        }

    # ── MCP capability discovery (owner only) ─────────────────
    @api.get("/mcp/tools")
    async def list_mcp_tools(request: Request):
        gid  = request.headers.get("x-gid", "")
        role = request.headers.get("x-role","free")
        if gid != OWNER_GID and role != "owner":
            return JSONResponse(status_code=403, content={"error": "Owner Architect clearance required"})
        return {
            "tools": get_tools_for_role(role),
            "count": len(TOOLS),
            "system_time": time.strftime("%H:%M:%S"),
        }

    @api.post("/mcp/execute")
    async def execute_mcp_tool(request: Request):
        """Direct MCP tool execution — owner-only debug endpoint."""
        gid  = request.headers.get("x-gid", "")
        role = request.headers.get("x-role","free")
        if gid != OWNER_GID:
            return JSONResponse(status_code=403, content={"error": "Owner Architect clearance required"})
        body = await request.json()
        tool_name = body.get("tool")
        params    = body.get("params", {})
        result    = await execute_tool(tool_name, params, gid, role)
        return {"tool": tool_name, "result": result, "system_time": time.strftime("%H:%M:%S")}


    @api.post("/tae/command")
    async def tae_command(request: Request):
        """Send command to TAE for state transition"""
        body = await request.json()
        command = body.get("command", "")
        await run_tae_command(command)
        return {"command": command, "status": "queued", "tae_state": eng.state.tae_state}

    # ── Runtime snapshot ───────────────────────────────────────
    @api.get("/runtime/snapshot")
    def runtime_snapshot():
        return eng.snapshot()

    # ── System events stream (SSE fallback for non-WS clients) ─
    @api.get("/runtime/events")
    async def runtime_events():
        async def event_stream():
            yield f"data: {json.dumps(eng.snapshot())}\n\n"
            # Hold connection — further events come via WS
        return StreamingResponse(event_stream(), media_type="text/event-stream")

    # ── Assemble app ───────────────────────────────────────────
    app = FastAPI()
    app.include_router(api, prefix="/api")

    if os.path.isdir(static_dir):
        assets_dir = os.path.join(static_dir, "_assets")
        if os.path.isdir(assets_dir):
            app.mount("/_assets", StaticFiles(directory=assets_dir), name="assets")

        @app.get("/{path:path}")
        async def spa_fallback(request: Request, path: str):
            # Exclude API and WS paths
            if path.startswith("api/") or path.startswith("ws"):
                return JSONResponse(status_code=404, content={"error": "Not found"})
            file_path = os.path.join(static_dir, path)
            if path and os.path.isfile(file_path):
                return FileResponse(file_path)
            return FileResponse(
                os.path.join(static_dir, "index.html"),
                headers={"Cache-Control": "no-cache, no-store, must-revalidate",
                         "Pragma": "no-cache", "Expires": "0"},
            )

    return app


# ── Helpers ────────────────────────────────────────────────────
_start_time = time.time()

def _uptime() -> str:
    elapsed = int(time.time() - _start_time)
    h = elapsed // 3600
    m = (elapsed % 3600) // 60
    s = elapsed % 60
    return f"{h:02d}:{m:02d}:{s:02d}"
