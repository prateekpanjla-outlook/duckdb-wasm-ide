// DuckDB WASM Manager
export class DuckDBManager {
    constructor() {
        this.db = null;
        this.connection = null;
    }

    async initialize() {
        try {
            // Load DuckDB WASM from local files
            const duckdb = await import('/libs/duckdb-wasm/duckdb-browser.mjs');

            // Create a new logger
            const logger = new duckdb.ConsoleLogger();

            // Select bundle with local paths (MVP bundle)
            const bundle = {
                mainModule: '/libs/duckdb-wasm/duckdb-mvp.wasm',
                mainWorker: '/libs/duckdb-wasm/duckdb-browser-mvp.worker.js',
                pthreadWorker: '/libs/duckdb-wasm/duckdb-browser-mvp.worker.js'
            };

            // Create worker directly
            const worker = new Worker(bundle.mainWorker);

            // Instantiate database (logger FIRST, then worker)
            this.db = new duckdb.AsyncDuckDB(logger, worker);
            await this.db.instantiate(bundle.mainModule, bundle.pthreadWorker);

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
        // Convert DuckDB Arrow result to usable format
        const data = {
            columns: [],
            rows: []
        };

        try {
            if (result && result.schema) {
                // Get column names
                data.columns = result.schema.fields.map(f => f.name);

                // Get rows from Arrow batches
                if (result.batches && result.batches.length > 0) {
                    const numRows = result.numRows || 0;

                    for (let i = 0; i < numRows; i++) {
                        const row = {};

                        // Process each batch
                        for (const batch of result.batches) {
                            if (batch.data && batch.data.children) {
                                data.columns.forEach((col, colIdx) => {
                                    if (batch.data.children[colIdx]) {
                                        const columnData = batch.data.children[colIdx];
                                        let value = null;

                                        // Method 1: Check for values object with numeric string keys
                                        if (columnData.values && typeof columnData.values === 'object') {
                                            // Try as object with string keys
                                            value = columnData.values[i];
                                            if (value === undefined && columnData.values[String(i)] !== undefined) {
                                                value = columnData.values[String(i)];
                                            }
                                        }

                                        // Method 2: Check for Array type (flat array)
                                        else if (Array.isArray(columnData)) {
                                            value = columnData[i];
                                        }

                                        // Method 3: Check for stride/data (nested structure)
                                        else if (columnData.data && columnData.stride !== undefined) {
                                            const stride = columnData.stride || 1;
                                            const offset = columnData.offset || 0;
                                            if (Array.isArray(columnData.data)) {
                                                value = columnData.data[offset + (i * stride)];
                                            }
                                        }

                                        // Method 4: Try to get from child vectors (for struct types)
                                        else if (columnData.children) {
                                            // Handle nested struct types
                                            value = {};
                                            for (let j = 0; j < columnData.children.length; j++) {
                                                const childData = columnData.children[j];
                                                if (childData.values && childData.values[i] !== undefined) {
                                                    value[`col_${j}`] = childData.values[i];
                                                }
                                            }
                                            if (Object.keys(value).length === 0) value = null;
                                        }

                                        // Set the value if found
                                        if (row[col] === undefined && value !== undefined) {
                                            row[col] = value;
                                        }
                                    }
                                });
                            }
                        }

                        // Add row if it has data
                        if (Object.keys(row).length > 0) {
                            data.rows.push(row);
                        }
                    }
                }
            }
        } catch (error) {
            console.error('Error formatting result:', error);
            // Log full structure for debugging
            console.log('Full result structure:', JSON.stringify(result, (key, value) => {
                if (typeof value === 'bigint') return value.toString();
                return value;
            }, 2));
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
