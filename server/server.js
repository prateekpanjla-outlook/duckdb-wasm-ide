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

// Load environment variables
dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || 3000;

// Security middleware — configure CSP to allow CDN scripts and inline scripts
app.use(helmet({
    contentSecurityPolicy: {
        directives: {
            defaultSrc: ["'self'"],
            scriptSrc: ["'self'", "'unsafe-inline'", "https://cdnjs.cloudflare.com"],
            styleSrc: ["'self'", "'unsafe-inline'", "https://cdnjs.cloudflare.com"],
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

// API routes
app.use('/api/auth', authRoutes);
app.use('/api/practice', practiceRoutes);

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

// Start server
// Start server - bind to all interfaces (0.0.0.0) for external access
app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 DuckDB WASM Backend Server running on port ${PORT}`);
    console.log(`📊 API endpoint: http://localhost:${PORT}/api`);
    console.log(`❤️  Health check: http://localhost:${PORT}/health`);
});
