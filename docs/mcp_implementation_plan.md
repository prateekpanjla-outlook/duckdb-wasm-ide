# Plan: Question Agent with MCP + Prefab UI on Cloud Run

## Context

EAG Session 4 assignment requires an MCP server with Prefab UI. We're building a new Cloud Run service that runs the question authoring agent via MCP protocol with Prefab rendering — all self-contained, no CDN dependencies.

## Architecture

```
┌───────────────────────────────────────────────────────────┐
│  Browser (any device, any network)                        │
│                                                           │
│  ┌─────────────────────────────────────────────────────┐  │
│  │  Landing Page (served by FastAPI)                   │  │
│  │  [Enter admin key] [Enter prompt] [Run Agent]       │  │
│  │                                                     │  │
│  │  Agent Log (plain HTML):  Prefab iframe:             │  │
│  │  ⚙ get_coverage_gaps     ┌──────────────────┐       │  │
│  │  ✅ 26 gaps              │ Prefab Card 1    │       │  │
│  │  ⚙ validate_question     │ Coverage Table   │       │  │
│  │  ✅ Schema valid         │                  │       │  │
│  │                          │ Prefab Card 2    │       │  │
│  │                          │ Validation ✓✓✓  │       │  │
│  │                          │ ER Diagram       │       │  │
│  │                          │                  │       │  │
│  │                          │ Prefab Card 3    │       │  │
│  │                          │ Question Preview │       │  │
│  │                          │ [Approve][Reject]│       │  │
│  │                          └──────────────────┘       │  │
│  └─────────────────────────────────────────────────────┘  │
└──────────────────────────┬────────────────────────────────┘
                           │ HTTPS (same origin)
                           ▼
┌───────────────────────────────────────────────────────────┐
│  Cloud Run: duckdb-ide-mcp (NEW Python service)           │
│  FastAPI + FastMCP + Prefab                               │
│  URL: https://duckdb-ide-mcp-xxx.run.app                  │
│                                                           │
│  Routes:                                                  │
│    GET  /              → Landing page HTML                │
│    GET  /js/*          → Bundled JS (MCP SDK, AppBridge)  │
│    GET  /ui-resource   → Prefab renderer HTML/JS          │
│    POST /mcp           → FastMCP server (8 tools)         │
│    POST /agent/stream  → Agent SSE endpoint               │
│                           (Gemini loop + MCP tool calls)  │
└──────────────────────────┬────────────────────────────────┘
                           │ HTTPS (server-to-server)
                           ▼
┌───────────────────────────────────────────────────────────┐
│  Cloud Run: duckdb-ide (EXISTING, unchanged)              │
│  Express API + PostgreSQL                                 │
│  URL: https://duckdb-ide-xxx.run.app                      │
│                                                           │
│  NEW thin endpoints (added to admin.js):                  │
│    GET  /api/admin/tools/coverage-gaps                    │
│    GET  /api/admin/tools/questions                        │
│    GET  /api/admin/tools/concepts                         │
│    POST /api/admin/tools/validate                         │
│    POST /api/admin/tools/execute-sql                      │
│    POST /api/admin/tools/concept-overlap                  │
│    POST /api/admin/tools/insert                           │
│    POST /api/admin/tools/generate-test                    │
└───────────────────────────────────────────────────────────┘
```

## User Interface Flow

### Step 1: Admin opens the MCP agent URL

This is a NEW URL — separate from the existing practice app.

```
Browser: https://duckdb-ide-mcp-xxx.run.app

┌──────────────────────────────────────────────────┐
│  SQL Practice — Question Authoring Agent (MCP)   │
│                                                  │
│  Admin Key: [••••••••••••••••]                    │
│  Prompt: [Add a question about INNER JOIN    ]   │
│  [Run Agent]                                     │
│                                                  │
│  ┌─── Agent Log ───┐  ┌─── Prefab UI ─────────┐ │
│  │                  │  │                       │ │
│  │ (waiting)        │  │ (waiting)             │ │
│  │                  │  │                       │ │
│  └──────────────────┘  └───────────────────────┘ │
└──────────────────────────────────────────────────┘
```

### Step 2: Admin clicks "Run Agent" — each tool call streams a Prefab card

SSE stream begins. EACH tool call renders its own Prefab card in the iframe:

```
┌──────────────────────────────────────────────────┐
│  [Running... stop]                               │
│                                                  │
│  ┌─── Agent Log ───┐  ┌─── Prefab UI (iframe) ─┐│
│  │                  │  │                        ││
│  │ ⚙ get_coverage  │  │ ┌── Card 1 ──────────┐ ││
│  │   _gaps          │  │ │ Coverage Gaps       │ ││
│  │   26 concepts    │  │ │ HAVING │ agg │ int  │ ││
│  │                  │  │ │ CTE    │ adv │ adv  │ ││
│  │                  │  │ │                     │ ││
│  │                  │  │ │ Total:6 Beg:1 Adv:2 │ ││
│  │                  │  │ └─────────────────────┘ ││
│  │                  │  │                        ││
│  └──────────────────┘  └────────────────────────┘│
└──────────────────────────────────────────────────┘

  ↓ 10 seconds later, next tool call...

┌──────────────────────────────────────────────────┐
│  ┌─── Agent Log ───┐  ┌─── Prefab UI (iframe) ─┐│
│  │ ⚙ get_coverage  │  │ ┌── Card 1 ──────────┐ ││
│  │   _gaps          │  │ │ Coverage Gaps       │ ││
│  │   26 concepts    │  │ │ (collapsed)         │ ││
│  │ ⚙ validate      │  │ └─────────────────────┘ ││
│  │   _question      │  │ ┌── Card 2 ──────────┐ ││
│  │   Schema valid   │  │ │ Validation Results  │ ││
│  │                  │  │ │ ✓ Schema Valid      │ ││
│  │                  │  │ │ ✓ 12 rows inserted  │ ││
│  │                  │  │ │ ✓ Distinguishable   │ ││
│  │                  │  │ │                     │ ││
│  │                  │  │ │ Table Relationships │ ││
│  │                  │  │ │ ┌─ erDiagram ─────┐ │ ││
│  │                  │  │ │ │departments ||--o{│ │ ││
│  │                  │  │ │ │  team_members    │ │ ││
│  │                  │  │ │ └─────────────────┘ │ ││
│  │                  │  │ └─────────────────────┘ ││
│  └──────────────────┘  └────────────────────────┘│
└──────────────────────────────────────────────────┘
```

### Step 3: Agent finishes — question preview with approve/reject (all Prefab)

```
┌──────────────────────────────────────────────────┐
│  ┌─── Agent Log ───┐  ┌─── Prefab UI (iframe) ─┐│
│  │ ⚙ get_coverage  │  │ Card 1: Coverage (↓)   ││
│  │ ⚙ validate      │  │ Card 2: Validation (↓) ││
│  │ ⚙ check_overlap │  │ Card 3: Overlap (↓)    ││
│  │ ✅ Complete      │  │                        ││
│  │                  │  │ ┌── Card 4 ──────────┐ ││
│  │                  │  │ │ Proposed Question   │ ││
│  │                  │  │ │ [advanced][JOIN]    │ ││
│  │                  │  │ │                     │ ││
│  │                  │  │ │ Question:           │ ││
│  │                  │  │ │ "Find departments.."│ ││
│  │                  │  │ │                     │ ││
│  │                  │  │ │ Schema:             │ ││
│  │                  │  │ │ CREATE TABLE dept.. │ ││
│  │                  │  │ │                     │ ││
│  │                  │  │ │ Solution:           │ ││
│  │                  │  │ │ SELECT d.name...    │ ││
│  │                  │  │ │                     │ ││
│  │                  │  │ │ Concepts:           │ ││
│  │                  │  │ │ [INNER JOIN][GROUP] │ ││
│  │                  │  │ │                     │ ││
│  │                  │  │ │ [Approve & Insert]  │ ││
│  │                  │  │ │ [Reject] [Retry]    │ ││
│  │                  │  │ └─────────────────────┘ ││
│  └──────────────────┘  └────────────────────────┘│
└──────────────────────────────────────────────────┘
```

### Step 4: Admin clicks Approve (inside Prefab — no separate component)

Approve button is a Prefab `Button` inside the iframe. Click → AppBridge sends `callServerTool` to MCP server → MCP server calls Express API `POST /api/admin/tools/insert` → question inserted → Prefab renders success card:

```
┌──────────────────────────────────────────────────┐
│  ┌─── Prefab UI (iframe) ────────────────────┐   │
│  │ Card 1-3: (collapsed)                     │   │
│  │                                           │   │
│  │ ┌── Card 5 ─────────────────────────────┐ │   │
│  │ │ ✓ Question #12 inserted successfully  │ │   │
│  │ │ Concepts tagged: INNER JOIN, GROUP BY │ │   │
│  │ │                                       │ │   │
│  │ │ [Generate Playwright Test]            │ │   │
│  │ └───────────────────────────────────────┘ │   │
│  └───────────────────────────────────────────┘   │
│                                                  │
│  Verify: open https://duckdb-ide-xxx.run.app     │
│  → question appears in dropdown                  │
└──────────────────────────────────────────────────┘
```

## Conflict Analysis with Existing UI

### Why there are ZERO conflicts

The two Cloud Run services are completely independent:

| Aspect | Existing service (duckdb-ide) | New service (duckdb-ide-mcp) |
|--------|------------------------------|------------------------------|
| URL | `duckdb-ide-xxx.run.app` | `duckdb-ide-mcp-xxx.run.app` |
| Language | Node.js / Express | Python / FastAPI |
| Frontend | Vanilla JS (`agent-panel.js`, `index.html`) | FastAPI serves HTML + Prefab iframe |
| Agent | `agent.js` (Gemini + direct tool calls) | `agent_harness.py` (Gemini + MCP tools) |
| Tools | `agentTools.js` (direct PostgreSQL) | MCP tools (HTTP proxy to Express) |
| UI rendering | SSE → DOM manipulation | SSE → Prefab in iframe via AppBridge |
| Port | 8080 (Cloud Run) | 8080 (Cloud Run, different service) |
| Database | Cloud SQL (direct) | Cloud SQL (via Express proxy) |

They share NOTHING in the browser:
- Different origins (different Cloud Run URLs)
- Different browser tabs
- No shared CSS, JS, DOM, localStorage, cookies
- No iframes between them
- No postMessage between them

### iframe safety (Prefab within the NEW service)

The Prefab iframe loads from the SAME origin as the landing page:

```
Landing page: https://duckdb-ide-mcp-xxx.run.app/
Prefab iframe: https://duckdb-ide-mcp-xxx.run.app/ui-resource?uri=...
```

Same origin means:
- No CORS issues
- No CSP frame-src needed (self is allowed by default)
- No mixed content (both HTTPS)
- No COEP conflict (we control both page and iframe headers)
- postMessage works without origin checks (same origin)

### The earlier Flow 2 conflict (NOT applicable here)

Earlier in the conversation we discussed embedding Prefab inside the EXISTING agent panel. That had:
- CSP blocking iframe from different origin ← NOT applicable (same origin)
- COEP require-corp blocking iframe ← NOT applicable (same origin)
- Mixed HTTP/HTTPS ← NOT applicable (both HTTPS on Cloud Run)
- Two agent loops fighting ← NOT applicable (separate services)

None of these apply to Flow 3 because the Prefab iframe and its host page are served by the same FastAPI service on the same Cloud Run URL.

### Server-to-server interaction

The only cross-service communication is:
```
duckdb-ide-mcp (Python) --HTTP--> duckdb-ide (Express)
```

This is a server-side HTTP call with the `X-Admin-Key` header. Not browser-level. No CORS, no CSP, no iframe issues. Same as any API call.

### What could go wrong

| Risk | Likelihood | Mitigation |
|------|-----------|-----------|
| Express API rate limit (100 req/15min) hits MCP agent | Low — agent makes ~5-8 calls per run | Add admin routes to a separate rate limiter or exempt admin endpoints |
| Both services writing to same DB simultaneously | Low — insert_question is called once per approval | Same as today — existing agent also writes to DB |
| Cloud Run cold start on new service | Medium — first request takes 5-10s | Set min-instances=1 for the MCP service (costs ~$5/month) |
| Gemini 503 during MCP agent run | Low — paid tier active | Retry logic already built in agent_harness.py |

## How Prefab Renders on Cloud Run (no CDN, no fastmcp dev apps)

We replicate what `fastmcp dev apps` does internally:

```
What fastmcp dev apps does:          What we deploy:
─────────────────────────            ──────────────
1. Starts MCP server (uvicorn)    → FastAPI + FastMCP mounted at /mcp
2. Serves landing page HTML       → FastAPI serves / (our custom HTML)
3. Serves app-bridge.js           → Bundled in Docker image from npm
4. Serves Prefab renderer HTML    → Read from prefab-ui Python package
5. Loads MCP SDK from esm.sh CDN  → Bundled in Docker image from npm
6. Proxies /mcp to MCP server     → Same origin — no proxy needed
```

Everything self-hosted. Zero CDN. One Docker image. One Cloud Run URL.

## Code Location

New `mcp/` subfolder in existing repo. Code from `c:\tmp\mcp_dashboard.py` and `c:\tmp\test_gemini.py` is adapted and moved into this folder — those tmp files are prototypes, the final code lives in `mcp/` and deploys to Cloud Run.

```
mcp/
  app.py                  # FastAPI app — routes, SSE, serves static files
  mcp_server.py           # FastMCP server — 8 tools with Prefab UI
  agent_harness.py        # Gemini agent loop (called by app.py SSE endpoint)
  tools/
    __init__.py
    api_client.py          # HTTP client to existing Express API (real data)
    tool_handlers.py       # 8 tool functions: call API → build Prefab UI
  ui/
    __init__.py
    components.py          # Reusable Prefab UI builders
    er_diagram.py          # Parse CREATE TABLE → Mermaid ER diagram
  static/
    index.html             # Landing page (prompt input + agent log + Prefab iframe)
    js/                    # Bundled: MCP SDK, AppBridge (from npm, no CDN)
  config.py                # Cloud Run URLs, admin key, Gemini key, model
  requirements.txt         # fastmcp, prefab-ui, httpx, fastapi, uvicorn
  package.json             # npm install of MCP SDK + AppBridge
  Dockerfile               # Python + Node (for npm), serves on port 8080
```

## Implementation Steps

### Step 1: Add REST endpoints to Express (30 min) -- DONE
- Add 8 thin routes to `server/routes/admin.js` wrapping existing `TOOL_FUNCTIONS`
- All behind `adminAuth` middleware
- Commit, deploy to Cloud Run
- Test: `curl -H "X-Admin-Key: ..." https://duckdb-ide-xxx.run.app/api/admin/tools/coverage-gaps`

### Step 2: Project skeleton + FastAPI app (1 hr) -- DONE
- Create `mcp/` directory structure
- `config.py` — existing Cloud Run URL, admin key, Gemini API key, model
- `requirements.txt` + `package.json`
- `app.py` — FastAPI with routes: `/`, `/js/*`, `/ui-resource`, `/mcp`, `/agent/stream`

### Step 3: Bundle JS dependencies (30 min) -- DONE
- `npm install @modelcontextprotocol/sdk` (provides MCP client for browser)
- Extract AppBridge JS from FastMCP dev apps source or npm
- Copy bundled JS to `mcp/static/js/`
- Serve Prefab renderer HTML from `prefab-ui` Python package path
- Verify: zero external CDN requests

### Step 4: ER diagram generator (1 hr) -- DONE
- `mcp/ui/er_diagram.py` — parse SQL schema → Mermaid ER diagram
- Extract tables, columns, PK/FK via regex
- Foreign keys present → Mermaid erDiagram string
- Single table, no FK → None (no diagram)

### Step 5: Prefab UI component helpers (1.5 hr) -- DONE
- `mcp/ui/components.py` — one builder per tool, each returns `Column`:
  - `build_coverage_table(data)` → table + metric cards
  - `build_questions_table(data)` → table + next index badge
  - `build_validation_result(data)` → checklist + ER diagram (if multi-table)
  - `build_concept_overlap(data)` → status badges per concept
  - `build_concepts_table(data)` → full taxonomy table
  - `build_sql_result(data)` → code block + result table
  - `build_question_preview(data)` → schema, solution, concepts, Approve/Reject/Retry buttons
  - `build_insert_result(data)` → success card with question ID
  - `build_test_code(data)` → code block with Playwright test

### Step 6: MCP server with 8 tools (1.5 hr) -- DONE
- `mcp/mcp_server.py` — 8 tools with `@mcp.tool(app=True)`
- Each tool: call Express API via `api_client.py` → build Prefab UI → return Column
- Mount via `mcp.http_app()` inside FastAPI at `/mcp`

### Step 7: Agent harness + SSE endpoint (2 hr) -- DONE
- `mcp/agent_harness.py` — Gemini agent loop (adapted from `c:\tmp\test_gemini.py`)
- Calls MCP tools internally (direct function call, not HTTP)
- Returns steps as async generator for SSE streaming
- Each step includes: tool name, args, result JSON, and Prefab structuredContent
- `app.py` `/agent/stream` endpoint — accepts prompt + admin key, streams steps via SSE
- Browser receives SSE: updates agent log (left panel) + pushes Prefab card to iframe (right panel)
- Handles parallel tool calls + thought signatures (Gemini 3.x)

### Step 8: Landing page HTML (1 hr) -- DONE
- `mcp/static/index.html` — split layout:
  - Left: admin key input, prompt input, Run button, agent log (SSE consumer)
  - Right: Prefab iframe that grows with each tool result
  - AppBridge setup: connects iframe to `/mcp`, receives structuredContent per tool call
  - All JS from `/js/` (bundled, no CDN)

### Step 9: System prompt update (30 min) -- DONE
- Port from `agent.js`, add FK constraint instructions
- "When generating questions with multiple tables, always include REFERENCES constraints"
- "Include a table_relationships field describing FK relationships"

### Step 10: Dockerfile + deploy (1 hr) -- DONE
- Multi-stage Dockerfile: Python 3.14 + Node 18 (for npm install)
- Stage 1: npm install (bundle JS deps)
- Stage 2: pip install (Python deps)
- Stage 3: production image with uvicorn
- `cloudbuild.mcp.yaml` — builds and deploys `duckdb-ide-mcp` service
- `.github/workflows/deploy-mcp.yml` — triggers on `mcp/**` changes
- Separate Cloud Run service, separate SA, separate secrets

### Step 11: Integration test + demo recording (1 hr) -- IN PROGRESS
- Open `https://duckdb-ide-mcp-xxx.run.app`
- Enter admin key + prompt "Add a question about INNER JOIN"
- Watch: agent log streams steps, Prefab cards appear one by one
- Verify: ER diagram renders for multi-table question
- Click Approve → verify question inserted -- approve/reject/retry buttons not functional yet
- Open `https://duckdb-ide-xxx.run.app` → verify question in dropdown
- Record YouTube demo (~3 min)

## Estimated Total: ~11.5 hours

## Future Enhancements (deferred)
- `search_web(query)` — StackOverflow search (assignment internet requirement)
- `manage_file(action, filename, data)` — local JSON file CRUD (assignment file requirement)
- Direct Cloud SQL connection from Python (bypass Express proxy)
- Merge both services into one (if admin service split happens per issue #43)
