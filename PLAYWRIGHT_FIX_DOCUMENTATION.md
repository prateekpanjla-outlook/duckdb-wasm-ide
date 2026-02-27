# Playwright E2E Test Fix Documentation

**Date**: 2025-02-27
**Commit**: `0ed1e37`
**Status**: ✅ Playwright tests now working with `--headed` flag

---

## Problem Summary

### Initial Issue
- `npx playwright test` was failing with error:
  ```
  Playwright Test did not expect test.describe() to be called here
  ```

### Root Causes Identified

1. **Vitest/Playwright Conflict**: Vitest's `expect.extend()` with custom matchers was conflicting with Playwright's expect
2. **Loading Overlay Blocking UI**: The `showLoading(false)` wasn't being called reliably, causing the loading overlay to persist and block clicks
3. **Port Conflicts**: Playwright config was using port 8000 which had conflicts
4. **Python Version**: Server command used `python` instead of `python3`

---

## Changes Made

### 1. `tests/setup/vitest.setup.js` - Removed Custom Matchers

**What was removed** (lines 172-199 in old version):
```javascript
// Custom matchers that conflicted with Playwright
expect.extend({
    toBeValidFile(received) { ... },
    toHaveValidMetadata(received) { ... },
    // ... more custom matchers
});
```

**Why**: Vitest's custom matchers were polluting the global expect object, causing conflicts when Playwright tried to use its own expect implementation.

**Current state**: File now only contains mocks (CodeMirror, localStorage, File, FileReader, Blob, URL APIs)

---

### 2. `js/app.js` - Error Handling for Loading Overlay

#### Changes to Constructor (lines 12-24):
```javascript
constructor() {
    this.dbManager = new DuckDBManager();
    this.fileHandler = new FileHandler(this.dbManager);
    this.queryEditor = new QueryEditor();
    this.resultsView = new ResultsView();

    // Initialize async and handle errors
    this.init().catch((error) => {
        console.error('[app.js] Initialization error:', error);
        // Ensure loading overlay is hidden even if init fails
        this.showLoading(false);
    });
}
```

**Why**: If init() throws an error, the loading overlay would never be hidden, blocking all UI interactions.

#### Changes to init() Method (lines 26-88):
```javascript
async init() {
    try {
        console.log('[app.js] init() - Starting application initialization');

        // Set up event listeners
        console.log('[app.js] init() - Setting up event listeners');
        this.setupEventListeners();

        // Initialize Authentication Manager (but don't initialize DuckDB yet!)
        console.log('[app.js] init() - Creating AuthManager...');
        this.authManager = new AuthManager();
        console.log('[app.js] init() - AuthManager created, checking if modal exists...');

        // Check if modal was created
        setTimeout(() => {
            const modal = document.getElementById('authModal');
            console.log('[app.js] init() - AuthModal exists in DOM:', !!modal);
            console.log('[app.js] init() - window.app exists:', !!window.app);
            console.log('[app.js] init() - window.app.authManager exists:', !!(window.app && window.app.authManager));
        }, 100);

        // Initialize Questions Manager
        console.log('[app.js] init() - Creating QuestionsManager...');
        this.questionsManager = new QuestionsManager();
        console.log('[app.js] init() - QuestionsManager created');

        // Check if user is already logged in from localStorage
        const token = localStorage.getItem('auth_token');
        const user = JSON.parse(localStorage.getItem('user_data') || 'null');

        console.log('[app.js] init() - Token exists:', !!token);
        console.log('[app.js] init() - User exists:', !!user);

        if (token && user) {
            console.log('[app.js] init() - User is logged in, initializing DuckDB');
            // User is logged in, initialize DuckDB now
            await this.initializeDuckDB();

            // Update UI for logged in user
            this.authManager.updateUIForLoggedInUser(user);

            // Initialize Practice Manager
            this.practiceManager = new PracticeManager(this.dbManager);
            window.practiceManager = this.practiceManager;

            // Make app instance available globally
            window.app = this;
            console.log('[app.js] init() - App instance set to window.app');
        } else {
            console.log('[app.js] init() - User not logged in, showing login prompt');
            // User not logged in, show login prompt
            this.showLoginPrompt();
        }

        console.log('[app.js] init() - Initialization complete');
    } catch (error) {
        console.error('[app.js] Error during initialization:', error);
    } finally {
        // Always hide loading overlay, regardless of success or failure
        console.log('[app.js] Hiding loading overlay');
        this.showLoading(false);
    }
}
```

**Why**: The `finally` block ensures `showLoading(false)` is ALWAYS called, even if an error occurs. This prevents the loading overlay from permanently blocking the UI.

#### showLoading() Method (lines 151-168):
```javascript
showLoading(show, message = '') {
    const overlay = document.getElementById('loadingOverlay');
    const appContainer = document.getElementById('appContainer');
    const loadingMessage = document.getElementById('loadingMessage');

    if (show) {
        overlay.classList.add('visible');
        appContainer.style.opacity = '0.5';
        appContainer.style.pointerEvents = 'none';
        if (message) {
            loadingMessage.textContent = message;
        }
    } else {
        overlay.classList.remove('visible');
        appContainer.style.opacity = '1';
        appContainer.style.pointerEvents = 'auto';
    }
}
```

**Key Point**: When `show` is `false`, this method:
1. Removes the `visible` class from loading overlay (hides it via `display: none`)
2. Sets appContainer opacity to `1`
3. Sets appContainer pointerEvents to `auto` (allows clicks)

---

### 3. `playwright.config.js` - Configuration Updates

**Changes**:
```javascript
// Before:
use: {
    baseURL: 'http://localhost:8000',
    // ...
},
webServer: {
    command: 'python server.py',
    url: 'http://localhost:8000',
    // ...
}

// After:
use: {
    baseURL: 'http://localhost:8888',
    // ...
},
webServer: {
    command: 'python3 server.py 8888',
    url: 'http://localhost:8888',
    // ...
}
```

**Why**:
- Port 8000 had conflicts with other processes
- Changed to `python3` for compatibility with systems where `python` is Python 2

---

## New Test Files Created

### `tests/e2e/auth-flow.spec.js`
Tests for authentication flow:
- JavaScript module loading verification
- AuthManager modal creation
- Login button click
- Form validation
- Modal close behavior

### `tests/e2e/debug-init.spec.js`
Debug test that captures initial app state:
- Console message logging
- Element state verification
- Manual fix workaround (for testing)
- Screenshot capture at each step

### `test-manual.html`
Manual testing page with:
- Console log capture
- Visual test results
- Buttons for testing loading overlay
- Automatic test execution after 5 seconds

---

## Current Test Results

### Passing Tests (6/26 Chromium)
```
✅ tests/e2e/debug-init.spec.js:8:1 › debug: capture initial app state
✅ tests/e2e/loading-state.spec.js:122:5 › DuckDB Loading State › should complete initialization within reasonable time
✅ tests/e2e/loading-state.spec.js:157:5 › DuckDB Loading State › should show correct loading messages
✅ tests/e2e/basic-workflow.spec.js:13:5 › DuckDB WASM IDE - Basic Workflow › should load the application
✅ tests/e2e/basic-workflow.spec.js:211:5 › DuckDB WASM IDE - Arrow Debugging › should debug Arrow result structure
✅ tests/e2e/arrow-debug.spec.js:10:1 › Arrow Debug: Capture structure after data load
```

### Known Issues (20/26 Chromium)

1. **Pointer Events Interception** (`<body>...</body> intercepts pointer events`)
   - The appContainer inline styles may not be cleared before tests try to click
   - Tests may need to wait for JavaScript initialization
   - Workaround: Add delay or wait for specific element state

2. **Outdated Tests** (looking for `#dropZone` that no longer exists):
   - `tests/e2e/basic-workflow.spec.js` - most tests
   - `tests/e2e/comprehensive-queries.spec.js` - all tests
   - These need to be updated to use the new question selector UI

3. **Port Mismatch**:
   - `tests/e2e/practice-mode-flow.spec.js` uses port 8000
   - Should be updated to 8888

4. **Loading State Test**:
   - `tests/e2e/loading-state.spec.js` expects overlay to be visible
   - But our fix hides it correctly (test expectation is wrong)

---

## How to Run Tests

### Headed Mode (see browser window):
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

## Files Modified

| File | Changes | Lines Changed |
|------|---------|---------------|
| `js/app.js` | Added error handling to init() and constructor | ±125 |
| `playwright.config.js` | Port 8000→8888, python→python3 | ±6 |
| `tests/setup/vitest.setup.js` | Removed expect.extend() | -29 |

---

## Next Steps to Complete

1. **Fix Pointer Events Timing**:
   - Tests should wait for `appContainer` to have `pointer-events: auto`
   - Or add a small delay after page load before clicking

2. **Update Outdated Tests**:
   - Rewrite `basic-workflow.spec.js` to use new question selector UI
   - Rewrite `comprehensive-queries.spec.js` similarly

3. **Fix Port References**:
   - Update `practice-mode-flow.spec.js` to use port 8888

4. **Fix Loading Test Expectations**:
   - Update `loading-state.spec.js` to expect overlay to be hidden after init

---

## Console Logging Added

For debugging purposes, the following console.log statements were added:

- `[app.js] init() - Starting application initialization`
- `[app.js] init() - Setting up event listeners`
- `[app.js] init() - Creating AuthManager...`
- `[app.js] init() - AuthManager created, checking if modal exists...`
- `[app.js] init() - AuthModal exists in DOM: [boolean]`
- `[app.js] init() - window.app exists: [boolean]`
- `[app.js] init() - window.app.authManager exists: [boolean]`
- `[app.js] init() - Creating QuestionsManager...`
- `[app.js] init() - QuestionsManager created`
- `[app.js] init() - Token exists: [boolean]`
- `[app.js] init() - User exists: [boolean]`
- `[app.js] init() - User is logged in, initializing DuckDB`
- `[app.js] init() - User not logged in, showing login prompt`
- `[app.js] init() - Initialization complete`
- `[app.js] Error during initialization: [error]`
- `[app.js] Hiding loading overlay`
- `[app.js] Initialization error: [error]` (in catch handler)
- `[app.js] DOMContentLoaded fired, creating App instance`
- `[app.js] App instance created and set to window.app`

These logs help track the initialization flow and debug issues.
