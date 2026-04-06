# SQL Practice Project

A browser-based SQL learning platform. Practice SQL against real data — queries run entirely in your browser via DuckDB WebAssembly. A PostgreSQL backend tracks progress and serves a question bank.

**Live:** https://duckdb-ide-frxi6yk4jq-uc.a.run.app

## How It Works

1. **Register or log in** with email and password
2. **Select a question** from the dropdown — each comes with preloaded data tables
3. **Write SQL** in the editor (CodeMirror with SQL syntax highlighting)
4. **Submit** — your query runs in-browser and results are compared to the expected output

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

Detailed flow diagrams: [docs/sequence-diagram.md](docs/sequence-diagram.md)

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
| CI/CD | Cloud Build (manual trigger, automated trigger planned) |
| Tests | Playwright (E2E) |

## Local Development — Vagrant VM

The project uses a single Ubuntu 24.04 VM with PostgreSQL, Node, and Playwright preinstalled. No synced folders — the VM clones the repo on its own native filesystem to avoid cross-OS filesystem issues.

```bash
# One-time: provision the VM (installs Node, PostgreSQL, dependencies, Playwright browsers)
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

### Database

Tables and seed questions are created automatically on server startup — no manual `init-db` or `seed` steps needed. See [server/server.js](server/server.js) `ensureTables()`.

## Running Tests

```bash
# E2E tests (Playwright) — run inside the Vagrant VM
PLAYWRIGHT_BASE_URL=http://localhost:3000 npm run test:e2e

# Against Cloud Run deployment
npx playwright test --config=playwright.cloud.config.js
```

See [docs/playwright-testing.md](docs/playwright-testing.md).

## Deployment

Cloud Build → Artifact Registry → Cloud Run. Currently triggered manually via `gcloud builds submit`; automated triggers on push are a future goal. See [GCP_DEPLOYMENT_PLAN.md](GCP_DEPLOYMENT_PLAN.md) for full setup.

Project: `sql-practice-project-489106`

Run cost: ~$9/month (Cloud SQL db-f1-micro is the only paid resource; Cloud Run and Artifact Registry are within free tier).

## Keyboard Shortcuts

| Shortcut | Action |
|---|---|
| `Ctrl+Enter` | Run query |
| `Ctrl+Space` | Autocomplete (in SQL editor) |

## Design & Architecture Docs

| Document | Description |
|----------|-------------|
| [docs/sequence-diagram.md](docs/sequence-diagram.md) | Mermaid sequence diagrams for all major flows (login, DuckDB init, question loading, grading, registration) |
| [docs/backend-requirements.md](docs/backend-requirements.md) | Backend API scope: auth, practice endpoints, progress tracking |
| [docs/duckdb-initialization-pattern.md](docs/duckdb-initialization-pattern.md) | DuckDB WASM init: EH/MVP bundle selection, connection lifecycle |
| [docs/user-sessions.md](docs/user-sessions.md) | Session management: restore-on-refresh, multi-tab considerations |
| [docs/playwright-testing.md](docs/playwright-testing.md) | E2E test strategy, Vagrant VM setup, known limitations |
| [docs/future.md](docs/future.md) | Planned features: OAuth, magic links, progress dashboard |
| [GCP_DEPLOYMENT_PLAN.md](GCP_DEPLOYMENT_PLAN.md) | Full GCP deployment architecture: Cloud Run, Cloud SQL, Secret Manager |

Key design decisions:
- **Client-side grading only** — DuckDB WASM runs both user and solution queries in the browser. No server-side SQL execution for grading. This eliminates dialect mismatch (user learns DuckDB, not PostgreSQL) and keeps server load at zero per query.
- **No bundler** — vanilla ES modules served directly. No webpack, no Vite, no build step for frontend code.
- **Self-hosted CodeMirror** — vendored in `libs/codemirror/` to avoid CDN dependencies.

## Pending Tasks

See [docs/pending_tasks.md](docs/pending_tasks.md) for the full list of open work items.

## Task Tracking

Tasks are tracked in a local [Vikunja](https://vikunja.io/) instance at `http://localhost:3456`, project "SQL Practice Project" (ID 2). Tasks cover bugs, features, infrastructure, and deferred work (anti-cheat, OAuth, etc.).

To list pending tasks via API:
```bash
curl -s -H "Authorization: Bearer <token>" \
  "http://localhost:3456/api/v1/projects/2/tasks?filter=done=false&sort_by=priority&order_by=desc"
```

## Browser Support

Currently **only tested in Chromium** (via Playwright). DuckDB WASM technically requires WebAssembly (2017+) and should work in any modern browser, but Firefox, Safari, and Edge are untested. If you try them and hit issues, please open an issue.
