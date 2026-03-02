# Google Cloud Platform Deployment Plan
**DuckDB WASM IDE**

---

## Overview

This application consists of:
- **Frontend**: Static HTML/CSS/JS files (DuckDB WASM IDE)
- **Backend**: Node.js/Express API server
- **Database**: PostgreSQL (users, questions, user_attempts, user_sessions)

---

## Architecture Diagram

```
                    ┌─────────────────┐
                    │   Cloudflare    │ (Optional - CDN/DDoS protection)
                    │     (CDN)       │
                    └────────┬────────┘
                             │
                    ┌────────▼────────┐
                    │  Cloud Run      │ (Frontend + Backend)
                    │  (Node.js App)  │
                    └────────┬────────┘
                             │
                    ┌────────▼────────┐
                    │  Cloud SQL      │ (PostgreSQL)
                    │   (Database)    │
                    └─────────────────┘
```

---

## Option 1: Google Cloud Run (Recommended)

### Services Used

| Service | Purpose | Est. Cost |
|---------|---------|-----------|
| **Cloud Run** | Containerized frontend + backend | Free tier available, then ~$0.40/1M requests |
| **Cloud SQL** | Managed PostgreSQL database | ~$10-50/month (tier dependent) |
| **Cloud Build** | CI/CD pipeline | Free tier: 120 min/day |
| **Artifact Registry** | Container storage | Free tier: 0.5 GB/month |

### Step 1: Create Dockerfile

Create `Dockerfile` in project root:

```dockerfile
# Multi-stage build for optimal image size

# Stage 1: Dependencies
FROM node:18-alpine AS dependencies
WORKDIR /app
COPY package*.json ./
COPY server/package*.json ./server/
RUN npm ci --only=production
WORKDIR /app/server
RUN npm ci --only=production

# Stage 2: Build
FROM node:18-alpine AS build
WORKDIR /app
COPY --from=dependencies /app/node_modules ./node_modules
COPY --from=dependencies /app/server/node_modules ./server/node_modules
COPY . .

# Stage 3: Production
FROM node:18-alpine AS production
WORKDIR /app

# Install dumb-init for proper signal handling
RUN apk add --no-cache dumb-init

# Create non-root user
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001

# Copy dependencies and app
COPY --from=build --chown=nodejs:nodejs /app/node_modules ./node_modules
COPY --from=build --chown=nodejs:nodejs /app/server ./server
COPY --from=build --chown=nodejs:nodejs /app/index.html ./
COPY --from=build --chown=nodejs:nodejs /app/css ./css
COPY --from=build --chown=nodejs:nodejs /app/js ./js
COPY --from=build --chown=nodejs:nodejs /app/libs ./libs

# Set environment
ENV NODE_ENV=production
ENV PORT=8080

USER nodejs

EXPOSE 8080

# Use dumb-init to handle signals properly
ENTRYPOINT ["dumb-init", "--"]
CMD ["node", "server/server.js"]
```

### Step 2: Create .dockerignore

```
node_modules
npm-debug.log
.git
.gitignore
README.md
.env
.env.local
test-results
playwright-report
screenshots
*.log
tests
scripts
docs
*.md
```

### Step 3: Google Cloud Setup

```bash
# Install Google Cloud SDK
curl https://sdk.cloud.google.com | bash
exec -l $SHELL
gcloud init

# Set your project
export PROJECT_ID="duckdb-ide-project"
gcloud config set project $PROJECT_ID

# Enable required APIs
gcloud services enable \
    cloudbuild.googleapis.com \
    run.googleapis.com \
    sqladmin.googleapis.com \
    artifactregistry.googleapis.com
```

### Step 4: Create Cloud SQL Database

```bash
# Create PostgreSQL instance
gcloud sql instances create duckdb-ide-db \
    --database-version=POSTGRES_15 \
    --tier=db-f1-micro \
    --region=us-central1 \
    --storage-auto-increase \
    --backup-start-time=03:00

# Set root password
gcloud sql users set-password postgres \
    --instance=duckdb-ide-db \
    --password=YOUR_SECURE_PASSWORD

# Create database
gcloud sql databases create duckdb_ide --instance=duckdb-ide-db

# Get connection string
gcloud sql instances describe duckdb-ide-db --format="value(connectionName)"
```

### Step 5: Create Artifact Registry

```bash
# Create Docker repository
gcloud artifacts repositories create duckdb-ide-repo \
    --repository-format=docker \
    --location=us-central1 \
    --description="Docker repository for DuckDB IDE"
```

### Step 6: Build and Deploy

```bash
# Build the image
gcloud builds submit \
    --tag us-central1-docker.pkg.dev/$PROJECT_ID/duckdb-ide-repo/duckdb-ide:latest

# Deploy to Cloud Run
gcloud run deploy duckdb-ide \
    --image us-central1-docker.pkg.dev/$PROJECT_ID/duckdb-ide-repo/duckdb-ide:latest \
    --platform managed \
    --region us-central1 \
    --allow-unauthenticated \
    --set-cloudsql-instances=duckdb-ide-db \
    --env-vars-file=server/.env.production
```

### Step 7: Create Production .env File

Create `server/.env.production`:

```env
PORT=8080
NODE_ENV=production

# Database (Cloud SQL)
DB_HOST=/cloudsql/duckdb-ide-project:us-central1:duckdb-ide-db
DB_PORT=5432
DB_NAME=duckdb_ide
DB_USER=postgres
DB_PASSWORD=YOUR_SECURE_PASSWORD

# JWT
JWT_SECRET=YOUR_SECURE_JWT_SECRET
JWT_EXPIRES_IN=7d

# CORS
ALLOWED_ORIGINS=https://your-domain.com
```

---

## Option 2: Google App Engine (Simpler)

### app.yaml Configuration

```yaml
runtime: nodejs18
instance_class: F2
env_variables:
  NODE_ENV: production
  PORT: 8080
beta_settings:
  cloud_sql_instances: "duckdb-ide-project:us-central1:duckdb-ide-db"
automatic_scaling:
  min_instances: 0
  max_instances: 10
  target_cpu_utilization: 0.6
handlers:
- url: /css
  static_dir: css
- url: /js
  static_dir: js
- url: /libs
  static_dir: libs
- url: /.*
  script: auto
```

### Deploy Command

```bash
gcloud app deploy
```

---

## Option 3: Firebase Hosting + Cloud Functions (Serverless)

### Structure

```
┌──────────────────┐
│ Firebase Hosting │ ← Frontend (static files)
└────────┬─────────┘
         │
         ▼
┌──────────────────┐
│ Cloud Functions  │ ← Backend API
└────────┬─────────┘
         │
         ▼
┌──────────────────┐
│   Cloud SQL      │ ← Database
└──────────────────┘
```

### firebase.json Configuration

```json
{
  "hosting": {
    "public": ".",
    "ignore": [
      "firebase.json",
      "server/**",
      "node_modules/**"
    ],
    "rewrites": [
      {
        "source": "/api/**",
        "function": "api"
      },
      {
        "source": "**",
        "destination": "/index.html"
      }
    ]
  },
  "functions": {
    "source": "server",
    "runtime": "nodejs18"
  }
}
```

---

## Security Checklist

- [ ] Enable Cloud Armor for DDoS protection
- [ ] Configure Secret Manager for sensitive data
- [ ] Enable VPC Service Controls
- [ ] Set up IAM roles with least privilege
- [ ] Enable audit logging
- [ ] Configure HTTPS only (automatic in Cloud Run)
- [ ] Set up database backups
- [ ] Configure rate limiting (already in server.js)

---

## Domain & SSL

```bash
# Map custom domain
gcloud run domain-mappings create \
    --service=duckdb-ide \
    --domain=your-domain.com

# SSL is automatic with Cloud Run
```

---

## Monitoring Setup

```bash
# Enable Cloud Monitoring
gcloud services enable monitoring.googleapis.com

# Create alert policy
gcloud alpha monitoring policies create --policy-from-file=alert-policy.yaml
```

---

## Cost Estimate (Monthly)

| Tier | Instances | Requests | Database | Total |
|------|-----------|----------|----------|-------|
| **Free** | - | 2M requests | - | $0 |
| **Small** | 1 container | 10M requests | db-f1-micro | ~$30-50 |
| **Medium** | 2-3 containers | 50M requests | db-g6-small | ~$100-150 |
| **Large** | 5+ containers | 100M+ requests | db-g6-medium | ~$300+ |

---

## Deployment Command Summary

```bash
# Quick deploy (Cloud Run)
gcloud run deploy duckdb-ide \
    --source . \
    --platform managed \
    --region us-central1 \
    --allow-unauthenticated \
    --set-cloudsql-instances=duckdb-ide-db

# View logs
gcloud logs tail /projects/duckdb-ide-project/logs/run.googleapis.com%2Frequests

# Get service URL
gcloud run services describe duckdb-ide --region us-central1 --format="value(status.url)"
```

---

## CI/CD: Cloud Build Configuration

Create `cloudbuild.yaml`:

```yaml
steps:
  - name: 'gcr.io/cloud-builders/docker'
    args: ['build', '-t', 'us-central1-docker.pkg.dev/$PROJECT_ID/duckdb-ide-repo/duckdb-ide:$COMMIT_SHA', '.']
  - name: 'gcr.io/cloud-builders/docker'
    args: ['push', 'us-central1-docker.pkg.dev/$PROJECT_ID/duckdb-ide-repo/duckdb-ide:$COMMIT_SHA']
  - name: 'gcr.io/cloud-builders/gcloud'
    args:
      - 'run'
      - 'deploy'
      - 'duckdb-ide'
      - '--image'
      - 'us-central1-docker.pkg.dev/$PROJECT_ID/duckdb-ide-repo/duckdb-ide:$COMMIT_SHA'
      - '--region'
      - 'us-central1'
      - '--platform'
      - 'managed'
      - '--allow-unauthenticated'
```

---

## Next Steps

1. Choose deployment option (Cloud Run recommended)
2. Create Google Cloud project
3. Set up billing account
4. Follow step-by-step deployment commands
5. Test deployment
6. Set up custom domain
7. Configure monitoring and alerts
