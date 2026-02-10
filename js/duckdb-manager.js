// DuckDB WASM Manager
export class DuckDBManager {
    constructor() {
        this.db = null;
        this.connection = null;
    }

    async initialize() {
        try {
            // Select the appropriate worker script
            const JS_DELIVR_BUNDLE = 'https://cdn.jsdelivr.net/npm/@duckdb/duckdb-wasm@1.28.1/dist/';

            // Load DuckDB WASM
            const duckdb = await import(
                'https://cdn.jsdelivr.net/npm/@duckdb/duckdb-wasm@1.28.1/dist/duckdb-browser-blocking.mjs'
            );

            // Create a new logger
            const logger = new duckdb.console_logger(duckdb.LogLevel.WARNING);

            // Create worker
            const worker = await duckdb.createWorker(JS_DELIVR_BUNDLE + 'duckdb-browser-blocking.worker.js');
            worker.logger = logger;

            // Instantiate database
            this.db = new duckdb.AsyncDuckDB(worker, logger);
            await this.db.instantiate(
                JS_DELIVR_BUNDLE + 'duckdb-browser-blocking.wasm',
                JS_DELIVR_BUNDLE + 'duckdb-browser-blocking.worker.js'
            );

            // Open connection
            this.connection = await this.db.connect();

            return true;
        } catch (error) {
            console.error('Failed to initialize DuckDB:', error);
            return false;
        }
    }

    async executeQuery(query) {
        if (!this.connection) {
            throw new Error('Database not connected');
        }

        try {
            const result = await this.connection.query(query);
            return this.formatResult(result);
        } catch (error) {
            throw new Error(`Query failed: ${error.message}`);
        }
    }

    formatResult(result) {
        // Convert DuckDB result to usable format
        const data = {
            columns: [],
            rows: []
        };

        if (result && result.schema) {
            // Get column names
            data.columns = result.schema.fields.map(f => f.name);

            // Get rows
            if (result.data) {
                const numRows = result.numRows || result.data.length;

                for (let i = 0; i < numRows; i++) {
                    const row = {};
                    data.columns.forEach((col, idx) => {
                        const colData = result.data[idx];
                        row[col] = colData ? colData[i] : null;
                    });
                    data.rows.push(row);
                }
            }
        }

        return data;
    }

    async registerFile(fileName, fileHandle) {
        if (!this.db) {
            throw new Error('Database not initialized');
        }

        try {
            await this.db.registerFileHandle(fileName, fileHandle, 2, true);
            return true;
        } catch (error) {
            throw new Error(`Failed to register file: ${error.message}`);
        }
    }

    async insertCSVFromPath(fileName, tableName) {
        if (!this.connection) {
            throw new Error('Database not connected');
        }

        try {
            await this.connection.insertCSVFromPath(fileName, {
                name: tableName,
                detect: true,
                header: true
            });
            return true;
        } catch (error) {
            throw new Error(`Failed to insert CSV: ${error.message}`);
        }
    }

    async insertJSONFromPath(fileName, tableName) {
        if (!this.connection) {
            throw new Error('Database not connected');
        }

        try {
            await this.connection.insertJSONFromPath(fileName, {
                name: tableName
            });
            return true;
        } catch (error) {
            throw new Error(`Failed to insert JSON: ${error.message}`);
        }
    }

    async createTableFromParquet(fileName, tableName) {
        if (!this.connection) {
            throw new Error('Database not connected');
        }

        try {
            await this.connection.query(`
                CREATE TABLE ${tableName} AS
                SELECT * FROM '${fileName}'
            `);
            return true;
        } catch (error) {
            throw new Error(`Failed to load Parquet: ${error.message}`);
        }
    }

    async getTables() {
        if (!this.connection) {
            throw new Error('Database not connected');
        }

        try {
            const result = await this.connection.query("SHOW TABLES");
            return this.formatResult(result);
        } catch (error) {
            throw new Error(`Failed to get tables: ${error.message}`);
        }
    }

    async close() {
        if (this.connection) {
            await this.connection.close();
            this.connection = null;
        }
        this.db = null;
    }
}
