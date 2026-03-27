// DuckDB WASM Manager
export class DuckDBManager {
    constructor() {
        this.db = null;
        this.connection = null;
    }

    async initialize(retries = 2) {
        for (let attempt = 0; attempt <= retries; attempt++) {
            try {
                // Load DuckDB WASM from local files
                const duckdb = await import('/libs/duckdb-wasm/duckdb-browser.mjs');

                // Create a new logger
                const logger = new duckdb.ConsoleLogger();

                // selectBundle() picks the best bundle for this browser.
                // EH (WASM exceptions) is preferred — fast, no threading needed.
                // COI (multi-threaded) is disabled: hangs on instantiate() in
                // @duckdb/duckdb-wasm 1.33.1-dev18.0 even with correct COI headers.
                // MVP is the fallback for older browsers without WASM exceptions.
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
                    coi: null,
                };
                const bundle = await duckdb.selectBundle(BUNDLES);

                const worker = await duckdb.createWorker(bundle.mainWorker);
                this.db = new duckdb.AsyncDuckDB(logger, worker);
                await this.db.instantiate(bundle.mainModule);

                // Open connection
                this.connection = await this.db.connect();

                return true;
            } catch (error) {
                console.error(`Failed to initialize DuckDB (attempt ${attempt + 1}/${retries + 1}):`, error);
                if (attempt < retries) {
                    console.log(`Retrying DuckDB initialization in 1 second...`);
                    await new Promise(resolve => setTimeout(resolve, 1000));
                } else {
                    return false;
                }
            }
        }
        return false;
    }

    async executeQuery(query, timeoutMs = 30000) {
        if (!this.connection) {
            throw new Error('Database not connected');
        }

        try {
            const result = await Promise.race([
                this.connection.query(query),
                new Promise((_, reject) =>
                    setTimeout(() => reject(new Error('Query timed out after 30 seconds')), timeoutMs)
                )
            ]);
            return this.formatResult(result);
        } catch (error) {
            throw new Error(`Query failed: ${error.message}`);
        }
    }

    formatResult(result) {
        // Convert DuckDB Arrow Table to {columns, rows} format
        const data = {
            columns: [],
            rows: []
        };

        try {
            if (result && result.schema) {
                data.columns = result.schema.fields.map(f => f.name);

                // Use Arrow Table's public API — handles all batches automatically
                const numCols = data.columns.length;
                const columns = [];
                for (let j = 0; j < numCols; j++) {
                    columns.push(result.getChildAt(j));
                }

                for (let i = 0; i < result.numRows; i++) {
                    const row = {};
                    for (let j = 0; j < numCols; j++) {
                        const value = columns[j].get(i);
                        row[data.columns[j]] = typeof value === 'bigint' ? Number(value) : value;
                    }
                    data.rows.push(row);
                }
            }
        } catch (error) {
            console.error('Error formatting result:', error);
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
            // Sanitize inputs to prevent SQL injection
            const safeName = tableName.replace(/[^a-zA-Z0-9_]/g, '_');
            const safeFile = fileName.replace(/'/g, "''");
            await this.connection.query(`
                CREATE TABLE ${safeName} AS
                SELECT * FROM '${safeFile}'
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

    /**
     * Get a new connection (for practice mode)
     * Creates a separate connection that can be used independently
     */
    async getNewConnection() {
        if (!this.db) {
            throw new Error('Database not initialized');
        }

        try {
            const newConnection = await this.db.connect();
            return {
                query: async (sql) => {
                    const result = await newConnection.query(sql);
                    return this.formatResult(result);
                },
                run: async (sql) => {
                    // Use query instead of run for executing SQL
                    await newConnection.query(sql);
                },
                close: async () => {
                    await newConnection.close();
                }
            };
        } catch (error) {
            throw new Error(`Failed to create new connection: ${error.message}`);
        }
    }
}
