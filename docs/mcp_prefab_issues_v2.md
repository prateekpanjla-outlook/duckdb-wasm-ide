# MCP + Prefab + Cloud Run — All Issues Encountered

Date: 2026-04-30

## Issue 1: `prefab serve` blank screen — MCP bridge error
**Error:** `[Prefab] Bridge connection failed: McpError: MCP error -32601: Method not found`
**Root cause:** `prefab serve` is a preview command that tries to establish an MCP bridge. Without a running MCP server, the bridge has nothing to connect to.
**Fix:** Don't use `prefab serve` standalone. Use `fastmcp dev apps` instead.

## Issue 2: `prefab export` static HTML — file:// security error
**Error:** `Unsafe attempt to load URL file:///... 'file:' URLs are treated as unique security origins.`
**Root cause:** Chrome blocks cross-origin resources from file:// URLs.
**Fix:** Serve via HTTP, not file://. But static export doesn't serve the assignment purpose.

## Issue 3: `fastmcp dev apps` — "No UI tools found"
**Error:** `No UI tools found on this server. Use @app.ui() to register entry-point tools.`
**Root cause:** Tool decorated with `@mcp.tool()` not `@mcp.tool(app=True)`.
**Fix:** Add `app=True` to the decorator.

## Issue 4: `fastmcp dev apps` Launch — blank page
**Error:** Tool executes (MCP log shows `[Rendered Prefab UI]`) but iframe is blank.
**Root cause:** Tool returned `Page` as root component instead of `Column`.
**Fix:** Return `Column` not `Page` from app tools. Matches official FastMCP examples.

## Issue 5: Windows console encoding crash
**Error:** `UnicodeEncodeError: 'charmap' codec can't encode character '\u2713'`
**Root cause:** Windows console uses cp1252 encoding, Prefab CLI prints Unicode checkmark.
**Fix:** Set `PYTHONIOENCODING=utf-8` for all CLI commands.

## Issue 6: `TableCell` doesn't accept components
**Error:** `Expected Rx, got <class 'prefab_ui.components.badge.Badge'>`
**Root cause:** TableCell content must be string or Rx, not nested components.
**Fix:** Use plain strings in TableCell.

## Issue 7: Component name mismatches
**Error:** `NameError: name 'Paragraph' is not defined`
**Root cause:** Prefab uses `P` not `Paragraph`, `Code` not `CodeBlock`.
**Fix:** Check available components with `dir(prefab_ui.components)`.

## Issue 8: `Page` requires title parameter
**Error:** `ValidationError: 1 validation error for Page — title: Field required`
**Fix:** Use `Page(title="...")`.

## Issue 9: Cloud Run deploy — health check 403
**Error:** GitHub Actions health check returns HTTP 403.
**Root cause:** New Cloud Run service defaults to requiring IAM auth.
**Fix:** `gcloud run services add-iam-policy-binding ... --member="allUsers" --role="roles/run.invoker"`

## Issue 10: Cloud Run — Mixed Content error
**Error:** `Mixed Content: page loaded over HTTPS, requested insecure resource 'http://...mcp/'`
**Root cause:** Cloud Run terminates TLS at load balancer. Internal requests see http:// scheme. MCP client constructs HTTP URL for the endpoint.
**Fix:** Add middleware to read `X-Forwarded-Proto` header and set `request.scope["scheme"] = "https"`.

## Issue 11: MCP endpoint returns 404
**Error:** `POST /mcp/ 404 (Not Found)` and `POST /mcp 307 redirect`
**Root cause:** FastMCP's `http_app()` has a `/mcp` route internally. When mounted at `/mcp` in FastAPI, the actual path becomes `/mcp/mcp`. 307 redirect from `/mcp` to `/mcp/` also fails.
**Fix:** Mount MCP sub-app at `/` instead of `/mcp`. FastAPI routes defined with decorators take priority over the mount.

## Issue 12: MCP endpoint returns 500 — task group not initialized
**Error:** `RuntimeError: FastMCP's StreamableHTTPSessionManager task group was not initialized`
**Root cause:** FastMCP's ASGI app requires its lifespan to be passed to the parent FastAPI app.
**Fix:** `app = FastAPI(title="...", lifespan=mcp_app.lifespan)`

## Issue 13: `runAgent is not defined`
**Error:** `ReferenceError: runAgent is not defined` when clicking Run Agent button.
**Root cause:** Function defined inside `<script type="module">` which has its own scope. `onclick="runAgent()"` can't access module-scoped functions.
**Fix:** Split into regular `<script>` for agent SSE (globally accessible) and `<script type="module">` for Prefab/AppBridge.

## Issue 14: esbuild bundle — `App` is view-side, not host-side
**Error:** `Failed to execute 'postMessage' on 'Window': ... could not be cloned.`
**Root cause:** We exported `App as AppBridge` from `@modelcontextprotocol/ext-apps`. But `App` is the VIEW-side class (runs inside iframe). `AppBridge` is the HOST-side class (runs in parent page). `AppBridge` is NOT exported from the published npm package — it only exists in FastMCP's patched `app-bridge.js`.
**Discovery:** Found by reading the ext-apps source at https://github.com/modelcontextprotocol/ext-apps/blob/main/src/app-bridge.ts
**Fix:** Must use FastMCP's `_fetch_app_bridge_bundle_sync()` to get the patched app-bridge.js which includes the real `AppBridge` host class.

## Issue 15: `_fetch_app_bridge_bundle_sync("latest", ...)` returns 404
**Error:** `httpx.HTTPStatusError: Client error '404 Not Found' for url 'https://registry.npmjs.org/@modelcontextprotocol/ext-apps/-/ext-apps-latest.tgz'`
**Root cause:** npm registry doesn't accept "latest" as a version string in the tarball URL.
**Fix:** Use exact version: `_fetch_app_bridge_bundle_sync("1.7.1", "1.25.2")`

## Issue 16: Zod v4 `e.custom is not a function`
**Error:** `[Prefab] Module init failed: e.custom is not a function`
**Root cause:** esm.sh's `zod@x.y.z/es2022/v4.mjs` only re-exports `{z, default}`, losing named exports like `custom`, `string`, etc. The MCP SDK does `import * as t from "zod/v4"` and calls `t.custom()` which fails.
**Fix:** Import map that redirects `zod@4.3.6/es2022/v4.mjs` to `zod@4.3.6/es2022/v4/classic/index.mjs`. FastMCP generates this import map automatically.

## Issue 17: Import map not injected — `on_event("startup")` not running
**Error:** Import map shows `{}` in served HTML.
**Root cause:** FastAPI's `on_event("startup")` doesn't run when `lifespan` parameter is set (they conflict). The bridge fetch never executed.
**Fix:** Call `_fetch_app_bridge_bundle_sync()` at module import time instead of in an async startup handler.

## Issue 18: `/js/app-bridge.js` returns 404
**Error:** `Failed to load resource: 404` for `/js/app-bridge.js`
**Root cause:** FastAPI `StaticFiles` mount at `/js` intercepts the request before the `@app.get("/js/app-bridge.js")` route. StaticFiles looks for a physical file, finds none, returns 404.
**Fix:** Serve app-bridge.js at `/bridge/app-bridge.js` instead.

## Issue 19 (CURRENT): app-bridge.js imports from esm.sh CDN
**Problem:** FastMCP's patched `app-bridge.js` internally imports from `esm.sh`:
- `https://esm.sh/@modelcontextprotocol/sdk@1.25.2/types.js`
- `https://esm.sh/@modelcontextprotocol/sdk@1.25.2/shared/protocol.js`

And the landing page imports:
- `https://esm.sh/@modelcontextprotocol/sdk@1.25.2/client/index.js`
- `https://esm.sh/@modelcontextprotocol/sdk@1.25.2/client/streamableHttp.js`

**Root cause:** `AppBridge` (host-side class) is NOT in the published npm package. FastMCP patches the ext-apps source and rewrites bare `@modelcontextprotocol/sdk` imports to `esm.sh` URLs. There is no official way to get AppBridge without these CDN imports.

**Potential fix:** 
1. Save `app-bridge.js` to disk
2. Replace the 2 esm.sh URLs in app-bridge.js with local paths (e.g., `/js/sdk-types.js`, `/js/sdk-protocol.js`)
3. Bundle those 4 SDK modules individually with esbuild (types.js, protocol.js, client/index.js, client/streamableHttp.js)
4. Serve all from Cloud Run — zero CDN

**Status:** Not yet implemented.

## Key Learnings

1. **`AppBridge` is NOT published** in the npm package — only FastMCP's patched source has it
2. **`App` ≠ `AppBridge`** — App is view-side (iframe), AppBridge is host-side (parent page)
3. **Prefab tools must return `Column`** not `Page`
4. **`@mcp.tool(app=True)`** is required for tools to appear in the dev apps UI
5. **FastAPI mount order matters** — routes defined with decorators take priority over `app.mount()`
6. **FastAPI `lifespan` and `on_event` conflict** — can't use both
7. **Cloud Run terminates TLS** — internal requests see http://, need X-Forwarded-Proto middleware
8. **esm.sh Zod v4 is broken** — needs import map redirect to classic/index.mjs
9. **Windows cp1252** doesn't support Unicode — always set PYTHONIOENCODING=utf-8
