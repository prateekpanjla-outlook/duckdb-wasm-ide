# Architectural Analysis — SQL Practice Platform

Deep analysis of intent, architecture, design patterns, and implementation. Generated 2026-05-16 by reading all source code and documentation.

---

## 1. Intent

A browser-based SQL learning platform where students practice SQL against real data. The core innovation: **queries run entirely in the browser** via DuckDB WebAssembly — no server-side SQL execution for grading. A PostgreSQL backend tracks user progress, and an AI agent generates new questions autonomously.

### Who uses it

| Role | Actions |
|------|---------|
| **Student** | Select question → write SQL → run → submit → get feedback → ask AI for hints |
| **Guest** | Same as student, no registration, 24h JWT, upgradeable to registered |
| **Admin** | Use AI agent to generate questions → review → approve → insert |

### Core constraint

The student's SQL runs in DuckDB WASM (in-browser). The solution SQL also runs in DuckDB WASM. Grading is client-side — the browser compares the two result sets. This means:
- Zero server load per query
- No dialect mismatch (both use the same engine)
- No server-side SQL execution surface for injection
- But: client-side grading is tamper-able (acceptable for a learning tool)

---

## 2. Architecture — Three Cloud Run Services

```
┌─────────────────────────────────────────────────────────────────────┐
│  duckdb-ide (Express + Node.js)                                    │
│  Port 8080 | Cloud Run                                             │
│                                                                     │
│  Serves: index.html, JS, CSS, DuckDB WASM, CodeMirror, Mermaid    │
│  API:    /api/auth, /api/practice, /api/ai, /api/admin             │
│  DB:     PostgreSQL 16 via Cloud SQL Auth Proxy (Unix socket)      │
│                                                                     │
│  Purpose: Student app + admin API + static files                   │
└─────────────────────────────────────────────────────────────────────┘
         │ HTTP (admin tool calls from MCP services)
         ▼
┌─────────────────────────────────────────────────────────────────────┐
│  duckdb-ide-mcp (Python/FastMCP + Prefab UI)                       │
│  Port 8080 | Cloud Run                                             │
│                                                                     │
│  v1: / — basic agent with Prefab structured UI                     │
│  v2: /v2 — ReACT reasoning framework (THINK/VERIFY/FALLBACK/ACT)  │
│  9 tools: 8 data + render_dashboard (UI-only)                      │
│  Gemini 2.5 Flash, in-memory MCP client, SSE streaming             │
│                                                                     │
│  Purpose: Question authoring agent with structured Prefab rendering│
└─────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────┐
│  duckdb-ide-genui (Python/FastMCP + Pyodide WASM)                  │
│  Port 8080 | Cloud Run                                             │
│                                                                     │
│  v3: Generative UI — Gemini writes Python Prefab code at runtime   │
│  Pyodide renders in browser iframe (25MB WASM)                     │
│  Option C: append-only script + sendToolInputPartial streaming     │
│  Approve & Insert button for one-click question insertion          │
│  10 tools: 8 data + generate_prefab_ui + search_prefab_components  │
│                                                                     │
│  Purpose: Experimental generative UI agent                         │
└─────────────────────────────────────────────────────────────────────┘
```

### Why three services?

- **Separation of concerns**: Student app is stable; agent experimentation shouldn't break it
- **Different runtimes**: Express/Node.js vs Python/FastMCP — can't share a process
- **Independent scaling**: Student app gets traffic; agent is admin-only, bursty
- **Independent deployment**: MCP changes don't redeploy the student app
- **v3 isolation**: Pyodide adds 25MB to the image — shouldn't burden v1/v2

---

## 3. Design Patterns

### 3.1 Client-Side Query Execution

```
Browser: DuckDB WASM (EH bundle, ~33MB)
  → Student types SQL
  → DuckDB executes both student query AND solution query
  → JS compares result sets (order-independent)
  → Sends boolean isCorrect to server
  → Server trusts it (acceptable for learning platform)
```

**Pattern**: Thick client, thin server. The server never sees or executes SQL. This is the foundational design decision.

**Trade-off**: Client-side grading is tamperable. Mitigated by: (1) learning platform, not exam, (2) anti-cheat tasks deferred until leaderboards added, (3) server-side verification possible as future enhancement.

### 3.2 Dual Content Pattern (MCP Services)

Every MCP tool returns two things:
```python
def _dual(data: dict, column: Column) -> ToolResult:
    return ToolResult(
        content=[TextContent(type="text", text=json.dumps(data))],  # For LLM
        structured_content=column,                                    # For browser
    )
```

- **TextContent (JSON)**: Fed back to Gemini for reasoning — the LLM sees data
- **structured_content (Prefab Column)**: Rendered in browser iframe — the admin sees UI

**In v3 (GenUI)**: The dual pattern is replaced by pass-through. `generate_prefab_ui` returns `"[Rendered Prefab UI]"` — the LLM writes the UI code itself.

### 3.3 HTTP Proxy Pattern

MCP tools don't directly access PostgreSQL. They proxy HTTP calls to the Express API:

```
MCP tool → api_client.py → HTTP POST → Express /api/admin/tools/* → PostgreSQL
```

**Why**: The Express service owns the database schema, validation, and business logic. MCP is a presentation layer, not a data layer. This means:
- MCP can be deleted without losing data access
- Express API is the single source of truth for data operations
- No shared database connection between services

### 3.4 Agent Loop with Gemini Function Calling

All three agent versions (Express v0, MCP v1/v2, GenUI v3) follow the same pattern:

```
1. Discover tools (MCP list_tools or hardcoded declarations)
2. Send system prompt + user request to Gemini
3. Gemini returns: TEXT (reasoning) + functionCall(s)
4. Execute tool via MCP or direct function call
5. Feed result back to Gemini
6. Repeat until text-only response or max steps
```

**Evolution**:
- v0 (Express agent.js): Direct JS function calls, basic prompt, SSE to admin panel
- v1 (MCP): Same loop but tools discovered via MCP protocol, Prefab UI rendering
- v2 (MCP + ReACT): Added [THINK]/[VERIFY]/[FALLBACK]/[ACT] labels, reasoning cards
- v3 (GenUI): LLM writes UI code, Pyodide renders in browser, Approve button

### 3.5 Zero CDN Architecture

All assets served from the same origin. No external CDN for:
- DuckDB WASM (vendored in `libs/duckdb-wasm/`)
- CodeMirror (vendored in `libs/codemirror/`)
- Mermaid.js (vendored in `libs/mermaid/`)
- MCP SDK bundle (esbuild'd into `static/js/sdk-bundle.js`)
- AppBridge (patched at build time to replace esm.sh URLs)
- Pyodide (downloaded at Docker build time into `static/pyodide/`)
- Pydantic wheels (pre-downloaded for Pyodide)

**Why**: Predictable loading, no third-party outages, COEP `require-corp` compliance, works in restricted networks.

### 3.6 Progressive Enhancement for Auth

```
Landing page → Guest button (instant, no form) → Full access with 24h JWT
                         or
              → Login/Register (email + password) → Full access with 7d JWT
                         ↓
              Guest can upgrade → same user_id, progress preserved
```

**Pattern**: Reduce friction to zero — guest access is one click. Registration is optional. Progress is tracked regardless.

---

## 4. Data Model

```
users (id, email, password_hash, is_guest, created_at, last_login)
  ├── user_sessions (user_id PK, current_question_id, practice_mode_active)
  ├── user_attempts (user_id, question_id, user_query, is_correct, attempts_count, time_taken_seconds)
  └── ai_usage (user_id, question_id, type, input_tokens, output_tokens, cached)

questions (id, sql_data, sql_question, sql_solution, sql_solution_explanation, difficulty, category, order_index, er_diagram)
  └── question_concepts (question_id, concept_id, is_intended)

sql_concepts (id, name, category, difficulty)  — 38 concepts seeded
```

**Key relationships**:
- `question_concepts.is_intended` distinguishes primary concepts from alternative-solution concepts
- `user_attempts.attempts_count` uses row-level locking (`SELECT FOR UPDATE`) to prevent race conditions
- `user_sessions` is single-row-per-user for practice state tracking
- All FKs have `ON DELETE CASCADE` for clean user/question deletion

---

## 5. Deployment Pipeline

```
Developer pushes to main
  → GitHub Actions (Workload Identity Federation — no SA keys)
  → gcloud builds submit (Cloud Build)
  → Docker multi-stage build → Artifact Registry
  → gcloud run deploy → Cloud Run

Three separate workflows:
  deploy.yml          → triggers on /** changes → duckdb-ide
  deploy-mcp.yml      → triggers on mcp/** changes → duckdb-ide-mcp
  deploy-mcp-genui.yml → triggers on mcp-genui/** changes → duckdb-ide-genui
```

**Infrastructure as Code**: 35 Terraform-managed resources (APIs, Artifact Registry, Cloud SQL, Cloud Run, IAM, secrets).

---

## 6. Strengths

1. **Client-side execution is the right call** for a learning tool — eliminates an entire class of server-side SQL security concerns and scales to zero server cost per query.

2. **Progressive auth** (guest → registered) removes the biggest barrier to engagement. Students start practicing in one click.

3. **Concept taxonomy** (38 concepts with intended/alternative tagging) enables intelligent gap detection. The agent doesn't generate random questions — it fills curriculum holes.

4. **Three-service separation** allows independent experimentation. v3 GenUI can break completely without affecting the student app.

5. **Zero CDN** means the app works in any network environment and COEP compliance is straightforward.

6. **Self-seeding database** — tables, indexes, seed data, and concept taxonomy all created on first startup. No manual migration scripts.

7. **Dual content pattern** gives the LLM clean JSON for reasoning while the admin sees rich UI. Each tool serves both audiences.

---

## 7. Weaknesses & Risks

### Architectural

1. **Three task trackers** (GitHub Issues, Vikunja, pending_tasks.md) — split brain, no single source of truth. 47 open tasks diverge across systems.

2. **Code duplication across agent versions** — mcp/, mcp/v2/, mcp-genui/ each have their own api_client.py, components.py, er_diagram.py, config.py. Changes to the Express API require updating 3+ copies.

3. **Client-side grading trust** — the server blindly trusts `isCorrect` from the browser. A student can POST `isCorrect: true` without running the query. Acceptable now but blocks gamification/leaderboards.

4. **No staging environment** — all three services deploy directly to production on push to main. No branch protection, no PR reviews required.

5. **Single-developer bus factor** — all code, infrastructure, and domain knowledge in one person.

### Implementation

6. **Gemini code quality variance** — the LLM generates Prefab Python code with ~10% error rate (wrong component patterns, hardcoded values instead of data parameters, keyword args on positional-only components). Mitigated by prompt engineering but not eliminated.

7. **SSE connection fragility** — long-running agent sessions (~3 min) are vulnerable to connection drops. Mitigated by closing MCP SSE after init, but `/agent/stream` itself can still drop.

8. **Pyodide first-load cost** — 25MB download + 2-5 second initialization. Cached after first visit but poor first impression.

9. **No retry/resume for agent sessions** — if the SSE drops mid-agent-run, the server-side agent continues to completion but the browser loses all remaining events. No way to reconnect and catch up.

10. **CALL_DELAY_SECONDS = 10** between Gemini calls was a rate-limit workaround. With a paid tier it could be reduced, cutting agent run time from ~3 min to ~1 min.

---

## 8. Evolution Path

```
Session 3: Express agent (agent.js) — 8 tools, direct function calls
     ↓
Session 4: MCP v1 (mcp/) — same 8+1 tools via MCP protocol, Prefab UI
     ↓
Session 5: MCP v2 (mcp/v2/) — ReACT reasoning, [THINK]/[VERIFY] labels
     ↓
Session 6: GenUI v3 (mcp-genui/) — LLM writes UI code, Pyodide renders
     ↓
Planned:   Reactive state, Approve button in-iframe, strategy selector
```

Each iteration preserved the core tool set and Express API while adding a new presentation/reasoning layer. The Express backend has been stable since Session 3.

---

## 9. File Organization

```
duckdb-wasm-ide/
├── index.html                    # SPA entry point
├── js/                           # Frontend ES modules (no bundler)
│   ├── app.js                    # App orchestrator
│   ├── duckdb-manager.js         # DuckDB WASM lifecycle
│   ├── query-editor.js           # CodeMirror wrapper
│   ├── results-view.js           # Query results rendering
│   └── services/                 # Feature modules
│       ├── api-client.js         # HTTP client to Express
│       ├── auth-manager.js       # JWT auth + guest
│       ├── practice-manager.js   # Question flow + grading
│       ├── agent-panel.js        # Admin agent UI
│       └── question*.js          # Question selector/list
├── css/style.css                 # Single stylesheet
├── libs/                         # Vendored dependencies (zero CDN)
│   ├── duckdb-wasm/              # DuckDB WASM bundles (~33MB)
│   ├── codemirror/               # CodeMirror 5
│   └── mermaid/                  # Mermaid.js for ER diagrams
├── server/                       # Express backend
│   ├── server.js                 # Express app + ensureTables()
│   ├── config/database.js        # PostgreSQL pool
│   ├── middleware/                # auth.js, validate.js
│   ├── models/                   # User, Question, UserAttempt, UserSession
│   ├── routes/                   # auth, practice, ai, admin
│   ├── services/                 # agent.js, agentTools.js, gemini.js, promptBuilder.js
│   └── seed/                     # seedData.js, seedConcepts.js, seedQuestions.js
├── mcp/                          # MCP v1 + v2 agent service
│   ├── app.py                    # FastAPI: /, /v2, /agent/stream, /agent/v2/stream
│   ├── mcp_server.py             # v1: 9 MCP tools
│   ├── agent_harness.py          # v1: Gemini agent loop
│   ├── v2/                       # v2: ReACT reasoning variant
│   ├── tools/api_client.py       # HTTP proxy to Express
│   ├── ui/components.py          # Prefab UI builders
│   └── Dockerfile                # 3-stage: JS deps → Python deps → production
├── mcp-genui/                    # v3 Generative UI agent service
│   ├── app.py                    # FastAPI: /, /agent/stream, /agent/insert
│   ├── mcp_server.py             # 10+1 tools (pass-through generate_prefab_ui)
│   ├── agent_harness.py          # Gemini + 5-section system prompt
│   ├── tools/api_client.py       # HTTP proxy to Express
│   ├── ui/components.py          # Prefab UI builders
│   └── Dockerfile                # 4-stage: JS → Pyodide download → Python → production
├── infra/terraform/              # 35 GCP resources (IaC)
├── tests/e2e/                    # Playwright tests (6 spec files)
├── .github/workflows/            # 4 workflows: ci, deploy, deploy-mcp, deploy-mcp-genui
├── docs/                         # 20+ architecture/design documents
└── Dockerfile                    # Main app: 3-stage Node.js build
```

---

## 10. Metrics

| Metric | Value |
|--------|-------|
| Cloud Run services | 3 |
| Express API endpoints | 30 |
| MCP tools (per service) | 9-11 |
| Database tables | 7 |
| SQL concepts | 38 |
| Practice questions | 11 (+ agent-generated) |
| Frontend JS modules | 11 |
| E2E test files | 6 |
| Terraform resources | 35 |
| Documentation files | 31 |
| Open tasks | 47 |
| Monthly cost | ~$9 (Cloud SQL is the only paid resource) |
