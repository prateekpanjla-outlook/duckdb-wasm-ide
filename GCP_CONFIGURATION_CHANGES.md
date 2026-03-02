# GCP Deployment Configuration Changes

**Branch:** `gcp-deployment`
**Date:** 2026-03-02

---

## Overview

All configuration is now parameterized through environment variables. To deploy to GCP, you only need to change the `.env` file values. **No code changes required.**

---

## New Files

### 1. `server/config/index.js` (NEW)

**Why:** Cloud Run requires all configuration to come from environment variables, not hardcoded values. A centralized config module ensures consistent access to settings across the application and provides validation to catch missing production credentials before deployment.

Centralized configuration module that:
- Loads environment-specific `.env` files automatically (`.env.development` for local, `.env.production` for GCP)
- Validates required production settings to prevent runtime failures from missing credentials
- Provides typed config object with sensible defaults
- Auto-detects Cloud SQL connection format vs local PostgreSQL

```javascript
import config from './config/index.js';

// Usage:
config.server.port           // 8080
config.database.host         // localhost or /cloudsql/...
config.jwt.secret           // JWT secret
config.cors.origin          // CORS allowed origins
```

---

## Modified Files

### 2. `server/server.js`

| Change | Before | After | Why Required |
|--------|--------|-------|--------------|
| Port config | `process.env.PORT \|\| 3000` | `config.server.port` (8080) | Cloud Run uses port 8080 by default (set via `PORT` env var). Using 8080 locally matches production, eliminating port-related bugs during development. |
| CORS | Hardcoded `*` | `config.cors.origin` | Cloud Run services have specific URLs (e.g., `https://service-xxx.run.app`). Hardcoded `*` works for development but is insecure for production. Parameterizing allows restricting to your actual domain. |
| Rate limit | Hardcoded values | `config.security.rateLimit*` | Rate limiting needs differ between environments. Development may need higher limits for testing, while production needs stricter controls. Parameterizing allows tuning without code changes. |
| Static files | ❌ Not served | ✅ Served from root | Cloud Run runs a single container. Previously, frontend was served separately (Python server). Now Express serves both frontend and backend from one container, required for Cloud Run deployment. |
| SPA fallback | ❌ No | ✅ Serves index.html | Single Page Apps (like this one) use client-side routing. Without a fallback, refreshing a route like `/practice` returns 404. The fallback serves `index.html` for all non-API routes, enabling client-side router to work. |
| Graceful shutdown | ❌ No | ✅ SIGTERM/SIGINT handling | Cloud Run sends SIGTERM before scaling down or updating deployments. Without graceful shutdown, active database connections are abruptly closed, potentially corrupting data. Proper shutdown closes connections and finishes in-flight requests. |
| Health check | Static | Includes database status | Cloud Run health checks determine if the container is healthy. A simple static response doesn't catch database connection issues. Including database status allows Cloud Run to restart containers with DB problems automatically. |

**Key additions:**
```javascript
// Static file serving - required for single-container deployment
app.use(express.static(path.join(__dirname, '..')));

// SPA fallback for client-side routing - prevents 404s on refresh
app.get('*', (req, res, next) => {
    if (!req.path.startsWith('/api') && !path.extname(req.path)) {
        res.sendFile(path.join(staticPath, 'index.html'));
    }
});

// Graceful shutdown - required for Cloud Run lifecycle
process.on('SIGTERM', async () => {
    server.close();
    await closePool();
});
```

---

### 3. `server/config/database.js`

| Change | Before | After | Why Required |
|--------|--------|-------|--------------|
| Config | `process.env.*` inline | `config.database.*` | Centralizing config ensures consistency. Using `process.env` directly throughout the codebase makes it hard to track what settings exist and where they're used. |
| Cloud SQL support | ❌ No | ✅ Auto-detects `/cloudsql/` host | Cloud SQL connects via Unix socket (e.g., `/cloudsql/project:region/instance`), not TCP like local PostgreSQL. The old code assumed TCP connections. Auto-detection allows the same code to work with local Postgres and Cloud SQL without changes. |
| Port handling | Always included | Only for local (not Cloud SQL) | Unix sockets don't use ports. Including a port config when using Cloud SQL causes connection failures. The code now conditionally adds the port only when not using a Unix socket path. |
| Logging | Verbose | Environment-aware | Cloud Run logs are captured by Cloud Logging. Verbose development logs clutter production logs and increase costs. Environment-aware logging reduces noise in production while maintaining detail locally. |
| Health check | ❌ No | ✅ `healthCheck()` function | Load balancers and health check endpoints need to verify database connectivity. Without this, a container with a dead database connection would still receive traffic. |
| Graceful shutdown | ❌ No | ✅ `closePool()` function | Database connections must be closed before container termination. Unclosed connections can exhaust the database's connection pool, preventing new connections. |

**Key logic:**
```javascript
// Cloud SQL uses Unix socket (no port needed)
if (!config.database.isCloudSQL) {
    poolConfig.port = config.database.port;
}
```

---

### 4. `server/routes/auth.js`

| Change | Before | After | Why Required |
|--------|--------|-------|--------------|
| JWT secret | `process.env.JWT_SECRET` | `config.jwt.secret` | Using the config module provides validation. If JWT_SECRET is missing in production, the config module throws an error at startup rather than failing at the first login attempt. |
| JWT expires | `process.env.JWT_EXPIRES_IN \|\| '7d'` | `config.jwt.expiresIn` | Centralizing token configuration makes it easier to manage session policies across environments. Development might use longer expiry for convenience, while production uses shorter for security. |

---

### 5. `server/middleware/auth.js`

| Change | Before | After | Why Required |
|--------|--------|-------|--------------|
| JWT verify | `process.env.JWT_SECRET` | `config.jwt.secret` | Consistent with auth routes. Using the config module ensures the same validation logic applies everywhere and that missing secrets are caught at startup. |

---

### 6. `.gitignore`

**Why:** Environment files contain sensitive data (database passwords, JWT secrets). Committing these to git exposes credentials. The `.env.*.example` files are committed (without secrets) as templates, while actual `.env` files are excluded. This follows security best practices.

Added:
```gitignore
# Environment files (keep .env.*.example files)
.env.development
.env.production
.env.test
server/.env
```

---

### 7. `server/.env.production.example`

**Why:** Documents the exact format needed for Cloud Run deployment. Cloud SQL uses a specific Unix socket path format that isn't obvious. Providing an example prevents deployment errors from incorrect connection string formatting.

Updated with Cloud SQL configuration format:
```env
DB_HOST=/cloudsql/YOUR_PROJECT_ID:us-central1:duckdb-ide-db
```

---

## Environment Files

### `.env.development` (Local)

**Why:** Matches production configuration (port 8080) while using local PostgreSQL. This parity catches environment-specific bugs before deployment. Using local Postgres allows offline development and faster iteration.

```env
NODE_ENV=development
PORT=8080

DB_HOST=localhost
DB_PORT=5432
DB_NAME=duckdb_ide
DB_USER=postgres
DB_PASSWORD=postgres

JWT_SECRET=dev-secret-change-in-production
JWT_EXPIRES_IN=7d

CORS_ORIGINS=*
```

### `.env.production` (GCP)

**Why:** Cloud Run containers receive environment variables via the `--set-env-vars` flag or Cloud Secret Manager. The `.env.production` file documents what values need to be set. Cloud SQL requires the Unix socket format, which differs from local TCP connections.

```env
NODE_ENV=production
PORT=8080

# Cloud SQL Unix socket
DB_HOST=/cloudsql/YOUR_PROJECT_ID:us-central1:duckdb-ide-db
DB_NAME=duckdb_ide
DB_USER=postgres
DB_PASSWORD=YOUR_PASSWORD  # Use Secret Manager

JWT_SECRET=YOUR_SECURE_SECRET  # Use Secret Manager
JWT_EXPIRES_IN=7d

CORS_ORIGINS=https://YOUR_SERVICE.run.app
```

---

## How It Works

### Local Development

```bash
# Set environment
export NODE_ENV=development

# Start server (loads .env.development)
node server/server.js

# Server connects to: localhost:5432
```

### GCP Production

```bash
# Deploy with production env vars
gcloud run deploy quacksql \
    --set-env-vars="NODE_ENV=production" \
    --set-env-vars="DB_HOST=/cloudsql/PROJECT:us-central1:INSTANCE" \
    --set-cloudsql-instances=PROJECT:us-central1:INSTANCE

# Server connects to: Cloud SQL via Unix socket
```

---

## Configuration Schema

```javascript
{
    server: {
        env: 'development' | 'production',
        port: 8080,
        host: '0.0.0.0'
    },
    database: {
        host: string,           // localhost or /cloudsql/...
        port: 5432,            // Only for local
        name: 'duckdb_ide',
        user: 'postgres',
        password: string,
        isCloudSQL: boolean    // Auto-detected
    },
    jwt: {
        secret: string,
        expiresIn: '7d'
    },
    cors: {
        origin: string | string[],
        credentials: true
    },
    security: {
        rateLimitWindowMs: 900000,
        rateLimitMax: 100
    },
    isProduction: boolean,
    isDevelopment: boolean
}
```

---

## Migration Checklist

To deploy to GCP:

- [ ] Create Google Cloud project
- [ ] Create Cloud SQL instance (PostgreSQL 15)
- [ ] Create database (`duckdb_ide`)
- [ ] Run migrations (`node server/utils/initDatabase.js`)
- [ ] Set environment variables in Cloud Run:
  - [ ] `NODE_ENV=production`
  - [ ] `DB_HOST=/cloudsql/PROJECT:REGION:INSTANCE`
  - [ ] `DB_NAME`, `DB_USER`, `DB_PASSWORD`
  - [ ] `JWT_SECRET`, `JWT_EXPIRES_IN`
  - [ ] `CORS_ORIGINS`
- [ ] Deploy: `gcloud run deploy quacksql --source .`

---

## Testing

### Local
```bash
cp server/.env.development server/.env
npm run dev
```

### With Cloud SQL Proxy (testing with production DB)
```bash
./cloud-sql-proxy PROJECT:REGION:INSTANCE &
export DB_HOST=/cloudsql/PROJECT:REGION:INSTANCE
npm run dev
```
