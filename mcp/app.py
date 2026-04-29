"""FastAPI web app — serves landing page, SSE agent endpoint, MCP server, and Prefab renderer.

Replaces `fastmcp dev apps` as a deployable web service.

Run locally: PYTHONIOENCODING=utf-8 uvicorn app:app --port 8080
"""

import json
import os
import pathlib
import sys

from fastapi import FastAPI, Request
from fastapi.responses import HTMLResponse, StreamingResponse, FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from agent_harness import run_agent
from mcp_server import mcp

app = FastAPI(title="SQL Practice MCP Agent")

# Serve bundled JS from static/js/
static_dir = pathlib.Path(__file__).parent / "static"
if (static_dir / "js").exists():
    app.mount("/js", StaticFiles(directory=str(static_dir / "js")), name="js")

# Mount FastMCP server at /mcp
mcp_app = mcp.http_app(transport="streamable-http")
app.mount("/mcp", mcp_app)


@app.get("/health")
async def health():
    return {"status": "ok", "service": "duckdb-ide-mcp"}


@app.get("/", response_class=HTMLResponse)
async def index():
    """Serve the landing page."""
    index_path = static_dir / "index.html"
    if index_path.exists():
        return HTMLResponse(index_path.read_text(encoding="utf-8"))
    return HTMLResponse("<h1>MCP Agent — index.html not found</h1>", status_code=404)


@app.get("/ui-resource")
async def ui_resource(uri: str):
    """Serve Prefab renderer HTML/JS from the prefab-ui Python package."""
    try:
        import prefab_ui
        prefab_dir = pathlib.Path(prefab_ui.__file__).parent

        # Map MCP UI resource URIs to files in the prefab-ui package
        # URI format: ui://prefab/tool/<hash>/renderer.html
        if "renderer.html" in uri:
            renderer_path = prefab_dir / "renderer" / "index.html"
            if not renderer_path.exists():
                # Try alternative paths
                for candidate in prefab_dir.rglob("renderer*.html"):
                    renderer_path = candidate
                    break

            if renderer_path.exists():
                content = renderer_path.read_text(encoding="utf-8")
                return HTMLResponse(content)

        return JSONResponse({"error": f"Resource not found: {uri}"}, status_code=404)
    except Exception as e:
        return JSONResponse({"error": str(e)}, status_code=500)


@app.post("/agent/stream")
async def agent_stream(request: Request):
    """SSE endpoint — runs the agent loop and streams steps."""
    body = await request.json()
    prompt = body.get("prompt", "")
    admin_key = body.get("admin_key", "")

    if not prompt:
        return JSONResponse({"error": "Prompt is required"}, status_code=400)

    # Override admin key if provided (for API client to use)
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


if __name__ == "__main__":
    import uvicorn
    port = int(os.environ.get("PORT", 8080))
    uvicorn.run(app, host="0.0.0.0", port=port)
