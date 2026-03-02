# Cloud Build Configuration Guide

**File:** `cloudbuild.yaml`
**Purpose:** Automates deployment from GitHub to Google Cloud Run

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
```

**Purpose:** Default values that can be overridden in the trigger UI. Variables prefixed with `_` are user-defined (not reserved).

**Usage:** Not currently used in steps, but can be referenced as `$_DEPLOY_REGION`.

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

## One-Time Setup Instructions

### 1. Enable Required APIs

```bash
gcloud services enable cloudbuild.googleapis.com \
    run.googleapis.com \
    artifactregistry.googleapis.com
```

### 2. Create Artifact Registry Repository

```bash
gcloud artifacts repositories create duckdb-ide-repo \
    --repository-format=docker \
    --location=us-central1
```

### 3. Create GitHub Trigger

```bash
# Replace with your values
REPO_OWNER=prateekpanjla-outlook
PROJECT_ID=your-project-id

gcloud builds triggers create github \
    --name="deploy-gcp-deployment" \
    --branch-pattern="^gcp-deployment$" \
    --build-config="cloudbuild.yaml" \
    --repo="${REPO_OWNER}/duckdb-wasm-ide"
```

### 4. Grant Cloud Build Permissions

```bash
# Get project number
PROJECT_NUMBER=$(gcloud projects describe PROJECT_ID --format='value(projectNumber)')

# Grant Cloud Run Admin role
gcloud projects add-iam-policy-binding PROJECT_ID \
    --member="serviceAccount:${PROJECT_NUMBER}@cloudbuild.gserviceaccount.com" \
    --role="roles/run.admin"

# Grant Service Account User role (for Cloud SQL)
gcloud projects add-iam-policy-binding PROJECT_ID \
    --member="serviceAccount:${PROJECT_NUMBER}@cloudbuild.gserviceaccount.com" \
    --role="roles/iam.serviceAccountUser"
```

### 5. Set Environment Variables (Optional)

You can set secrets directly in the trigger UI instead of in code:

```bash
# Navigate to: Cloud Build > Triggers > Edit your trigger
# Add these variables in "Substitution variables":

NODE_ENV=production
DB_HOST=/cloudsql/PROJECT:us-central1:INSTANCE
DB_NAME=duckdb_ide
DB_USER=postgres
DB_PASSWORD=***  # Use Secret Manager reference
JWT_SECRET=***   # Use Secret Manager reference
CORS_ORIGINS=https://duckdb-ide-xxxxx.run.app
```

For Secret Manager references:
```bash
--set-secrets="DB_PASSWORD=db-password:latest"
--set-secrets="JWT_SECRET=jwt-secret:latest"
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

### Service Deployed but Returns Errors
- Check environment variables are set
- Verify Cloud SQL connection string format
- Check logs: `gcloud tail logs duckdb-ide`

---

## Cost Estimates

| Resource | Free Tier | Paid |
|----------|-----------|------|
| Cloud Build | 120 min/day | $0.003/minute after |
| Artifact Registry | 0.5 GB | $0.10/GB/month after |
| Cloud Run | 2M requests/month | Varies by usage |

**Typical monthly cost for small app:** $10-30
