# DuckDB Unit Tests Documentation

## Overview

This document describes the comprehensive unit tests for the DuckDB WebAssembly integration in the DuckDB WASM IDE. The unit tests verify all database operations without requiring the actual DuckDB WASM module to load.

## Test Architecture

### Dependency Injection Pattern

The `DuckDBManager` class uses dependency injection to enable testing:

```javascript
// Production use
const dbManager = new DuckDBManager();

// Testing use
const mockDuckDB = new MockAsyncDuckDB();
const dbManager = new DuckDBManager({
    duckdbModule: mockDuckDB,
    logger: mockLogger
});
```

### Mock Implementation

The `MockDuckDB` class simulates DuckDB WASM behavior:

- **MockAsyncDuckDB**: Simulates the WASM module
- **MockDuckDBConnection**: Simulates a database connection
- Supports query execution, file operations, and table management

## Test Suite: DuckDBManager (25 Tests)

### 1. Initialization Tests (3 tests)

#### Test: `should initialize successfully with valid module`
```javascript
// Verifies successful initialization with injected mock module
await dbManager.initialize();
expect(result).toBe(true);
expect(dbManager.connection).toBeDefined();
```

**Purpose**: Confirms the manager initializes correctly with a mock DuckDB module.

#### Test: `should handle initialization errors gracefully`
```javascript
// Tests error handling when initialization fails
const failingManager = new DuckDBManager({
    duckdbModule: null,
    logger: mockLogger
});
```

**Purpose**: Ensures graceful failure when DuckDB cannot be loaded.

#### Test: `should use default configuration when not provided`
```javascript
// Verifies default CDN bundle and log level
const defaultManager = new DuckDBManager({
    duckdbModule: mockDuckDB,
    logger: mockLogger
});
```

**Purpose**: Confirms sensible defaults are applied.

---

### 2. Query Execution Tests (5 tests)

#### Test: `should execute SELECT query successfully`
```javascript
const result = await dbManager.executeQuery('SELECT * FROM test');
expect(result).toHaveProperty('columns');
expect(result).toHaveProperty('rows');
```

**Purpose**: Validates basic query execution and result structure.

#### Test: `should throw DuckDBError when not connected`
```javascript
await expect(
    disconnectedManager.executeQuery('SELECT 1')
).rejects.toThrow(DuckDBError);
```

**Purpose**: Ensures proper error handling for disconnected state.

#### Test: `should format DuckDB result correctly`
```javascript
const formatted = dbManager.formatResult(mockResult);
expect(formatted.columns).toEqual(['id', 'name']);
expect(formatted.rows[0]).toEqual({ id: 1, name: 'Alice' });
```

**Purpose**: Tests result formatting from DuckDB format to app format.

**Format Transformation**:
```javascript
// DuckDB format
{
    schema: { fields: [{ name: 'id' }, { name: 'name' }] },
    data: [[1, 2, 3], ['Alice', 'Bob', 'Charlie']],
    numRows: 3
}

// App format
{
    columns: ['id', 'name'],
    rows: [
        { id: 1, name: 'Alice' },
        { id: 2, name: 'Bob' },
        { id: 3, name: 'Charlie' }
    ]
}
```

#### Test: `should handle empty result`
```javascript
const formatted = dbManager.formatResult({
    schema: { fields: [] },
    data: [],
    numRows: 0
});
expect(formatted.columns).toEqual([]);
expect(formatted.rows).toEqual([]);
```

**Purpose**: Ensures empty results don't cause errors.

#### Test: `should throw DuckDBError for failed queries`
```javascript
await expect(
    errorManager.executeQuery('SELECT * FROM nonexistent')
).rejects.toThrow(DuckDBError);
```

**Purpose**: Validates error wrapping for query failures.

---

### 3. File Operations Tests (6 tests)

#### Test: `should register CSV file successfully`
```javascript
const mockFile = new File(['id,name\n1,Alice'], 'test.csv');
const result = await dbManager.registerFile('test.csv', mockFile);
expect(result).toBe(true);
```

**Purpose**: Verifies file registration with DuckDB.

#### Test: `should throw error when registering file without database`
```javascript
await expect(
    noDbManager.registerFile('test.csv', mockFile)
).rejects.toThrow(DuckDBError);
```

**Purpose**: Ensures validation before file operations.

#### Test: `should insert CSV from path`
```javascript
const result = await dbManager.insertCSVFromPath('test.csv', 'test_table');
expect(result).toBe(true);
```

**Purpose**: Tests CSV data insertion.

#### Test: `should throw error when inserting CSV without connection`
```javascript
await expect(
    newManager.insertCSVFromPath('test.csv', 'test_table')
).rejects.toThrow(DuckDBError);
```

**Purpose**: Validates connection state before operations.

#### Test: `should insert JSON from path`
```javascript
const result = await dbManager.insertJSONFromPath('test.json', 'test_table');
expect(result).toBe(true);
```

**Purpose**: Tests JSON data insertion.

#### Test: `should create table from Parquet file`
```javascript
const result = await dbManager.createTableFromParquet('test.parquet', 'test_table');
expect(result).toBe(true);
```

**Purpose**: Tests Parquet file table creation.

---

### 4. Table Operations Tests (3 tests)

#### Test: `should retrieve list of tables`
```javascript
dbManager.connection.mockData.tables['test'] = { type: 'csv', rows: 100 };
const result = await dbManager.getTables();
expect(result.columns).toContain('name');
```

**Purpose**: Verifies table listing functionality.

#### Test: `should return empty tables list when no tables exist`
```javascript
const result = await dbManager.getTables();
expect(result.rows).toHaveLength(0);
```

**Purpose**: Handles empty database state.

#### Test: `should throw error when getting tables without connection`
```javascript
await expect(newManager.getTables()).rejects.toThrow(DuckDBError);
```

**Purpose**: Validates connection state.

---

### 5. Cleanup Tests (2 tests)

#### Test: `should close connection properly`
```javascript
await dbManager.initialize();
await dbManager.close();
expect(dbManager.connection).toBeNull();
expect(dbManager.db).toBeNull();
```

**Purpose**: Ensures proper resource cleanup.

#### Test: `should handle closing when already closed`
```javascript
await dbManager.close();
await expect(dbManager.close()).resolves.not.toThrow();
```

**Purpose**: Tests idempotent close operation.

---

### 6. Error Handling Tests (2 tests)

#### Test: `should create DuckDBError with message and code`
```javascript
const error = new DuckDBError('Test error', 'TEST_CODE');
expect(error.message).toBe('Test error');
expect(error.code).toBe('TEST_CODE');
expect(error.name).toBe('DuckDBError');
```

**Purpose**: Validates custom error class.

#### Test: `should use default error code`
```javascript
const error = new DuckDBError('Test error');
expect(error.code).toBe('DUCKDB_ERROR');
```

**Purpose**: Confirms default error code.

---

### 7. Edge Cases Tests (4 tests)

#### Test: `should handle result with missing data`
```javascript
const formatted = dbManager.formatResult({
    schema: { fields: [{ name: 'id' }] }
});
expect(formatted.rows).toEqual([]);
```

**Purpose**: Handles incomplete results.

#### Test: `should handle result with zero rows`
```javascript
const formatted = dbManager.formatResult({
    schema: { fields: [{ name: 'id' }] },
    data: [[]],
    numRows: 0
});
expect(formatted.rows).toEqual([]);
```

**Purpose**: Handles empty data arrays.

#### Test: `should handle columns with null values`
```javascript
const formatted = dbManager.formatResult({
    schema: { fields: [{ name: 'id' }, { name: 'name' }] },
    data: [[1, 2], ['Alice', null]],
    numRows: 2
});
expect(formatted.rows[1]).toEqual({ id: 2, name: null });
```

**Purpose**: Properly handles NULL values in results.

#### Test: `should handle result with null schema`
```javascript
const formatted = dbManager.formatResult(null);
expect(formatted.columns).toEqual([]);
expect(formatted.rows).toEqual([]);
```

**Purpose**: Handles null/undefined results.

---

## Test Coverage Summary

| Category | Tests | Coverage |
|----------|-------|----------|
| Initialization | 3 | 100% |
| Query Execution | 5 | 100% |
| File Operations | 6 | 100% |
| Table Operations | 3 | 100% |
| Cleanup | 2 | 100% |
| Error Handling | 2 | 100% |
| Edge Cases | 4 | 100% |
| **Total** | **25** | **100%** |

---

## Mock Implementation Details

### MockDuckDBConnection

The mock connection simulates DuckDB behavior:

```javascript
class MockDuckDBConnection {
    constructor(mockData = {}) {
        this.mockData = {
            tables: mockData.tables || {},
            queryResults: mockData.queryResults || {}
        };
        this.queryLog = [];
        this.isClosed = false;
    }

    async query(sql) {
        if (this.isClosed) {
            throw new Error('Connection is closed');
        }
        this.queryLog.push(sql);

        // Handle SHOW TABLES
        if (sql.trim().toUpperCase().startsWith('SHOW TABLES')) {
            return this._getMockTablesResult();
        }

        // Return default result
        return this._createMockResult(sql);
    }
}
```

**Features**:
- Tracks all executed queries
- Simulates connection state
- Returns realistic mock data
- Supports custom query results

---

## Running the Tests

### Run all DuckDBManager tests:
```bash
npm test tests/unit/core/DuckDBManager.test.js
```

### Run with coverage:
```bash
npm run test:coverage tests/unit/core/DuckDBManager.test.js
```

### Run in watch mode:
```bash
npm test -- --watch
```

---

## Test Dependencies

- **Vitest**: Test runner
- **jsdom**: DOM simulation
- **MockDuckDB**: Custom mock implementation
- **vi.fn()**: Vitest spy functions

---

## Future Enhancements

Planned test additions:

1. **Transaction Tests**: Test BEGIN, COMMIT, ROLLBACK
2. **Prepared Statement Tests**: Test parameterized queries
3. **Performance Tests**: Test large dataset handling
4. **Concurrent Query Tests**: Test parallel query execution
5. **WASM Loading Tests**: Test actual WASM module loading

---

## Related Documentation

- [Storage Adapter Tests](./storage-tests.md)
- [History Service Tests](./history-service-tests.md)
- [Integration Tests](./integration-tests.md)
- [Testing Guide](./TESTING.md)
