# First-Time GCP Deployment - Terraform

Automates the initial setup of all GCP resources for the DuckDB WASM IDE application.

---

## Deployment Architecture

This deployment uses a **hybrid approach**:

```
┌─────────────────────────────────────────────────────────────────┐
│                    Step 1: Terraform                            │
│  Creates GCP Infrastructure (stateful, declarative)             │
│  - APIs, Cloud SQL, Secret Manager, Service Accounts            │
│  - Outputs: connection names, service account emails            │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│                Step 2: Shell Scripts (use Terraform outputs)    │
│  Deploy Cloud Function + Init DB + Create Build Trigger        │
│  - Uses `terraform output` values to configure commands        │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│                    Step 3: Git Push                             │
│  Triggers Cloud Build → Deploys Application to Cloud Run       │
└─────────────────────────────────────────────────────────────────┘
```

**Why this approach?**
- Terraform manages infrastructure (stateful, version-controlled)
- gcloud commands handle deployment operations (better Cloud Functions/Cloud Run support)
- Shell scripts bridge the gap using `terraform output`

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

### Option 2: Google Cloud Application Default Credentials (Quick for Development)

```bash
# Authenticate using your Google account (opens browser)
gcloud auth application-default login

# Terraform automatically uses these credentials
# No environment variable needed
```

---

## Prerequisites

1. **Install Terraform**: https://developer.hashicorp.com/terraform/downloads
2. **Install gcloud CLI**: https://cloud.google.com/sdk/docs/install
3. **Authenticate** (see options above)

---

## Quick Start

### Step 1: Run Terraform (Create GCP Infrastructure)

```bash
# Navigate to terraform directory
cd terraform/first-time-deployment

# Set credentials
export GOOGLE_APPLICATION_CREDENTIALS=$(pwd)/terraform-key.json

# Initialize Terraform (downloads providers)
terraform init

# Review what will be created
terraform plan -out=tfplan

# Apply changes (creates resources)
terraform apply tfplan

# View outputs (needed for next steps)
terraform output
```

### Step 2: Deploy Cloud Function (uses Terraform outputs)

```bash
# Get values from Terraform outputs
PROJECT_ID=$(terraform output -raw project_id)
REGION=$(terraform output -raw region)
CONNECTION_NAME=$(terraform output -raw cloudsql_connection_name)
DB_INIT_SA=$(terraform output -json service_accounts | jq -r '.db_init')
DB_NAME=$(terraform output -raw db_name)

# Deploy Cloud Function
cd ../../server/cloud-functions/db-init

gcloud functions deploy db-init-service \
    --gen2 \
    --region=$REGION \
    --runtime=nodejs18 \
    --source=. \
    --entry-point=initDatabase \
    --trigger-http \
    --allow-unauthenticated \
    --memory=512Mi \
    --timeout=300s \
    --set-cloudsql-instances=$CONNECTION_NAME \
    --set-env-vars=DB_NAME=$DB_NAME,DB_USER=postgres,INSTANCE_CONNECTION_NAME=$CONNECTION_NAME \
    --set-secrets=DB_PASSWORD=db-password:latest \
    --service-account=$DB_INIT_SA
```

### Step 3: Initialize Database

```bash
# Get the function URL
FUNCTION_URL=$(gcloud functions describe db-init-service --region $REGION --format="value(serviceConfig.uri)")

# Run initialization (creates tables and seeds data)
curl -X POST $FUNCTION_URL/init
```

### Step 4: Create Cloud Build Trigger

```bash
# Get values from Terraform outputs
PROJECT_ID=$(terraform output -raw project_id)
CLOUDBUILD_SA=$(terraform output -json service_accounts | jq -r '.cloud_build_deployer')

# Create the trigger
gcloud builds triggers create github \
    --name="deploy-gcp-deployment" \
    --branch-pattern="^gcp-deployment$" \
    --build-config="../../cloudbuild.yaml" \
    --service-account=$CLOUDBUILD_SA \
    --repo="prateekpanjla-outlook/duckdb-wasm-ide"
```

### Step 5: Deploy Application

```bash
# Push to gcp-deployment branch to trigger Cloud Build
git push origin gcp-deployment
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

## Terraform Outputs

After running `terraform apply`, use these outputs in subsequent steps:

```bash
# View all outputs
terraform output

# Output as JSON (for scripting)
terraform output -json

# Get single output value
terraform output -raw cloudsql_connection_name

# Example outputs:
# - project_id: GCP project ID
# - region: GCP region
# - cloudsql_connection_name: For Cloud SQL connections
# - cloudsql_instance_name: Database instance name
# - artifact_registry_repository: Docker repo path
# - service_accounts: JSON with all SA emails
# - secrets: JSON with secret names
# - generated_passwords: Auto-generated passwords (sensitive)
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

## Common Commands

```bash
# Preview changes without applying
terraform plan

# Apply with auto-approval
terraform apply -auto-approve

# Save plan to file
terraform plan -out=tfplan

# Apply saved plan
terraform apply tfplan

# Destroy all resources
terraform destroy

# Format configuration files
terraform fmt

# Validate configuration
terraform validate

# Show current state
terraform show

# Refresh state (sync with GCP)
terraform refresh
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

```bash
# Ubuntu/Debian
wget -O- https://apt.releases.hashicorp.com/gpg | sudo gpg --dearmor -o /usr/share/keyrings/hashicorp-archive-keyring.gpg
echo "deb [signed-by=/usr/share/keyrings/hashicorp-archive-keyring.gpg] https://apt.releases.hashicorp.com $(lsb_release -cs) main" | sudo tee /etc/apt/sources.list.d/hashicorp.list
sudo apt update && sudo apt install terraform
```

### Error: "google: could not find default credentials"

Run: `export GOOGLE_APPLICATION_CREDENTIALS=$(pwd)/terraform-key.json`

Or: `gcloud auth application-default login`

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
- Service account key (`terraform-key.json`) should be secured and rotated

---

## Cleanup

To remove all created resources:

```bash
terraform destroy
```

**Note:** If `deletion_protection` is enabled, you must disable it first:
```bash
terraform apply -var="deletion_protection=false"
terraform destroy
```

---

## Deployment Script (Automation)

For automated deployment using Terraform outputs, see: [GCP_DEPLOYMENT_EXECUTION.md](../../GCP_DEPLOYMENT_EXECUTION.md)
