# MCP + Prefab Implementation — Detailed Step-by-Step

Each step = one file or one component change. Steps are ordered by dependency.

---

## Phase 1: Express API Endpoints (existing service)

### Step 1.1: Add tool REST endpoints to admin.js
**File:** `server/routes/admin.js`
**Change:** Add 8 new routes after existing routes. Each wraps one `TOOL_FUNCTIONS` export:
```javascript
router.get('/tools/coverage-gaps', async (req, res) => {
    const result = await TOOL_FUNCTIONS.get_coverage_gaps();
    res.json(result);
});
router.get('/tools/questions', async (req, res) => {
    const result = await TOOL_FUNCTIONS.list_existing_questions();
    res.json(result);
});
router.get('/tools/concepts', async (req, res) => {
    const result = await TOOL_FUNCTIONS.list_concepts();
    res.json(result);
});
router.post('/tools/validate', async (req, res) => {
    const result = await TOOL_FUNCTIONS.validate_question(req.body);
    res.json(result);
});
router.post('/tools/execute-sql', async (req, res) => {
    const result = await TOOL_FUNCTIONS.execute_sql(req.body);
    res.json(result);
});
router.post('/tools/concept-overlap', async (req, res) => {
    const result = await TOOL_FUNCTIONS.check_concept_overlap(req.body);
    res.json(result);
});
router.post('/tools/insert', async (req, res) => {
    const result = await TOOL_FUNCTIONS.insert_question(req.body);
    res.json(result);
});
router.post('/tools/generate-test', async (req, res) => {
    const result = TOOL_FUNCTIONS.generate_test(req.body);
    res.json(result);
});
```
All routes are already behind `adminAuth` middleware (applied via `router.use(adminAuth)` at top of file).
**Effort:** 15 min
**Test:** `curl -H "X-Admin-Key: KEY" https://duckdb-ide-xxx.run.app/api/admin/tools/coverage-gaps`

### Step 1.2: Commit and deploy Express changes
**File:** No new file — git commit + push
**Change:** Commit `admin.js`, push to main, GitHub Actions deploys to Cloud Run
**Effort:** 5 min
**Test:** Verify deploy succeeds via `gh run list`

### Step 1.3: Test all 8 endpoints with curl
**File:** No file — manual verification
**Change:** Run curl for each endpoint, verify JSON responses match expected format from `agentTools.js`
**Effort:** 10 min

---

## Phase 2: MCP Project Skeleton

### Step 2.1: Create directory structure
**File:** `mcp/` directory tree
**Change:** Create empty directories:
```
mcp/
  tools/
  ui/
  static/
    js/
```
**Effort:** 2 min

### Step 2.2: Create requirements.txt
**File:** `mcp/requirements.txt`
**Content:**
```
fastmcp>=3.2.4
prefab-ui>=0.19.1
httpx>=0.27
fastapi>=0.115
uvicorn>=0.35
```
**Effort:** 2 min

### Step 2.3: Create package.json
**File:** `mcp/package.json`
**Content:**
```json
{
  "name": "mcp-static-deps",
  "private": true,
  "dependencies": {
    "@modelcontextprotocol/sdk": "^1.25.0"
  }
}
```
**Effort:** 2 min

### Step 2.4: Create config.py
**File:** `mcp/config.py`
**Content:**
```python
import os

CLOUD_RUN_BASE = os.environ.get("CLOUD_RUN_BASE", "https://duckdb-ide-frxi6yk4jq-uc.a.run.app")
ADMIN_KEY = os.environ.get("ADMIN_KEY", "")
GEMINI_API_KEY = os.environ.get("GEMINI_API_KEY", "")
GEMINI_MODEL = os.environ.get("GEMINI_MODEL", "gemini-2.5-flash")
GEMINI_BASE_URL = "https://generativelanguage.googleapis.com/v1beta/models"
MAX_STEPS = 10
CALL_DELAY_SECONDS = 10
```
**Effort:** 5 min

### Step 2.5: Create tools/__init__.py
**File:** `mcp/tools/__init__.py`
**Content:** Empty file
**Effort:** 1 min

### Step 2.6: Create ui/__init__.py
**File:** `mcp/ui/__init__.py`
**Content:** Empty file
**Effort:** 1 min

---

## Phase 3: API Client (real data from Express)

### Step 3.1: Create api_client.py
**File:** `mcp/tools/api_client.py`
**Content:** HTTP client class that calls the Express REST endpoints:
```python
import httpx
from config import CLOUD_RUN_BASE, ADMIN_KEY

class ApiClient:
    def __init__(self):
        self.base = CLOUD_RUN_BASE
        self.headers = {
            "Content-Type": "application/json",
            "X-Admin-Key": ADMIN_KEY,
        }

    async def get_coverage_gaps(self) -> dict:
        async with httpx.AsyncClient() as client:
            resp = await client.get(
                f"{self.base}/api/admin/tools/coverage-gaps",
                headers=self.headers, timeout=30,
            )
            resp.raise_for_status()
            return resp.json()

    async def list_existing_questions(self) -> dict:
        # same pattern, GET

    async def list_concepts(self) -> dict:
        # same pattern, GET

    async def validate_question(self, sql_data: str, sql_solution: str) -> dict:
        # POST with body

    async def execute_sql(self, sql: str) -> dict:
        # POST with body

    async def check_concept_overlap(self, concepts: list) -> dict:
        # POST with body

    async def insert_question(self, params: dict) -> dict:
        # POST with body

    async def generate_test(self, params: dict) -> dict:
        # POST with body
```
8 methods, each ~5 lines. GET for read-only, POST for mutations.
**Effort:** 30 min
**Test:** `python -c "import asyncio; from tools.api_client import ApiClient; print(asyncio.run(ApiClient().get_coverage_gaps()))"`

---

## Phase 4: ER Diagram Generator

### Step 4.1: Create er_diagram.py
**File:** `mcp/ui/er_diagram.py`
**Content:** Parse CREATE TABLE SQL → Mermaid erDiagram string:
```python
import re

def generate_er_diagram(sql_data: str) -> str | None:
    """Parse SQL schema and generate Mermaid ER diagram.
    Returns None if single table with no foreign keys."""

    # Extract table definitions
    tables = {}  # table_name -> [(col_name, col_type, is_pk, fk_ref)]
    create_pattern = r'CREATE TABLE\s+(\w+)\s*\(([\s\S]+?)\);'
    
    for match in re.finditer(create_pattern, sql_data, re.IGNORECASE):
        table_name = match.group(1)
        columns_str = match.group(2)
        columns = []
        for col_line in columns_str.split(','):
            col_line = col_line.strip()
            # Parse column name, type, PK, FK
            # ...
            columns.append((name, col_type, is_pk, fk_table))
        tables[table_name] = columns

    # Find foreign key relationships
    relationships = []
    for table, cols in tables.items():
        for name, col_type, is_pk, fk_table in cols:
            if fk_table:
                relationships.append((fk_table, table))

    # No FK = no diagram
    if not relationships:
        return None

    # Build Mermaid erDiagram
    lines = ["erDiagram"]
    for parent, child in relationships:
        lines.append(f"    {parent} ||--o{{ {child} : has")
    for table, cols in tables.items():
        lines.append(f"    {table} {{")
        for name, col_type, is_pk, fk_table in cols:
            suffix = " PK" if is_pk else (" FK" if fk_table else "")
            lines.append(f"        {col_type} {name}{suffix}")
        lines.append("    }")

    return "\n".join(lines)
```
**Effort:** 45 min
**Test:** Pass multi-table SQL with FK → verify Mermaid output. Pass single-table SQL → verify returns None.

---

## Phase 5: Prefab UI Components

### Step 5.1: Create components.py — build_coverage_table
**File:** `mcp/ui/components.py`
**Content:** First builder function:
```python
from prefab_ui.components import *

def build_coverage_table(data: dict) -> Column:
    gaps = data.get("gaps_by_category", {})
    total = data.get("total_gaps", 0)
    all_gaps = [g for cat_gaps in gaps.values() for g in cat_gaps]

    with Column(gap=3) as layout:
        H3(f"Coverage Gaps ({total} concepts)")
        with Card():
            with CardContent():
                with Table():
                    with TableHeader():
                        with TableRow():
                            TableHead("Concept")
                            TableHead("Category")
                            TableHead("Difficulty")
                    with TableBody():
                        for gap in all_gaps:
                            with TableRow():
                                TableCell(gap["name"])
                                TableCell(gap.get("category", ""))
                                TableCell(gap["difficulty"])
    return layout
```
**Effort:** 15 min

### Step 5.2: Add build_questions_table to components.py
**File:** `mcp/ui/components.py`
**Content:** Append function for list_existing_questions results:
- Table with id, order_index, category, difficulty, preview
- Badge showing next available order_index
- List of used table names
**Effort:** 15 min

### Step 5.3: Add build_validation_result to components.py
**File:** `mcp/ui/components.py`
**Content:** Append function for validate_question results:
- Green/red badges for: schema_valid, solution_valid, distinguishable
- Row count and column count
- Table collision warning (if any)
- Mermaid ER diagram (calls `er_diagram.generate_er_diagram(sql_data)`)
**Effort:** 20 min

### Step 5.4: Add build_concept_overlap to components.py
**File:** `mcp/ui/components.py`
**Content:** Append function for check_concept_overlap results:
- List of concepts with status badge per concept
- "not_covered" = green, "already_covered" = yellow, "not_in_taxonomy" = red
**Effort:** 10 min

### Step 5.5: Add build_concepts_table to components.py
**File:** `mcp/ui/components.py`
**Content:** Append function for list_concepts results:
- Table with name, category, difficulty, intended_count, alternative_count
**Effort:** 10 min

### Step 5.6: Add build_sql_result to components.py
**File:** `mcp/ui/components.py`
**Content:** Append function for execute_sql results:
- Code block showing the SQL that was executed
- If success: result table (columns + rows)
- If error: red error message
**Effort:** 10 min

### Step 5.7: Add build_question_preview to components.py
**File:** `mcp/ui/components.py`
**Content:** Append function for the final question JSON:
- Difficulty + category badges
- Question text
- Schema code block
- Mermaid ER diagram (if multi-table with FK)
- Solution code block
- Explanation steps
- Concept badges (intended vs alternative)
- Approve & Insert, Reject, Retry buttons
**Effort:** 20 min

### Step 5.8: Add build_insert_result to components.py
**File:** `mcp/ui/components.py`
**Content:** Append function for insert_question results:
- Success card with question ID
- Concepts tagged list
- Generate Playwright Test button
**Effort:** 10 min

### Step 5.9: Add build_test_code to components.py
**File:** `mcp/ui/components.py`
**Content:** Append function for generate_test results:
- Filename badge
- Code block with Playwright test code
**Effort:** 10 min

---

## Phase 6: MCP Server

### Step 6.1: Create mcp_server.py with get_coverage_gaps tool
**File:** `mcp/mcp_server.py`
**Content:** FastMCP server with first tool:
```python
from fastmcp import FastMCP
from prefab_ui.components import *
from tools.api_client import ApiClient
from ui.components import build_coverage_table

mcp = FastMCP("SQL Practice Agent")
api = ApiClient()

@mcp.tool(app=True)
async def get_coverage_gaps() -> Column:
    """Returns SQL concepts with zero intended questions — gaps in the curriculum"""
    data = await api.get_coverage_gaps()
    return build_coverage_table(data)
```
**Effort:** 10 min
**Test:** `PYTHONIOENCODING=utf-8 fastmcp dev apps mcp_server.py --no-reload` → verify tool appears → Launch → verify Prefab renders with real data

### Step 6.2: Add list_existing_questions tool
**File:** `mcp/mcp_server.py`
**Content:** Add second tool, same pattern: call API → build Prefab → return Column
**Effort:** 5 min

### Step 6.3: Add validate_question tool
**File:** `mcp/mcp_server.py`
**Content:** Add tool with `sql_data: str` and `sql_solution: str` params. Calls API, builds validation checklist + ER diagram.
**Effort:** 10 min

### Step 6.4: Add check_concept_overlap tool
**File:** `mcp/mcp_server.py`
**Content:** Add tool with `concepts: list[str]` param.
**Effort:** 5 min

### Step 6.5: Add list_concepts tool
**File:** `mcp/mcp_server.py`
**Content:** Add tool, no params.
**Effort:** 5 min

### Step 6.6: Add execute_sql tool
**File:** `mcp/mcp_server.py`
**Content:** Add tool with `sql: str` param.
**Effort:** 5 min

### Step 6.7: Add insert_question tool
**File:** `mcp/mcp_server.py`
**Content:** Add tool with full question params (sql_data, sql_question, sql_solution, etc.).
**Effort:** 5 min

### Step 6.8: Add generate_test tool
**File:** `mcp/mcp_server.py`
**Content:** Add tool with question_id, sql_solution, question_text params.
**Effort:** 5 min

---

## Phase 7: Agent Harness

### Step 7.1: Create agent_harness.py — Gemini API caller
**File:** `mcp/agent_harness.py`
**Content:** Core agent loop adapted from `c:\tmp\test_gemini.py`:
- System prompt (ported from `agent.js` + FK constraint instructions)
- Tool declarations (derived from MCP tool schemas)
- `call_gemini(url, headers, messages)` function
- `run_agent(prompt, admin_key)` async generator that yields steps
- Each step: `{ type, tool, input, result, prefab_content }`
- Parallel tool call support (filter all functionCall parts, dispatch all)
- Thought signature preservation (append full parts as-is)
- 10-second delay between Gemini calls
**Effort:** 1.5 hr

### Step 7.2: Add MCP tool dispatch to agent_harness.py
**File:** `mcp/agent_harness.py`
**Content:** Instead of mock responses, import and call MCP tool functions directly:
```python
from mcp_server import mcp

# Get tool function by name
tool_fn = None
for tool in mcp._tool_manager._tools.values():
    if tool.name == name:
        tool_fn = tool.fn
        break

result = await tool_fn(**args)
```
Each call returns a Prefab `Column` (for the UI) plus the underlying API data (for Gemini).
**Effort:** 30 min

---

## Phase 8: FastAPI Web App

### Step 8.1: Create app.py — basic structure
**File:** `mcp/app.py`
**Content:** FastAPI app with health check and static file serving:
```python
from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles
from fastapi.responses import HTMLResponse, FileResponse

app = FastAPI(title="SQL Practice MCP Agent")

app.mount("/js", StaticFiles(directory="static/js"), name="js")

@app.get("/health")
async def health():
    return {"status": "ok"}

@app.get("/")
async def index():
    return FileResponse("static/index.html")
```
**Effort:** 15 min

### Step 8.2: Add MCP endpoint to app.py
**File:** `mcp/app.py`
**Content:** Mount FastMCP as ASGI sub-app:
```python
from mcp_server import mcp

app.mount("/mcp", mcp.http_app(transport="streamable-http"))
```
**Effort:** 10 min

### Step 8.3: Add /ui-resource endpoint to app.py
**File:** `mcp/app.py`
**Content:** Serve Prefab renderer HTML from the `prefab-ui` Python package:
```python
import prefab_ui
import pathlib

PREFAB_DIR = pathlib.Path(prefab_ui.__file__).parent

@app.get("/ui-resource")
async def ui_resource(uri: str):
    # Map uri to file path in prefab_ui package
    # Return the renderer HTML/JS
```
**Effort:** 20 min

### Step 8.4: Add /agent/stream SSE endpoint to app.py
**File:** `mcp/app.py`
**Content:** SSE endpoint that runs the agent loop:
```python
from fastapi.responses import StreamingResponse
from agent_harness import run_agent

@app.post("/agent/stream")
async def agent_stream(request: dict):
    prompt = request["prompt"]
    admin_key = request["admin_key"]

    async def event_generator():
        async for step in run_agent(prompt, admin_key):
            yield f"data: {json.dumps(step)}\n\n"

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={"X-Accel-Buffering": "no"},
    )
```
**Effort:** 20 min

---

## Phase 9: Bundle JS Dependencies

### Step 9.1: npm install and extract bundles
**File:** `mcp/static/js/` (multiple JS files)
**Change:** Run `cd mcp && npm install`, then copy the required browser-compatible bundles from `node_modules/` to `static/js/`. The MCP SDK and AppBridge need to be browser-importable (ESM format).
**Effort:** 20 min

### Step 9.2: Locate and copy Prefab renderer files
**File:** `mcp/static/js/` or served dynamically via `/ui-resource`
**Change:** Find the Prefab renderer HTML/JS inside the `prefab-ui` Python package directory. Copy or serve it so the iframe can load it from same origin.
**Effort:** 10 min

---

## Phase 10: Landing Page

### Step 10.1: Create index.html — layout structure
**File:** `mcp/static/index.html`
**Content:** Split layout HTML:
```html
<div id="controls">
    <input type="password" id="adminKey" placeholder="Admin Key">
    <input type="text" id="prompt" placeholder="Add a question about...">
    <button id="runBtn">Run Agent</button>
</div>
<div id="content">
    <div id="agentLog"><!-- SSE steps appear here --></div>
    <iframe id="prefabFrame" src=""></iframe>
</div>
```
Basic CSS for split layout (left: agent log, right: Prefab iframe).
**Effort:** 20 min

### Step 10.2: Add SSE consumer to index.html
**File:** `mcp/static/index.html`
**Content:** JavaScript that:
- On "Run Agent" click: POST to `/agent/stream` with admin_key + prompt
- Read SSE stream via fetch + ReadableStream (same pattern as existing agent-panel.js)
- For each step: append tool call/result summary to `#agentLog`
**Effort:** 20 min

### Step 10.3: Add AppBridge + Prefab iframe integration to index.html
**File:** `mcp/static/index.html`
**Content:** JavaScript that:
- Creates MCP client connected to `/mcp` (same origin)
- Sets up AppBridge with the Prefab iframe
- For each SSE step that contains structuredContent: sends it to iframe via AppBridge
- Iframe renders Prefab cards incrementally (one per tool call)
**Effort:** 30 min

---

## Phase 11: System Prompt

### Step 11.1: Create system prompt in agent_harness.py
**File:** `mcp/agent_harness.py` (update)
**Content:** Port system prompt from `server/services/agent.js` lines 134-181. Add:
```
RULES (additions):
- When generating questions with multiple tables, ALWAYS include 
  REFERENCES constraints for foreign keys
- Include table_relationships in concepts array describing FK relationships
```
Updated workflow remains the same 9-step process.
**Effort:** 15 min

---

## Phase 12: Docker + Deploy

### Step 12.1: Create Dockerfile
**File:** `mcp/Dockerfile`
**Content:**
```dockerfile
# Stage 1: JS dependencies
FROM node:18-alpine AS js-deps
WORKDIR /app
COPY package.json ./
RUN npm install

# Stage 2: Python dependencies
FROM python:3.14-slim AS py-deps
WORKDIR /app
COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

# Stage 3: Production
FROM python:3.14-slim
WORKDIR /app
RUN pip install --no-cache-dir uvicorn
COPY --from=py-deps /usr/local/lib/python3.14/site-packages /usr/local/lib/python3.14/site-packages
COPY --from=js-deps /app/node_modules ./node_modules
COPY . .
# Copy JS bundles to static
RUN cp -r node_modules/@modelcontextprotocol/sdk/dist static/js/mcp-sdk || true
ENV PORT=8080
ENV PYTHONIOENCODING=utf-8
EXPOSE 8080
CMD ["uvicorn", "app:app", "--host", "0.0.0.0", "--port", "8080"]
```
**Effort:** 30 min

### Step 12.2: Create cloudbuild.mcp.yaml
**File:** `mcp/cloudbuild.mcp.yaml`
**Content:** Cloud Build config for the new service:
- Build Docker image from `mcp/` directory
- Push to Artifact Registry
- Deploy to Cloud Run as `duckdb-ide-mcp`
- Set env vars: CLOUD_RUN_BASE, GEMINI_MODEL
- Set secrets: ADMIN_KEY=admin-secret, GEMINI_API_KEY=gemini-api-key
- Service account: new `sql-practice-runtime-mcp` SA (or reuse existing)
**Effort:** 15 min

### Step 12.3: Create deploy-mcp.yml GitHub Actions workflow
**File:** `.github/workflows/deploy-mcp.yml`
**Content:** Triggers on push to main with path `mcp/**`. Same WIF auth pattern as existing deploy.yml.
**Effort:** 15 min

### Step 12.4: Deploy and verify
**File:** No file — deployment
**Change:** Push to main, verify GitHub Action runs, verify Cloud Run service comes up.
**Test:** Open `https://duckdb-ide-mcp-xxx.run.app/health` → `{"status": "ok"}`
**Effort:** 15 min

---

## Phase 13: Integration Test + Demo

### Step 13.1: Test full agent flow
**File:** No file — manual test
**Steps:**
1. Open `https://duckdb-ide-mcp-xxx.run.app`
2. Enter admin key + prompt "Add a question about INNER JOIN"
3. Click Run Agent
4. Verify: agent log shows each tool call
5. Verify: Prefab iframe shows cards for each tool result
6. Verify: ER diagram renders for multi-table question
7. Verify: question preview card has Approve/Reject buttons
8. Click Approve → verify question inserted
9. Open `https://duckdb-ide-xxx.run.app` → verify question in dropdown
**Effort:** 30 min

### Step 13.2: Record YouTube demo
**File:** Output: YouTube video
**Steps:** Screen record the full flow from Step 13.1 with narration. ~3 minutes.
**Effort:** 30 min

---

## Summary

| Phase | Steps | Total Effort |
|-------|-------|-------------|
| 1. Express endpoints | 1.1-1.3 | 30 min |
| 2. Project skeleton | 2.1-2.6 | 13 min |
| 3. API client | 3.1 | 30 min |
| 4. ER diagram | 4.1 | 45 min |
| 5. Prefab components | 5.1-5.9 | 2 hr |
| 6. MCP server | 6.1-6.8 | 50 min |
| 7. Agent harness | 7.1-7.2 | 2 hr |
| 8. FastAPI app | 8.1-8.4 | 65 min |
| 9. Bundle JS | 9.1-9.2 | 30 min |
| 10. Landing page | 10.1-10.3 | 70 min |
| 11. System prompt | 11.1 | 15 min |
| 12. Docker + deploy | 12.1-12.4 | 75 min |
| 13. Test + demo | 13.1-13.2 | 60 min |
| **TOTAL** | **39 steps** | **~12 hours** |
