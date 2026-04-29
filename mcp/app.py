"""FastAPI web app — serves landing page, SSE agent endpoint, and Prefab UI.

Uses FastMCP's built-in app-bridge and Prefab renderer machinery.
The browser loads MCP SDK from esm.sh CDN (client-side only — server is self-contained).

Run locally: PYTHONIOENCODING=utf-8 uvicorn app:app --port 8080
"""

import json
import os
import pathlib
import sys

from fastapi import FastAPI, Request
from fastapi.responses import HTMLResponse, StreamingResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from starlette.routing import Mount

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from agent_harness import run_agent
from mcp_server import mcp

# MCP sub-app needs its lifespan passed to the parent app
mcp_app = mcp.http_app(transport="streamable-http")
app = FastAPI(title="SQL Practice MCP Agent", lifespan=mcp_app.lifespan)

# Serve bundled JS from static/js/
static_js_dir = pathlib.Path(__file__).parent / "static" / "js"
if static_js_dir.exists():
    app.mount("/js", StaticFiles(directory=str(static_js_dir)), name="js")

# ── HTTPS scheme fix for Cloud Run ──

@app.middleware("http")
async def force_https_scheme(request, call_next):
    """Cloud Run terminates TLS at the LB. Forward the original scheme."""
    if request.headers.get("x-forwarded-proto") == "https":
        request.scope["scheme"] = "https"
    return await call_next(request)

# MCP sub-app mounted after all routes — see bottom of file

# Fetch app-bridge.js from npm at startup (patched by FastMCP — includes
# the HOST-side AppBridge class which is NOT in the published npm package)
import asyncio
import concurrent.futures

_bridge_js = "// loading..."
_import_map_json = "{}"

def _fetch_bridge_sync():
    global _bridge_js, _import_map_json
    try:
        from fastmcp.cli.apps_dev import _fetch_app_bridge_bundle_sync
        _bridge_js, _import_map_json = _fetch_app_bridge_bundle_sync("latest", "1.25.2")
        print("[startup] app-bridge.js fetched successfully")
    except Exception as e:
        print(f"[startup] Warning: Could not fetch app-bridge: {e}")

@app.on_event("startup")
async def startup():
    loop = asyncio.get_event_loop()
    await loop.run_in_executor(None, _fetch_bridge_sync)


# ── Routes ──

@app.get("/bridge/app-bridge.js")
async def serve_bridge():
    """Serve the patched app-bridge.js from FastMCP."""
    from fastapi.responses import Response
    return Response(_bridge_js, media_type="application/javascript")


@app.get("/health")
async def health():
    return {"status": "ok", "service": "duckdb-ide-mcp"}


@app.get("/ui-resource")
async def ui_resource(uri: str = ""):
    """Serve Prefab renderer HTML from the prefab-ui package."""
    try:
        import prefab_ui
        renderer_path = pathlib.Path(prefab_ui.__file__).parent / "renderer" / "app.html"
        if renderer_path.exists():
            return HTMLResponse(renderer_path.read_text(encoding="utf-8"))
        return JSONResponse({"error": "Renderer not found"}, status_code=404)
    except Exception as e:
        return JSONResponse({"error": str(e)}, status_code=500)


@app.get("/", response_class=HTMLResponse)
async def index():
    """Serve the landing page with agent log + Prefab iframe."""
    html = LANDING_PAGE.replace("IMPORT_MAP_PLACEHOLDER", _import_map_json)
    return HTMLResponse(html)


@app.post("/agent/stream")
async def agent_stream(request: Request):
    """SSE endpoint — runs the agent loop and streams steps."""
    body = await request.json()
    prompt = body.get("prompt", "")
    admin_key = body.get("admin_key", "")

    if not prompt:
        return JSONResponse({"error": "Prompt is required"}, status_code=400)

    if admin_key:
        os.environ["ADMIN_KEY"] = admin_key

    async def event_generator():
        try:
            async for step in run_agent(prompt):
                yield f"data: {json.dumps(step)}\n\n"
            yield f"data: {json.dumps({'type': 'done'})}\n\n"
        except Exception as e:
            yield f"data: {json.dumps({'type': 'error', 'content': str(e)})}\n\n"

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


# ── Landing Page HTML ──
# Agent log on left, Prefab iframe on right.
# When agent completes, the final tool's structuredContent is sent to the
# Prefab iframe via AppBridge for rich rendering.

LANDING_PAGE = """\
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>SQL Practice — Question Authoring Agent (MCP)</title>
    <script type="importmap">IMPORT_MAP_PLACEHOLDER</script>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body {
            font-family: system-ui, -apple-system, sans-serif;
            background: #0f172a; color: #e2e8f0;
            height: 100vh; display: flex; flex-direction: column;
        }
        .header {
            padding: 12px 20px; background: #1e293b;
            border-bottom: 1px solid #334155;
            display: flex; align-items: center; gap: 10px; flex-shrink: 0;
        }
        .header h1 { font-size: 16px; font-weight: 600; white-space: nowrap; }
        .header input {
            padding: 7px 10px; border-radius: 6px;
            border: 1px solid #475569; background: #0f172a;
            color: #e2e8f0; font-size: 13px;
        }
        .header input[type="password"] { width: 140px; }
        .header input[type="text"] { flex: 1; min-width: 200px; }
        .header button {
            padding: 7px 18px; border-radius: 6px; border: none;
            background: #3b82f6; color: white; font-size: 13px;
            font-weight: 500; cursor: pointer; white-space: nowrap;
        }
        .header button:hover { background: #2563eb; }
        .header button:disabled { background: #475569; cursor: not-allowed; }
        .content { display: flex; flex: 1; overflow: hidden; }
        .agent-log {
            width: 340px; min-width: 260px; background: #1e293b;
            border-right: 1px solid #334155;
            overflow-y: auto; padding: 10px; flex-shrink: 0;
        }
        .agent-log h3 {
            font-size: 12px; font-weight: 600; color: #94a3b8;
            text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 10px;
        }
        .step {
            padding: 6px 8px; margin-bottom: 5px;
            border-radius: 5px; font-size: 12px; line-height: 1.3;
            word-break: break-word;
        }
        .step-tool-call { background: #1e3a5f; border-left: 3px solid #3b82f6; }
        .step-tool-call .tool-name { color: #60a5fa; font-weight: 600; }
        .step-tool-result { background: #1a3329; border-left: 3px solid #22c55e; color: #86efac; }
        .step-answer { background: #312e81; border-left: 3px solid #818cf8; }
        .step-error { background: #3b1320; border-left: 3px solid #ef4444; color: #fca5a5; }
        .step-system { background: #422006; border-left: 3px solid #f59e0b; color: #fcd34d; }
        .prefab-container {
            flex: 1; display: flex; flex-direction: column;
            background: #ffffff; overflow: hidden;
        }
        .prefab-container h3 {
            font-size: 12px; font-weight: 600; color: #475569;
            text-transform: uppercase; letter-spacing: 0.5px;
            padding: 10px 14px; background: #f8fafc;
            border-bottom: 1px solid #e2e8f0; flex-shrink: 0;
        }
        #prefabFrame { flex: 1; border: none; width: 100%; display: none; }
        .empty-state {
            display: flex; align-items: center; justify-content: center;
            height: 100%; color: #64748b; font-size: 13px;
        }
    </style>
</head>
<body>
    <div class="header">
        <h1>MCP Agent</h1>
        <input type="password" id="adminKey" placeholder="Admin Key">
        <input type="text" id="prompt" placeholder="e.g. Add a question about INNER JOIN">
        <button id="runBtn">Run Agent</button>
    </div>
    <div class="content">
        <div class="agent-log" id="agentLog">
            <h3>Agent Log</h3>
            <div class="empty-state" id="logEmpty">Enter a prompt and click Run Agent</div>
        </div>
        <div class="prefab-container">
            <h3>Prefab UI</h3>
            <div class="empty-state" id="prefabEmpty">Tool results will render here</div>
            <iframe id="prefabFrame"></iframe>
        </div>
    </div>

    <script>
        // ── Agent SSE log (no module imports needed) ──
        const logEl = document.getElementById('agentLog');
        const runBtn = document.getElementById('runBtn');
        const iframe = document.getElementById('prefabFrame');
        const prefabEmpty = document.getElementById('prefabEmpty');
        let running = false;

        function addStep(type, content) {
            const empty = document.getElementById('logEmpty');
            if (empty) empty.remove();
            const div = document.createElement('div');
            div.className = 'step step-' + type;
            div.innerHTML = content;
            logEl.appendChild(div);
            logEl.scrollTop = logEl.scrollHeight;
        }

        function esc(text) {
            const d = document.createElement('div');
            d.textContent = text;
            return d.innerHTML;
        }

        async function runAgent() {
            if (running) return;
            const adminKey = document.getElementById('adminKey').value.trim();
            const prompt = document.getElementById('prompt').value.trim();
            if (!adminKey) { alert('Enter admin key'); return; }
            if (!prompt) { alert('Enter a prompt'); return; }

            running = true;
            runBtn.textContent = 'Running...';
            runBtn.disabled = true;
            logEl.innerHTML = '<h3>Agent Log</h3>';

            try {
                const response = await fetch('/agent/stream', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ prompt, admin_key: adminKey }),
                });

                if (!response.ok) {
                    const err = await response.json();
                    throw new Error(err.error || 'Request failed');
                }

                const reader = response.body.getReader();
                const decoder = new TextDecoder();
                let buffer = '';

                while (true) {
                    const { done, value } = await reader.read();
                    if (done) break;
                    buffer += decoder.decode(value, { stream: true });
                    const events = buffer.split('\\n\\n');
                    buffer = events.pop();

                    for (const event of events) {
                        if (!event.startsWith('data: ')) continue;
                        const step = JSON.parse(event.slice(6));

                        switch (step.type) {
                            case 'tool_call':
                                addStep('tool-call',
                                    '<span class="tool-name">' + esc(step.tool) + '</span>'
                                    + (step.input ? '<br><small>' + esc(JSON.stringify(step.input).substring(0, 100)) + '</small>' : '')
                                );
                                break;
                            case 'tool_result':
                                addStep('tool-result',
                                    esc(step.tool) + ' result'
                                    + (step.result ? '<br><small>' + esc(JSON.stringify(step.result).substring(0, 150)) + '</small>' : '')
                                );
                                // Trigger Prefab render for this tool
                                renderPrefab(step.tool, step.result);
                                break;
                            case 'answer':
                                addStep('answer', '<strong>Answer:</strong><br><small>' + esc((step.content || '').substring(0, 300)) + '...</small>');
                                break;
                            case 'error':
                                addStep('error', esc(step.content || 'Unknown error'));
                                break;
                            case 'system':
                                addStep('system', esc(step.content || ''));
                                break;
                            case 'done':
                                addStep('system', 'Agent complete');
                                break;
                        }
                    }
                }
            } catch (err) {
                addStep('error', esc(err.message));
            }

            running = false;
            runBtn.textContent = 'Run Agent';
            runBtn.disabled = false;
        }

        // Trigger Prefab rendering by calling the MCP tool directly
        // The iframe + AppBridge will handle the Prefab rendering
        async function renderPrefab(toolName, toolResult) {
            // For now, show the last tool result in the Prefab area
            // Full AppBridge integration loaded via module script below
            if (window._prefabRender) {
                window._prefabRender(toolName, toolResult);
            }
        }

        runBtn.addEventListener('click', runAgent);
        document.getElementById('prompt').addEventListener('keydown', (e) => {
            if (e.key === 'Enter') runAgent();
        });
    </script>

    <script type="module">
        // ── Prefab AppBridge — using FastMCP's patched app-bridge.js ──
        try {
            const { AppBridge, PostMessageTransport }
                = await import("/bridge/app-bridge.js");
            const { Client }
                = await import("https://esm.sh/@modelcontextprotocol/sdk@1.25.2/client/index.js");
            const { StreamableHTTPClientTransport }
                = await import("https://esm.sh/@modelcontextprotocol/sdk@1.25.2/client/streamableHttp.js");

            const iframe = document.getElementById('prefabFrame');
            const prefabEmpty = document.getElementById('prefabEmpty');

            // 1. Connect MCP client to our server
            const client = new Client({ name: "mcp-agent-ui", version: "1.0.0" });
            const mcpUrl = new URL("/mcp", window.location.origin);
            console.log("[Prefab] Connecting MCP client to:", mcpUrl.href);
            await client.connect(new StreamableHTTPClientTransport(mcpUrl));
            console.log("[Prefab] MCP client connected");

            const serverCaps = client.getServerCapabilities();

            // 2. Load iframe with Prefab renderer
            const loaded = new Promise(r => iframe.addEventListener("load", r, { once: true }));
            iframe.src = "/ui-resource?uri=renderer";
            await loaded;
            console.log("[Prefab] Iframe loaded");

            // 3. Create transport and bridge AFTER iframe has loaded
            const transport = new PostMessageTransport(
                iframe.contentWindow,
                iframe.contentWindow
            );

            const bridge = new AppBridge(
                client,
                { name: "mcp-agent-ui", version: "1.0.0" },
                {
                    openLinks: {},
                    serverTools: serverCaps?.tools,
                    serverResources: serverCaps?.resources,
                },
                {
                    hostContext: {
                        theme: "light",
                        platform: "web",
                        containerDimensions: { maxHeight: 8000 },
                        displayMode: "inline",
                        availableDisplayModes: ["inline"],
                    },
                }
            );

            bridge.onopenlink = async ({ url }) => { window.open(url, "_blank"); return {}; };
            bridge.onmessage = async () => ({});
            bridge.oninitialized = async () => {
                console.log("[Prefab] Bridge initialized — ready for tool results");
            };

            await bridge.connect(transport);
            console.log("[Prefab] AppBridge connected");

            // Expose render function to the non-module agent script
            window._prefabRender = async function(toolName, toolArgs) {
                try {
                    console.log("[Prefab] Rendering tool:", toolName);
                    // Call MCP tool to get structuredContent (Prefab UI)
                    const result = await client.callTool({
                        name: toolName,
                        arguments: toolArgs || {},
                    });
                    if (result) {
                        await bridge.sendToolInput({ arguments: toolArgs || {} });
                        await bridge.sendToolResult(result);
                        prefabEmpty.style.display = 'none';
                        iframe.style.display = 'block';
                        console.log("[Prefab] Rendered:", toolName);
                    }
                } catch (err) {
                    console.warn("[Prefab] Render failed:", toolName, err.message);
                }
            };

            console.log("[Prefab] Ready");
        } catch (err) {
            console.warn("[Prefab] Module init failed (Prefab UI disabled):", err.message);
        }
    </script>
</body>
</html>
"""


# Mount MCP sub-app LAST — it has a /mcp route internally.
# Mounted at "/" so the route is reachable at /mcp.
# FastAPI routes above (@app.get, @app.post) take priority.
app.mount("/", mcp_app)


if __name__ == "__main__":
    import uvicorn
    port = int(os.environ.get("PORT", 8080))
    uvicorn.run(app, host="0.0.0.0", port=port)
