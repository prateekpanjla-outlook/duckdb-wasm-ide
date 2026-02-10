/**
 * DuckDBManager - Manages DuckDB WASM database operations
 * Refactored with dependency injection for testability
 */
export class DuckDBManager {
    constructor(dependencies = {}) {
        // Inject DuckDB module for testing
        this.duckdbModule = dependencies.duckdbModule || null;
        this.logger = dependencies.logger || console;
        this.connection = null;
        this.db = null;
        this.config = dependencies.config || {
            jsDelivrBundle: 'https://cdn.jsdelivr.net/npm/@duckdb/duckdb-wasm@1.28.1/dist/',
            logLevel: 'WARNING'
        };
    }

    async initialize() {
        try {
            // Use injected DuckDB module if provided (for testing)
            if (this.duckdbModule) {
                this.db = this.duckdbModule;
                this.connection = await this.db.connect();
                this.logger.log('DuckDB initialized successfully');
                return true;
            }

            // Load DuckDB WASM from CDN (production)
            const duckdb = await import(
                this.config.jsDelivrBundle + 'duckdb-browser-blocking.mjs'
            );

            // Create logger
            const logger = new duckdb.console_logger(duckdb.LogLevel[this.config.logLevel]);

            // Create worker
            const worker = await duckdb.createWorker(
                this.config.jsDelivrBundle + 'duckdb-browser-blocking.worker.js'
            );
            worker.logger = logger;

            // Instantiate database
            this.db = new duckdb.AsyncDuckDB(worker, logger);
            await this.db.instantiate(
                this.config.jsDelivrBundle + 'duckdb-browser-blocking.wasm',
                this.config.jsDelivrBundle + 'duckdb-browser-blocking.worker.js'
            );

            // Open connection
            this.connection = await this.db.connect();

            this.logger.log('DuckDB initialized successfully');
            return true;
        } catch (error) {
            this.logger.error('Failed to initialize DuckDB:', error);
            return false;
        }
    }

    async executeQuery(query) {
        if (!this.connection) {
            throw new DuckDBError('Database not connected');
        }

        try {
            const result = await this.connection.query(query);
            return this.formatResult(result);
        } catch (error) {
            this.logger.error('Query failed:', error);
            throw new DuckDBError(`Query failed: ${error.message}`);
        }
    }

    /**
     * Format DuckDB result into standard format
     * @param {Object} result - Raw DuckDB result
     * @returns {Object} Formatted result with columns and rows
     */
    formatResult(result) {
        const data = {
            columns: [],
            rows: []
        };

        if (!result || !result.schema) {
            return data;
        }

        // Get column names
        data.columns = result.schema.fields.map(f => f.name);

        // Get rows
        if (result.data && result.data.length > 0) {
            const numRows = result.numRows || this._getRowCount(result.data);

            for (let i = 0; i < numRows; i++) {
                const row = {};
                data.columns.forEach((col, idx) => {
                    const colData = result.data[idx];
                    row[col] = colData ? colData[i] : null;
                });
                data.rows.push(row);
            }
        }

        return data;
    }

    async registerFile(fileName, fileHandle) {
        if (!this.db) {
            throw new DuckDBError('Database not initialized');
        }

        try {
            await this.db.registerFileHandle(fileName, fileHandle, 2, true);
            return true;
        } catch (error) {
            throw new DuckDBError(`Failed to register file: ${error.message}`);
        }
    }

    async insertCSVFromPath(fileName, tableName) {
        if (!this.connection) {
            throw new DuckDBError('Database not connected');
        }

        try {
            await this.connection.insertCSVFromPath(fileName, {
                name: tableName,
                detect: true,
                header: true
            });
            return true;
        } catch (error) {
            throw new DuckDBError(`Failed to insert CSV: ${error.message}`);
        }
    }

    async insertJSONFromPath(fileName, tableName) {
        if (!this.connection) {
            throw new DuckDBError('Database not connected');
        }

        try {
            await this.connection.insertJSONFromPath(fileName, {
                name: tableName
            });
            return true;
        } catch (error) {
            throw new DuckDBError(`Failed to insert JSON: ${error.message}`);
        }
    }

    async createTableFromParquet(fileName, tableName) {
        if (!this.connection) {
            throw new DuckDBError('Database not connected');
        }

        try {
            await this.connection.query(`
                CREATE TABLE ${tableName} AS
                SELECT * FROM '${fileName}'
            `);
            return true;
        } catch (error) {
            throw new DuckDBError(`Failed to load Parquet: ${error.message}`);
        }
    }

    async getTables() {
        if (!this.connection) {
            throw new DuckDBError('Database not connected');
        }

        try {
            const result = await this.connection.query('SHOW TABLES');
            return this.formatResult(result);
        } catch (error) {
            throw new DuckDBError(`Failed to get tables: ${error.message}`);
        }
    }

    async close() {
        if (this.connection) {
            await this.connection.close();
            this.connection = null;
        }
        this.db = null;
    }

    /**
     * Get row count from result data
     * @private
     */
    _getRowCount(data) {
        if (data.length > 0 && Array.isArray(data[0])) {
            return data[0].length;
        }
        return 0;
    }
}

/**
 * Custom error class for DuckDB operations
 */
export class DuckDBError extends Error {
    constructor(message, code = 'DUCKDB_ERROR') {
        super(message);
        this.name = 'DuckDBError';
        this.code = code;
    }
}
