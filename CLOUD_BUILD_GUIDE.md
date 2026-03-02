# Cloud Build Configuration Guide

**File:** `cloudbuild.yaml`
**Purpose:** Automates deployment from GitHub to Google Cloud Run

---

## Prerequisites (ONE-TIME MANUAL SETUP)

**IMPORTANT:** Before Cloud Build can deploy, you must manually set up these resources ONCE:

### 1. Create Google Cloud Project

```bash
# Create new project or use existing
gcloud projects create duckdb-ide-project
gcloud config set project duckdb-ide-project
```

### 2. Create Cloud SQL Instance (PostgreSQL)

```bash
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
```

### 3. Create Database and Run Migrations

```bash
# Option A: Using Cloud SQL Proxy (RECOMMENDED)
# Download proxy
wget https://dl.google.com/cloudsql/cloud_sql_proxy.linux.amd64
mv cloud_sql_proxy.linux.amd64 cloud-sql-proxy
chmod +x cloud-sql-proxy

# Start proxy
./cloud-sql-proxy duckdb-ide-project:us-central1:duckdb-ide-db &

# Run migrations
cd server
node utils/initDatabase.js

# Seed questions
node seed/seedQuestions.js
```

```bash
# Option B: Using gcloud sql connect
gcloud sql connect duckdb-ide-db --user=postgres
# Then run the SQL from initDatabase.js manually
```

### 4. Create Secrets in Secret Manager

```bash
# Enable Secret Manager API
gcloud services enable secretmanager.googleapis.com

# Create database password secret
echo "YOUR_DB_PASSWORD" | \
    gcloud secrets create db-password --data-file=-

# Create JWT secret
openssl rand -base64 32 | \
    gcloud secrets create jwt-secret --data-file=-

# Grant Cloud Build service account access to secrets
PROJECT_NUMBER=$(gcloud projects describe duckdb-ide-project --format='value(projectNumber)')
gcloud secrets add-iam-policy-binding db-password \
    --member="serviceAccount:${PROJECT_NUMBER}@cloudbuild.gserviceaccount.com" \
    --role="roles/secretmanager.secretAccessor"
gcloud secrets add-iam-policy-binding jwt-secret \
    --member="serviceAccount:${PROJECT_NUMBER}@cloudbuild.gserviceaccount.com" \
    --role="roles/secretmanager.secretAccessor"
```

### 5. Enable Required APIs

```bash
gcloud services enable cloudbuild.googleapis.com \
    run.googleapis.com \
    artifactregistry.googleapis.com \
    sqladmin.googleapis.com
```

### 6. Create Artifact Registry Repository

```bash
gcloud artifacts repositories create duckdb-ide-repo \
    --repository-format=docker \
    --location=us-central1
```

### 7. Create GitHub Trigger

```bash
# Replace with your values
REPO_OWNER=prateekpanjla-outlook
PROJECT_ID=duckdb-ide-project

gcloud builds triggers create github \
    --name="deploy-gcp-deployment" \
    --branch-pattern="^gcp-deployment$" \
    --build-config="cloudbuild.yaml" \
    --repo="${REPO_OWNER}/duckdb-wasm-ide"

# Update trigger with substitution variables
gcloud builds triggers update deploy-gcp-deployment \
    --substitutions=_CLOUDSQL_CONNECTION=duckdb-ide-project:us-central1:duckdb-ide-db,_DB_NAME=duckdb_ide,_DB_USER=postgres,_DB_PASSWORD_SECRET=db-password,_JWT_SECRET_SECRET=jwt-secret
```

---

## What is Cloud Build?

Google Cloud Build is a serverless CI/CD platform. When you push code to GitHub, Cloud Build:
1. Builds a Docker image of your application
2. Pushes the image to Google Artifact Registry
3. Deploys the image to Cloud Run

---

## File Structure Breakdown

### `steps` - Build Pipeline

Each step runs in sequence. If one fails, the pipeline stops.

#### Step 1: Build Docker Image

```yaml
- name: 'gcr.io/cloud-builders/docker'
  args:
    - 'build'
    - '-t'
    - 'us-central1-docker.pkg.dev/$PROJECT_ID/duckdb-ide-repo/duckdb-ide:$COMMIT_SHA'
    - '-t'
    - 'us-central1-docker.pkg.dev/$PROJECT_ID/duckdb-ide-repo/duckdb-ide:latest'
    - '.'
```

| Component | Value | Meaning |
|-----------|-------|---------|
| `name` | `gcr.io/cloud-builders/docker` | Use Google's Docker builder |
| `args: -t` | `$COMMIT_SHA` | Tag image with unique commit hash |
| `args: -t` | `:latest` | Tag image as "latest" for easy reference |
| `args: '.'` | Build context | Current directory (root of repo) |

**Why two tags?**
- `$COMMIT_SHA` - Unique identifier, allows rollback to any version
- `:latest` - Human-readable, always points to most recent build

---

#### Step 2: Push to Artifact Registry

```yaml
- name: 'gcr.io/cloud-builders/docker'
  args:
    - 'push'
    - 'us-central1-docker.pkg.dev/$PROJECT_ID/duckdb-ide-repo/duckdb-ide:$COMMIT_SHA'
```

| Component | Value | Meaning |
|-----------|-------|---------|
| `name` | `gcr.io/cloud-builders/docker` | Use Docker builder |
| `args: push` | - | Upload image to registry |
| `args: image` | `$COMMIT_SHA` | Push the uniquely tagged image |

**Why push?** Cloud Run can only deploy images stored in Artifact Registry (or Docker Hub, GCR, etc.).

---

#### Step 3: Deploy to Cloud Run

```yaml
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
    - '--port'
    - '8080'
    - '--memory'
    - '512Mi'
    - '--cpu'
    - '1'
    - '--max-instances'
    - '10'
    - '--timeout'
    - '300'
    # Connect to Cloud SQL
    - '--set-cloudsql-instances=$_CLOUDSQL_CONNECTION'
    # Environment variables (use --set-secrets for sensitive values)
    - '--set-env-vars'
    - 'NODE_ENV=production,DB_NAME=$_DB_NAME,DB_USER=$_DB_USER,DB_HOST=/cloudsql/$_CLOUDSQL_CONNECTION'
    - '--set-secrets'
    - 'DB_PASSWORD=$_DB_PASSWORD_SECRET:latest,JWT_SECRET=$_JWT_SECRET_SECRET:latest'
```

| Argument | Value | Purpose |
|----------|-------|---------|
| `deploy` | `duckdb-ide` | Service name (appears in URL) |
| `--image` | `$COMMIT_SHA` | Which image to deploy |
| `--region` | `us-central1` | Geographic location |
| `--platform` | `managed` | Fully managed (not GKE) |
| `--allow-unauthenticated` | - | Public access (no IAM required) |
| `--port` | `8080` | Container listening port |
| `--memory` | `512Mi` | RAM per instance |
| `--cpu` | `1` | CPU cores per instance |
| `--max-instances` | `10` | Max concurrent instances |
| `--timeout` | `300` | Request timeout (seconds) |
| `--set-cloudsql-instances` | `$_CLOUDSQL_CONNECTION` | Connect Cloud Run to Cloud SQL |
| `--set-env-vars` | `NODE_ENV,DB_*` | Non-sensitive environment variables |
| `--set-secrets` | `DB_PASSWORD,JWT_SECRET` | Sensitive values from Secret Manager |

---

### `images` - Manifest

```yaml
images:
  - 'us-central1-docker.pkg.dev/$PROJECT_ID/duckdb-ide-repo/duckdb-ide:latest'
```

**Purpose:** Tells Cloud Build to display these images in the build UI. Also enables automatic scanning for vulnerabilities.

---

### `substitutions` - Variables

```yaml
substitutions:
  _DEPLOY_REGION: 'us-central1'
  _MEMORY: '512Mi'
  _CPU: '1'
  _MAX_INSTANCES: '10'
  # Cloud SQL connection (format: PROJECT:REGION:INSTANCE)
  _CLOUDSQL_CONNECTION: 'your-project:us-central1:duckdb-ide-db'
  # Database configuration
  _DB_NAME: 'duckdb_ide'
  _DB_USER: 'postgres'
  # Secret Manager references (create these secrets before deploying)
  _DB_PASSWORD_SECRET: 'db-password'
  _JWT_SECRET_SECRET: 'jwt-secret'
```

**Purpose:** Default values that can be overridden in the trigger UI. Variables prefixed with `_` are user-defined (not reserved).

These values are used in the deploy step to configure the service.

---

### `options` - Build Settings

```yaml
options:
  logging: CLOUD_LOGGING_ONLY
  machineType: 'E2_HIGHCPU_8'
```

| Option | Value | Meaning |
|--------|-------|---------|
| `logging` | `CLOUD_LOGGING_ONLY` | Don't show build logs inline, store in Cloud Logging |
| `machineType` | `E2_HIGHCPU_8` | Use high-CPU machine for faster builds |

---

## Built-in Variables

Cloud Build automatically provides these variables:

| Variable | Value | Example |
|----------|-------|---------|
| `$PROJECT_ID` | Your GCP project ID | `duckdb-ide-project` |
| `$COMMIT_SHA` | Git commit hash | `abc123def456...` |
| `$SHORT_SHA` | Short commit hash | `abc123de` |
| `$REVISION_ID` | Build ID | `12345-67890` |
| `$BRANCH_NAME` | Git branch | `gcp-deployment` |
| `$TAG_NAME` | Git tag (if pushed) | `v1.0.0` |

---

## Complete Deployment Flow

```
┌─────────────────┐
│ Push to GitHub  │
│ (gcp-deployment)│
└────────┬────────┘
         │
         ▼
┌─────────────────────────────────────┐
│ Cloud Build Trigger Fires           │
│ - Detects push to gcp-deployment    │
└────────┬────────────────────────────┘
         │
         ▼
┌─────────────────────────────────────┐
│ Step 1: Build Docker Image          │
│ - Uses Dockerfile in repo root      │
│ - Tags with $COMMIT_SHA             │
└────────┬────────────────────────────┘
         │
         ▼
┌─────────────────────────────────────┐
│ Step 2: Push to Artifact Registry   │
│ - Stores image for deployment       │
└────────┬────────────────────────────┘
         │
         ▼
┌─────────────────────────────────────┐
│ Step 3: Deploy to Cloud Run         │
│ - Creates/updates service           │
│ - Sets environment variables        │
│ - Connects to Cloud SQL             │
│ - Routes traffic to new revision    │
└────────┬────────────────────────────┘
         │
         ▼
┌─────────────────────────────────────┐
│ Service Live                        │
│ https://duckdb-ide-xxxxx.run.app    │
└─────────────────────────────────────┘
```

---

## Grant Cloud Build Permissions

After creating the trigger, grant permissions:

```bash
# Get project number
PROJECT_NUMBER=$(gcloud projects describe PROJECT_ID --format='value(projectNumber)')

# Grant Cloud Run Admin role (needed for deployment)
gcloud projects add-iam-policy-binding PROJECT_ID \
    --member="serviceAccount:${PROJECT_NUMBER}@cloudbuild.gserviceaccount.com" \
    --role="roles/run.admin"

# Grant Cloud SQL Client role (needed for Cloud SQL connection)
gcloud projects add-iam-policy-binding PROJECT_ID \
    --member="serviceAccount:${PROJECT_NUMBER}@cloudbuild.gserviceaccount.com" \
    --role="roles/cloudsql.client"
```

---

## Troubleshooting

### Build Fails at Step 1 (Docker build)
- Check Dockerfile syntax
- Verify all required files are in git
- Check build logs in Cloud Console

### Build Fails at Step 2 (Push)
- Verify Artifact Registry exists
- Check permissions on repository

### Build Fails at Step 3 (Deploy)
- Verify Cloud Run API enabled
- Check service account permissions
- Verify region matches your Cloud SQL region
- Verify secrets exist in Secret Manager

### Service Deployed but Returns Errors
- Check environment variables are set correctly
- Verify Cloud SQL connection string format
- Check secrets are accessible by Cloud Build service account
- Check logs: `gcloud tail logs duckdb-ide`

---

## Cost Estimates

| Resource | Free Tier | Paid |
|----------|-----------|------|
| Cloud Build | 120 min/day | $0.003/minute after |
| Artifact Registry | 0.5 GB | $0.10/GB/month after |
| Cloud Run | 2M requests/month | Varies by usage |
| Cloud SQL (db-f1-micro) | ~$10/month | ~$10-50/month depending on tier |

**Typical monthly cost for small app:** $20-60
