# Prefab + FastMCP Setup — Issues, Steps, and Fixes

Date: 2026-04-25

## Goal

Get a Prefab UI dashboard rendering via FastMCP's `dev apps` command locally on Windows 11.

## Environment

- Windows 11
- Python 3.14.3 (`C:\Python314\python.exe`)
- prefab-ui 0.19.1
- fastmcp 3.2.4
- pip packages installed to user site: `C:\Users\prateek\AppData\Roaming\Python\Python314\Scripts\`
- Executables NOT on PATH — must use full path to `prefab.exe` and `fastmcp.exe`

## Issue 1: `prefab serve` — blank white screen with MCP bridge error

**What happened:**
```
prefab serve prefab_demo.py
```
Server started, showed "Serving at http://127.0.0.1:5175", but browser showed blank white screen.

**Console error:**
```
[Prefab] Bridge connection failed: McpError: MCP error -32601: Method not found
```

**Root cause:** `prefab serve` is a preview command that tries to establish an MCP bridge internally for interactivity (button clicks, state updates). Without a running MCP server backend, the bridge has nothing to connect to. The renderer loads but can't communicate — blank screen.

**Attempted fixes that did NOT work:**
1. Running FastMCP SSE server on port 8000 alongside `prefab serve` on port 5175 — bridge still failed, they don't auto-connect
2. Adding explicit `PrefabApp` object with `view=page` — same bridge error
3. Various combinations of server + serve — same result

**Verdict:** `prefab serve` on its own cannot render interactive Prefab UIs. It needs the FastMCP app bridge infrastructure.

## Issue 2: `prefab export` — static HTML, file:// security error

**What happened:**
```
prefab export prefab_demo.py -o dashboard.html
```
Exported successfully (13KB, CDN). Opened in browser via `file:///C:/tmp/dashboard.html`.

**Console error:**
```
Unsafe attempt to load URL file:///C:/tmp/dashboard.html from frame with URL file:///C:/tmp/dashboard.html.
'file:' URLs are treated as unique security origins.
```

**Root cause:** Chrome treats each `file://` URL as a unique security origin. The exported HTML uses iframes or cross-origin resources that are blocked under this policy.

**Verdict:** Static export works for sharing/embedding but not for local preview via `file://`. Would need to serve via HTTP (e.g., `python -m http.server`), but user wanted live interactive demo, not static HTML.

## Issue 3: `fastmcp dev inspector` — `fastmcp` not on PATH

**What happened:**
```
fastmcp dev inspector mcp_dashboard.py
```
Inspector launched at http://localhost:6274 with proxy on port 6277. But clicking Connect in the inspector UI failed.

**Console error:**
```
Connection Error - Did you add the proxy session token in Configuration?
```
And later:
```
'fastmcp' is not recognized as an internal or external command
```

**Root cause:** The MCP Inspector proxy tries to spawn `fastmcp` as a subprocess via stdio transport. Since `fastmcp.exe` is installed in the user Scripts directory which is NOT on PATH, the subprocess launch fails.

**Fix applied:** Changed the Command field in the inspector UI from `fastmcp` to the full path:
```
C:\Users\prateek\AppData\Roaming\Python\Python314\Scripts\fastmcp.exe
```

**Additional fix:** The inspector requires a proxy auth token. Must use the full URL with token:
```
http://localhost:6274/?MCP_PROXY_AUTH_TOKEN=<token-from-terminal-output>
```

**Result:** Inspector connected but only shows raw tool results — does NOT render Prefab UI. The inspector is for testing MCP tools, not for rendering app UIs.

## Issue 4: `fastmcp dev inspector` — proxy health check fails on retry

**What happened:** After multiple attempts, the inspector proxy on port 6277 would die and not restart.

**Console error:**
```
GET http://localhost:6277/health net::ERR_CONNECTION_REFUSED
Couldn't connect to MCP Proxy Server TypeError: Failed to fetch
```

**Root cause:** Previous Python/Node processes were still holding ports. Multiple zombie processes from failed attempts.

**Fix:** Kill all Python and Node processes before retrying:
```bash
taskkill /F /IM python.exe
taskkill /F /IM node.exe
```

## Issue 5: `fastmcp dev apps` — "No UI tools found"

**What happened:**
```
fastmcp dev apps mcp_dashboard.py --no-reload
```
Server started, dev UI at http://localhost:8080 loaded, but showed:
```
No UI tools found on this server. Use @app.ui() to register entry-point tools.
```

**Root cause:** The tool was decorated with `@mcp.tool()` (regular tool) instead of `@mcp.tool(app=True)`. The `dev apps` UI only lists tools that have `app=True` — it filters for tools with Prefab UI metadata.

**Fix:** Changed decorator from:
```python
@mcp.tool()
def show_dashboard(...):
```
To:
```python
@mcp.tool(app=True)
def show_dashboard(...):
```

## Issue 6: `fastmcp dev apps` — Launch shows blank page

**What happened:** After fixing Issue 5, the dev UI listed `show_dashboard` with a Launch button. Clicking Launch opened `/launch?tool=show_dashboard&args=...` but the page was blank white.

**MCP Log showed:** `tools/call show_dashboard → [Rendered Prefab UI]` with full `structuredContent` JSON — the tool executed correctly and returned the complete component tree. But the iframe displayed nothing.

**Console showed:** `[Prefab] ontoolinput: complete` — no errors.

**Root cause:** The tool returned `Page` as the root component:
```python
@mcp.tool(app=True)
def show_dashboard(...) -> Page:
    with Page(title="...") as page:
        ...
    return page
```

The official FastMCP examples return `Column` (not `Page`). The `Page` component has special behavior in Prefab — it expects to be the top-level container managed by the host, not returned from a tool. Returning it from a tool confuses the renderer's layout.

**Fix:** Changed return type from `Page` to `Column`:
```python
@mcp.tool(app=True)
def show_dashboard(...) -> Column:
    with Column(gap=4) as layout:
        H2("SQL Practice Dashboard")
        ...
    return layout
```

**Result:** Dashboard rendered correctly with all components — table, metrics, cards, code blocks, badges, buttons.

## Issue 7: Windows console encoding error

**What happened:**
```
prefab serve prefab_demo.py
```
Crashed with:
```
UnicodeEncodeError: 'charmap' codec can't encode character '\u2713' in position 0
```

**Root cause:** The Prefab CLI prints a checkmark character (✓) in the "Serving at..." message. Windows console uses cp1252 encoding which doesn't support Unicode checkmarks.

**Fix:** Set encoding environment variable:
```bash
PYTHONIOENCODING=utf-8 prefab serve prefab_demo.py
```

This fix was needed for ALL prefab/fastmcp CLI commands on Windows.

## Issue 8: `PrefabApp` not found

**What happened:**
```
prefab serve prefab_demo.py
```
Error: `No PrefabApp found in prefab_demo.py`

**Root cause:** The `prefab serve` command looks for a `PrefabApp` instance in the module. The initial code just had component definitions without wrapping them in a `PrefabApp`.

**Fix:** Added explicit app object:
```python
from prefab_ui import PrefabApp
dashboard = PrefabApp(title="SQL Practice Dashboard", view=page)
```

And referenced it explicitly:
```bash
prefab serve prefab_standalone.py:dashboard
```

**Note:** This fixed the "not found" error but didn't fix the bridge error (Issue 1). `prefab serve` still showed blank screen.

## Issue 9: `Page` requires `title` parameter

**What happened:**
```python
with Page():
    H2("Title")
```
Error:
```
pydantic_core._pydantic_core.ValidationError: 1 validation error for Page
title
  Field required
```

**Fix:**
```python
with Page(title="SQL Practice Dashboard"):
```

## Issue 10: `TableCell` doesn't accept components as content

**What happened:**
```python
TableCell(Badge(gap["difficulty"], variant="secondary"))
```
Error:
```
Expected Rx, got <class 'prefab_ui.components.badge.Badge'>
```

**Root cause:** `TableCell` content must be a string or `Rx` reactive variable. Cannot nest Badge inside TableCell directly.

**Fix:** Use plain string:
```python
TableCell(gap["difficulty"])
```

If you need badges in table cells, use context manager nesting (not positional arg).

## Issue 11: `Paragraph` component doesn't exist

**What happened:**
```python
Paragraph(proposed_question["sql_question"])
```
Error: `NameError: name 'Paragraph' is not defined`

**Fix:** Use `P` (the actual component name):
```python
P(proposed_question["sql_question"])
```

Similarly, `CodeBlock` doesn't exist — use `Code`.

**Available component names:** Check with:
```python
import prefab_ui.components
print([x for x in dir(prefab_ui.components) if not x.startswith('_')])
```

## Working Configuration (Final)

**File: `mcp_dashboard.py`**
```python
from fastmcp import FastMCP
from prefab_ui.components import *

mcp = FastMCP("SQL Practice Tools")

@mcp.tool(app=True)
def show_dashboard(title: str = "Concept Coverage") -> Column:
    with Column(gap=4) as layout:
        H2("Dashboard Title")
        # ... components ...
    return layout

if __name__ == "__main__":
    mcp.run()
```

**Run command:**
```bash
PYTHONIOENCODING=utf-8 fastmcp dev apps mcp_dashboard.py --no-reload
```

**Access:** http://localhost:8080 → Click Launch on `show_dashboard`

## Key Learnings

1. **`prefab serve` is broken for standalone use** — needs MCP bridge, can't work alone
2. **`prefab export` is for static sharing** — not for interactive demos
3. **`fastmcp dev apps` is the correct way** to preview Prefab UIs during development
4. **Return `Column` not `Page`** from app tools — `Page` breaks iframe rendering
5. **`app=True` is required** on the tool decorator for it to appear in dev apps UI
6. **Windows needs `PYTHONIOENCODING=utf-8`** for all CLI commands
7. **Kill zombie processes** between attempts — ports get stuck
8. **Component names differ from intuition** — `P` not `Paragraph`, `Code` not `CodeBlock`
9. **TableCell only accepts strings** — can't nest components as positional args
10. **fastmcp.exe and prefab.exe are not on PATH** — use full path or add Scripts dir to PATH
