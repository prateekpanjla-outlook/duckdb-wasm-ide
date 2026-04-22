# Playwright E2E Testing Guide

End-to-end tests for the SQL Practice Platform using Playwright.

## Prerequisites

1. **Install dependencies:**
   ```bash
   npm install
   ```

2. **Install Playwright browsers:**
   ```bash
   npx playwright install chromium
   ```

   For all browsers:
   ```bash
   npx playwright install
   ```

## Test Files

| File | Purpose | Config |
|------|---------|--------|
| [tests/e2e/app.spec.js](../tests/e2e/app.spec.js) | Local E2E: auth flow, question selector, DuckDB query execution | `playwright.config.js` |
| [tests/e2e/guest.spec.js](../tests/e2e/guest.spec.js) | Guest access: landing page, guest session, upgrade, logout | `playwright.config.js` |
| [tests/e2e/agent.spec.js](../tests/e2e/agent.spec.js) | Admin agent: reasoning chain generation, question insertion | `playwright.config.js` |
| [tests/e2e/cloud.spec.js](../tests/e2e/cloud.spec.js) | Smoke tests against Cloud Run deployment | `playwright.cloud.config.js` |

## Running Tests

### Against Local Backend (Vagrant VM)

The default config targets `http://localhost:3015` — the Express backend running inside the Vagrant VM (port 3000 in VM → 3015 on Windows host).

```bash
# One-time: start the VM and Playwright (from project root on Windows)
vagrant up
vagrant ssh -c "cd /home/vagrant/duckdb-wasm-ide && node server/server.js &"

# Run E2E tests (from Windows host)
npm run test:e2e
```

Or run everything inside the VM:
```bash
vagrant ssh
cd /home/vagrant/duckdb-wasm-ide
node server/server.js &
npx playwright test
```

### Against Cloud Run Deployment

```bash
npx playwright test --config=playwright.cloud.config.js
```

Uses `CLOUD_URL` env var to override the default deployed URL if needed.

### Debug / UI Mode

```bash
# Visual UI with timelines
npm run test:e2e:ui

# Step-through debugger
npm run test:e2e:debug

# Headed browser
npx playwright test --headed
```

### Run Specific Test

```bash
npx playwright test --grep "Auth flow"
npx playwright test tests/e2e/app.spec.js:106
```

## Current Test Coverage (tests/e2e/app.spec.js)

| # | Test | Verifies |
|---|------|----------|
| 1 | Auth flow › shows login prompt when not authenticated | Login prompt visible, editor hidden |
| 2 | Auth flow › register via UI opens modal and submits | Registration API + UI state transition |
| 3 | Question selector › loads questions into dropdown after login | `/api/practice/questions` fetch + dropdown populated |
| 4 | Question selector › selecting a question shows info panel | Question metadata display |
| 5 | DuckDB query execution › executes SELECT 1 and shows result | Full DuckDB WASM round-trip |

## Key Selectors

Based on current [index.html](../index.html):

| Element | Selector |
|---------|----------|
| SQL editor (CodeMirror) | `.CodeMirror` |
| Run Query button | `#runQueryBtn` |
| DB status indicator | `#dbStatus` / `.status.connected` |
| Auth button / modal | `#authBtn`, `#authModal`, `#authEmail`, `#authPassword` |
| Login prompt | `#loginPromptSection`, `#loginPromptBtn` |
| Question selector | `#questionSelectorSection`, `#questionDropdown`, `#loadQuestionBtn` |
| Results container | `#resultsContainer` |
| Loading overlay | `#loadingOverlay` |

## Environment Details

| Setting | Local (Vagrant) | Cloud Run |
|---------|----------------|-----------|
| Backend URL | `http://localhost:3015` | `https://duckdb-ide-192834930119.us-central1.run.app` |
| Config file | `playwright.config.js` | `playwright.cloud.config.js` |
| Test file | `app.spec.js` | `cloud.spec.js` |
| Timeout | 120s | 120s |
| Workers | 1 | 1 |

## Troubleshooting

### Tests Timing Out

DuckDB WASM initialization takes 1-3 seconds in the EH bundle. If tests time out waiting for `.status.connected`, check:

- Server is running on port 3015 (`curl http://localhost:3015/health`)
- WASM files are being served with correct MIME type
- Browser console for CSP or module loading errors

### Missing Browsers on Vagrant VM

```bash
vagrant ssh -c "cd /home/vagrant/duckdb-wasm-ide && npx playwright install chromium"
```

### Screenshots from Failed Tests

Saved to `test-results/` automatically on failure. Config: `screenshot: 'only-on-failure'`.

## CI/CD Integration

Example for GitHub Actions:

```yaml
- name: Install dependencies
  run: npm ci

- name: Install Playwright browsers
  run: npx playwright install chromium --with-deps

- name: Run E2E tests (against Cloud Run)
  run: npx playwright test --config=playwright.cloud.config.js
  env:
    CLOUD_URL: ${{ secrets.CLOUD_RUN_URL }}

- name: Upload test results
  if: always()
  uses: actions/upload-artifact@v4
  with:
    name: playwright-report
    path: test-results/
```

## Resources

- [Playwright Documentation](https://playwright.dev)
- [Selectors Guide](https://playwright.dev/docs/selectors)
- [Debugging Tests](https://playwright.dev/docs/debug)
