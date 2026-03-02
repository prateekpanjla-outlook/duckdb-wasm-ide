/**
 * Database Connection Configuration
 * Works with local PostgreSQL and Cloud SQL
 * Just change .env file to switch
 */

import pg from 'pg';
import config from './index.js';

const { Pool } = pg;

// Create connection pool
// Works with both local PostgreSQL and Cloud SQL
const poolConfig = {
    // For local: host + port
    // For Cloud SQL: Unix socket path (host contains the full path)
    host: config.database.host,
    database: config.database.name,
    user: config.database.user,
    password: config.database.password,
    max: config.database.poolMax,
    idleTimeoutMillis: config.database.poolIdleTimeout,
    connectionTimeoutMillis: config.database.poolConnectionTimeout,
};

// Add port only if NOT using Cloud SQL (Cloud SQL uses Unix socket)
if (!config.database.isCloudSQL) {
    poolConfig.port = config.database.port;
}

// Use connection string if provided (overrides individual settings)
if (config.database.connectionString) {
    poolConfig.connectionString = config.database.connectionString;
}

const pool = new Pool(poolConfig);

// Connection event handlers
pool.on('connect', () => {
    if (config.isDevelopment) {
        console.log('✅ Connected to PostgreSQL database');
        console.log(`   Database: ${config.database.name}`);
        console.log(`   Host: ${config.database.isCloudSQL ? 'Cloud SQL' : config.database.host}`);
    }
});

pool.on('error', (err) => {
    console.error('❌ Unexpected database error:', err);
    if (config.isProduction) {
        // Don't exit in production, let the request fail gracefully
        console.error('Database connection error - will retry on next request');
    } else {
        // In development, exit to show the error immediately
        process.exit(-1);
    }
});

/**
 * Execute a query
 */
export const query = async (text, params) => {
    const start = Date.now();
    try {
        const res = await pool.query(text, params);
        const duration = Date.now() - start;

        if (config.isDevelopment) {
            console.log('🔍 Query executed', {
                duration: `${duration}ms`,
                rows: res.rowCount,
            });
        }

        return res;
    } catch (error) {
        if (config.isDevelopment) {
            console.error('❌ Database query error:', error.message);
        }
        throw error;
    }
};

/**
 * Get a client from the pool for transactions
 */
export const getClient = async () => {
    const client = await pool.connect();
    return client;
};

/**
 * Health check for database connection
 */
export const healthCheck = async () => {
    try {
        const result = await query('SELECT 1 as health');
        return { healthy: true, message: 'Database connection OK' };
    } catch (error) {
        return { healthy: false, message: error.message };
    }
};

/**
 * Close all connections (graceful shutdown)
 */
export const closePool = async () => {
    await pool.end();
    console.log('🔌 Database connection pool closed');
};

export default pool;
