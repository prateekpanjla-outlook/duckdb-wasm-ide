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
                    const batch = result.batches[0]; // Use first batch
                    const numRows = result.numRows || 0;

                    for (let i = 0; i < numRows; i++) {
                        const row = {};

                        data.columns.forEach((col, colIdx) => {
                            if (batch.data && batch.data.children && batch.data.children[colIdx]) {
                                const colData = batch.data.children[colIdx];
                                const value = this.extractArrowValue(colData, i);

                                if (value !== null && value !== undefined) {
                                    row[col] = value;
                                }
                            }
                        });

                        // Add row if it has data
                        if (Object.keys(row).length > 0) {
                            data.rows.push(row);
                        }
                    }
                }
            }
        } catch (error) {
            console.error('Error formatting result:', error);
            console.log('Result structure:', JSON.stringify(result, (key, value) => {
                if (typeof value === 'bigint') return value.toString();
                return value;
            }, 2).substring(0, 1000));
        }

        return data;
    }

    extractArrowValue(colData, rowIndex) {
        // Method 1: Utf8Vector with offsets and values (for strings)
        if (colData.valueOffsets && colData.values) {
            const startOffset = colData.valueOffsets[rowIndex];
            const endOffset = colData.valueOffsets[rowIndex + 1];

            // Handle null values (offsets will be equal)
            if (startOffset === endOffset) {
                return null;
            }

            // Extract substring from values using offsets
            let str = '';
            for (let i = startOffset; i < endOffset; i++) {
                const charCode = colData.values[i];
                if (charCode !== undefined && charCode !== null) {
                    str += String.fromCharCode(charCode);
                }
            }
            return str;
        }

        // Method 2: Direct value access (for integers, floats, etc.)
        if (colData.values && typeof colData.values === 'object') {
            const value = colData.values[rowIndex];
            if (value !== undefined) {
                return value;
            }
            // Try string key access
            if (colData.values[String(rowIndex)] !== undefined) {
                return colData.values[String(rowIndex)];
            }
        }

        // Method 3: Array type (flat array)
        if (Array.isArray(colData.values)) {
            return colData.values[rowIndex];
        }

        // Method 4: Typed array access (valueArray property)
        if (colData.valueArray && colData.valueArray.length > rowIndex) {
            return colData.valueArray[rowIndex];
        }

        return null;
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
