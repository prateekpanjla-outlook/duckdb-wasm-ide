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
- **Agent-written plans** — Gemini could generate a `solve()` function as a Python plan instead of just calling tools sequentially. This is the "code as plan" concept.

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
- **Embedding models** — Learn Gemini embeddings API or Nomic for local embeddings. My use case is small enough that full RAG may be overkill, but the concepts matter.

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
- **Concept only** — This session is less directly applicable to my web app. However, the VLM screen understanding pattern could be used for: (1) automated visual testing — screenshot the Prefab UI and ask Gemini "does this look correct?", (2) accessibility auditing — check if the student app meets a11y standards by reading the accessibility tree.
- **UI element detection** — The YOLO/ONNX model for detecting buttons/text fields is conceptually interesting for testing the admin panel. But Playwright already handles this with selectors.

---

## Session 11: Channel Architecture, Voice & Gateway

**What it covers:** Connect agents to WhatsApp, Slack, Discord, voice. Unified adapter pattern. Gateway architecture.

**What I already have:**
- Web-only interface (browser landing page for each agent version)
- SSE streaming for real-time updates
- No external channel integration

**What I need to learn:**
- **Channel adapter pattern** — Abstract the agent's input/output so the same agent can be invoked from: (1) web UI (current), (2) Slack command (`/generate-question HAVING`), (3) Discord bot, (4) API endpoint for CI/CD integration.
- **Gateway architecture** — A single entry point that routes requests to the right agent version and manages sessions across channels.
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
- **Circuit breaker** — If Gemini returns 5 consecutive errors, stop calling it (OPEN state). After a cooldown, try one request (HALF_OPEN). Currently the agent just retries blindly up to MAX_STEPS.
- **JSON repair** — When Gemini returns malformed function calls, I currently ask it to retry. A JSON repair pipeline (`json_repair` library) could fix common issues (trailing commas, unclosed braces) without wasting a Gemini call.
- **Container isolation** — The v3 GenUI agent executes LLM-generated Python code in the browser via Pyodide (sandboxed). But the Prefab code could theoretically do anything in the iframe. Server-side: the original Deno sandbox was the right idea, just wrong implementation.
- **Cost tracking** — Track Gemini API usage per agent run. The `ai_usage` table exists but only tracks hint requests, not agent runs.

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
- **OpenTelemetry** — Instrument the agent loop with spans: `gemini_call`, `mcp_tool_call`, `sse_event`. Visualize with Jaeger to find bottlenecks (the 10s delay is the obvious one).
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
- **System 2 reasoning** — Draft-Verify-Refine loop for question generation: (1) Draft the SQL schema + solution, (2) Verify by running `validate_question`, (3) Refine if validation fails. I already do this informally — formalizing it would make the agent more robust.
- **SKILL.md pattern** — Extract the "how to write Prefab code" rules from my system prompt into a `SKILL.md` file. The agent reads it at runtime. This makes prompt maintenance easier and enables hot-swapping skills.
- **Codebase navigation** — An agent that can read my `server/routes/admin.js`, understand the API, and generate correct tool implementations. Useful for self-evolving the agent's own tools.

---

## Session 18: Agent Evaluation, Benchmarking & Capstone Prep

**What it covers:** Custom eval harnesses, GAIA/SWE-bench benchmarks, A/B testing, regression testing for agents.

**What I already have:**
- Playwright E2E tests (but they test the app, not the agent's quality)
- No eval harness for agent output quality
- No regression testing for prompt changes

**What I need to learn:**
- **Custom eval harness** — 20+ test cases for the question agent: "Generate a HAVING question" → check that sql_data has GROUP BY + HAVING, difficulty is intermediate, table names are unique, validation passes. Score: fields_complete, sql_valid, concept_correct, difficulty_appropriate.
- **Regression testing** — After every prompt change, run the eval suite. Compare: did the Badge fix improve rendering? Did the data-driven prompt increase field completion rate?
- **A/B testing** — Run the same prompt with thinkingBudget=1024 vs 2048. Compare: token cost, completion rate, error rate, quality score.
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
