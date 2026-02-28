# How to Run E2E Tests

## Prerequisites

1. Ensure you're in the project directory:
   ```bash
   cd /home/vagrant/Desktop/claude-code-zai/duckdb-wasm-project
   ```

2. Ensure dependencies are installed:
   ```bash
   npm install
   ```

---

## ✅ CORRECT WAY TO RUN TESTS

### **IMPORTANT: Always run in headed mode**

```bash
cd /home/vagrant/Desktop/claude-code-zai/duckdb-wasm-project
npm run test:e2e -- --headed
```

This command:
- Uses the local `@playwright/test` package (not cached npx version)
- Runs tests in headed mode (you'll see browser windows)
- Automatically starts the web server on port 8888

### Run all tests (headless):
```bash
npm run test:e2e
```

### Run specific test file:
```bash
npx playwright test tests/e2e/debug-init.spec.js --headed
```

### Run with debug output:
```bash
npx playwright test --debug
```

---

## ❌ WHAT DOESN'T WORK

### Don't use these commands (they fail):

```bash
# WRONG - Uses cached global playwright with wrong version
npx playwright test --project=chromium --headed

# WRONG - Project filter doesn't work with local playwright
npx playwright test --project=chromium
```

**Error you'll see**:
```
Error: Project(s) "chromium" not found. Available projects: ""
```

Or:
```
Playwright Test did not expect test.describe() to be called here
```

---

## Issues Encountered & Fixes

### Issue 1: "Playwright Test did not expect test.describe() to be called here"

**Cause**: `npx playwright` uses a globally cached version that conflicts with local dependencies.

**Fix**: Always use `npm run test:e2e` which uses the local playwright binary.

---

### Issue 2: "Project(s) chromium not found"

**Cause**: Running `npx playwright test --project=chromium` from wrong directory or using cached version.

**Fix**: Use `npm run test:e2e -- --headed` instead.

---

### Issue 3: "Address already in use" (port 8888)

**Cause**: Previous test run left server running.

**Fix**:
```bash
fuser -k 8888/tcp 2>/dev/null
# Then run tests again
npm run test:e2e -- --headed
```

---

### Issue 4: TypeError: Cannot redefine property: Symbol($$jest-matchers-object)

**Cause**: Vitest's `expect.extend()` in `tests/setup/vitest.setup.js` was conflicting with Playwright.

**Fix**: Removed custom matchers from vitest.setup.js. (Already fixed in commit `0ed1e37`)

---

### Issue 5: Loading overlay blocking clicks

**Error**: `<body>...</body> intercepts pointer events`

**Cause**: Tests clicked before `appContainer.style.pointerEvents = 'auto'` was applied.

**Fix**: Added `waitForFunction` wait in test files before clicking buttons. (Fixed in commit `16be271`)

---

## Test Files Overview

| File | Tests | Description |
|------|-------|-------------|
| `arrow-debug.spec.js` | 2 | Arrow data structure capture & analysis |
| `auth-flow.spec.js` | 9 | Login modal, form validation, auth flow |
| `basic-workflow.spec.js` | 2 | App load, Arrow debug (6 skipped) |
| `comprehensive-queries.spec.js` | 0 | All skipped (awaiting question selector UI rewrite) |
| `debug-init.spec.js` | 1 | Initial app state debug |
| `loading-state.spec.js` | 3 | Loading overlay behavior |
| `practice-mode-flow.spec.js` | 1 | Practice mode flow (uses port 9200) |

---

## View Test Results

### HTML Report:
```bash
open playwright-report/index.html
# Or in browser: file:///path/to/duckdb-wasm-project/playwright-report/index.html
```

### Screenshots:
```bash
ls test-results/screenshots/
```

---

## Quick Reference

```bash
# Run all tests in headed mode (RECOMMENDED)
npm run test:e2e -- --headed

# Kill stuck server and run tests
fuser -k 8888/tcp 2>/dev/null && npm run test:e2e -- --headed

# Run single test file
npm run test:e2e tests/e2e/debug-init.spec.js -- --headed

# View HTML report
open playwright-report/index.html
```

---

**Last Updated**: 2025-02-27
**Related Commits**: `0ed1e37`, `16be271`, `b9aea08`
