# Google Cloud Platform Deployment Plan
**DuckDB WASM IDE**
**Project:** sql-practice-project-489106

---

## Overview

This application consists of:
- **Frontend**: Static HTML/CSS/JS with DuckDB WASM (EH bundle, ~34MB)
- **Backend**: Node.js/Express API server
- **Database**: PostgreSQL (users, questions, user_attempts, user_sessions)

---

## Architecture

```
                    ┌────────────────────┐
                    │  Cloud Run         │  Frontend + Backend
                    │  (Node.js + WASM)  │  Port 8080
                    └────────┬───────────┘
                             │ Unix socket (no VPC needed)
                             │ /cloudsql/PROJECT:REGION:INSTANCE
                    ┌────────▼───────────┐
                    │  Cloud SQL         │  PostgreSQL 16
                    │  (No public IP)    │  db-f1-micro
                    └────────────────────┘
```

**Key design decisions:**
- No CDN — all resources served same-origin from Express (avoids CORS/COEP issues)
- No VPC — Cloud Run's built-in Cloud SQL connector uses Google's internal control plane
- Cloud SQL has NO public IP — connector bypasses it entirely
- WASM files pre-compressed at build time (gzip -9) to stay under 32MB HTTP/1.1 limit
- EH bundle (WASM exceptions) — 1.3s init, no SharedArrayBuffer/threading needed

---

## POC Validation (2026-03-28)

**Cloud Run → Cloud SQL via Unix socket: VALIDATED**

```
connect:     OK
createTable: OK
insert:      OK  → "Hello from Cloud Run! Connection via Unix socket works."
read:        OK
dropTable:   OK
dbHost:      /cloudsql/sql-practice-project-489106:us-central1:duckdb-ide-poc
```

- `pg` npm module (v8.18.0) connects via Unix socket natively when host starts with `/`
- No code changes needed — just set DB_HOST env var
- Only IAM role needed: `roles/cloudsql.client` on Cloud Run service account

---

## Cost Estimate (Monthly)

| Service | Tier | Cost |
|---------|------|------|
| **Cloud Run** | Free tier: 2M requests, 360K vCPU-sec | $0 |
| **Cloud SQL** | db-f1-micro, 10GB HDD, no public IP | ~$9/month |
| **Cloud Build** | Free tier: 120 min/day | $0 |
| **Artifact Registry** | Free tier: 0.5GB | $0 |
| **Total** | | **~$9/month** |

---

## Step-by-Step Deployment

### Step 1: GCP Project Setup

```bash
export PROJECT_ID="sql-practice-project-489106"
gcloud config set project $PROJECT_ID

# Enable required APIs
gcloud services enable \
    cloudbuild.googleapis.com \
    run.googleapis.com \
    sqladmin.googleapis.com \
    artifactregistry.googleapis.com \
    secretmanager.googleapis.com
```

### Step 2: Create Cloud SQL Instance

```bash
# Create PostgreSQL 16 (cheapest tier, no public IP is optional — proxy bypasses it)
gcloud sql instances create duckdb-ide-db \
    --database-version=POSTGRES_16 \
    --tier=db-f1-micro \
    --region=us-central1 \
    --edition=ENTERPRISE \
    --storage-size=10 \
    --storage-type=HDD

# Set password
gcloud sql users set-password postgres \
    --instance=duckdb-ide-db \
    --password=YOUR_SECURE_PASSWORD

# Create database
gcloud sql databases create duckdb_ide --instance=duckdb-ide-db

# Get connection name (needed for Cloud Run)
gcloud sql instances describe duckdb-ide-db --format="value(connectionName)"
# → sql-practice-project-489106:us-central1:duckdb-ide-db
```

### Step 3: Create Secrets in Secret Manager

```bash
# DB password
echo -n "YOUR_SECURE_PASSWORD" | gcloud secrets create db-password --data-file=-

# JWT secret
echo -n "$(openssl rand -base64 32)" | gcloud secrets create jwt-secret --data-file=-

# Grant Cloud Run service account access to secrets
PROJECT_NUMBER=$(gcloud projects describe $PROJECT_ID --format="value(projectNumber)")
SA="${PROJECT_NUMBER}-compute@developer.gserviceaccount.com"

gcloud secrets add-iam-policy-binding db-password \
    --member="serviceAccount:$SA" --role="roles/secretmanager.secretAccessor"
gcloud secrets add-iam-policy-binding jwt-secret \
    --member="serviceAccount:$SA" --role="roles/secretmanager.secretAccessor"
```

### Step 4: Create Artifact Registry

```bash
gcloud artifacts repositories create duckdb-ide-repo \
    --repository-format=docker \
    --location=us-central1
```

### Step 5: Grant IAM Roles

```bash
# Cloud SQL Client role for Cloud Run service account
gcloud projects add-iam-policy-binding $PROJECT_ID \
    --member="serviceAccount:$SA" \
    --role="roles/cloudsql.client"
```

### Step 6: Build and Deploy

```bash
REGION="us-central1"
IMAGE="$REGION-docker.pkg.dev/$PROJECT_ID/duckdb-ide-repo/duckdb-ide:latest"
SQL_CONN="$PROJECT_ID:$REGION:duckdb-ide-db"

# Build Docker image (remote, no local Docker needed)
gcloud builds submit --tag=$IMAGE

# Deploy to Cloud Run
gcloud run deploy duckdb-ide \
    --image=$IMAGE \
    --region=$REGION \
    --platform=managed \
    --port=8080 \
    --memory=512Mi \
    --cpu=1 \
    --max-instances=10 \
    --timeout=300 \
    --allow-unauthenticated \
    --add-cloudsql-instances=$SQL_CONN \
    --set-env-vars="DB_HOST=/cloudsql/$SQL_CONN,DB_PORT=5432,DB_NAME=duckdb_ide,DB_USER=postgres,JWT_EXPIRES_IN=7d,NODE_ENV=production" \
    --set-secrets="DB_PASSWORD=db-password:latest,JWT_SECRET=jwt-secret:latest"
```

### Step 7: Initialize Database

```bash
# Get service URL
SERVICE_URL=$(gcloud run services describe duckdb-ide --region=$REGION --format="value(status.url)")

# The first request will trigger table auto-creation if initDatabase runs on startup
# Or SSH into Cloud SQL via proxy to run init-db manually:
# gcloud sql connect duckdb-ide-db --user=postgres --database=duckdb_ide
```

### Step 8: Verify

```bash
# Health check
curl $SERVICE_URL/health

# DB connectivity
curl $SERVICE_URL/health/db

# Register test user
curl -X POST $SERVICE_URL/api/auth/register \
    -H "Content-Type: application/json" \
    -d '{"email":"test@test.com","password":"test1234"}'
```

---

## CI/CD: Cloud Build

`cloudbuild.yaml` is configured to:
1. Build Docker image with commit SHA + latest tags
2. Push to Artifact Registry
3. Deploy to Cloud Run with Cloud SQL connection + secrets

Trigger setup:
```bash
gcloud builds triggers create github \
    --repo-name=duckdb-wasm-ide \
    --repo-owner=prateekpanjla-outlook \
    --branch-pattern="^main$" \
    --build-config=cloudbuild.yaml
```

---

## Security

- **Cloud SQL**: No public IP — only accessible via Cloud Run Auth Proxy
- **Secrets**: Stored in GCP Secret Manager, injected at runtime
- **HTTPS**: Automatic with Cloud Run (managed TLS)
- **CSP**: Strict Content-Security-Policy with wasm-unsafe-eval
- **COI**: Cross-Origin-Opener-Policy + Cross-Origin-Embedder-Policy headers
- **Rate limiting**: 100 requests per 15 min per IP (express-rate-limit)
- **Non-root container**: nodejs user (UID 1001)
- **dumb-init**: Proper signal handling for graceful shutdown

---

## Monitoring

```bash
# View logs
gcloud run services logs read duckdb-ide --region=us-central1 --limit=50

# Get service URL
gcloud run services describe duckdb-ide --region=us-central1 --format="value(status.url)"
```

---

## Cleanup (to stop billing)

```bash
# Delete Cloud Run service
gcloud run services delete duckdb-ide --region=us-central1 --quiet

# Delete Cloud SQL instance (~$9/month)
gcloud sql instances delete duckdb-ide-db --quiet

# Delete Artifact Registry images
gcloud artifacts docker images delete \
    us-central1-docker.pkg.dev/$PROJECT_ID/duckdb-ide-repo/duckdb-ide --delete-tags --quiet
```
