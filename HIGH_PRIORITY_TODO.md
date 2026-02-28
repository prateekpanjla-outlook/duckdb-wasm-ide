# 🟡 MEDIUM PRIORITY TODO - E2E Test Fixes Needed

**Last Updated**: 2025-02-27
**Status**: UNBLOCKED - Playwright tests now working, 6/26 Chromium tests passing

---

## ✅ RESOLVED - Previous Blockers

### 1. JavaScript Modules Loading (FALSE ALARM)
**Previous Status**: 🔴 BLOCKED - "JavaScript modules not loading"
**Actual Finding**: Modules ARE loading correctly (200 OK responses confirmed)
**Resolution**: The real issue was the loading overlay blocking UI interactions

### 2. Playwright/Vitest Conflict
**Problem**: `npx playwright test` failed with "Playwright Test did not expect test.describe() to be called here"
**Fix**: Removed Vitest's `expect.extend()` custom matchers from `tests/setup/vitest.setup.js`
**Commit**: `0ed1e37`

### 3. Loading Overlay Permanently Blocking UI
**Problem**: `showLoading(false)` wasn't called reliably, overlay never hidden
**Fix**: Added try-catch-finally in `app.js init()` + .catch() in constructor
**Commit**: `0ed1e37`

### 4. Playwright Configuration
**Fixes**:
- Changed port from 8000 to 8888
- Changed `python` to `python3`
**Commit**: `0ed1e37`

---

## 🟢 CURRENT TEST RESULTS

### Passing Tests (6/26 Chromium)
```
✅ tests/e2e/debug-init.spec.js:8:1 › debug: capture initial app state
✅ tests/e2e/loading-state.spec.js:122:5 › DuckDB Loading State › should complete initialization within reasonable time
✅ tests/e2e/loading-state.spec.js:157:5 › DuckDB Loading State › should show correct loading messages
✅ tests/e2e/basic-workflow.spec.js:13:5 › DuckDB WASM IDE - Basic Workflow › should load the application
✅ tests/e2e/basic-workflow.spec.js:211:5 › DuckDB WASM IDE - Arrow Debugging › should debug Arrow result structure
✅ tests/e2e/arrow-debug.spec.js:10:1 › Arrow Debug: Capture structure after data load
```

### Failed Tests (20/26 Chromium)
- See "Pending Tasks" below

---

## 🔴 PENDING TASKS

### Task 1: Fix Pointer Events Timing Issue (HIGH PRIORITY)
**Status**: 🔴 Blocking 10+ auth-related tests
**Error**: `<body>...</body> intercepts pointer events`

**Problem**:
Tests try to click buttons before `appContainer.style.pointerEvents = 'auto'` is applied.
The appContainer has inline styles `pointer-events: none` that should be cleared by `showLoading(false)`.

**Affected Tests**:
- `tests/e2e/auth-flow.spec.js` - All auth flow tests (5 tests)
- Any test that clicks buttons immediately after page load

**Solution Options**:
1. Add explicit wait in tests for `pointer-events: auto`
2. Increase page load wait time
3. Add a ready state indicator that tests can wait for

**Example Fix**:
```javascript
// Instead of:
await page.goto('/');
await page.click('#authBtn');

// Use:
await page.goto('/');
await page.waitForFunction(() => {
    const container = document.getElementById('appContainer');
    return container && container.style.pointerEvents === 'auto';
});
await page.click('#authBtn');
```

**Estimated Time**: 15-30 minutes

---

### Task 2: Update Outdated Tests - DropZone References (MEDIUM PRIORITY)
**Status**: 🟡 Blocking ~10 tests
**Problem**: Tests reference `#dropZone` element which was removed in favor of question selector

**Affected Files**:
- `tests/e2e/basic-workflow.spec.js` - 7 tests reference dropZone
- `tests/e2e/comprehensive-queries.spec.js` - 2 tests reference dropZone

**New UI Flow** (after changes):
1. User logs in
2. Questions dropdown appears (not CSV upload)
3. User selects a question
4. Query is pre-populated in editor
5. User runs query

**Solution**:
Rewrite tests to use new question selector UI instead of CSV dropZone:
```javascript
// Old approach:
await page.click('#dropZone');
await page.locator('#fileInput').setInputFiles('./sample-employees.csv');

// New approach:
await page.fill('#questionDropdown', 'SQL Question 1');
await page.click('#loadQuestionBtn');
```

**Estimated Time**: 45-60 minutes

---

### Task 3: Fix Port Mismatch in Practice Mode Test (LOW PRIORITY)
**Status**: 🟡 1 test affected
**File**: `tests/e2e/practice-mode-flow.spec.js`
**Line 78**: `const BASE_URL = 'http://localhost:8000/';`
**Should be**: `const BASE_URL = 'http://localhost:8888/';`

**Fix**:
```javascript
// Change line 78 from:
const BASE_URL = 'http://localhost:8000/';
// To:
const BASE_URL = 'http://localhost:8888/';  // Or use baseURL from config
```

**Estimated Time**: 2 minutes

---

### Task 4: Fix Loading State Test Expectations (LOW PRIORITY)
**Status**: 🟡 1 test affected
**File**: `tests/e2e/loading-state.spec.js`
**Test**: "should show loading overlay and block UI during initialization"

**Problem**: Test expects loading overlay to be visible, but our fix correctly hides it after initialization.

**Current Test Expectation**:
```javascript
await expect(loadingOverlay).toBeVisible();  // FAILS - overlay is now correctly hidden
```

**Solution**: Update test to expect overlay to be hidden AFTER initialization:
```javascript
test('should show loading overlay and hide it after initialization', async ({ page }) => {
    await page.goto('/');

    // First, overlay should be visible
    const loadingOverlay = page.locator('#loadingOverlay');
    await expect(loadingOverlay).toBeVisible();

    // After initialization, overlay should be hidden
    await page.waitForTimeout(2000);
    await expect(loadingOverlay).toBeHidden();
});
```

**Estimated Time**: 10 minutes

---

### Task 5: Install Firefox and WebKit Browsers (OPTIONAL)
**Status**: ⚪ Optional - Chromium tests sufficient for CI
**Error**: `Executable doesn't exist at /home/vagrant/.cache/ms-playwright/...`

**Fix**:
```bash
npx playwright install firefox
npx playwright install webkit
```

**Estimated Time**: 5-10 minutes (download time depends on connection)

---

## 📋 SUMMARY OF PENDING WORK

| Task | Priority | Tests Affected | Est. Time |
|------|----------|----------------|-----------|
| 1. Fix pointer-events timing | 🔴 High | ~10 tests | 15-30 min |
| 2. Update dropZone tests | 🟡 Medium | ~10 tests | 45-60 min |
| 3. Fix port in practice-mode-flow | 🟡 Low | 1 test | 2 min |
| 4. Fix loading-state test | 🟡 Low | 1 test | 10 min |
| 5. Install Firefox/WebKit | ⚪ Optional | 0 tests | 5-10 min |

**Total Estimated Time**: 1.5 - 2 hours

---

## 🚀 QUICK START - RUNNING TESTS

### Headed Mode (see browser):
```bash
cd /home/vagrant/Desktop/claude-code-zai/duckdb-wasm-project
npx playwright test --project=chromium --headed
```

### Headless Mode:
```bash
npm run test:e2e
```

### Specific Test File:
```bash
npx playwright test tests/e2e/debug-init.spec.js --headed
```

### With Debug Output:
```bash
npx playwright test --debug
```

---

## 📚 DOCUMENTATION

- [PLAYWRIGHT_FIX_DOCUMENTATION.md](PLAYWRIGHT_FIX_DOCUMENTATION.md) - Complete fix documentation
- [TESTING_STATUS.md](TESTING_STATUS.md) - Testing status overview
- [playwright.config.js](playwright.config.js) - Playwright configuration

---

## 🔗 RELATED COMMITS

- **0ed1e37** - Fix Playwright E2E tests and enable headed mode
- **b9aea08** - Add comprehensive Playwright fix documentation

---

## STATUS

🟡 **MEDIUM PRIORITY** - Tests are running, 6/26 passing. Known issues documented above.

**Next Recommended Action**: Fix Task 1 (pointer-events timing) to unblock auth flow tests.
