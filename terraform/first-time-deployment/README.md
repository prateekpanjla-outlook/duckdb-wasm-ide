# First-Time GCP Deployment - Terraform

Automates the initial setup of all GCP resources for the DuckDB WASM IDE application.

---

## How Terraform Connects to Google Cloud

Terraform uses **Google Cloud credentials** to authenticate. You have three options:

### Option 1: Dedicated Service Account (Recommended for Production)

**Why use a service account?**
- ✅ Security: Separate from personal account
- ✅ Audit: Clear trail of Terraform actions
- ✅ CI/CD: Can be automated without personal credentials
- ✅ Rotation: Can be rotated without affecting your account

**Quick setup with the provided script:**

```bash
cd terraform/first-time-deployment

# Run the setup script
./setup-auth.sh

# This will:
# - Create a terraform-deployer service account
# - Grant required permissions
# - Download terraform-key.json
# - Show you how to set the environment variable

# Set the environment variable
export GOOGLE_APPLICATION_CREDENTIALS=$(pwd)/terraform-key.json

# Run Terraform
terraform init
terraform plan
```

**Manual setup:**

```bash
# Create service account
gcloud iam service-accounts create terraform-deployer \
    --project=sql-practice-project-489106 \
    --display-name="Terraform Deployer"

# Grant Editor role (required for creating all resources)
gcloud projects add-iam-policy-binding sql-practice-project-489106 \
    --member="serviceAccount:terraform-deployer@sql-practice-project-489106.iam.gserviceaccount.com" \
    --role="roles/editor"

# Create and download key
gcloud iam service-accounts keys create terraform-key.json \
    --iam-account=terraform-deployer@sql-practice-project-489106.iam.gserviceaccount.com

# Set environment variable
export GOOGLE_APPLICATION_CREDENTIALS=$(pwd)/terraform-key.json
```

### Option 2: Google Cloud Application Default Credentials (Quick for Development)

```bash
# Authenticate using your Google account (opens browser)
gcloud auth application-default login

# Terraform automatically uses these credentials
# No environment variable needed
```

### Option 3: Personal gcloud Auth

```bash
# Authenticate with your personal Google account
gcloud auth login

# Set your project
gcloud config set project sql-practice-project-489106
```

---

## Prerequisites

1. **Install Terraform**: https://developer.hashicorp.com/terraform/downloads
2. **Install gcloud CLI**: https://cloud.google.com/sdk/docs/install
3. **Authenticate** (see options above)

---

## Quick Start

```bash
# Navigate to terraform directory
cd terraform/first-time-deployment

# Initialize Terraform (downloads providers)
terraform init

# Review what will be created
terraform plan

# Apply changes (creates resources)
terraform apply

# Type 'yes' when prompted
```

---

## Configuration

Edit `variables.tf` to customize your deployment:

| Variable | Default | Description |
|----------|---------|-------------|
| `project_id` | `sql-practice-project-489106` | Your GCP project ID |
| `region` | `us-central1` | GCP region for resources |
| `db_name` | `duckdb_ide` | Database name |
| `db_password` | `""` | Leave empty to auto-generate |
| `jwt_secret` | `""` | Leave empty to auto-generate |
| `deletion_protection` | `true` | Prevents accidental DB deletion |

Or override with CLI:

```bash
terraform apply -var="project_id=my-project-id"
```

---

## Resources Created

| Resource | Name | Purpose |
|----------|------|---------|
| APIs | 7 services | cloudbuild, run, artifactregistry, sqladmin, etc. |
| Artifact Registry | `duckdb-ide-repo` | Docker container storage |
| Cloud SQL Instance | `duckdb-ide-db` | PostgreSQL database |
| Cloud SQL Database | `duckdb_ide` | Application database |
| Secrets | `db-password`, `jwt-secret` | Sensitive credentials |
| Service Accounts | 3 SAs | Least privilege IAM |
| IAM Bindings | Multiple | Permissions for each SA |

---

## After Terraform Apply

### 1. View Outputs

```bash
terraform output
terraform output generated_passwords  # View auto-generated passwords
```

### 2. Create Cloud Build Trigger

```bash
gcloud builds triggers create github \
    --name="deploy-gcp-deployment" \
    --branch-pattern="^gcp-deployment$" \
    --build-config="../../cloudbuild.yaml" \
    --service-account="cloud-build-deployer-sa@sql-practice-project-489106.iam.gserviceaccount.com" \
    --repo="prateekpanjla-outlook/duckdb-wasm-ide"
```

### 3. Deploy Cloud Function (db-init)

```bash
cd ../../server/cloud-functions/db-init

gcloud functions deploy db-init-service \
    --gen2 \
    --region=us-central1 \
    --runtime=nodejs18 \
    --source=. \
    --entry-point=initDatabase \
    --trigger-http \
    --allow-unauthenticated \
    --memory=512Mi \
    --timeout=300s \
    --set-cloudsql-instances=sql-practice-project-489106:us-central1:duckdb-ide-db \
    --set-env-vars=DB_NAME=duckdb_ide,DB_USER=postgres,DB_HOST=/cloudsql/sql-practice-project-489106:us-central1:duckdb-ide-db \
    --set-secrets=DB_PASSWORD=db-password:latest \
    --service-account=db-init-sa@sql-practice-project-489106.iam.gserviceaccount.com
```

### 4. Initialize Database

```bash
# Get the function URL
FUNCTION_URL=$(gcloud functions describe db-init-service --region us-central1 --format="value(serviceConfig.uri)")

# Run initialization
curl -X POST $FUNCTION_URL/init
```

### 5. Deploy Application

Push to `gcp-deployment` branch to trigger Cloud Build:

```bash
git push origin gcp-deployment
```

---

## Common Commands

```bash
# Preview changes without applying
terraform plan

# Apply with auto-approval
terraform apply -auto-approve

# Destroy all resources
terraform destroy

# Format configuration files
terraform fmt

# Validate configuration
terraform validate

# Show current state
terraform show
```

---

## Cost Estimate

| Resource | Monthly Cost |
|----------|--------------|
| Cloud SQL (db-f1-micro) | ~$10-15 |
| Secret Manager | ~$0.06 (2 secrets) |
| Artifact Registry | FREE (under 0.5 GB) |
| Cloud Functions | FREE tier covers initial usage |
| **Total** | **~$12-16/month** |

**Free Trial Credits:** The $300 new account credit covers these costs for ~18-24 months.

---

## Troubleshooting

### Error: "terraform: not found"

Install Terraform from: https://developer.hashicorp.com/terraform/downloads

### Error: "google: could not find default credentials"

Run: `gcloud auth application-default login`

### Error: "API not enabled"

The script automatically enables required APIs. If this fails, manually run:
```bash
gcloud services enable cloudbuild.googleapis.com run.googleapis.com
```

### Error: "Insufficient permissions"

Ensure your account has Editor or Owner role on the project:
```bash
gcloud projects get-iam-policy sql-practice-project-489106
```

---

## Security Notes

- Auto-generated passwords are stored in Secret Manager
- Service accounts follow least privilege principle
- Cloud SQL deletion protection is enabled by default
- Secrets are only accessible to designated service accounts

---

## Cleanup

To remove all created resources:

```bash
terraform destroy
```

**Note:** If `deletion_protection` is enabled, you must disable it first:
```bash
# Edit variables.tf: deletion_protection = false
terraform apply
terraform destroy
```
