# Service Accounts Setup for GCP Deployment

**Purpose:** Configure dedicated service accounts following the principle of least privilege.

---

## Why Dedicated Service Accounts?

| Approach | Problem |
|----------|---------|
| **Default** (using Cloud Build SA) | Single SA has broad permissions across all services |
| **Dedicated** (recommended) | Each service has minimal required permissions only |

**Benefits:**
- Security breach in one service doesn't compromise others
- Clear audit trail of which service did what
- Easier to rotate credentials per service
- Compliance with security best practices

---

## Architecture

```
┌──────────────────────────────────────────────────────────────────────┐
│                                                                      │
│  ┌─────────────────────────────────────────────────────────────┐    │
│  │  cloud-build-deployer-sa@PROJECT_ID.iam.gserviceaccount.com │    │
│  │  Purpose: CI/CD deployment only                              │    │
│  └─────────────────────────────────────────────────────────────┘    │
│                          │                                          │
│          ┌───────────────┴───────────────┐                          │
│          ▼                               ▼                          │
│  ┌───────────────────────┐   ┌─────────────────────────────────┐   │
│  │  Cloud Run            │   │  Cloud Functions                │   │
│  │  duckdb-ide           │   │  db-init-service                │   │
│  │                       │   │                                 │   │
│  │  SA: cloud-run-sa@    │   │  SA: db-init-sa@                │   │
│  └───────────────────────┘   └─────────────────────────────────┘   │
│                          │                                          │
│                          ▼                                          │
│                  ┌───────────────┐                                  │
│                  │  Cloud SQL    │                                  │
│                  │  duckdb-ide-db│                                  │
│                  └───────────────┘                                  │
│                                                                      │
└──────────────────────────────────────────────────────────────────────┘
```

---

## Setup Commands

### 1. Set Variables

```bash
export PROJECT_ID=YOUR_PROJECT_ID
export PROJECT_NUMBER=$(gcloud projects describe $PROJECT_ID --format='value(projectNumber)')
export REGION=us-central1
```

### 2. Create Service Accounts

```bash
# Cloud Build Deployer SA (for CI/CD)
gcloud iam service-accounts create cloud-build-deployer-sa \
    --project=$PROJECT_ID \
    --description="Service account for Cloud Build to deploy Cloud Run and Cloud Functions" \
    --display-name="Cloud Build Deployer"

# Cloud Run SA (for the application)
gcloud iam service-accounts create cloud-run-sa \
    --project=$PROJECT_ID \
    --description="Service account for duckdb-ide Cloud Run service" \
    --display-name="Cloud Run Application"

# Cloud Functions SA (for database initialization)
gcloud iam service-accounts create db-init-sa \
    --project=$PROJECT_ID \
    --description="Service account for db-init Cloud Function" \
    --display-name="Database Initialization Service"
```

### 3. Grant Permissions to Cloud Build Deployer SA

```bash
# Permission to deploy Cloud Run
gcloud projects add-iam-policy-binding $PROJECT_ID \
    --member="serviceAccount:cloud-build-deployer-sa@$PROJECT_ID.iam.gserviceaccount.com" \
    --role="roles/run.developer"

# Permission to deploy Cloud Functions
gcloud projects add-iam-policy-binding $PROJECT_ID \
    --member="serviceAccount:cloud-build-deployer-sa@$PROJECT_ID.iam.gserviceaccount.com" \
    --role="roles/cloudfunctions.developer"

# Permission to push images to Artifact Registry
gcloud artifacts repositories add-iam-policy-binding duckdb-ide-repo \
    --location=$REGION \
    --member="serviceAccount:cloud-build-deployer-sa@$PROJECT_ID.iam.gserviceaccount.com" \
    --role="roles/artifactregistry.writer"

# Permission to act as service accounts (impersonation)
gcloud iam service-accounts add-iam-policy-binding cloud-run-sa@$PROJECT_ID.iam.gserviceaccount.com \
    --project=$PROJECT_ID \
    --member="serviceAccount:cloud-build-deployer-sa@$PROJECT_ID.iam.gserviceaccount.com" \
    --role="roles/iam.serviceAccountUser"

gcloud iam service-accounts add-iam-policy-binding db-init-sa@$PROJECT_ID.iam.gserviceaccount.com \
    --project=$PROJECT_ID \
    --member="serviceAccount:cloud-build-deployer-sa@$PROJECT_ID.iam.gserviceaccount.com" \
    --role="roles/iam.serviceAccountUser"
```

### 4. Grant Permissions to Cloud Run SA

```bash
# Access Cloud SQL via Unix socket
gcloud projects add-iam-policy-binding $PROJECT_ID \
    --member="serviceAccount:cloud-run-sa@$PROJECT_ID.iam.gserviceaccount.com" \
    --role="roles/cloudsql.client"

# Access specific secrets from Secret Manager
gcloud secrets add-iam-policy-binding db-password \
    --member="serviceAccount:cloud-run-sa@$PROJECT_ID.iam.gserviceaccount.com" \
    --role="roles/secretmanager.secretAccessor"

gcloud secrets add-iam-policy-binding jwt-secret \
    --member="serviceAccount:cloud-run-sa@$PROJECT_ID.iam.gserviceaccount.com" \
    --role="roles/secretmanager.secretAccessor"
```

### 5. Grant Permissions to Cloud Functions SA

```bash
# Access Cloud SQL
gcloud projects add-iam-policy-binding $PROJECT_ID \
    --member="serviceAccount:db-init-sa@$PROJECT_ID.iam.gserviceaccount.com" \
    --role="roles/cloudsql.client"

# Access specific secrets
gcloud secrets add-iam-policy-binding db-password \
    --member="serviceAccount:db-init-sa@$PROJECT_ID.iam.gserviceaccount.com" \
    --role="roles/secretmanager.secretAccessor"
```

### 6. Update Cloud Build Trigger to Use Deployer SA

```bash
gcloud builds triggers update deploy-gcp-deployment \
    --service-account="projects/$PROJECT_ID/serviceAccounts/cloud-build-deployer-sa@$PROJECT_ID.iam.gserviceaccount.com"
```

---

## Verify Setup

```bash
# List all service accounts
gcloud iam service-accounts list --project=$PROJECT_ID

# Check policy for a specific service account
gcloud iam service-accounts get-iam-policy cloud-run-sa@$PROJECT_ID.iam.gserviceaccount.com \
    --project=$PROJECT_ID

# Check who can access a secret
gcloud secrets get-iam-policy db-password
```

---

## Summary of Service Accounts

| Service Account | Purpose | Key Permissions |
|-----------------|---------|-----------------|
| `cloud-build-deployer-sa@` | CI/CD deployment | `roles/run.developer`, `roles/cloudfunctions.developer`, `roles/artifactregistry.writer`, `roles/iam.serviceAccountUser` |
| `cloud-run-sa@` | Cloud Run app | `roles/cloudsql.client`, `roles/secretmanager.secretAccessor` (specific secrets) |
| `db-init-sa@` | Cloud Functions | `roles/cloudsql.client`, `roles/secretmanager.secretAccessor` (specific secrets) |

---

## Application Code: No Changes Required

**Important:** The application code does NOT need to be modified. Service accounts operate at the infrastructure/IAM level, not at the application level.

Your app continues to use the same environment variables:
- `DB_HOST`, `DB_NAME`, `DB_USER`, `DB_PASSWORD`
- `JWT_SECRET`
- `NODE_ENV`, etc.

These are still injected via `--set-env-vars` and `--set-secrets` flags during deployment. The service account is used implicitly by the GCP services to access resources.

---

## Deployment Files Updated

The following deployment files have been updated to use these service accounts:
- `cloudbuild.yaml` - Uses `--service-account=cloud-run-sa@` for Cloud Run deploy
- `CLOUD_BUILD_CLOUDFUNCTIONS.md` - Uses `--service-account=db-init-sa@` for Cloud Functions deploy
- `CLOUD_BUILD_GUIDE.md` - Updated with service account setup steps
