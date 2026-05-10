"""FastAPI web app — Generative UI agent with Pyodide rendering.

Serves landing page, SSE agent endpoint, Prefab iframe with Pyodide support,
and locally-bundled Pyodide WASM files (zero CDN dependency).

Run locally: PYTHONIOENCODING=utf-8 uvicorn app:app --port 8081
"""

import json
import os
import pathlib
import sys

from fastapi import FastAPI, Request
from fastapi.responses import HTMLResponse, StreamingResponse, JSONResponse
from fastapi.staticfiles import StaticFiles

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from agent_harness import run_agent
from mcp_server import mcp

mcp_app = mcp.http_app(transport="streamable-http")
app = FastAPI(title="SQL Practice — Generative UI Agent", lifespan=mcp_app.lifespan)

# Serve bundled JS from static/js/
static_js_dir = pathlib.Path(__file__).parent / "static" / "js"
if static_js_dir.exists():
    app.mount("/js", StaticFiles(directory=str(static_js_dir)), name="js")

# Serve Pyodide WASM files from static/pyodide/ (zero CDN)
pyodide_dir = pathlib.Path(__file__).parent / "static" / "pyodide"
if pyodide_dir.exists():
    app.mount("/pyodide", StaticFiles(directory=str(pyodide_dir)), name="pyodide")


# ── HTTPS scheme fix for Cloud Run ──

@app.middleware("http")
async def force_https_scheme(request, call_next):
    if request.headers.get("x-forwarded-proto") == "https":
        request.scope["scheme"] = "https"
    return await call_next(request)


# ── Routes ──

@app.get("/health")
async def health():
    return {"status": "ok", "service": "duckdb-ide-genui"}


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
    return HTMLResponse(LANDING_PAGE)


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

LANDING_PAGE = """\
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>SQL Practice — Generative UI Agent</title>
    <script type="importmap">{"imports":{"zod/v4":"/js/zod-v4.js"}}</script>
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
        .header .version-badge {
            font-size: 10px; background: #059669; color: white;
            padding: 2px 6px; border-radius: 4px; font-weight: 600;
        }
        .header input {
            padding: 7px 10px; border-radius: 6px;
            border: 1px solid #475569; background: #0f172a;
            color: #e2e8f0; font-size: 13px;
        }
        .header input[type="password"] { width: 140px; }
        .header input[type="text"] { flex: 1; min-width: 200px; }
        .header button {
            padding: 7px 18px; border-radius: 6px; border: none;
            background: #059669; color: white; font-size: 13px;
            font-weight: 500; cursor: pointer; white-space: nowrap;
        }
        .header button:hover { background: #047857; }
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
        .step-reasoning {
            background: #1e1b3a; border-left: 3px solid #a78bfa; color: #c4b5fd;
            cursor: pointer;
        }
        .step-reasoning .reasoning-summary { font-weight: 600; color: #a78bfa; }
        .step-reasoning .reasoning-detail {
            display: none; margin-top: 4px; font-size: 11px;
            color: #9ca3af; white-space: pre-wrap;
        }
        .step-reasoning.expanded .reasoning-detail { display: block; }
        .step-genui { background: #0a3622; border-left: 3px solid #10b981; color: #6ee7b7; }
        .step-genui .tool-name { color: #34d399; font-weight: 600; }
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
        <span class="version-badge">GenUI</span>
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
            <h3>Prefab UI — Generative</h3>
            <div class="empty-state" id="prefabEmpty">Tool results will render here (Pyodide-powered)</div>
            <iframe id="prefabFrame"></iframe>
        </div>
    </div>

    <script>
        const logEl = document.getElementById('agentLog');
        const runBtn = document.getElementById('runBtn');
        const iframe = document.getElementById('prefabFrame');
        const prefabEmpty = document.getElementById('prefabEmpty');
        let running = false;
        const pendingToolArgs = {};
        let dashboardResults = [];
        let renderTimer = null;

        function addStep(type, content) {
            const empty = document.getElementById('logEmpty');
            if (empty) empty.remove();
            const div = document.createElement('div');
            div.className = 'step step-' + type;
            div.innerHTML = content;
            logEl.appendChild(div);
            logEl.scrollTop = logEl.scrollHeight;
            return div;
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
            dashboardResults = [];
            if (renderTimer) clearTimeout(renderTimer);
            renderTimer = null;

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
                            case 'reasoning': {
                                const reasonText = step.content || '';
                                const thinkMatch = reasonText.match(/\\[THINK\\]\\s*(.+?)(?=\\[|$)/s);
                                const summary = thinkMatch
                                    ? thinkMatch[1].trim().substring(0, 100)
                                    : reasonText.substring(0, 100);
                                const el = addStep('reasoning',
                                    '<span class="reasoning-summary">\\ud83d\\udcad ' + esc(summary) + '</span>'
                                    + '<div class="reasoning-detail">' + esc(reasonText) + '</div>'
                                );
                                el.addEventListener('click', () => el.classList.toggle('expanded'));
                                dashboardResults.push({
                                    tool: '_reasoning',
                                    data: { text: reasonText }
                                });
                                scheduleDashboardRender(true);
                                break;
                            }
                            case 'tool_call': {
                                // Highlight generate_prefab_ui calls differently
                                const isGenUI = step.tool === 'generate_prefab_ui';
                                const stepClass = isGenUI ? 'genui' : 'tool-call';
                                const label = isGenUI ? '\\ud83c\\udfa8 ' : '';
                                addStep(stepClass,
                                    '<span class="tool-name">' + label + esc(step.tool) + '</span>'
                                    + (step.input ? '<br><small>' + esc(JSON.stringify(step.input).substring(0, 100)) + '</small>' : '')
                                );
                                pendingToolArgs[step.tool] = step.input || {};
                                break;
                            }
                            case 'tool_result':
                                addStep('tool-result',
                                    esc(step.tool) + ' result'
                                    + (step.result ? '<br><small>' + esc(JSON.stringify(step.result).substring(0, 150)) + '</small>' : '')
                                );
                                const toolInput = pendingToolArgs[step.tool] || {};
                                const merged = { ...step.result, _input: toolInput };
                                if (toolInput.sql_data) merged._sql_data = toolInput.sql_data;
                                if (toolInput.sql) merged._sql = toolInput.sql;
                                dashboardResults.push({
                                    tool: step.tool,
                                    data: merged
                                });
                                scheduleDashboardRender();
                                break;
                            case 'answer':
                                addStep('answer', '<strong>Answer:</strong><br><small>' + esc((step.content || '').substring(0, 300)) + '...</small>');
                                dashboardResults.push({
                                    tool: '_answer',
                                    data: { text: step.content || '' }
                                });
                                scheduleDashboardRender(true);
                                break;
                            case 'error':
                                addStep('error', esc(step.content || 'Unknown error'));
                                break;
                            case 'system':
                                addStep('system', esc(step.content || ''));
                                break;
                            case 'done':
                                addStep('system', 'Agent complete');
                                if (renderTimer) clearTimeout(renderTimer);
                                renderDashboard();
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

        function scheduleDashboardRender(immediate = false) {
            if (immediate) {
                if (renderTimer) clearTimeout(renderTimer);
                renderTimer = null;
                renderDashboard();
                return;
            }
            if (!renderTimer) {
                renderDashboard();
            }
            if (renderTimer) clearTimeout(renderTimer);
            renderTimer = setTimeout(() => {
                renderTimer = null;
                renderDashboard();
            }, 10000);
        }

        async function renderDashboard() {
            if (window._prefabRender) {
                window._prefabRender(JSON.stringify(dashboardResults));
            }
        }

        runBtn.addEventListener('click', runAgent);
        document.getElementById('prompt').addEventListener('keydown', (e) => {
            if (e.key === 'Enter') runAgent();
        });
    </script>

    <script type="module">
        try {
            const { AppBridge, PostMessageTransport }
                = await import("/js/app-bridge.js");
            const { Client, StreamableHTTPClientTransport }
                = await import("/js/sdk-bundle.js");

            const iframe = document.getElementById('prefabFrame');
            const prefabEmpty = document.getElementById('prefabEmpty');

            const client = new Client({ name: "mcp-genui", version: "3.0.0" });
            const mcpUrl = new URL("/mcp", window.location.origin);
            await client.connect(new StreamableHTTPClientTransport(mcpUrl));

            const serverCaps = client.getServerCapabilities();

            const transport = new PostMessageTransport(
                iframe.contentWindow,
                iframe.contentWindow
            );

            const bridge = new AppBridge(
                client,
                { name: "mcp-genui", version: "3.0.0" },
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
                console.log("[Prefab GenUI] Bridge initialized");
            };

            await bridge.connect(transport);

            bridge.oncalltool = async (params) => {
                console.log("[Prefab GenUI] CallTool:", params.name);
                const result = await client.callTool({
                    name: params.name,
                    arguments: params.arguments || {},
                });
                await bridge.sendToolInput({ arguments: params.arguments || {} });
                await bridge.sendToolResult(result);
                return result;
            };

            iframe.src = "/ui-resource?uri=renderer";
            await new Promise(r => iframe.addEventListener("load", r, { once: true }));

            window._prefabRender = async function(resultsJson) {
                try {
                    const count = JSON.parse(resultsJson).length;
                    console.log("[Prefab GenUI] Rendering dashboard with", count, "results");
                    const result = await client.callTool({
                        name: "render_dashboard",
                        arguments: { results_json: resultsJson },
                    });
                    if (result && result.structuredContent) {
                        await bridge.sendToolInput({ arguments: {} });
                        await bridge.sendToolResult(result);
                        prefabEmpty.style.display = 'none';
                        iframe.style.display = 'block';
                    }
                } catch (err) {
                    console.warn("[Prefab GenUI] Render failed:", err.message);
                }
            };

            console.log("[Prefab GenUI] Ready");
        } catch (err) {
            console.warn("[Prefab GenUI] Init failed:", err.message);
        }
    </script>
</body>
</html>
"""


# Mount MCP sub-app LAST
app.mount("/", mcp_app)


if __name__ == "__main__":
    import uvicorn
    port = int(os.environ.get("PORT", 8080))
    uvicorn.run(app, host="0.0.0.0", port=port)
