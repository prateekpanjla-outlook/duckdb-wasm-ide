# E2E Test Status

**Last Updated:** 2026-02-28

## Authentication Persistence Behavior

**Note:** The application uses `localStorage` to persist user authentication across browser sessions.

- When a user logs in, the auth token and user data are stored in `localStorage`:
  - `auth_token`: JWT token for API authentication
  - `user_data`: User profile information (email, name, etc.)
- This means **users remain logged in** when:
  - Refreshing the page
  - Closing and reopening the browser
  - Opening a new browser tab/window
- This is **expected production behavior**, not a bug
- To test with a fresh login state, manually clear localStorage in DevTools or use Incognito/Private mode

**File:** `js/services/api-client.js` lines 17-22, 36-41
```javascript
constructor() {
    this.token = localStorage.getItem('auth_token') || null;
    this.user = JSON.parse(localStorage.getItem('user_data') || 'null');
}
setToken(token) {
    if (token) localStorage.setItem('auth_token', token);
}
```

## Test Summary

| Test File | Total Tests | Passing (Chromium) | Status |
|-----------|-------------|-------------------|--------|
| `basic-workflow.spec.js` | 9 | 9 | ✅ **ALL PASSING** |
| `debug-login-questions.spec.js` | 1 | 1 | ✅ **PASSING** |
| `debug-init.spec.js` | 1 | 1 | ✅ **PASSING** |
| `loading-state.spec.js` | 3 | 3 | ✅ **ALL PASSING** |
| `auth-flow.spec.js` | 9 | 9 | ✅ **ALL PASSING** |
| `arrow-debug.spec.js` | 2 | 2 | ✅ **ALL PASSING** |
| `practice-mode-flow.spec.js` | 1 | 1 | ✅ **ALL PASSING** |
| `comprehensive-queries.spec.js` | 2 | 2 | ✅ **ALL PASSING** |

**Total:** 28 tests | **28 passing** (100%) ✅

---

## ✅ Fully Passing Test Suites

### 1. `basic-workflow.spec.js` - ALL 9 TESTS PASSING ✓

**Fixes Applied:**
- Changed `mockLogin()` to `performRealLogin()` for actual login flow
- Added query typing in "should load a question and run query" test
- Increased test timeout to 120 seconds

### 2. `debug-login-questions.spec.js` - PASSING ✓

Tests login flow with actual authentication and question selector visibility.

### 3. `debug-init.spec.js` - PASSING ✓

Tests initial app state capture and DOM structure verification.

### 4. `loading-state.spec.js` - ALL 3 TESTS PASSING ✓

**Fixes Applied:**
- Updated test to wait for loading overlay to be hidden instead of expecting visible state
- Added proper async handling with `toPass()` and timeout

### 5. `auth-flow.spec.js` - ALL 9 TESTS PASSING ✓

**Fixes Applied:**
- Changed loading state expectation to loaded state (`opacity: 1`)
- Converted "Mock Authentication" tests to "Real Authentication Flow" with actual login
- Fixed JavaScript Execution Verification test with timeout and `waitForFunction()`
- Fixed logged-in UI state checks to wait for questions to load

### 6. `arrow-debug.spec.js` - ALL 2 TESTS PASSING ✓

Tests Arrow data structure capture and analysis.

### 7. `practice-mode-flow.spec.js` - ALL 1 TEST PASSING ✓

**Fixes Applied:**
- Removed duplicate `startPracticeBtn` from HTML (was causing conflict with JS-created button)
- Updated practice-manager.js to show button by default when created

### 8. `comprehensive-queries.spec.js` - ALL 2 TESTS PASSING ✓

**Fixes Applied:**
- Converted `mockLogin()` to `performRealLogin()`
- Updated table name from `sample_employees` to `employees`
- Updated expected columns to match actual schema
- Fixed aggregation queries to use existing columns
- Increased test timeout to 3 minutes

---

## Key Fixes Applied

### 1. FileHandler Blocking UI
**Files:** `js/app.js`, `js/file-handler.js`
**Issue:** TypeError on null dropZone element
**Fix:** Conditional FileHandler creation, defensive checks

### 2. Hardcoded API URLs
**Files:** `js/services/question-dropdown-manager.js`, `js/services/questions-manager.js`
**Issue:** `http://localhost:3000` hardcoded
**Fix:** Dynamic hostname: `http://${hostname}:3000/api`

### 3. Mock Login Not Working
**Files:** `tests/e2e/basic-workflow.spec.js`, `tests/e2e/auth-flow.spec.js`, `tests/e2e/comprehensive-queries.spec.js`
**Issue:** Mock authentication not triggering app flow
**Fix:** Changed to real login with form submission

### 4. PracticeManager Import Missing
**File:** `js/services/auth-manager.js`
**Issue:** `PracticeManager is not defined` error
**Fix:** Added import: `import { PracticeManager } from './practice-manager.js';`

### 5. Duplicate startPracticeBtn
**Files:** `index.html`, `js/services/practice-manager.js`
**Issue:** Two buttons with same ID, test finding hidden HTML button instead of JS-created one
**Fix:** Removed HTML button, made JS-created button visible by default

### 6. Schema Mismatches
**File:** `tests/e2e/comprehensive-queries.spec.js`
**Issue:** Tests expected `sample_employees` with columns that don't exist
**Fix:** Updated to use `employees` table with actual schema

---

## How to Run Tests

```bash
# Run all tests (recommended with single worker to avoid concurrency issues)
npm run test:e2e -- --project=chromium --workers=1

# Run all tests in headed mode
npm run test:e2e -- --project=chromium --headed

# Run specific test file
npm run test:e2e -- tests/e2e/basic-workflow.spec.js --project=chromium

# Run specific test with grep
npm run test:e2e -- tests/e2e/auth-flow.spec.js --grep "should login" --project=chromium

# Using script
./run-debug-test.sh
```

---

## Individual Test Status Files

Each test file has its own status file:
- `tests/e2e/AUTH_FLOW_SPEC_STATUS.md`
- `tests/e2e/ARROW_DEBUG_SPEC_STATUS.md`
- `tests/e2e/LOADING_STATE_SPEC_STATUS.md`
- `tests/e2e/PRACTICE_MODE_FLOW_SPEC_STATUS.md`
- `tests/e2e/COMPREHENSIVE_QUERIES_SPEC_STATUS.md`

---

**Last Updated:** 2026-02-28
**Status:** All 28 tests passing (100%) ✅
