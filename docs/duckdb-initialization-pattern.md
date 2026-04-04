# DuckDB WASM Initialization Pattern

**Last Verified:** 2026-03-31
**Status:** ✅ Working (EH bundle)
**Source:** [js/duckdb-manager.js:17-41](../js/duckdb-manager.js#L17)

## Current Pattern: selectBundle() with EH Preferred

The initialization uses DuckDB WASM's built-in `selectBundle()` helper to auto-detect the best bundle for the current browser. EH (WASM exceptions) is preferred, MVP is the fallback, and COI is disabled.

```javascript
// 1. Load DuckDB WASM module
const duckdb = await import('/libs/duckdb-wasm/duckdb-browser.mjs');

// 2. Create logger
const logger = new duckdb.ConsoleLogger();

// 3. Define bundles — selectBundle() picks the right one
const base = new URL('/libs/duckdb-wasm/', window.location.origin).href;
const BUNDLES = {
    mvp: {
        mainModule: `${base}duckdb-mvp.wasm`,
        mainWorker: `${base}duckdb-browser-mvp.worker.js`,
    },
    eh: {
        mainModule: `${base}duckdb-eh.wasm`,
        mainWorker: `${base}duckdb-browser-eh.worker.js`,
    },
    coi: null,  // Disabled — see COI Bundle Issue below
};

// 4. Let DuckDB pick the best bundle for this browser
const bundle = await duckdb.selectBundle(BUNDLES);

// 5. Create worker and instantiate
const worker = await duckdb.createWorker(bundle.mainWorker);
const db = new duckdb.AsyncDuckDB(logger, worker);
await db.instantiate(bundle.mainModule);

// 6. Connect
const connection = await db.connect();
```

## The Three Bundles

| Bundle | Size | Browser Support | Status |
|--------|------|----------------|--------|
| **eh** (preferred) | ~34 MB | WASM exceptions (2020+) | Active |
| **mvp** (fallback) | ~38 MB | All browsers with WASM (2017+) | Active fallback |
| **coi** (disabled) | ~37 MB | Requires SharedArrayBuffer + COOP/COEP | **Disabled** |

`selectBundle()` returns `eh` if the browser supports WASM exceptions, otherwise `mvp`.

### COI Bundle Issue

The COI (Cross-Origin-Isolated) bundle enables multi-threaded query execution via `SharedArrayBuffer`. It is currently set to `null` because `@duckdb/duckdb-wasm@1.33.1-dev18.0` hangs indefinitely on `instantiate()` with the COI bundle, even when COOP/COEP headers are correctly set.

The EH bundle provides fast single-threaded execution (~1.3s init time) and is sufficient for the practice-question workload. Multi-threading is not needed for the datasets used here (small tables per question).

If a future `@duckdb/duckdb-wasm` release fixes the COI hang, the bundle can be re-enabled by adding paths to the `coi` key in `BUNDLES`.

## Historical Fixes (Resolved)

These were real bugs encountered during earlier development. All are fixed in the current pattern:

### ~~Fix 1: Import Map for Dependencies~~
**Was:** `Failed to resolve module specifier 'apache-arrow'`
**Resolution:** Import map added in [index.html](../index.html) for `apache-arrow`, `tslib`, `qs`, `side-channel`, `flatbuffers`. Still required today.

### ~~Fix 2: ConsoleLogger Capitalization~~
**Was:** `duckdb.console_logger is not a constructor`
**Resolution:** Use `ConsoleLogger` (capital C). Current code uses the correct name.

### ~~Fix 3: AsyncDuckDB Parameter Order~~
**Was:** `this._worker.addEventListener is not a function`
**Resolution:** `new AsyncDuckDB(logger, worker)` — logger first. Current code is correct.

### ~~Fix 4: Manual pthreadWorker Required~~
**Was:** Database initialization failures when `pthreadWorker` was omitted.
**Resolution:** No longer relevant. `selectBundle()` + EH bundle don't need `pthreadWorker` (no threading).

### ~~Fix 5: Direct Worker Creation~~
**Was:** Proxy object issues with `createWorker()`.
**Resolution:** Current code uses `duckdb.createWorker(bundle.mainWorker)` successfully — the old issue was specific to earlier DuckDB WASM versions.

## References

- [DuckDB WASM Instantiation Guide](https://duckdb.org/docs/stable/clients/wasm/instantiation.html)
- [DuckDB WASM GitHub](https://github.com/duckdb/duckdb-wasm)
- [Current implementation](../js/duckdb-manager.js)
