# SQL Practice Project

A browser-based SQL learning platform. Practice SQL against real data — queries run entirely in your browser via DuckDB WebAssembly. A PostgreSQL backend tracks progress and serves a question bank.

**Live:** https://duckdb-ide-frxi6yk4jq-uc.a.run.app

## Demo

| Feature | Video |
|---------|-------|
| App Walkthrough | [![Watch](https://img.youtube.com/vi/cG_GHg43-8c/mqdefault.jpg)](https://youtu.be/cG_GHg43-8c) |
| AI-Powered SQL Hints | [![Watch](https://img.youtube.com/vi/DbzvDvRmXlY/mqdefault.jpg)](https://youtu.be/DbzvDvRmXlY) |
| Question Authoring Agent | [![Watch](https://img.youtube.com/vi/RPB8i3xnakU/mqdefault.jpg)](https://youtu.be/RPB8i3xnakU) |

## How It Works

1. **Start as guest** (instant, no signup) or **register** with email and password
2. **Select a question** from the dropdown — each comes with preloaded data tables
3. **Write SQL** in the editor (CodeMirror with syntax highlighting, `Ctrl+Enter` to run, `Ctrl+Space` for autocomplete)
4. **Submit** — your query runs in-browser and results are compared to the expected output (order-independent)
5. **Ask for AI help** — click Get Hint, Explain Error, or Explain What's Wrong for Gemini-powered guidance

## Features

### AI-Powered SQL Hints

Get help while practicing — powered by Gemini 2.5 Flash (server-side, no API key exposed to the browser):
- **Get Hint** — nudges you in the right direction without revealing the answer
- **Explain This Error** — explains DuckDB syntax errors in plain language
- **Explain What's Wrong** — analyzes why your query returns incorrect results

### Question Authoring Agent

With limited questions on the platform, I built an AI agent that generates, validates, and inserts new SQL practice questions autonomously.

The platform maintains a concept taxonomy of 38 SQL concepts (WHERE, JOIN, RANK, CTE, etc.). Each question is tagged with which concepts it covers (intended vs alternative solutions). Without a taxonomy, the agent would generate random questions. With it, the agent checks what's missing and fills curriculum gaps.

When the admin asks "Add a question about DENSE_RANK()", the agent:

1. Checks the concept map to see if DENSE_RANK is already covered (for the admin's information — it generates regardless)
2. Generates the question, schema, sample data, and solution
3. Validates the SQL (syntax, distinguishability from SELECT *, table name collisions)
4. Presents a structured preview for human approval
5. On approval, inserts the question into the database — it immediately appears in the question list

The agent uses 7 custom tools, each solving a specific failure mode:

| Tool | Why |
|------|-----|
| `get_coverage_gaps` | Agent knows what's missing — generates questions that fill gaps, not repeat existing topics |
| `list_existing_questions` | Prevents table name collisions (DuckDB crashes if two questions use the same table name in the browser). Sends existing table names to Gemini to avoid reuse |
| `validate_question` | Catches SQL syntax errors + verifies solution is distinguishable from SELECT * — before human reviews |
| `check_concept_overlap` | Shows admin which concepts are already covered — informed approve/reject decision |
| `list_concepts` | Full coverage picture so agent picks correct difficulty and category |
| `execute_sql` | Agent can test individual SQL statements during generation |
| `insert_question` | Only callable after human approval — human-in-the-loop gate |

The reasoning chain streams in real-time via SSE — each tool call, result, and retry is visible in the admin panel. Gemini 503 errors trigger exponential backoff (1m, 5m, 10m, 20m, 1h) with visible retry steps.

## Architecture

```
┌──────────────────────────────────────────────┐
│  Browser                                     │
│  ┌────────────┐   ┌──────────────────────┐   │
│  │ SQL Editor │──▶│ DuckDB WASM (EH)     │   │
│  │            │   │ Tables in memory     │   │
│  └────────────┘   └──────────────────────┘   │
└───────────────┬──────────────────────────────┘
                │ JWT auth, practice API
                ▼
┌──────────────────────────────────────────────┐
│  Cloud Run (Express + static files)          │
│  - Serves frontend + API                     │
│  - Pre-compressed WASM (gzip)                │
│  - COI headers (COOP/COEP)                   │
└───────────────┬──────────────────────────────┘
                │ Unix socket via Auth Proxy
                ▼
┌──────────────────────────────────────────────┐
│  Cloud SQL (PostgreSQL 16)                   │
│  users, questions, user_attempts, sessions   │
└──────────────────────────────────────────────┘
```

Key design decisions:
- **Client-side grading only** — DuckDB WASM runs both user and solution queries in the browser. No server-side SQL execution for grading. Eliminates dialect mismatch and keeps server load at zero per query.
- **No bundler** — vanilla ES modules served directly. No webpack, no Vite, no build step for frontend code.
- **Self-hosted CodeMirror** — vendored in `libs/codemirror/` to avoid CDN dependencies.

## Stack

| Layer | Technology |
|-------|------------|
| Query engine | DuckDB WASM (EH bundle via `selectBundle()`) |
| Editor | CodeMirror 5 with SQL mode |
| Frontend | Vanilla ES modules (no framework, no bundler) |
| Backend | Node.js 18+, Express, `pg` |
| Database | PostgreSQL 16 |
| Auth | JWT in localStorage, bcrypt password hashing |
| Deployment | Cloud Run + Cloud SQL + Secret Manager |
| CI/CD | GitHub Actions → Cloud Build → Cloud Run (via WIF) |
| Tests | Playwright (E2E) |

## Local Development

The project uses a Vagrant VM (Ubuntu 24.04) with PostgreSQL, Node, and Playwright preinstalled. No synced folders — the VM clones the repo on its own native filesystem to avoid cross-OS filesystem issues.

```bash
# One-time: provision the VM
vagrant up

# SSH in
vagrant ssh

# Start the server (inside VM)
cd /home/vagrant/duckdb-wasm-ide
node server/server.js
```

Ports (VM guest → Windows host):

| Service | VM | Host |
|---|---|---|
| Express (API + static frontend) | 3000 | **3015** |
| PostgreSQL | 5432 | 5447 |
| Docker container test | 8080 | 8095 |

Open `http://localhost:3015` in your Windows browser.

Tables and seed questions are created automatically on server startup — no manual `init-db` or `seed` steps needed. See `server/server.js` `ensureTables()`.

## Running Tests

```bash
# E2E tests (Playwright) — run inside the Vagrant VM
PLAYWRIGHT_BASE_URL=http://localhost:3000 npm run test:e2e

# Against Cloud Run deployment
npx playwright test --config=playwright.cloud.config.js
```

See [docs/playwright-testing.md](docs/playwright-testing.md) for details.

## Deployment

Automated via GitHub Actions on push to main. Uses Workload Identity Federation (no SA keys). Pipeline: GitHub Actions → Cloud Build → Artifact Registry → Cloud Run. See [GCP_DEPLOYMENT.md](GCP_DEPLOYMENT.md) and [`.github/workflows/deploy.yml`](.github/workflows/deploy.yml).

Project: `sql-practice-project-489106` | Run cost: ~$9/month (Cloud SQL db-f1-micro is the only paid resource).

## Documentation

| Document | Description |
|----------|-------------|
| [docs/sequence-diagram.md](docs/sequence-diagram.md) | Mermaid sequence diagrams for all major flows |
| [docs/backend-requirements.md](docs/backend-requirements.md) | Backend & frontend architecture: API, grading, UI components |
| [docs/duckdb-initialization-pattern.md](docs/duckdb-initialization-pattern.md) | DuckDB WASM init: EH/MVP bundle selection, connection lifecycle |
| [docs/user-sessions.md](docs/user-sessions.md) | Session management: restore-on-refresh, multi-tab considerations |
| [docs/future.md](docs/future.md) | Planned features: OAuth, magic links, progress dashboard |
| [docs/pending_tasks.md](docs/pending_tasks.md) | Full list of open work items |
| [GCP_DEPLOYMENT.md](GCP_DEPLOYMENT.md) | GCP deployment architecture |
| [docs/gemini-integration.md](docs/gemini-integration.md) | Gemini AI integration: architecture, prompts, issues, fine-tuning analysis |
| [docs/question-authoring-agent.md](docs/question-authoring-agent.md) | Question Authoring Agent: tools, SSE streaming, concept taxonomy |
| [docs/terraform-learnings.md](docs/terraform-learnings.md) | Terraform/GCP gotchas and fixes (11 items) |
| [infra/terraform/](infra/terraform/) | Terraform IaC — all GCP resources (35 managed) |

## Browser Support

Currently tested in **Chromium only** (via Playwright). DuckDB WASM requires WebAssembly (2017+) and should work in any modern browser, but Firefox, Safari, and Edge are untested.

## Task Tracking

Tasks are tracked on [GitHub Projects](https://github.com/users/prateekpanjla-outlook/projects/2). See [docs/pending_tasks.md](docs/pending_tasks.md) for a categorized snapshot.
