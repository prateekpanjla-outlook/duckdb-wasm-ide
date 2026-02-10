# DuckDB WASM Initialization Pattern

**Date Verified**: 2026-02-10
**Status**: ✅ Working
**Test File**: [test-duckdb-init.html](../test-duckdb-init.html)

## Working Initialization Pattern

This document captures the exact initialization pattern that successfully initializes DuckDB WASM in the browser.

### Prerequisites

1. **Import Map Required**: DuckDB WASM has transitive dependencies that must be mapped
2. **Parameter Order Critical**: `AsyncDuckDB(logger, worker)` - logger FIRST
3. **pthreadWorker Required**: Must use `pthreadWorker` in `instantiate()` call

### Import Map Configuration

```html
<script type="importmap">
{
    "imports": {
        "apache-arrow": "/node_modules/apache-arrow/Arrow.dom.mjs",
        "apache-arrow/": "/node_modules/apache-arrow/",
        "tslib": "/node_modules/tslib/tslib.es6.js",
        "tslib/": "/node_modules/tslib/modules/",
        "qs": "/node_modules/qs/lib/index.js",
        "side-channel": "/node_modules/side-channel/index.js",
        "flatbuffers": "/node_modules/flatbuffers/mjs/flatbuffers.js"
    }
}
</script>
```

### Working Initialization Code

```javascript
// Step 1: Load DuckDB WASM from local files
const duckdb = await import('/libs/duckdb-wasm/duckdb-browser.mjs');

// Step 2: Create logger
const logger = new duckdb.ConsoleLogger();

// Step 3: Define bundle with pthreadWorker
const bundle = {
    mainModule: '/libs/duckdb-wasm/duckdb-mvp.wasm',
    mainWorker: '/libs/duckdb-wasm/duckdb-browser-mvp.worker.js',
    pthreadWorker: '/libs/duckdb-wasm/duckdb-browser-mvp.worker.js'  // REQUIRED
};

// Step 4: Create worker directly (NOT using createWorker())
const worker = new Worker(bundle.mainWorker);

// Step 5: Instantiate database (logger FIRST, then worker)
const db = new duckdb.AsyncDuckDB(logger, worker);
await db.instantiate(bundle.mainModule, bundle.pthreadWorker);

// Step 6: Connect
const connection = await db.connect();
```

## Critical Fixes Applied

### Fix 1: Import Map for Dependencies
**Error**: `Failed to resolve module specifier 'apache-arrow'`

**Solution**: Added import map with all transitive dependencies:
- apache-arrow
- tslib
- qs
- side-channel
- flatbuffers

### Fix 2: ConsoleLogger Capitalization
**Error**: `duckdb.console_logger is not a constructor`

**Solution**: Use `ConsoleLogger` (capital C), not `console_logger`

### Fix 3: AsyncDuckDB Parameter Order
**Error**: `this._worker.addEventListener is not a function`

**Solution**: Use correct parameter order:
```javascript
// WRONG
const db = new duckdb.AsyncDuckDB(worker, logger);

// CORRECT
const db = new duckdb.AsyncDuckDB(logger, worker);
```

**Reference**: [Official DuckDB Documentation](https://duckdb.org/docs/stable/clients/wasm/instantiation.html)

### Fix 4: pthreadWorker Usage
**Error**: Database initialization failures

**Solution**: Use `pthreadWorker` in instantiate call:
```javascript
await db.instantiate(bundle.mainModule, bundle.pthreadWorker);
```

### Fix 5: Direct Worker Creation
**Error**: Proxy object issues with `createWorker()`

**Solution**: Use native Worker constructor:
```javascript
const worker = new Worker(bundle.mainWorker);
```

## Test Results

**Browser**: Chromium
**Date**: 2026-02-10
**Result**: ✅ All 9 steps passed

```
[2026-02-10T11:19:00.256Z] 🚀 Starting DuckDB WASM initialization test...
[2026-02-10T11:19:00.256Z] Step 1: Loading DuckDB module...
[2026-02-10T11:19:03.169Z] ✅ DuckDB module loaded successfully!
[2026-02-10T11:19:03.169Z] Step 2: Creating console logger...
[2026-02-10T11:19:03.169Z] ✅ Logger created successfully!
[2026-02-10T11:19:03.169Z] Step 3: Setting up bundle paths...
[2026-02-10T11:19:03.169Z] Step 4: Checking if WASM files exist...
[2026-02-10T11:19:03.180Z] WASM file status: 200 OK
[2026-02-10T11:19:03.206Z] Worker file status: 200 OK
[2026-02-10T11:19:03.207Z] Step 5: Creating worker...
[2026-02-10T11:19:03.209Z] ✅ Worker created successfully!
[2026-02-10T11:19:03.209Z] Step 6: Creating AsyncDuckDB instance...
[2026-02-10T11:19:03.210Z] ✅ AsyncDuckDB instance created!
[2026-02-10T11:19:03.210Z] Step 7: Instantiating database with WASM file...
[2026-02-10T11:19:05.686Z] ✅ Database instantiated successfully!
[2026-02-10T11:19:05.686Z] Step 8: Connecting to database...
[2026-02-10T11:19:05.986Z] ✅ Database connected successfully!
[2026-02-10T11:19:05.986Z] Step 9: Testing simple query (SELECT 1)...
[2026-02-10T11:19:06.031Z] ✅ Query executed successfully!
[2026-02-10T11:19:06.031Z] 🎉 ALL TESTS PASSED! DuckDB WASM is working correctly!
```

## Files Updated

1. **js/duckdb-manager.js** - Uses correct initialization pattern
2. **index.html** - Has import map
3. **test-duckdb-init.html** - Standalone test page with detailed logging

## Next Steps

1. ✅ DuckDB initialization working
2. Test main application with CSV file upload
3. Verify query execution works end-to-end
4. Continue with Phase 3-5 testing (UI components, integration, E2E)

## References

- Official Documentation: https://duckdb.org/docs/stable/clients/wasm/overview.html
- Instantiation Guide: https://duckdb.org/docs/stable/clients/wasm/instantiation.html
- GitHub Repository: https://github.com/duckdb/duckdb-wasm
