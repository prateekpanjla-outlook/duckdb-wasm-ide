import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import config from './config/index.js';
import path from 'path';
import { fileURLToPath } from 'url';

// Import routes
import authRoutes from './routes/auth.js';
import practiceRoutes from './routes/practice.js';

// Get directory name (ES modules don't have __dirname)
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = config.server.port;
const HOST = config.server.host;

// ============ TRUST PROXY (for Cloud Run) ============
// Cloud Run sits behind a proxy, so we need to trust it
// This fixes express-rate-limit X-Forwarded-For validation error
if (config.isProduction) {
    app.set('trust proxy', true);
}

// ============ SECURITY MIDDLEWARE ============
app.use(helmet(config.security.helmet));

// ============ CORS ============
app.use(cors({
    origin: config.cors.origin,
    credentials: config.cors.credentials,
}));

// ============ RATE LIMITING ============
const limiter = rateLimit({
    windowMs: config.security.rateLimitWindowMs,
    max: config.security.rateLimitMax,
    standardHeaders: true,
    legacyHeaders: false,
});
app.use('/api/', limiter);

// ============ BODY PARSING ============
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// ============ STATIC FILES ============
// Serve frontend from the same container
// Works for both local and Cloud Run
const staticPath = path.join(__dirname, '..');
app.use(express.static(staticPath, {
    // Don't log static file requests in production
    setHeaders: (res, filePath) => {
        // Cache static assets in production
        if (config.isProduction) {
            const ext = path.extname(filePath);
            if (ext === '.js' || ext === '.css') {
                res.setHeader('Cache-Control', 'public, max-age=86400'); // 1 day
            }
        }
    },
}));

// ============ HEALTH CHECK ============
app.get('/health', async (req, res) => {
    // Import database health check
    const { healthCheck: dbHealthCheck } = await import('./config/database.js');
    const dbHealth = await dbHealthCheck();

    res.json({
        status: 'ok',
        environment: config.server.env,
        database: dbHealth,
        timestamp: new Date().toISOString(),
    });
});

// ============ API ROUTES ============
app.use('/api/auth', authRoutes);
app.use('/api/practice', practiceRoutes);

// ============ SPA FALLBACK ============
// Serve index.html for all non-API, non-static routes
// This enables client-side routing
app.get('*', (req, res, next) => {
    // Don't intercept API routes
    if (req.path.startsWith('/api')) {
        return next();
    }

    // Don't intercept files with extensions
    if (path.extname(req.path)) {
        return next();
    }

    // Serve index.html for SPA routing
    res.sendFile(path.join(staticPath, 'index.html'));
});

// ============ ERROR HANDLING ============
app.use((err, req, res, next) => {
    // Log error details in development
    if (config.isDevelopment) {
        console.error('Error:', err.stack);
    } else {
        console.error('Error:', err.message);
    }

    // JWT errors
    if (err.name === 'UnauthorizedError') {
        return res.status(401).json({ error: 'Invalid or expired token' });
    }

    // Validation errors
    if (err.name === 'ValidationError') {
        return res.status(400).json({ error: err.message });
    }

    // Database connection errors
    if (err.code === 'ECONNREFUSED' || err.code === 'ETIMEDOUT') {
        return res.status(503).json({
            error: 'Service temporarily unavailable',
            message: config.isDevelopment ? err.message : 'Please try again later',
        });
    }

    // Default error
    res.status(500).json({
        error: 'Internal server error',
        ...(config.isDevelopment ? { details: err.message } : {}),
    });
});

// ============ 404 HANDLER ============
app.use((req, res) => {
    // Return JSON for API routes
    if (req.path.startsWith('/api')) {
        return res.status(404).json({ error: 'API endpoint not found' });
    }

    // Return 404 page for frontend routes
    res.status(404).sendFile(path.join(staticPath, 'index.html'));
});

// ============ START SERVER ============
const server = app.listen(PORT, HOST, () => {
    console.log(`🚀 Server running on port ${PORT}`);
    console.log(`📍 Environment: ${config.server.env}`);
    console.log(`🌐 URL: http://${HOST === '0.0.0.0' ? 'localhost' : HOST}:${PORT}`);

    if (config.isDevelopment) {
        console.log(`\n📊 Available endpoints:`);
        console.log(`   GET  /health`);
        console.log(`   POST /api/auth/register`);
        console.log(`   POST /api/auth/login`);
        console.log(`   GET  /api/auth/me`);
        console.log(`   POST /api/practice/start`);
        console.log(`   POST /api/practice/submit`);
    }
});

// ============ GRACEFUL SHUTDOWN ============
process.on('SIGTERM', async () => {
    console.log('SIGTERM received, shutting down gracefully...');

    server.close(async () => {
        console.log('HTTP server closed');

        // Close database connections
        const { closePool } = await import('./config/database.js');
        await closePool();

        process.exit(0);
    });

    // Force shutdown after 10 seconds
    setTimeout(() => {
        console.error('Forced shutdown after timeout');
        process.exit(1);
    }, 10000);
});

process.on('SIGINT', async () => {
    console.log('\nSIGINT received, shutting down...');

    server.close(async () => {
        console.log('HTTP server closed');

        // Close database connections
        const { closePool } = await import('./config/database.js');
        await closePool();

        process.exit(0);
    });
});

export default app;
