# EAG V3 — What I Need to Learn (Sessions 6–19)

Mapped to the SQL Practice Platform. For each session: what the curriculum covers, what I already have, and what I need to learn/build.

---

## Session 6: Cognitive Architecture & Adaptive Planning

**What it covers:** 4-layer cognitive pipeline (Perception → Memory → Decision → Action), strategy profiles (Conservative/Exploratory/Fallback), adaptive retry, Pydantic typed data flow.

**What I already have:**
- Perception: Agent receives admin prompt + tool results
- Decision: `[THINK]` + `[REASON_TYPE]` (7 categories) in v2/v3 prompts
- Action: 8 tool calls via MCP
- Retry: MALFORMED_FUNCTION_CALL retry (up to 2), `[FALLBACK]` label
- Pydantic: FastMCP uses Pydantic for tool parameter validation

**What I need to learn:**
- **Strategy profiles** — Currently the agent always follows the same workflow. I need to add a strategy selector (Conservative: simple single-table questions; Exploratory: complex multi-table with advanced concepts; Fallback: retry with simpler approach if validation fails). The UI already has a prompt input — add a dropdown for strategy.
- **Pydantic between pipeline layers** — My agent passes raw dicts between steps. I should define Pydantic models for `QuestionDraft`, `ValidationResult`, `CoverageGaps` so type errors are caught before Gemini sees them.
- **Agent-written plans** — Instead of the LLM calling tools one-by-one in a loop (which is what our agent does now), the LLM generates an entire executable plan as code. For our platform, Gemini would output:
  ```python
  def solve(tools):
      gaps = tools.get_coverage_gaps()
      questions = tools.list_existing_questions()
      concept = pick_best_gap(gaps, "LEFT JOIN")
      draft = generate_question(concept, questions.used_table_names)
      result = tools.validate_question(draft.sql_data, draft.sql_solution)
      if not result.schema_valid:
          draft = simplify_schema(draft)
          result = tools.validate_question(draft.sql_data, draft.sql_solution)
      return draft
  ```
  The agent harness then executes this plan step by step. The advantage: the LLM plans everything upfront in one call instead of deciding at each step, reducing total LLM calls from ~15 to ~3 (plan + execute + refine). The risk: the plan may be wrong and need replanning.

---

## Session 7: Memory Systems & Modern RAG

**What it covers:** 3-tier memory (preferences, episodic, factual), hybrid retrieval (semantic + BM25), embedding models, semantic chunking, document processing.

**What I already have:**
- No persistent memory — each agent session starts fresh
- Conversation context within a session (Gemini accumulates tool results)
- PostgreSQL stores questions, attempts, concepts — but the agent doesn't read past attempts

**What I need to learn:**
- **Preference memory** — Remember admin's style preferences (e.g., "always include ER diagrams", "prefer intermediate difficulty"). Store in a simple key-value table or JSON file. Inject into system prompt.
- **Episodic memory** — Remember past agent sessions ("last time you asked about LEFT JOIN, I generated question 12 with clients/purchases tables"). Store session summaries in PostgreSQL. Retrieve relevant ones for new sessions.
- **Factual memory / RAG** — If the concept taxonomy grows or external SQL documentation is added, I'd need retrieval. Currently 38 concepts fit in the prompt. At 200+ concepts, I'd need embedding search.
- **Embedding models** — These convert text into numerical vectors (arrays of ~768 floats) where similar text has similar vectors. Used to find "related" content without keyword matching. Options for our platform:
  - **Gemini Embedding API** (`text-embedding-004`): Cloud-hosted, 768 dimensions, free tier. Send "LEFT JOIN" → get a vector → find similar concepts in our taxonomy by cosine similarity.
  - **Nomic Embed** (local via Ollama): Runs on your machine, no API cost, 768 dimensions. Good for development.
  - **When we'd need this**: Currently 38 concepts fit in the system prompt. If we grow to 200+ concepts or add SQL documentation, we'd embed all documents, store vectors in PostgreSQL (pgvector extension), and retrieve only relevant ones per query.
  - **Hybrid retrieval**: Combine embedding search (semantic: "find concepts about combining tables") with BM25 (keyword: "LEFT JOIN") using Reciprocal Rank Fusion (RRF) to get the best of both.

- **Memory implementation — same or separate PostgreSQL?**
  Use the **same PostgreSQL instance** (Cloud SQL). Reasons:
  - We already pay for it (~$9/month) — adding tables is free
  - Memory queries are simple key-value lookups, not heavy analytics
  - No need for a separate vector DB at our scale (pgvector extension handles embeddings in PostgreSQL)
  - Keeps ops simple — one connection string, one backup, one monitoring point
  
  Add these tables to `ensureTables()`:
  ```sql
  -- Admin preferences (key-value)
  CREATE TABLE agent_preferences (key VARCHAR PRIMARY KEY, value JSONB, updated_at TIMESTAMP);
  
  -- Past agent sessions (episodic memory)
  CREATE TABLE agent_sessions (id SERIAL, prompt TEXT, summary TEXT, question_id INT, created_at TIMESTAMP);
  
  -- Embeddings for RAG (only if needed later)
  -- Requires: CREATE EXTENSION vector;
  -- CREATE TABLE doc_embeddings (id SERIAL, content TEXT, embedding vector(768));
  ```
  
  Separate DB only makes sense if: (1) you need a specialized vector DB like Pinecone/Weaviate for millions of documents, or (2) memory access patterns are very different from app queries (e.g., real-time streaming). Neither applies to us.

- **What is Trafilatura?**
  A Python library for extracting clean text content from web pages. It strips navigation, ads, footers, and boilerplate — returning just the article/documentation text. For our platform:
  ```python
  import trafilatura
  html = trafilatura.fetch_url("https://duckdb.org/docs/sql/query_syntax/having")
  text = trafilatura.extract(html)  # Returns clean markdown-like text
  ```
  Useful if the agent researches SQL concepts before generating questions. Alternative to BeautifulSoup (which requires manual selector writing) or Readability.js (JavaScript). Trafilatura is the most accurate for article extraction.

---

## Session 8: Multi-Agent Systems & DAG Architecture

**What it covers:** Multiple agents coordinating via directed acyclic graphs, parallel execution, shared session state (blackboard), fallback strategies.

**What I already have:**
- Single agent with sequential tool calls
- No parallelism (Gemini sometimes returns parallel function calls, but they execute sequentially)
- No agent-to-agent communication

**What I need to learn:**
- **Multi-agent decomposition** — Instead of one agent doing everything, split into: SchemaAgent (generates tables), ValidatorAgent (tests SQL), ReviewerAgent (checks quality). Each is a specialized prompt + tool subset.
- **DAG execution** — Use NetworkX to define: `coverage_gaps → schema_design → validation → review → preview`. Agents at the same depth level can run in parallel.
- **Shared state (blackboard)** — All agents read/write to a shared `QuestionDraft` object. Each agent enriches it: SchemaAgent adds `sql_data`, ValidatorAgent adds `is_valid`, ReviewerAgent adds `review_score`.
- **Fallback nodes** — If ValidationAgent fails 3 times, route to a FallbackSchemaAgent that generates simpler tables.

---

## Session 9: Browser Agents & Autonomous Web

**What it covers:** Playwright browser automation, vision-capable navigation, multi-source research, autonomous form filling.

**What I already have:**
- Playwright for E2E testing (6 spec files)
- The student app itself is a web target
- No browser-based research or autonomous web interaction in the agent

**What I need to learn:**
- **Research agent** — Before generating a question about DENSE_RANK, the agent could search SQL documentation sites for examples, edge cases, common mistakes. Use Playwright headless + Trafilatura to extract content.
- **Vision-capable browsing** — Take screenshots of SQL documentation pages, send to Gemini as images for understanding. Useful for complex topics where text extraction loses formatting.
- **Autonomous testing** — The agent could Playwright-test its own generated question: load the student app, paste the sql_data, run the solution, verify the result renders correctly.

---

## Session 10: Computer Use & Desktop Agents

**What it covers:** Screen understanding with VLMs, accessibility trees, OS-level automation, cross-platform desktop control.

**What I already have:**
- Nothing — my app is entirely web-based, no desktop interaction

**What I need to learn:**
- **What to test on Windows desktop without Playwright?** Playwright automates browsers. For desktop app testing, you need different tools:
  - **Anthropic Computer Use API** — Send a screenshot to Claude, it returns coordinates to click. Works with any app visible on screen.
  - **pyautogui** — Python library for mouse/keyboard automation. `pyautogui.click(x, y)`, `pyautogui.typewrite("SELECT *")`. Simple but no understanding — just coordinates.
  - **Windows UI Automation (UIA)** — Microsoft's accessibility API. Reads the UI tree (buttons, text fields, menus) programmatically. Like Playwright selectors but for native Windows apps.
  - **For our platform**: Test the genui agent by taking screenshots at each step, sending to Gemini Vision asking "is the coverage gaps table rendering correctly?", "does the Approve button appear?". This is **visual regression testing** without Playwright selectors.
  - What you need: `pip install pyautogui Pillow`, Gemini Vision API access, and a screen capture function. No Playwright, no browser automation — works on any Windows application.
- **UI element detection** — YOLO/ONNX model detects buttons, text fields, menus in a screenshot without accessibility tree access. Useful when the app doesn't expose accessibility info (e.g., Electron apps, games, custom UIs).

---

## Session 11: Channel Architecture, Voice & Gateway

**What it covers:** Connect agents to WhatsApp, Slack, Discord, voice. Unified adapter pattern. Gateway architecture.

**What I already have:**
- Web-only interface (browser landing page for each agent version)
- SSE streaming for real-time updates
- No external channel integration

**What I need to learn:**
- **Channel adapter pattern — what architectural changes needed?**
  Currently the agent is tightly coupled to the web UI:
  ```
  Browser → POST /agent/stream → SSE events → JS renders in HTML
  ```
  To enable channels, extract the agent core from the HTTP layer:
  ```python
  # Current: agent_harness.py yields SSE dicts
  async for step in run_agent(prompt):
      yield f"data: {json.dumps(step)}\n\n"
  
  # Refactored: agent core returns structured events
  class AgentEvent:
      type: str  # "tool_call", "tool_result", "reasoning", "done"
      data: dict
  
  # Each channel adapter formats events differently:
  class WebAdapter:     # SSE → browser JS
  class SlackAdapter:   # Block Kit JSON → Slack API
  class DiscordAdapter: # Embed → Discord webhook
  class APIAdapter:     # JSON → REST response
  ```
  The key change: `run_agent()` stays the same, but the **output formatting** is separated into adapter classes. The web adapter is what we have now. A Slack adapter would format tool results as Slack Block Kit messages. Each adapter handles its channel's auth, message format, and delivery mechanism independently.

- **Gateway architecture** — A single entry point (e.g., `/gateway/invoke`) that accepts `{channel: "slack", prompt: "Add a HAVING question", auth: "..."}`, routes to the right adapter, and manages session state across channels.
- **Voice** — Not directly useful for SQL practice, but the STT/TTS pipeline is a transferable skill.

---

## Session 12: Error Correction, Safety & Container Isolation

**What it covers:** JSON repair, code variant resilience, circuit breakers, Docker sandboxing, cost management.

**What I already have:**
- MALFORMED_FUNCTION_CALL retry (up to 2 attempts)
- `[FALLBACK]` reasoning label for error recovery
- Docker deployment (but no sandbox isolation for agent code)
- No cost tracking or budget controls

**What I need to learn:**
- **Circuit breaker — what is HALF_OPEN?**
  A circuit breaker has 3 states, borrowed from electrical engineering:
  ```
  CLOSED (normal) → errors exceed threshold → OPEN (all calls rejected)
       ↑                                           │
       │                                    cooldown expires
       │                                           ↓
       └──── success ──── HALF_OPEN (allow ONE test call) ──── failure → back to OPEN
  ```
  - **CLOSED**: Normal operation. Gemini calls go through. Track consecutive failures.
  - **OPEN**: Too many failures (e.g., 5 in a row). All calls immediately return an error without actually calling Gemini. Saves API cost and prevents hammering a failing service. Stays open for a cooldown period (e.g., 60 seconds).
  - **HALF_OPEN**: After cooldown, allow exactly ONE request through. If it succeeds → back to CLOSED (service recovered). If it fails → back to OPEN (still broken, wait longer).
  
  For our agent: if Gemini returns 5 consecutive MALFORMED_FUNCTION_CALL or 503 errors, enter OPEN state. Show "Gemini unavailable, retrying in 60s" in the agent log. After 60s, try one call. If it works, resume the agent.

- **JSON repair** — When Gemini returns malformed function calls, I currently ask it to retry (costs another LLM call). A JSON repair pipeline (`json_repair` library) could fix common issues (trailing commas, unclosed braces, single quotes) without wasting a Gemini call.

- **Container isolation — testing for jailbreak in server container**
  Your idea: run LLM-generated code in a server container first, check if it tried to escape, then send to browser. This makes sense as a **defense-in-depth** strategy:
  ```
  Gemini generates Python code
    → Run in server-side Docker container (restricted: no network, no filesystem, 5s timeout)
    → Check: did it try to import os/subprocess? Access /etc/passwd? Open network connections?
    → If clean → send to browser Pyodide for rendering
    → If suspicious → reject and ask Gemini to regenerate
  ```
  What to check for:
  - `import os`, `import subprocess`, `import socket` → system access attempts
  - `open("/etc/passwd")`, `pathlib.Path("/")` → filesystem escape
  - `exec()`, `eval()` with dynamic input → code injection
  - `requests.get()`, `urllib` → network exfiltration
  
  Implementation: Use Docker with `--network=none --read-only --memory=128m --cpus=0.5 --pids-limit=50`. Or use Python's `RestrictedPython` library for static analysis without a container. The Deno sandbox we removed was this concept — the issue was import mismatch, not the approach.

- **Cost tracking** — Track Gemini API usage per agent run. The `ai_usage` table exists but only tracks hint requests, not agent runs. Add an `agent_runs` table with token counts from `usageMetadata`.

---

## Session 13: A2A — Agent-to-Agent Protocol

**What it covers:** Google's Agent2Agent protocol, agent capability cards, JSON-RPC communication, cross-vendor collaboration.

**What I already have:**
- MCP protocol (tools, resources) — similar concept but for tool discovery, not agent discovery
- No agent-to-agent communication

**What I need to learn:**
- **Agent Cards** — Publish a JSON capability card for my Question Authoring Agent: "I can generate SQL practice questions given a concept name. I accept `concept: string` and return `QuestionPreview`." Other students' agents can discover and invoke mine.
- **A2A server** — Wrap my agent in an A2A-compliant HTTP server. Accept JSON-RPC requests. Return structured results.
- **Federation** — My SchemaAgent could delegate ER diagram generation to another student's DiagramAgent via A2A. Or a CurriculumAgent could invoke my QuestionAgent to fill gaps automatically.
- **Does A2A increase LLM calls significantly?**
  Yes, potentially. Each agent in the chain makes its own LLM calls:
  ```
  CurriculumAgent (1 LLM call: "which gaps exist?")
    → QuestionAgent (5 LLM calls: coverage + generate + validate + preview)
      → DiagramAgent (1 LLM call: "generate ER diagram")
  Total: 7 LLM calls for what was 5 in a single agent
  ```
  The overhead is ~40% more LLM calls. Mitigation strategies:
  - **Caching**: If DiagramAgent already generated an ER diagram for these tables, return cached result (0 LLM calls)
  - **Model routing**: Use cheap models (Flash/Haiku) for simple delegation decisions, expensive models (Pro/Opus) only for generation. An A2A routing call might cost $0.001 vs $0.01 for generation.
  - **Batch delegation**: Instead of delegating per-question, delegate a batch ("generate ER diagrams for these 5 questions") — one LLM call instead of five.
  - **Direct tool calls**: Not every A2A interaction needs an LLM. If the remote agent exposes a deterministic tool (like ER diagram generation from SQL), call it directly without an LLM intermediary.
  
  The real question: is the coordination overhead worth it? For our platform with a single admin, probably not. For a multi-team platform where different teams own different capabilities, A2A makes the system composable.

---

## Session 14: A2UI / AG-UI — Agent-to-User Interface

**What it covers:** Agents generating dynamic UIs at runtime. Declarative components (A2UI/Google), event-based streaming (AG-UI/CopilotKit).

**What I already have:**
- **This is v3 GenUI** — I'm already doing this. Gemini writes Python Prefab code, Pyodide renders it. Progressive streaming via `sendToolInputPartial`. This is the core of Session 14.
- Prefab component library (Column, Card, Table, Badge, Code, Mermaid, etc.)
- Approve button with data accumulation

**What I need to learn:**
- **A2UI protocol** — Formalize what I've built. My ad-hoc `generate_prefab_ui` tool is essentially an A2UI implementation. Understanding the formal protocol (declarative components, native rendering, security model) would improve my design.
- **AG-UI events** — CopilotKit's ~16 event types map roughly to my SSE events (tool_call, tool_result, reasoning, done). Learning the standard would help interoperability.
- **Interactive components** — Currently my UI is static. Session 14 pushes toward agents generating interactive dashboards with filters, forms, and live data. This is the reactive state feature (GitHub #68).

---

## Session 15: Model Routing, Agent Economics & Observability

**What it covers:** Multi-model routing, cost tracking, OpenTelemetry, budget-aware agents.

**What I already have:**
- Single model: Gemini 2.5 Flash for everything
- `CALL_DELAY_SECONDS = 10` as a rate-limit workaround
- No cost tracking for agent runs
- No observability (logs only, no traces)

**What I need to learn:**
- **Model routing** — Use Flash for simple tool calls (coverage gaps, list questions), Gemini Pro for complex generation (question schema + solution), and a local model for validation checks. Route based on task complexity.
- **Cost dashboard** — Track input/output tokens per agent run. Currently `usageMetadata` is logged but not stored. Add a table or dashboard showing cost per question generated.
- **OpenTelemetry — what are spans and why not just log?**
  Logs tell you *what happened*. Traces tell you *how long it took and what caused what*.
  
  A **span** is a timed unit of work with a parent-child relationship:
  ```
  agent_run (total: 158s)
  ├── gemini_call_1 (1.9s)
  │   └── http_post_gemini (1.8s)
  ├── mcp_tool_get_coverage_gaps (222ms)
  │   └── http_get_express (200ms)
  ├── delay_between_calls (10s)          ← this is why it's slow!
  ├── gemini_call_2 (4.6s)
  │   └── http_post_gemini (4.5s)
  ├── mcp_tool_generate_prefab_ui (4ms)
  ├── delay_between_calls (10s)
  └── ... 13 more steps
  ```
  
  **Why not just log?** You already log `[LLM] Response ← 1988ms` and `[MCP] ← 222ms`. But:
  - Logs are flat — you can't see parent-child relationships (which Gemini call triggered which tool call)
  - Logs don't aggregate — you can't ask "what's the average Gemini latency across 100 runs?"
  - Logs don't visualize — OpenTelemetry exports to Jaeger/Grafana where you see a waterfall timeline
  - Logs from multiple services don't correlate — a trace ID links browser → FastAPI → Express → PostgreSQL across all 3 services
  
  For a single-developer project, logging is fine. OpenTelemetry shines when: (1) you have multiple services (we have 3), (2) you want to compare performance across runs, (3) you need to find bottlenecks in a complex pipeline.

- **Budget controls** — Set a max cost per agent run. If tokens exceed threshold, stop and report "budget exceeded" instead of silently consuming API credits.

---

## Session 16: Event-Driven Autonomous Agents

**What it covers:** Proactive agents monitoring event streams, autonomous decision-making, cron jobs, webhooks.

**What I already have:**
- Reactive agent only — admin triggers it manually
- No event monitoring, no cron jobs, no autonomous operation

**What I need to learn:**
- **Proactive question generation** — Instead of "admin asks for a HAVING question", the agent monitors `question_concepts` coverage and autonomously generates questions for gaps. Runs on a schedule (daily cron) or triggered by webhook when a new concept is added.
- **GitHub webhook integration** — When a PR is merged that adds a new concept to `seedConcepts.js`, automatically trigger the agent to generate a question for it.
- **Autonomous operation** — The agent runs for an hour, checking gaps, generating questions, self-validating, and queueing them for admin review. The admin reviews a batch instead of triggering one at a time.
- **Audit log** — Every autonomous action logged with timestamp, input, output, decision rationale. The admin can review and approve/reject retroactively.

---

## Session 17: Agentic Coding & Markdown-as-Code Skills

**What it covers:** Coding agents (Claude Code, Cursor architecture), System 2 reasoning (Draft-Verify-Refine), SKILL.md files, codebase navigation.

**What I already have:**
- `generate_test` tool — the agent generates Playwright E2E tests for new questions
- System prompt as a long string (not markdown skill files)
- No codebase-aware agent

**What I need to learn:**
- **What is System 2 Reasoning?**
  From Daniel Kahneman's "Thinking, Fast and Slow":
  - **System 1**: Fast, intuitive, automatic. Like how GPT-4 generates an answer in one shot.
  - **System 2**: Slow, deliberate, analytical. Like how a human double-checks their work.
  
  In agents, System 2 = **Draft → Verify → Refine** loop:
  ```
  Step 1 (Draft):   Gemini generates SQL schema + solution in one shot
  Step 2 (Verify):  Run validate_question → check schema_valid, solution_valid, distinguishable
  Step 3 (Refine):  If validation fails → analyze the error → regenerate with constraints
  Step 4 (Verify):  Run validate_question again
  Step 5 (Accept):  If passes → proceed to preview
  ```
  
  Our agent already does this informally — `[VERIFY]` label after `validate_question`, `[FALLBACK]` on failure. The formalization adds:
  - **Explicit verify function**: Not just "does it make sense?" but "run these 5 specific checks"
  - **Structured refinement**: Instead of "try again", tell the LLM exactly what failed and how to fix it
  - **Bounded iterations**: Draft-Verify-Refine up to 3 times, then escalate to a different strategy
  
  The key insight: current LLMs are good at System 1 (generate quickly) but bad at System 2 (self-verify). By adding explicit verification steps with tools, we compensate for the LLM's weakness.

- **SKILL.md pattern** — Extract the "how to write Prefab code" rules from my system prompt into a `SKILL.md` file. The agent reads it at runtime. This makes prompt maintenance easier and enables hot-swapping skills. We already have `SYSTEM_PROMPT_IMPROVED.md` which is conceptually a SKILL file.
- **Codebase navigation** — An agent that can read my `server/routes/admin.js`, understand the API, and generate correct tool implementations. Useful for self-evolving the agent's own tools.

---

## Session 18: Agent Evaluation, Benchmarking & Capstone Prep

**What it covers:** Custom eval harnesses, GAIA/SWE-bench benchmarks, A/B testing, regression testing for agents.

**What I already have:**
- Playwright E2E tests (but they test the app, not the agent's quality)
- No eval harness for agent output quality
- No regression testing for prompt changes

**What I need to learn:**
- **What is a custom eval harness?**
  An eval harness is a test suite for your **agent's output quality**, not your code's correctness. Playwright tests check "does the button appear?" — an eval harness checks "did the agent generate a good question?"
  
  For our question agent, a harness would be:
  ```python
  TEST_CASES = [
      {"prompt": "Add a question about HAVING", "expect": {
          "difficulty": "intermediate",
          "has_group_by": True,
          "has_having": True,
          "table_count": 1,
          "validation_passes": True,
          "unique_table_names": True,
      }},
      {"prompt": "Add a question about LEFT JOIN", "expect": {
          "difficulty": "intermediate",
          "table_count": 2,
          "has_foreign_key": True,
          "has_left_join": True,
          "er_diagram_present": True,
      }},
      # ... 20+ test cases covering edge cases
  ]
  
  def evaluate(agent_output, expected):
      score = 0
      score += 1 if agent_output["difficulty"] == expected["difficulty"] else 0
      score += 1 if "GROUP BY" in agent_output["sql_solution"] and expected.get("has_group_by") else 0
      score += 1 if agent_output["validation"]["schema_valid"] else 0
      # ... check each expectation
      return score / total_checks  # 0.0 to 1.0
  ```
  
  Run it after every prompt change: "Did the Badge fix improve rendering?" → rendering_score went from 0.7 to 0.9. "Did data-driven prompt increase field completion?" → data_completeness went from 0.5 to 0.95. Without an eval harness, you're guessing.

- **Regression testing** — Run the eval suite on every commit. If score drops, the commit broke something. Like unit tests but for LLM output quality.
- **A/B testing** — Run the same 20 test cases with `thinkingBudget=1024` vs `2048`. Compare: token cost, completion rate, error rate, quality score. Pick the configuration that optimizes for your priority (cost vs quality).
- **Capstone proposal** — Define a 30-day project. Options: (1) Full multi-agent question authoring pipeline, (2) Autonomous curriculum builder, (3) Student-facing adaptive practice agent.

---

## Session 19: Arcturus 2.0 — Full Integration

**What it covers:** MCP + A2A + A2UI integrated into one platform. Production deployment. Gateway API.

**What I already have:**
- MCP: ✅ (v1/v2/v3)
- A2UI: Partially (v3 GenUI is proto-A2UI)
- A2A: ❌
- Gateway: ❌
- Production deployment: ✅ (Cloud Run, 3 services)

**What I need to learn:**
- **Protocol integration** — Connect MCP (tool access) + A2A (agent collaboration) + A2UI (dynamic UI) into one coherent system. My platform already has MCP and proto-A2UI — adding A2A would complete the stack.
- **Gateway API** — A single entry point that handles auth, rate limiting, metering, and routes to the right service. Currently each service has its own auth check.
- **Docker Compose** — For local development of all 3 services together. Currently I develop each service independently.
- **Health checks and restart policies** — Cloud Run handles this, but understanding the patterns for self-hosted deployment matters.
