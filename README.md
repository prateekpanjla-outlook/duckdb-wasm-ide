# SQL Practice Platform

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
| CI/CD | Cloud Build triggered from GitHub |
| Tests | Playwright (E2E), Vitest (unit) |

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

Open `http://localhost:3015` in your Windows browser.

### Database

Tables and seed questions are created automatically on server startup — no manual `init-db` or `seed` steps needed. See [server/server.js](server/server.js) `ensureTables()`.

## Running Tests

```bash
# Unit tests (Vitest)
npm run test:unit

# E2E tests (Playwright)
npm run test:e2e

# Against Cloud Run deployment
npx playwright test --config=playwright.cloud.config.js
```

See [docs/playwright-testing.md](docs/playwright-testing.md).

## Deployment

Pushes to `refactor` branch trigger Cloud Build → Artifact Registry → Cloud Run. See [GCP_DEPLOYMENT_PLAN.md](GCP_DEPLOYMENT_PLAN.md) for full setup.

Project: `sql-practice-project-489106`

Run cost: ~$9/month (Cloud SQL db-f1-micro is the only paid resource; Cloud Run and Artifact Registry are within free tier).

## Keyboard Shortcuts

| Shortcut | Action |
|---|---|
| `Ctrl+Enter` | Run query |
| `Ctrl+Space` | Autocomplete (in SQL editor) |

## Browser Support

Currently **only tested in Chromium** (via Playwright). DuckDB WASM technically requires WebAssembly (2017+) and should work in any modern browser, but Firefox, Safari, and Edge are untested. If you try them and hit issues, please open an issue.

## License

MIT
