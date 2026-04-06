# SQL Practice Project

A browser-based SQL learning platform. Practice SQL against real data — queries run entirely in your browser via DuckDB WebAssembly. A PostgreSQL backend tracks progress and serves a question bank.

**Live:** https://duckdb-ide-frxi6yk4jq-uc.a.run.app

## Demo

[![Watch the demo](https://img.youtube.com/vi/cG_GHg43-8c/maxresdefault.jpg)](https://youtu.be/cG_GHg43-8c)

[Watch on YouTube](https://youtu.be/cG_GHg43-8c)

## How It Works

1. **Register or log in** with email and password
2. **Select a question** from the dropdown — each comes with preloaded data tables
3. **Write SQL** in the editor (CodeMirror with syntax highlighting, `Ctrl+Enter` to run, `Ctrl+Space` for autocomplete)
4. **Submit** — your query runs in-browser and results are compared to the expected output (order-independent)

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
| CI/CD | Cloud Build (manual trigger, automated trigger planned) |
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

Cloud Build → Artifact Registry → Cloud Run. Currently triggered manually via `gcloud builds submit`; automated triggers on push are a future goal. See [GCP_DEPLOYMENT.md](GCP_DEPLOYMENT.md) for full setup.

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

## Browser Support

Currently tested in **Chromium only** (via Playwright). DuckDB WASM requires WebAssembly (2017+) and should work in any modern browser, but Firefox, Safari, and Edge are untested.

## Task Tracking

Tasks are tracked in a local [Vikunja](https://vikunja.io/) instance (project ID 2). See [docs/pending_tasks.md](docs/pending_tasks.md) for the current list.
