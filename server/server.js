import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

// Import routes
import authRoutes from './routes/auth.js';
import practiceRoutes from './routes/practice.js';
import aiRoutes from './routes/ai.js';
import pool from './config/database.js';

// Load environment variables
dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || 3000;

// Security middleware — all assets served from same origin, no CDN
app.use(helmet({
    contentSecurityPolicy: {
        directives: {
            defaultSrc: ["'self'"],
            scriptSrc: ["'self'", "'unsafe-inline'", "'wasm-unsafe-eval'"],
            styleSrc: ["'self'", "'unsafe-inline'"],
            workerSrc: ["'self'", "blob:"],
            connectSrc: ["'self'"],
        }
    },
    crossOriginEmbedderPolicy: false, // We set COEP manually below
}));

// Cross-Origin Isolation headers for DuckDB COI (multi-threaded) bundle
// Enables SharedArrayBuffer → parallel query execution
app.use((req, res, next) => {
    res.set('Cross-Origin-Opener-Policy', 'same-origin');
    res.set('Cross-Origin-Embedder-Policy', 'require-corp');
    next();
});

// CORS configuration — same-origin serves frontend, so only needed for dev/external access
app.use(cors({
    origin: process.env.CORS_ORIGIN || true,
    credentials: true
}));

// Rate limiting
const limiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100 // limit each IP to 100 requests per windowMs
});
app.use('/api/', limiter);

// Body parsing middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Health check endpoint
app.get('/health', (req, res) => {
    res.json({ status: 'ok', message: 'DuckDB WASM Backend Server is running' });
});

// DB connectivity test — creates temp table, inserts, reads, drops
app.get('/health/db', async (req, res) => {
    try {
        const pool = (await import('./config/database.js')).default;
        await pool.query('CREATE TABLE IF NOT EXISTS _health_check (id SERIAL, msg TEXT, ts TIMESTAMP DEFAULT NOW())');
        await pool.query("INSERT INTO _health_check (msg) VALUES ('poc-test')");
        const result = await pool.query('SELECT * FROM _health_check ORDER BY id DESC LIMIT 1');
        await pool.query('DROP TABLE _health_check');
        res.json({ status: 'ok', db: 'connected', row: result.rows[0], host: process.env.DB_HOST });
    } catch (error) {
        res.status(500).json({ status: 'error', message: error.message, host: process.env.DB_HOST });
    }
});

// API routes
app.use('/api/auth', authRoutes);
app.use('/api/practice', practiceRoutes);
app.use('/api/ai', aiRoutes);

// Serve pre-compressed WASM files (built by Docker: gzip -k -9)
// Browser sends Accept-Encoding: gzip → we serve .wasm.gz with Content-Encoding: gzip
// Zero runtime CPU cost, stays under Cloud Run 32MB HTTP/1.1 limit
const staticRoot = path.join(__dirname, '..');
app.use((req, res, next) => {
    if (req.path.endsWith('.wasm') && req.headers['accept-encoding']?.includes('gzip')) {
        const gzPath = path.join(staticRoot, req.path + '.gz');
        if (fs.existsSync(gzPath)) {
            res.set('Content-Type', 'application/wasm');
            res.set('Content-Encoding', 'gzip');
            res.set('Cache-Control', 'public, max-age=31536000, immutable');
            return res.sendFile(gzPath);
        }
    }
    next();
});

// Serve frontend static files (in production, Express serves everything)
app.use(express.static(staticRoot, {
    maxAge: '1d',
    setHeaders: (res, filePath) => {
        if (filePath.endsWith('.wasm')) {
            res.set('Content-Type', 'application/wasm');
            res.set('Cache-Control', 'public, max-age=31536000, immutable');
        }
    }
}));

// SPA fallback — serve index.html for non-API routes
app.use((req, res, next) => {
    if (!req.path.startsWith('/api/') && !req.path.startsWith('/health')) {
        return res.sendFile(path.join(staticRoot, 'index.html'));
    }
    next();
});

// 404 handler for API routes
app.use((req, res) => {
    res.status(404).json({ error: 'Route not found' });
});

// Error handling middleware
app.use((err, req, res, next) => {
    console.error('Error:', err.stack);

    // JWT errors
    if (err.name === 'UnauthorizedError') {
        return res.status(401).json({ error: 'Invalid token' });
    }

    // Validation errors
    if (err.name === 'ValidationError') {
        return res.status(400).json({ error: err.message });
    }

    // Default error
    res.status(500).json({ error: 'Internal server error' });
});

// Ensure tables exist (idempotent — uses CREATE TABLE IF NOT EXISTS)
async function ensureTables() {
    const client = await pool.connect();
    try {
        await client.query(`CREATE TABLE IF NOT EXISTS users (
            id SERIAL PRIMARY KEY,
            email VARCHAR(255) UNIQUE NOT NULL,
            password_hash VARCHAR(255) NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            last_login TIMESTAMP
        )`);
        await client.query(`CREATE TABLE IF NOT EXISTS questions (
            id SERIAL PRIMARY KEY,
            sql_data TEXT NOT NULL,
            sql_question TEXT NOT NULL,
            sql_solution TEXT NOT NULL,
            sql_solution_explanation JSONB,
            difficulty VARCHAR(20) DEFAULT 'beginner',
            category VARCHAR(50) DEFAULT 'SELECT queries',
            order_index INTEGER,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )`);
        await client.query(`CREATE TABLE IF NOT EXISTS user_attempts (
            id SERIAL PRIMARY KEY,
            user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            question_id INTEGER NOT NULL REFERENCES questions(id) ON DELETE CASCADE,
            user_query TEXT NOT NULL,
            is_correct BOOLEAN DEFAULT FALSE,
            attempts_count INTEGER DEFAULT 1,
            completed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            time_taken_seconds INTEGER
        )`);
        await client.query(`CREATE TABLE IF NOT EXISTS user_sessions (
            user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
            current_question_id INTEGER REFERENCES questions(id) ON DELETE SET NULL,
            practice_mode_active BOOLEAN DEFAULT FALSE,
            last_activity TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )`);
        await client.query(`CREATE INDEX IF NOT EXISTS idx_user_attempts_user_id ON user_attempts(user_id)`);
        await client.query(`CREATE INDEX IF NOT EXISTS idx_user_attempts_question_id ON user_attempts(question_id)`);
        await client.query(`CREATE INDEX IF NOT EXISTS idx_user_attempts_user_question ON user_attempts(user_id, question_id)`);
        await client.query(`CREATE INDEX IF NOT EXISTS idx_user_sessions_user_id ON user_sessions(user_id)`);
        await client.query(`CREATE TABLE IF NOT EXISTS ai_usage (
            id SERIAL PRIMARY KEY,
            user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            question_id INTEGER NOT NULL REFERENCES questions(id) ON DELETE CASCADE,
            type VARCHAR(20) NOT NULL,
            input_tokens INTEGER DEFAULT 0,
            output_tokens INTEGER DEFAULT 0,
            cached BOOLEAN DEFAULT FALSE,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )`);
        await client.query(`CREATE INDEX IF NOT EXISTS idx_ai_usage_user_id ON ai_usage(user_id)`);
        await client.query(`CREATE INDEX IF NOT EXISTS idx_questions_order_index ON questions(order_index)`);
        console.log('✅ Database tables and indexes ensured');

        // Seed questions if table is empty
        const { rows } = await client.query('SELECT COUNT(*) as count FROM questions');
        if (parseInt(rows[0].count) === 0) {
            console.log('🌱 Seeding questions...');
            const { seedQuestions } = await import('./seed/seedData.js');
            for (const q of seedQuestions) {
                await client.query(
                    `INSERT INTO questions (sql_data, sql_question, sql_solution, sql_solution_explanation, difficulty, category, order_index)
                     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
                    [q.sql_data, q.sql_question, q.sql_solution, JSON.stringify(q.sql_solution_explanation), q.difficulty, q.category, q.order_index]
                );
            }
            console.log(`✅ Seeded ${seedQuestions.length} questions`);
        }
    } finally {
        client.release();
    }
}

// Start server
// Start server - bind to all interfaces (0.0.0.0) for external access
ensureTables()
    .then(() => {
        app.listen(PORT, '0.0.0.0', () => {
            console.log(`🚀 DuckDB WASM Backend Server running on port ${PORT}`);
            console.log(`📊 API endpoint: http://localhost:${PORT}/api`);
            console.log(`❤️  Health check: http://localhost:${PORT}/health`);
        });
    })
    .catch(err => {
        console.error('❌ Failed to initialize database tables:', err);
        process.exit(1);
    });
