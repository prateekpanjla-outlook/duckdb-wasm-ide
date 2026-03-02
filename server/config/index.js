/**
 * Centralized Configuration
 * Works for local development and GCP production
 * Just change .env file to switch environments
 */

import dotenv from 'dotenv';

// Load environment-specific .env file first
const env = process.env.NODE_ENV || 'development';
const envFile = `.env.${env}`;

// Try to load environment-specific file, fall back to default .env
dotenv.config({ path: envFile });
dotenv.config();

// Helper to parse boolean
const parseBool = (val) => {
    if (val === 'true' || val === '1') return true;
    if (val === 'false' || val === '0') return false;
    return undefined;
};

// Helper to parse integer
const parseIntSafe = (val, defaultValue) => {
    const parsed = parseInt(val, 10);
    return isNaN(parsed) ? defaultValue : parsed;
};

const config = {
    // ============ SERVER ============
    server: {
        env: process.env.NODE_ENV || 'development',
        port: parseIntSafe(process.env.PORT, 8080),
        host: process.env.HOST || '0.0.0.0',
    },

    // ============ DATABASE ============
    database: {
        // For local: localhost
        // For GCP Cloud SQL: /cloudsql/PROJECT:REGION:INSTANCE
        host: process.env.DB_HOST || 'localhost',
        port: parseIntSafe(process.env.DB_PORT, 5432),
        name: process.env.DB_NAME || 'duckdb_ide',
        user: process.env.DB_USER || 'postgres',
        password: process.env.DB_PASSWORD || 'postgres',

        // Connection pool settings
        poolMax: parseIntSafe(process.env.DB_POOL_MAX, 20),
        poolIdleTimeout: parseIntSafe(process.env.DB_POOL_IDLE_TIMEOUT, 30000),
        poolConnectionTimeout: parseIntSafe(process.env.DB_POOL_CONNECTION_TIMEOUT, 2000),

        // Check if using Cloud SQL (Unix socket path)
        isCloudSQL: process.env.DB_HOST?.includes('/cloudsql'),

        // Full connection string (optional, overrides individual settings)
        connectionString: process.env.DATABASE_URL,
    },

    // ============ JWT ============
    jwt: {
        secret: process.env.JWT_SECRET || 'dev-secret-change-in-production',
        expiresIn: process.env.JWT_EXPIRES_IN || '7d',
    },

    // ============ CORS ============
    cors: {
        // Comma-separated origins or '*' for all
        origin: process.env.CORS_ORIGINS
            ? process.env.CORS_ORIGINS.split(',').map(o => o.trim())
            : (process.env.FRONTEND_URL || '*'),
        credentials: parseBool(process.env.CORS_CREDENTIALS) !== false,
    },

    // ============ SECURITY ============
    security: {
        // Rate limiting
        rateLimitWindowMs: parseIntSafe(process.env.RATE_LIMIT_WINDOW_MS, 15 * 60 * 1000), // 15 minutes
        rateLimitMax: parseIntSafe(process.env.RATE_LIMIT_MAX, 100), // 100 requests per window

        // Helmet (security headers)
        helmet: {
            contentSecurityPolicy: process.env.NODE_ENV === 'production',
        },
    },

    // ============ LOGGING ============
    logging: {
        level: process.env.LOG_LEVEL || (env === 'production' ? 'info' : 'debug'),
        // In production, use structured logging
        structured: parseBool(process.env.STRUCTURED_LOGGING) || env === 'production',
    },

    // ============ FEATURES ============
    features: {
        // Enable practice mode
        practiceMode: parseBool(process.env.FEATURE_PRACTICE_MODE) !== false,
    },

    // ============ HELPERS ============
    isProduction: env === 'production',
    isDevelopment: env === 'development',
    isTest: env === 'test',

    // Get current environment
    get env() {
        return env;
    },
};

// Validate required settings in production
if (config.isProduction) {
    const required = [
        'DB_HOST',
        'DB_NAME',
        'DB_USER',
        'DB_PASSWORD',
        'JWT_SECRET',
    ];

    const missing = required.filter(key => !process.env[key]);

    if (missing.length > 0) {
        throw new Error(
            `Missing required environment variables for production: ${missing.join(', ')}`
        );
    }

    // Warn if JWT_SECRET is default
    if (process.env.JWT_SECRET === 'dev-secret-change-in-production') {
        console.warn('⚠️  WARNING: Using default JWT_SECRET in production!');
    }
}

export default config;
