/**
 * MockDuckDB - Mock implementation of DuckDB WASM for testing
 * Allows testing DuckDB functionality without loading the actual WASM module
 */

/**
 * Mock connection that simulates DuckDB connection behavior
 */
export class MockDuckDBConnection {
    constructor(mockData = {}) {
        this.mockData = {
            tables: mockData.tables || {},
            queryResults: mockData.queryResults || {},
            defaultResult: mockData.defaultResult || this._createDefaultResult()
        };
        this.queryLog = [];
        this.isClosed = false;
    }

    /**
     * Execute a query and return mock result
     * @param {string} sql - SQL query
     * @returns {Promise<Object>} Query result
     */
    async query(sql) {
        if (this.isClosed) {
            throw new Error('Connection is closed');
        }

        this.queryLog.push(sql);

        // Handle SHOW TABLES
        if (sql.trim().toUpperCase().startsWith('SHOW TABLES')) {
            return this._getMockTablesResult();
        }

        // Handle specific table queries
        const tableMatch = sql.match(/FROM\s+(\w+)/i);
        if (tableMatch) {
            const tableName = tableMatch[1];
            if (this.mockData.queryResults[tableName]) {
                return this.mockData.queryResults[tableName];
            }
        }

        // Return default result for other queries
        return this._createMockResult(sql);
    }

    /**
     * Insert data from CSV file
     * @param {string} fileName - Name of the CSV file
     * @param {Object} options - Insert options
     * @returns {Promise<boolean>}
     */
    async insertCSVFromPath(fileName, options) {
        if (this.isClosed) {
            throw new Error('Connection is closed');
        }

        const tableName = options?.name || this._tableNameFromFileName(fileName);
        this.mockData.tables[tableName] = {
            type: 'csv',
            source: fileName,
            columns: options?.columns || null,
            rows: 100 // Mock row count
        };
        return true;
    }

    /**
     * Insert data from JSON file
     * @param {string} fileName - Name of the JSON file
     * @param {Object} options - Insert options
     * @returns {Promise<boolean>}
     */
    async insertJSONFromPath(fileName, options) {
        if (this.isClosed) {
            throw new Error('Connection is closed');
        }

        const tableName = options?.name || this._tableNameFromFileName(fileName);
        this.mockData.tables[tableName] = {
            type: 'json',
            source: fileName,
            rows: 50
        };
        return true;
    }

    /**
     * Close the connection
     */
    async close() {
        this.isClosed = true;
    }

    /**
     * Get query log
     * @returns {Array<string>} Array of executed queries
     */
    getQueryLog() {
        return [...this.queryLog];
    }

    /**
     * Reset query log
     */
    resetQueryLog() {
        this.queryLog = [];
    }

    /**
     * Create mock result for a table
     * @private
     */
    _createMockResult(sql) {
        // Try to extract table name from query
        const tableMatch = sql.match(/FROM\s+(\w+)/i);
        const tableName = tableMatch ? tableMatch[1] : 'unknown';

        return {
            schema: {
                fields: [
                    { name: 'id', type: 'INTEGER' },
                    { name: 'value', type: 'VARCHAR' }
                ]
            },
            data: [
                [1, 2, 3],
                ['a', 'b', 'c']
            ],
            numRows: 3
        };
    }

    /**
     * Create mock SHOW TABLES result
     * @private
     */
    _getMockTablesResult() {
        const tableNames = Object.keys(this.mockData.tables);

        return {
            schema: {
                fields: [{ name: 'name' }]
            },
            data: [tableNames],
            numRows: tableNames.length
        };
    }

    /**
     * Extract table name from file name
     * @private
     */
    _tableNameFromFileName(fileName) {
        return fileName.replace(/\.[^/.]+$/, '').replace(/[^a-zA-Z0-9_]/g, '_');
    }

    /**
     * Create default empty result
     * @private
     */
    _createDefaultResult() {
        return {
            schema: {
                fields: []
            },
            data: [],
            numRows: 0
        };
    }
}

/**
 * Mock AsyncDuckDB that simulates the WASM module
 */
export class MockAsyncDuckDB {
    constructor(config = {}) {
        this.config = config;
        this.connection = null;
    }

    /**
     * Create a new connection
     * @returns {Promise<MockDuckDBConnection>}
     */
    async connect() {
        this.connection = new MockDuckDBConnection(this.config.mockData || {});
        return this.connection;
    }

    /**
     * Register a file handle (mock)
     * @param {string} fileName - Name of the file
     * @param {File} fileHandle - File handle
     * @returns {Promise<boolean>}
     */
    async registerFileHandle(fileName, fileHandle) {
        // Mock implementation - just return true
        return true;
    }

    /**
     * Register file text content (mock)
     * @param {string} fileName - Name of the file
     * @param {string} content - File content
     * @returns {Promise<boolean>}
     */
    async registerFileText(fileName, content) {
        return true;
    }

    /**
     * Register file buffer (mock)
     * @param {string} fileName - Name of the file
     * @param {Uint8Array} buffer - File buffer
     * @returns {Promise<boolean>}
     */
    async registerFileBuffer(fileName, buffer) {
        return true;
    }

    /**
     * Register file URL (mock)
     * @param {string} fileName - Name of the file
     * @param {string} url - File URL
     * @returns {Promise<boolean>}
     */
    async registerFileURL(fileName, url) {
        return true;
    }

    /**
     * Get current connection
     * @returns {MockDuckDBConnection|null}
     */
    getConnection() {
        return this.connection;
    }
}

/**
 * Factory function to create mock DuckDB with specific data
 * @param {Object} mockData - Mock data to use
 * @returns {MockAsyncDuckDB}
 */
export function createMockDuckDB(mockData = {}) {
    return new MockAsyncDuckDB({ mockData });
}

/**
 * Create mock DuckDB with predefined tables
 * @param {Object} tables - Tables to create
 * @returns {MockAsyncDuckDB}
 */
export function createMockDuckDBWithTables(tables = {}) {
    const mockData = {
        tables: {},
        queryResults: {}
    };

    // Convert table definitions to mock results
    Object.entries(tables).forEach(([name, data]) => {
        mockData.tables[name] = {
            type: 'table',
            rows: data.length
        };

        mockData.queryResults[name] = {
            schema: {
                fields: Object.keys(data[0]).map(key => ({ name: key }))
            },
            data: Object.keys(data[0]).map(key =>
                data.map(row => row[key])
            ),
            numRows: data.length
        };
    });

    return new MockAsyncDuckDB({ mockData });
}
