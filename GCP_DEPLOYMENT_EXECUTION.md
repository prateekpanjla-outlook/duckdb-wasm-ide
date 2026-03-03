# GCP Deployment Log

Track progress and notes for GCP deployment of DuckDB WASM IDE.

---

## 2026-03-03

### Terraform Service Account Setup

**Actions Taken:**
- User ran `./setup-auth.sh` from terminal after doing `gcloud auth login`
- Key file command was not correct (`--key-type` should be `--key-file-type`)
- Fixed it in script and ran command manually
- Command in file to create key is still not tested

**Status:** ⚠️ Service account created, key downloaded manually, script fixed (not re-tested)

**Next Steps:**
- [ ] Run `terraform init` to verify authentication works
- [ ] Run `terraform plan` to preview resources
- [ ] Run `terraform apply` to create GCP resources

---

## Run 1 - Terraform Apply Failed (2026-03-03 13:28)

### Log File
`terraform/first-time-deployment/terraform-apply-20260303-132849.log`

### What Was Executed
1. **Terraform Init** - ✅ Successful
2. **Terraform Plan** - ✅ Successful (30 resources to create)
3. **Terraform Apply** - ❌ Failed (API dependency issue)

### Issue Summary
**Root Cause:** Chicken-and-egg problem with API enablement

Terraform failed because the following prerequisite APIs were not enabled:
- `cloudresourcemanager.googleapis.com` (Cloud Resource Manager API)
- `iam.googleapis.com` (IAM API)

These APIs are required to:
1. Enable other APIs via Terraform
2. Create service accounts

**Rationale:** Cloud Resource Manager API is the foundation for all GCP resource management. It must be enabled first because Terraform uses it to enable other APIs (Cloud SQL, Secret Manager, etc.) and to manage project-level resources. Without it, Terraform cannot make any changes to the project's service configuration.

**Error Pattern:**
```
Error 403: Cloud Resource Manager API has not been used in project 192834930119 before
```

**Project Reference Note:**
- Project ID: `sql-practice-project-489106`
- Project Number: `192834930119`
- (Service accounts use project numbers internally - same project)

### Resources That Started Creation
- ✅ Random passwords (db_password, jwt_secret)
- ✅ SQL API enabled
- ⏸️ Other APIs blocked (waiting for Cloud Resource Manager)

### Proposed Next Steps
1. **Enable Prerequisite APIs Manually:**
   ```bash
   gcloud services enable cloudresourcemanager.googleapis.com iam.googleapis.com \
       --project=sql-practice-project-489106
   ```

2. **Retry Terraform Apply:**
   ```bash
   cd terraform/first-time-deployment
   terraform apply tfplan
   ```

---

## Run 2 - Cloud SQL Creation Failed (2026-03-03 13:40)

### Log File
`terraform/first-time-deployment/terraform-apply-20260303-134044.apply`

### What Was Executed
1. **Terraform Plan** - ✅ Successful (32 resources with tainted APIs being recreated)
2. **Terraform Apply** - ❌ Failed (Cloud SQL IP configuration error)

### Issue Summary
**Root Cause:** Cloud SQL instance had no network connectivity configured

**Error:**
```
Error 400: Invalid request: At least one of Public IP or Private IP or PSC connectivity must be enabled.
```

**Rationale:** The Cloud SQL configuration had both `ipv4_enabled = false` (no public IP) and `private_network = null` (no private network). Cloud SQL requires at least one connectivity method.

### Resources Created Successfully ✅
| Resource | Status |
|----------|--------|
| APIs (8 services, including compute) | ✅ Recreated (taint cleanup) |
| Service Accounts (3) | ✅ Created |
| Secrets (db-password, jwt-secret) | ✅ Created |
| Artifact Registry | ✅ Created |
| IAM Permissions (all) | ✅ Created |
| **VPC Network** | ❌ Not yet created |
| **Subnet** | ❌ Not yet created |
| **Cloud SQL Instance** | ❌ Failed |
| **Database** | ❌ Blocked (needs instance) |

### Progress Summary
- **Infrastructure created:** ~70% complete
- **Remaining:** VPC, Subnet, Cloud SQL, Database, SQL User

### Fix Applied
Updated `main.tf` to add private networking:
1. Added `compute.googleapis.com` API
2. Created VPC network (`duckdb-ide-vpc`)
3. Created subnet (`10.0.0.0/24`)
4. Configured Cloud SQL with `private_network = google_compute_network.vpc_network.id`

### Proposed Next Steps
1. **Run Terraform Plan:**
   ```bash
   cd terraform/first-time-deployment
   TS=$(date +%Y%m%d-%H%M%S)
   terraform plan -out=tfplan-$TS.plan
   ```

2. **Apply:**
   ```bash
   terraform apply tfplan-$TS.plan 2>&1 | tee terraform-apply-$TS.apply
   ```

---

## Run 3 - VPC Creation Failed (2026-03-03 13:46)

### Log File
`terraform/first-time-deployment/terraform-apply-20260303-134631.apply`

### What Was Executed
1. **Terraform Apply** - ❌ Failed (VPC network creation permission error)

### Issue Summary
**Root Cause:** terraform-deployer service account lacks `compute.networks.create` permission

**Error:**
```
Error 403: Required 'compute.networks.create' permission for 'projects/sql-practice-project-489106/global/networks/duckdb-ide-vpc', forbidden
```

**Rationale:** The terraform-deployer service account had `roles/compute.networkViewer` (read-only access) but not `roles/compute.networkAdmin` (required to create VPC networks and subnets). The VPC network must be created before Cloud SQL can be configured with private IP connectivity.

### Resources Status from Run 2 (Preserved)
| Resource | Status |
|----------|--------|
| APIs (8 services, including compute) | ✅ Created |
| Service Accounts (3) | ✅ Created |
| Secrets (db-password, jwt-secret) | ✅ Created |
| Artifact Registry | ✅ Created |
| IAM Permissions (all) | ✅ Created |
| **VPC Network** | ❌ Not created |
| **Subnet** | ❌ Not created |
| **Cloud SQL Instance** | ❌ Blocked (needs VPC) |
| **Database** | ❌ Blocked (needs instance) |

### Fix Applied
Updated [setup-auth.sh](terraform/first-time-deployment/setup-auth.sh) to grant `roles/compute.networkAdmin` to the terraform-deployer service account:

```bash
# Compute Network Admin - required to create VPC networks and subnets
echo "  - roles/compute.networkAdmin (create VPC networks)"
gcloud projects add-iam-policy-binding "$PROJECT_ID" \
    --member="serviceAccount:$SA_EMAIL" \
    --role="roles/compute.networkAdmin" \
    --condition=None \
    --quiet 2>/dev/null || echo "    (Already has permissions)"
```

### Action Taken
**✅ Permission Granted** - Manually granted `roles/compute.networkAdmin` to terraform-deployer service account:
```bash
gcloud projects add-iam-policy-binding sql-practice-project-489106 \
    --member="serviceAccount:terraform-deployer@sql-practice-project-489106.iam.gserviceaccount.com" \
    --role="roles/compute.networkAdmin"
```

### Next Steps
1. **Run Terraform Plan:**
   ```bash
   cd terraform/first-time-deployment
   TS=$(date +%Y%m%d-%H%M%S)
   terraform plan -out=tfplan-$TS.plan
   ```

3. **Apply:**
   ```bash
   terraform apply tfplan-$TS.plan 2>&1 | tee terraform-apply-$TS.apply
   ```

---

## Run 4 - Cloud SQL Private Service Connection Missing (2026-03-03 14:02)

### Log File
`terraform/first-time-deployment/terraform-apply-20260303-140244.apply`

### What Was Executed
1. **Terraform Apply** - ❌ Failed (Cloud SQL private service connection not set up)

### Issue Summary
**Root Cause:** Cloud SQL with private IP requires a Private Services Connection (VPC peering to Google's service network)

**Error:**
```
Error: failed to create instance because the network doesn't have at least 1 private services connection.
Please see https://cloud.google.com/sql/docs/mysql/private-ip#network_requirements
```

**Rationale:** When using private IP for Cloud SQL, you cannot simply assign a VPC network. Google requires a VPC peering connection between your VPC and Google's service network (`servicenetworking.googleapis.com`). This is done via:
1. A global address to reserve IP range for services
2. A service networking connection to establish the peering

### Resources Created Successfully ✅
| Resource | Status |
|----------|--------|
| APIs (8 services) | ✅ Created |
| Service Accounts (3) | ✅ Created |
| Secrets (db-password, jwt-secret) | ✅ Created |
| Artifact Registry | ✅ Created |
| IAM Permissions (all) | ✅ Created |
| **VPC Network** | ✅ Created (duckdb-ide-vpc) |
| **Subnet** | ✅ Created (10.0.0.0/24) |
| **Cloud SQL Instance** | ❌ Failed |

### Progress Summary
- **Infrastructure created:** ~85% complete
- **Remaining:** Private service connection, Cloud SQL, Database, SQL User

### Fix Applied
Updated `main.tf` to add private service connection resources:

1. Added `servicenetworking.googleapis.com` API
2. Added `google_compute_global_address` - Reserve IP range for Google services
3. Added `google_service_networking_connection` - Establish VPC peering
4. Updated Cloud SQL `depends_on` to wait for service connection

```hcl
resource "google_compute_global_address" "private_ip_alloc" {
  name          = "duckdb-ide-private-ip"
  purpose       = "VPC_PEERING"
  address_type  = "INTERNAL"
  prefix_length = 16
  network       = google_compute_network.vpc_network.id
  project       = var.project_id
}

resource "google_service_networking_connection" "private_vpc_connection" {
  network                 = google_compute_network.vpc_network.id
  service                 = "servicenetworking.googleapis.com"
  reserved_peering_ranges = [google_compute_global_address.private_ip_alloc.name]
  deletion_policy         = "ABANDON"
}
```

### Next Steps
1. **Run Terraform Plan:**
   ```bash
   cd terraform/first-time-deployment
   TS=$(date +%Y%m%d-%H%M%S)
   terraform plan -out=tfplan-$TS.plan
   ```

2. **Apply:**
   ```bash
   terraform apply tfplan-$TS.plan 2>&1 | tee terraform-apply-$TS.apply
   ```

---

## Run 5 - SUCCESS! (2026-03-03 14:10)

### Log File
`terraform/first-time-deployment/terraform-apply-20260303-141024.apply`

### What Was Executed
1. **Terraform Apply** - ✅ **SUCCESS**

### Result
**Apply complete! Resources: 6 added, 0 changed, 0 destroyed.**

### Resources Created ✅

| Resource | Status | Time Taken |
|----------|--------|------------|
| `servicenetworking.googleapis.com` API | ✅ Created | 6s |
| Global IP Allocation (`private_ip_alloc`) | ✅ Created | 12s |
| VPC Peering Connection (`private_vpc_connection`) | ✅ Created | 58s |
| Cloud SQL Instance (`duckdb-ide-db`) | ✅ Created | **13m 20s** |
| Database (`duckdb_ide`) | ✅ Created | 5s |
| SQL User (`postgres`) | ✅ Created | 10s |

### Terraform Outputs

```
artifact_registry_repository = "us-central1-docker.pkg.dev/sql-practice-project-489106/duckdb-ide-repo"
cloudsql_connection_name = "sql-practice-project-489106:us-central1:duckdb-ide-db"
cloudsql_instance_name = "duckdb-ide-db"
project_id = "sql-practice-project-489106"
region = "us-central1"

service_accounts = {
  "cloud_build_deployer" = "cloud-build-deployer-sa@sql-practice-project-489106.iam.gserviceaccount.com"
  "cloud_run" = "cloud-run-sa@sql-practice-project-489106.iam.gserviceaccount.com"
  "db_init" = "db-init-sa@sql-practice-project-489106.iam.gserviceaccount.com"
}
```

### Infrastructure Status - 100% Complete ✅

| Category | Resources | Status |
|----------|-----------|--------|
| **APIs** | 9 APIs enabled | ✅ Complete |
| **Networking** | VPC, Subnet, Peering | ✅ Complete |
| **Database** | Cloud SQL, Database, User | ✅ Complete |
| **Security** | 2 Secrets, IAM permissions | ✅ Complete |
| **Compute** | 3 Service Accounts | ✅ Complete |
| **Registry** | Artifact Registry | ✅ Complete |

### Next Steps

1. **Deploy Cloud Function (db-init-service)** - Initialize database tables
2. **Create Cloud Build Trigger** - Automate deployment on git push
3. **Push code to gcp-deployment branch** - Deploy the application

---

## Post-Deployment Scripts Run 1 (2026-03-03 14:41)

### Log File
`logs/deploy-next-steps-20260303-144140.log`

### What Was Executed
1. **deploy-next-steps.sh** - ❌ Partially failed (script issues found)

### Issue Summary
**Root Cause:** Multiple issues in the deployment script

| # | Error | Root Cause |
|---|-------|------------|
| 1 | **Terraform outputs empty** | `db_name` output not defined in `outputs.tf` |
| 2 | **Service accounts empty** | Script used wrong jq syntax causing silent failures |
| 3 | **Cloud Function deploy failed** | `--set-cloudsql-instances=` with empty value caused invalid argument error |

**Error Pattern:**
```
ERROR: (gcloud.functions.deploy) unrecognized arguments: --set-cloudsql-instances= (did you mean '--clear-min-instances'?)
```

**Rationale:**
1. The `db_name` was only a variable, not a terraform output
2. When variables are empty, the deploy command becomes `--set-cloudsql-instances=` which is invalid
3. The jq syntax `jq -r '.cloud_run' // ""` doesn't work as expected in bash - empty results still fail silently

### Fixes Applied

#### 1. Added `db_name` Output to Terraform
Updated [outputs.tf](terraform/first-time-deployment/outputs.tf):
```hcl
output "db_name" {
  description = "Database name"
  value       = var.db_name
}
```

#### 2. Updated deploy-next-steps.sh Script
Fixed multiple issues:
- Added hardcoded `DB_NAME="duckdb_ide"` as fallback
- Added fallback service account emails when terraform output fails
- Changed Cloud Functions deploy to use array for arguments
- Only add `--set-cloudsql-instances` when CONNECTION_NAME is not empty
- Added better error handling for empty FUNCTION_URL

```bash
# Build deploy command with proper handling of empty variables
DEPLOY_ARGS=(
    --gen2
    --region="$REGION"
    --runtime=nodejs18
    ...
)

# Only add --set-cloudsql-instances if CONNECTION_NAME is not empty
if [[ -n "$CONNECTION_NAME" ]]; then
    DEPLOY_ARGS+=(--set-cloudsql-instances="$CONNECTION_NAME")
fi
```

### Status After Run 1

| Step | Status | Notes |
|------|--------|-------|
| GCP Configuration | ✅ Success | Project, region, zone set |
| Get Terraform Outputs | ⚠️ Partial | Some outputs empty, now has fallbacks |
| Deploy Cloud Function | ❌ Failed | Script error caused deploy to fail |
| Initialize Database | ⏸️ Skipped | Depends on Cloud Function |

### Next Steps

1. **Re-run terraform apply** to get the `db_name` output registered:
   ```bash
   cd terraform/first-time-deployment
   terraform apply -refresh=true
   ```

2. **Re-run deploy-next-steps.sh** with fixed script:
   ```bash
   cd /home/vagrant/Desktop/claude-code-zai/duckdb-wasm-project
   ./deploy-next-steps.sh
   ```

3. **If Cloud Function already exists from partial deployment**, delete it first:
   ```bash
   gcloud functions delete db-init-service --region=us-central1
   ```

---

## Post-Deployment Scripts Run 2 (2026-03-03 14:49)

### Log File
`logs/deploy-next-steps-20260303-144935.log`

### What Was Executed
1. **deploy-next-steps.sh** - ❌ Failed (incorrect gcloud flag)

### Issue Summary
**Root Cause:** Used Cloud Run flag (`--set-cloudsql-instances`) for Cloud Functions deployment

**Error:**
```
ERROR: (gcloud.functions.deploy) unrecognized arguments: --set-cloudsql-instances=sql-practice-project-489106:us-central1:duckdb-ide-db
(did you mean '--clear-min-instances'?)
```

**Rationale:**
- `--set-cloudsql-instances` is a **Cloud Run** flag, not a Cloud Functions flag
- Cloud Functions Gen2 requires a **Serverless VPC Access connector** to connect to Cloud SQL via private IP
- The VPC connector was not set up in the original terraform configuration

### Terraform Outputs Retrieved ✅

| Output | Value | Status |
|--------|-------|--------|
| Project | sql-practice-project-489106 | ✅ |
| Region | us-central1 | ✅ |
| Cloud SQL Connection | sql-practice-project-489106:us-central1:duckdb-ide-db | ✅ |
| Database Name | duckdb_ide | ✅ (fixed from Run 1) |
| Artifact Registry | us-central1-docker.pkg.dev/... | ✅ |
| Service Accounts | All 3 retrieved | ✅ |

### Fixes Applied

#### 1. Added Serverless VPC Access API to Terraform
Updated [main.tf](terraform/first-time-deployment/main.tf:55):
```hcl
resource "google_project_service" "apis" {
  for_each = toset([
    ...
    "vpcaccess.googleapis.com",         # Required for Serverless VPC Access connector
  ])
```

#### 2. Added VPC Connector Resource to Terraform
Updated [main.tf](terraform/first-time-deployment/main.tf:97-110):
```hcl
/**
 * Serverless VPC Access Connector
 * Required for Cloud Functions and Cloud Run to connect to Cloud SQL via private IP
 */
resource "google_vpc_access_connector" "cloud_sql_connector" {
  name          = "duckdb-ide-vpc-connector"
  region        = var.region
  ip_cidr_range = "10.8.0.0/28"
  network       = google_compute_network.vpc_network.id
  project       = var.project_id

  depends_on = [google_project_service.apis, google_compute_subnetwork.subnet]
}
```

#### 3. Added VPC Connector Output
Updated [outputs.tf](terraform/first-time-deployment/outputs.tf:26-30):
```hcl
output "vpc_connector_name" {
  description = "Serverless VPC Access connector name (for Cloud Functions)"
  value       = google_vpc_access_connector.cloud_sql_connector.name
}
```

#### 4. Updated deploy-next-steps.sh Script
Changed from `--set-cloudsql-instances` (Cloud Run flag) to `--vpc-connector` (Cloud Functions flag):
```bash
# Get VPC connector from terraform
VPC_CONNECTOR=$(terraform output -raw vpc_connector_name 2>/dev/null || echo "")

# Only add --vpc-connector if VPC_CONNECTOR is not empty
if [[ -n "$VPC_CONNECTOR" ]]; then
    DEPLOY_ARGS+=(--vpc-connector="$VPC_CONNECTOR")
fi
```

### Status After Run 2

| Step | Status | Notes |
|------|--------|-------|
| GCP Configuration | ✅ Success | Project, region, zone set |
| Get Terraform Outputs | ✅ Success | All outputs retrieved correctly |
| Deploy Cloud Function | ❌ Failed | Wrong flag - --set-cloudsql-instances not valid |
| Initialize Database | ⏸️ Skipped | Depends on Cloud Function |

### Next Steps

1. **Run terraform apply** to create the VPC connector:
   ```bash
   cd terraform/first-time-deployment
   TS=$(date +%Y%m%d-%H%M%S)
   terraform plan -out=tfplan-$TS.plan
   terraform apply tfplan-$TS.plan
   ```

2. **Re-run deploy-next-steps.sh** with updated script:
   ```bash
   cd /home/vagrant/Desktop/claude-code-zai/duckdb-wasm-project
   ./deploy-next-steps.sh
   ```

### Key Difference: Cloud Run vs Cloud Functions

| Product | Flag for Cloud SQL | Purpose |
|---------|-------------------|---------|
| **Cloud Run** | `--set-cloudsql-instances` | Direct Cloud SQL connection |
| **Cloud Functions Gen2** | `--vpc-connector` | Requires VPC connector for private IP |

---

## Terraform Run 6 - VPC Connector Permission Denied (2026-03-03 14:54)

### Log File
`terraform/first-time-deployment/terraform-apply-20260303-145409.log`

### What Was Executed
1. **terraform apply** - ❌ Failed (IAM permission denied)

### Issue Summary
**Root Cause:** terraform-deployer service account lacks `vpcaccess.connectors.create` permission

**Error:**
```
Error: Error creating Connector: googleapi: Error 403: Permission 'vpcaccess.connectors.create'
denied on resource '//vpcaccess.googleapis.com/projects/sql-practice-project-489106/locations/us-central1'
```

**Rationale:**
- The `roles/vpcaccess.admin` role was not included in the original setup-auth.sh script
- This role is required to create Serverless VPC Access connectors
- The connector is needed for Cloud Functions to connect to Cloud SQL via private IP

### Resources Created Before Failure
| Resource | Status |
|----------|--------|
| `vpcaccess.googleapis.com` API | ✅ Created (31s) |
| VPC Connector | ❌ Failed |

### Fix Applied

#### 1. Added vpcaccess.admin Role to setup-auth.sh
Updated [setup-auth.sh](terraform/first-time-deployment/setup-auth.sh:133-141):
```bash
# VPC Access Admin - required to create Serverless VPC Access connectors
# determined this was required for Cloud Functions to connect to Cloud SQL
echo "  - roles/vpcaccess.admin (create VPC connectors)"
gcloud projects add-iam-policy-binding "$PROJECT_ID" \
    --member="serviceAccount:$SA_EMAIL" \
    --role="roles/vpcaccess.admin" \
    --condition=None \
    --quiet 2>/dev/null || echo "    (Already has permissions)"
```

### Next Steps

1. **Grant vpcaccess.admin role manually** (for immediate fix):
   ```bash
   gcloud projects add-iam-policy-binding sql-practice-project-489106 \
       --member="serviceAccount:terraform-deployer@sql-practice-project-489106.iam.gserviceaccount.com" \
       --role="roles/vpcaccess.admin"
   ```

2. **Re-run terraform apply** to create the VPC connector:
   ```bash
   cd terraform/first-time-deployment
   TS=$(date +%Y%m%d-%H%M%S)
   terraform apply 2>&1 | tee terraform-apply-$TS.log
   ```

3. **Re-run deploy-next-steps.sh** after terraform succeeds:
   ```bash
   cd /home/vagrant/Desktop/claude-code-zai/duckdb-wasm-project
   ./deploy-next-steps.sh
   ```

---

## Post-Deployment Scripts Run 3 (2026-03-03 15:01)

### Log File
`logs/deploy-next-steps-20260303-150136.log`

### What Was Executed
1. **deploy-next-steps.sh** - ❌ Failed (invalid runtime)

### Issue Summary
**Root Cause:** Cloud Functions Gen2 doesn't support `nodejs18` runtime

**Error:**
```
ERROR: (gcloud.functions.deploy) Invalid value for [--runtime]: nodejs18 is not a
supported runtime on GCF 2nd gen. Use `gcloud functions runtimes list` to get a list of available runtimes
```

**Rationale:**
- Cloud Functions Gen2 has different runtime support than Gen1
- `nodejs18` is deprecated/not supported on Gen2
- Must use `nodejs20` or later for Gen2 functions

### Terraform Outputs Retrieved ✅

| Output | Value | Status |
|--------|-------|--------|
| Project | sql-practice-project-489106 | ✅ |
| Region | us-central1 | ✅ |
| Cloud SQL Connection | sql-practice-project-489106:us-central1:duckdb-ide-db | ✅ |
| Database Name | duckdb_ide | ✅ |
| Artifact Registry | us-central1-docker.pkg.dev/... | ✅ |
| **VPC Connector** | **duckdb-ide-vpc-connector** | ✅ (newly created) |
| Service Accounts | All 3 retrieved | ✅ |

### Fix Applied

#### Updated deploy-next-steps.sh Runtime
Changed from `--runtime=nodejs18` to `--runtime=nodejs20`:
```bash
DEPLOY_ARGS=(
    --gen2
    --region="$REGION"
    --runtime=nodejs20    # Changed from nodejs18
    --source=.
```

### Next Steps

Re-run deploy-next-steps.sh:
```bash
cd /home/vagrant/Desktop/claude-code-zai/duckdb-wasm-project
./deploy-next-steps.sh
```

---

## Post-Deployment Scripts Run 4 (2026-03-03 15:04)

### Log File
`logs/deploy-next-steps-20260303-150417.log`

### What Was Executed
1. **deploy-next-steps.sh** - ❌ Failed (Cloud Build permission denied)

### Issue Summary
**Root Cause:** Cloud Functions uses the project's Cloud Build service account to build the function, but it lacked necessary permissions.

**Error:**
```
ERROR: (gcloud.functions.deploy) OperationError: code=3, message=Build failed with status: FAILURE.
Could not build the function due to a missing permission on the build service account.
```

**Rationale:**
- When deploying Cloud Functions, Google uses `{project_number}@cloudbuild.gserviceaccount.com` as the build service account
- This is different from the custom `cloud-build-deployer-sa` we created for CI/CD
- The build service account needs:
  - `roles/secretmanager.secretAccessor` - to access `db-password` secret during build
  - `roles/vpcaccess.user` - to use VPC connector
  - `roles/cloudbuild.builds.builder` - to build the container image

### Fix Applied

#### Granted Permissions to Cloud Functions Build Service Account
```bash
# Project number
PROJECT_NUMBER=192834930119

# Grant Secret Manager access (for DB_PASSWORD secret)
gcloud secrets add-iam-policy-binding db-password \
    --member="serviceAccount:${PROJECT_NUMBER}@cloudbuild.gserviceaccount.com" \
    --role="roles/secretmanager.secretAccessor" \
    --project=sql-practice-project-489106

# Grant VPC Access user role (to use VPC connector)
gcloud projects add-iam-policy-binding sql-practice-project-489106 \
    --member="serviceAccount:${PROJECT_NUMBER}@cloudbuild.gserviceaccount.com" \
    --role="roles/vpcaccess.user"

# Grant Cloud Build builder role (to build container images)
gcloud projects add-iam-policy-binding sql-practice-project-489106 \
    --member="serviceAccount:${PROJECT_NUMBER}@cloudbuild.gserviceaccount.com" \
    --role="roles/cloudbuild.builds.builder"
```

### Permissions Granted ✅

| Permission | Service Account | Purpose |
|------------|----------------|---------|
| `roles/secretmanager.secretAccessor` | `192834930119@cloudbuild.gserviceaccount.com` | Access DB_PASSWORD secret |
| `roles/vpcaccess.user` | `192834930119@cloudbuild.gserviceaccount.com` | Use VPC connector |
| `roles/cloudbuild.builds.builder` | `192834930119@cloudbuild.gserviceaccount.com` | Build container images |

### Next Steps

Re-run deploy-next-steps.sh:
```bash
cd /home/vagrant/Desktop/claude-code-zai/duckdb-wasm-project
./deploy-next-steps.sh
```

---

## Post-Deployment Scripts Run 5 (2026-03-03 15:11)

### Log File
`logs/deploy-next-steps-20260303-151102.log`

### What Was Executed
1. **deploy-next-steps.sh** - ❌ Failed (Cloud Build permission denied - redeploy)

### Issue Summary
**Root Cause:** Same error as Run 4 - Cloud Functions build still failing due to missing permissions.

**Error:**
```
ERROR: (gcloud.functions.deploy) OperationError: code=3, message=Build failed with status: FAILURE.
Could not build the function due to a missing permission on the build service account.
```

**Rationale:**
- The Compute Engine service account (`192834930119@cloudservices.gserviceaccount.com`) also needs permissions
- This service account is used by Cloud Functions during the build process
- A redeploy may have cached state issues

### Fix Applied

#### 1. Deleted Existing Cloud Function
```bash
gcloud functions delete db-init-service --region=us-central1
```

#### 2. Granted Additional Permissions to Compute Engine SA
```bash
# Secret Manager access
gcloud secrets add-iam-policy-binding db-password \
    --member="serviceAccount:192834930119@cloudservices.gserviceaccount.com" \
    --role="roles/secretmanager.secretAccessor"

# Cloud Build builder role
gcloud projects add-iam-policy-binding sql-practice-project-489106 \
    --member="serviceAccount:192834930119@cloudservices.gserviceaccount.com" \
    --role="roles/cloudbuild.builds.builder"
```

### All Service Account Permissions Granted ✅

| Service Account | Permissions | Purpose |
|-----------------|-------------|---------|
| `192834930119@cloudbuild.gserviceaccount.com` | `secretmanager.secretAccessor`<br>`vpcaccess.user`<br>`cloudbuild.builds.builder` | Cloud Functions build SA |
| `192834930119@cloudservices.gserviceaccount.com` | `secretmanager.secretAccessor`<br>`cloudbuild.builds.builder` | Compute Engine SA |

### Next Steps

Re-run deploy-next-steps.sh:
```bash
cd /home/vagrant/Desktop/claude-code-zai/duckdb-wasm-project
./deploy-next-steps.sh
```

---

## Post-Deployment Scripts Run 6 (2026-03-03 15:23+)

### Issue Summary
**Root Cause:** Cloud Functions Gen2 build service account needs `roles/iam.serviceAccountTokenCreator` role on the runtime service account to impersonate it during deployment. Also discovered missing `roles/editor` and `roles/logging.logWriter` permissions.

**Reference:** [Google Developer Forums Discussion](https://discuss.google.dev/t/cloud-function-error-permission-iam-serviceaccounts-get-denied-on-resource-or-it-may-not-exist/191003)

### Error
```
ERROR: (gcloud.functions.deploy) OperationError: code=3, message=Build failed with status: FAILURE.
Could not build the function due to a missing permission on the build service account.
```

Additional error seen in Cloud Console:
```
The service account running this build (192834930119-compute@developer.gserviceaccount.com)
does not have permission to write logs to Cloud Logging.
```

### Rationale
- **Cloud Functions Gen2 uses Cloud Build to build the function container**
- During build, Cloud Build needs to **impersonate** the runtime service account (`db-init-sa`)
- This requires the **Service Account Token Creator** role (`roles/iam.serviceAccountTokenCreator`)
- The build also uses the **Compute Engine developer service account** (`{project_number}-compute@developer.gserviceaccount.com`) which needs logging permissions
- Even broad roles like `Editor` don't automatically grant the Token Creator permission on specific service accounts

### Service Accounts Involved

| Service Account | Purpose |
|-----------------|---------|
| `192834930119@cloudbuild.gserviceaccount.com` | Cloud Functions build service account |
| `192834930119@cloudservices.gserviceaccount.com` | Compute Engine service account |
| `192834930119-compute@developer.gserviceaccount.com` | Compute Engine developer service account |
| `db-init-sa@sql-practice-project-489106.iam.gserviceaccount.com` | Runtime service account for the function |

### Fixes Applied

#### 1. Granted Service Account Token Creator Role
```bash
# Allow Cloud Build SA to impersonate the runtime service account
PROJECT_ID="sql-practice-project-489106"
PROJECT_NUMBER="192834930119"
RUNTIME_SA="db-init-sa@${PROJECT_ID}.iam.gserviceaccount.com"
CLOUD_BUILD_SA="${PROJECT_NUMBER}@cloudbuild.gserviceaccount.com"

gcloud iam service-accounts add-iam-policy-binding "$RUNTIME_SA" \
    --member="serviceAccount:$CLOUD_BUILD_SA" \
    --role="roles/iam.serviceAccountTokenCreator" \
    --project="$PROJECT_ID"
```

#### 2. Granted Editor Role to Build Service Accounts
```bash
# Grant Editor role to Cloud Build SA and Compute Engine SA
gcloud projects add-iam-policy-binding "$PROJECT_ID" \
    --member="serviceAccount:${PROJECT_NUMBER}@cloudbuild.gserviceaccount.com" \
    --role="roles/editor"

gcloud projects add-iam-policy-binding "$PROJECT_ID" \
    --member="serviceAccount:${PROJECT_NUMBER}@cloudservices.gserviceaccount.com" \
    --role="roles/editor"
```

#### 3. Granted Logs Writer Role to Compute Developer SA
```bash
# Fix Cloud Logging permission error
COMPUTE_DEV_SA="${PROJECT_NUMBER}-compute@developer.gserviceaccount.com"

gcloud projects add-iam-policy-binding "$PROJECT_ID" \
    --member="serviceAccount:$COMPUTE_DEV_SA" \
    --role="roles/logging.logWriter"
```

### All Service Account Permissions Granted ✅

| Service Account | Roles | Purpose |
|-----------------|-------|---------|
| `192834930119@cloudbuild.gserviceaccount.com` | `roles/editor`<br>`roles/iam.serviceAccountTokenCreator` on `db-init-sa` | Cloud Functions build SA |
| `192834930119@cloudservices.gserviceaccount.com` | `roles/editor` | Compute Engine SA |
| `192834930119-compute@developer.gserviceaccount.com` | `roles/logging.logWriter` | Compute developer SA |

### Key Insight: Token Creator Role
The **Service Account Token Creator** role (`roles/iam.serviceAccountTokenCreator`) is specifically required for:
- Service account impersonation
- Cloud Functions Gen2 builds (Cloud Build impersonates the runtime SA)
- Cloud Run deployments with custom service accounts
- Any service that needs to act as another service account

**This is NOT included** in broad roles like `Editor` or `Owner` - it must be granted explicitly on the target service account.

### Status After Run 6

| Step | Status | Notes |
|------|--------|-------|
| GCP Configuration | ✅ Success | Project, region, zone set |
| Get Terraform Outputs | ✅ Success | All outputs retrieved correctly |
| Deploy Cloud Function | ⏳ Pending | All IAM permissions now granted |
| Initialize Database | ⏳ Skipped | Depends on Cloud Function |

### Next Steps

Re-run deploy-next-steps.sh:
```bash
cd /home/vagrant/Desktop/claude-code-zai/duckdb-wasm-project
./deploy-next-steps.sh
```

---

## Post-Deployment Scripts Run 7 (2026-03-03 15:34)

### Log File
`logs/deploy-next-steps-20260303-153255.log`

### What Was Executed
1. **deploy-next-steps.sh** - ❌ Failed (Storage permission denied)

### Issue Summary
**Root Cause:** The compute developer service account cannot fetch function source code from the Cloud Functions sources bucket.

### Error from Cloud Build Logs
```
Failed to fetch gs://gcf-v2-sources-192834930119-us-central1/db-init-service/function-source.zip
Access to bucket gcf-v2-sources-192834930119-us-central1 denied.
You must grant Storage Object Viewer permission to 192834930119-compute@developer.gserviceaccount.com.
```

### Rationale
- Cloud Functions stores source code in a GCS bucket: `gcf-v2-sources-{project_number}-{region}`
- During build, the compute developer service account needs to fetch the source from this bucket
- This requires `objectViewer` permission on the bucket

### Google-Managed Buckets Explained

**Important:** The `gcf-v2-sources-{project_number}-{region}` bucket is **NOT created by our terraform or scripts**. It is **automatically created by Google Cloud** when you deploy a Cloud Function Gen2.

```
┌─────────────────────────────────────────────────────────────┐
│  gcloud functions deploy db-init-service                    │
│                                                             │
│  1. Uploads source code to GCS bucket                      │
│     → gs://gcf-v2-sources-{project_number}-{region}/       │
│     → This bucket is AUTO-CREATED by Google on first deploy │
│                                                             │
│  2. Cloud Build fetches source from bucket                 │
│     → Uses {project_number}-compute@developer.gserviceaccount.com│
│     → Needs objectViewer permission (this was our error)    │
│                                                             │
│  3. Builds container image                                 │
│     → Pushes to Artifact Registry                           │
│                                                             │
│  4. Deploys to Cloud Functions Gen2                        │
└─────────────────────────────────────────────────────────────┘
```

#### Google-Managed Buckets Created Automatically

| Bucket Pattern | Purpose | Created By |
|---------------|---------|------------|
| `gcf-v2-sources-{project_number}-{region}` | Cloud Functions Gen2 source code | Google Cloud Functions |
| `artifacts.{project}.appspot.com` | Cloud Functions Gen1 (legacy) | Google Cloud Functions |
| `gcf-sources-{project_number}-{region}` | Cloud Functions Gen1 (legacy) | Google Cloud Functions |

#### Why Our Permission Fix Was Needed

The bucket is created by Google automatically, but the **service account performing the fetch** (`{project_number}-compute@developer.gserviceaccount.com`) didn't have permission to read from it. This is a known quirk of Cloud Functions Gen2 where the bucket permissions aren't always set up automatically correctly, requiring manual IAM binding.

### Fix Applied

#### Granted Storage Object Viewer on Cloud Functions Sources Bucket
```bash
PROJECT_ID="sql-practice-project-489106"
PROJECT_NUMBER="192834930119"
COMPUTE_DEV_SA="${PROJECT_NUMBER}-compute@developer.gserviceaccount.com"
SOURCES_BUCKET="gcf-v2-sources-${PROJECT_NUMBER}-us-central1"

# Grant Storage Object Viewer to compute developer SA on the bucket
gsutil iam ch "serviceAccount:${COMPUTE_DEV_SA}:objectViewer" "gs://${SOURCES_BUCKET}"
```

### All Service Account Permissions Summary ✅

| Service Account | Roles | Purpose |
|-----------------|-------|---------|
| `192834930119@cloudbuild.gserviceaccount.com` | `roles/editor`<br>`roles/iam.serviceAccountTokenCreator` on `db-init-sa` | Cloud Functions build SA |
| `192834930119@cloudservices.gserviceaccount.com` | `roles/editor` | Compute Engine SA |
| `192834930119-compute@developer.gserviceaccount.com` | `roles/logging.logWriter`<br>`objectViewer` on `gs://gcf-v2-sources-*` | Compute developer SA |

### Status After Run 7

| Step | Status | Notes |
|------|--------|-------|
| GCP Configuration | ✅ Success | Project, region, zone set |
| Get Terraform Outputs | ✅ Success | All outputs retrieved correctly |
| Deploy Cloud Function | ⏳ Pending | Storage permission now granted |
| Initialize Database | ⏳ Skipped | Depends on Cloud Function |

### Next Steps

Re-run deploy-next-steps.sh:
```bash
cd /home/vagrant/Desktop/claude-code-zai/duckdb-wasm-project
./deploy-next-steps.sh
```

---

## Post-Deployment Scripts Run 8 (2026-03-03 15:40+)

### What Was Executed
1. **deploy-next-steps.sh** - ❌ Failed (Artifact Registry permission denied)

### Issue Summary
**Root Cause:** The compute developer service account cannot download base images from Artifact Registry during the build process.

### Error from Cloud Build Logs
```
DENIED: Permission 'artifactregistry.repositories.downloadArtifacts' denied on resource
```

### Rationale
- During the Cloud Functions build process, the compute developer service account needs to:
  1. Fetch source code from GCS bucket (fixed in Run 7)
  2. **Download base images from Artifact Registry** (this error)
  3. Build the container image
  4. Push to Artifact Registry

### Fix Applied

#### Granted Artifact Registry Reader Role
```bash
PROJECT_ID="sql-practice-project-489106"
PROJECT_NUMBER="192834930119"
COMPUTE_DEV_SA="${PROJECT_NUMBER}-compute@developer.gserviceaccount.com"

# Grant Artifact Registry Reader to compute developer SA
gcloud artifacts repositories add-iam-policy-binding duckdb-ide-repo \
    --location=us-central1 \
    --member="serviceAccount:$COMPUTE_DEV_SA" \
    --role="roles/artifactregistry.reader"
```

### All Service Account Permissions Summary ✅ (Updated)

| Service Account | Roles | Purpose |
|-----------------|-------|---------|
| `192834930119@cloudbuild.gserviceaccount.com` | `roles/editor`<br>`roles/iam.serviceAccountTokenCreator` on `db-init-sa` | Cloud Functions build SA |
| `192834930119@cloudservices.gserviceaccount.com` | `roles/editor` | Compute Engine SA |
| `192834930119-compute@developer.gserviceaccount.com` | `roles/logging.logWriter`<br>`objectViewer` on `gs://gcf-v2-sources-*`<br>`roles/artifactregistry.reader` | Compute developer SA |

### Status After Run 8

| Step | Status | Notes |
|------|--------|-------|
| GCP Configuration | ✅ Success | Project, region, zone set |
| Get Terraform Outputs | ✅ Success | All outputs retrieved correctly |
| Deploy Cloud Function | ⏳ Pending | Artifact Registry permission now granted |
| Initialize Database | ⏳ Skipped | Depends on Cloud Function |

### Next Steps

Re-run deploy-next-steps.sh:
```bash
cd /home/vagrant/Desktop/claude-code-zai/duckdb-wasm-project
./deploy-next-steps.sh
```

---

## Post-Deployment Scripts Run 9 (2026-03-03 15:45+)

### What Was Executed
1. **deploy-next-steps.sh** - ❌ Failed (Different Artifact Repository permission denied)

### Issue Summary
**Root Cause:** The compute developer service account cannot access the **`gcf-artifacts`** repository - a different, Google-auto-created repository for Cloud Functions build cache.

### Error from Cloud Build Logs
```
Checking if image us-central1-docker.pkg.dev/sql-practice-project-489106/gcf-artifacts/
sql--practice--project--489106__us--central1__db--init--service/cache:latest exists

WARNING: Failed to reuse previous cache image; will not affect current build:
GET https://us-central1-docker.pkg.dev/v2/token?scope=repository%3Asql-practice-project-489106%
2Fgcf-artifacts%2Fsql--practice--project--489106__us--central1__db--init--service%2Fcache%3Apull&service=:
DENIED: Permission 'artifactregistry.repositories.downloadArtifacts' denied on resource (or it may not exist).

ERROR: failed to create image cache: accessing cache image
"us-central1-docker.pkg.dev/sql-practice-project-489106/gcf-artifacts/
sql--practice--project--489106__us--central1__db--init--service/cache:latest":
connect to repo store: GET https://us-central1-docker.pkg.dev/v2/token?scope=repository%3A...:
DENIED: Permission 'artifactregistry.repositories.downloadArtifacts' denied on resource (or it may not exist).
```

### Rationale
- In **Run 8**, we granted access to `duckdb-ide-repo` (our custom terraform-created repository)
- However, Cloud Functions **also uses** `gcf-artifacts` repository which is **auto-created by Google** for build cache
- The build process needs to:
  1. Pull base builder image from `serverless-runtimes` (Google-managed, public) ✅
  2. **Push/pull cache images to/from `gcf-artifacts`** (project-specific, needs permission) ❌ **This error**
  3. Push final image to `duckdb-ide-repo` (our custom repo, fixed in Run 8) ✅

### Google-Managed Artifact Registry Repositories

| Repository Pattern | Purpose | Created By |
|-------------------|---------|------------|
| `gcf-artifacts` | **Cloud Functions build cache** | Google Cloud Functions (auto-created) |
| `duckdb-ide-repo` | Custom Docker images | Our terraform configuration |
| `serverless-runtimes` | Base builder images | Google (public, no auth needed) |

**Key Insight:** The `gcf-artifacts` repository is **NOT created by our terraform**. It is **automatically created by Google Cloud Functions** to store cached build layers for faster rebuilds. This is why the permission was missing - we never set it up!

### Fix Applied

#### Granted Artifact Registry Reader Role on gcf-artifacts Repository
```bash
PROJECT_ID="sql-practice-project-489106"
PROJECT_NUMBER="192834930119"
COMPUTE_DEV_SA="${PROJECT_NUMBER}-compute@developer.gserviceaccount.com"

# Grant Artifact Registry Reader on gcf-artifacts (Google's auto-created repo)
gcloud artifacts repositories add-iam-policy-binding gcf-artifacts \
    --location=us-central1 \
    --member="serviceAccount:$COMPUTE_DEV_SA" \
    --role="roles/artifactregistry.reader" \
    --project="$PROJECT_ID"
```

### All Service Account Permissions Summary ✅ (Updated)

| Service Account | Roles | Purpose |
|-----------------|-------|---------|
| `192834930119@cloudbuild.gserviceaccount.com` | `roles/editor`<br>`roles/iam.serviceAccountTokenCreator` on `db-init-sa` | Cloud Functions build SA |
| `192834930119@cloudservices.gserviceaccount.com` | `roles/editor` | Compute Engine SA |
| `192834930119-compute@developer.gserviceaccount.com` | `roles/logging.logWriter`<br>`objectViewer` on `gs://gcf-v2-sources-*`<br>`roles/artifactregistry.reader` on `duckdb-ide-repo`<br>`roles/artifactregistry.reader` on `gcf-artifacts` | Compute developer SA |

### Key Learning: Multiple Artifact Registry Repositories

When deploying Cloud Functions Gen2, **multiple Artifact Registry repositories** are involved:

1. **`gcf-artifacts`** (Google-auto-created) - For build cache - **Needs explicit permission!**
2. **Your custom repo** (terraform-created) - For final images - Also needs permission

Both require `roles/artifactregistry.reader` on the compute developer service account for the build to succeed.

### Status After Run 9

| Step | Status | Notes |
|------|--------|-------|
| GCP Configuration | ✅ Success | Project, region, zone set |
| Get Terraform Outputs | ✅ Success | All outputs retrieved correctly |
| Deploy Cloud Function | ⏳ Pending | gcf-artifacts permission now granted |
| Initialize Database | ⏸️ Skipped | Depends on Cloud Function |

### Next Steps

Re-run deploy-next-steps.sh:
```bash
cd /home/vagrant/Desktop/claude-code-zai/duckdb-wasm-project
./deploy-next-steps.sh
```

---

## Post-Deployment Scripts Run 10 (2026-03-03 15:50+)

### What Was Executed
1. **deploy-next-steps.sh** - ❌ Failed (Artifact Registry upload permission denied)

### Issue Summary
**Root Cause:** The compute developer service account has **download** permission but lacks **upload** permission (`artifactregistry.repositories.uploadArtifacts`) for Artifact Registry repositories.

### Missing Permission
```
artifactregistry.repositories.uploadArtifacts
```

### Rationale
- In **Run 9**, we granted `roles/artifactregistry.reader` which only provides **download** permission
- The build process needs to **push** the final container image, which requires **upload** permission
- `roles/artifactregistry.writer` provides both download AND upload permissions

### Fix Applied

#### Upgraded to Artifact Registry Writer Role (Full Read/Write)
```bash
PROJECT_ID="sql-practice-project-489106"
PROJECT_NUMBER="192834930119"
COMPUTE_DEV_SA="${PROJECT_NUMBER}-compute@developer.gserviceaccount.com"

# Grant Artifact Registry Writer (full read/write) on duckdb-ide-repo
gcloud artifacts repositories add-iam-policy-binding duckdb-ide-repo \
    --location=us-central1 \
    --member="serviceAccount:$COMPUTE_DEV_SA" \
    --role="roles/artifactregistry.writer" \
    --project="$PROJECT_ID"

# Grant Artifact Registry Writer (full read/write) on gcf-artifacts
gcloud artifacts repositories add-iam-policy-binding gcf-artifacts \
    --location=us-central1 \
    --member="serviceAccount:$COMPUTE_DEV_SA" \
    --role="roles/artifactregistry.writer" \
    --project="$PROJECT_ID"
```

### All Service Account Permissions Summary ✅ (Updated)

| Service Account | Roles | Purpose |
|-----------------|-------|---------|
| `192834930119@cloudbuild.gserviceaccount.com` | `roles/editor`<br>`roles/iam.serviceAccountTokenCreator` on `db-init-sa` | Cloud Functions build SA |
| `192834930119@cloudservices.gserviceaccount.com` | `roles/editor` | Compute Engine SA |
| `192834930119-compute@developer.gserviceaccount.com` | `roles/logging.logWriter`<br>`objectViewer` on `gs://gcf-v2-sources-*`<br>`roles/artifactregistry.writer` on `duckdb-ide-repo`<br>`roles/artifactregistry.writer` on `gcf-artifacts` | Compute developer SA |

### Key Learning: Reader vs Writer

| Role | Permissions Included | Use Case |
|------|---------------------|----------|
| `roles/artifactregistry.reader` | downloadArtifacts, listRepositories, ... | Pull images only |
| `roles/artifactregistry.writer` | All Reader permissions + **uploadArtifacts**, deletePackages, ... | Pull AND push images |

Cloud Functions Gen2 build needs **both** download and upload, so `writer` role is required.

### Status After Run 10

| Step | Status | Notes |
|------|--------|-------|
| GCP Configuration | ✅ Success | Project, region, zone set |
| Get Terraform Outputs | ✅ Success | All outputs retrieved correctly |
| Deploy Cloud Function | ⏳ Pending | gcf-artifacts permission now granted |
| Initialize Database | ⏳ Skipped | Depends on Cloud Function |

### Next Steps

Re-run deploy-next-steps.sh:
```bash
cd /home/vagrant/Desktop/claude-code-zai/duckdb-wasm-project
./deploy-next-steps.sh
```

---

## Post-Deployment Scripts Run 11 (2026-03-03 15:55+)

### What Was Executed
1. **deploy-next-steps.sh** - ❌ Failed (Artifact Registry delete permission denied)

### Issue Summary
**Root Cause:** The compute developer service account lacks **delete** permission (`artifactregistry.repositories.deleteArtifacts`) for Artifact Registry repositories.

### Missing Permission
```
Permission 'artifactregistry.repositories.deleteArtifacts' denied on resource (or it may not exist)
```

### Rationale
- In **Run 10**, we granted `roles/artifactregistry.writer` which includes download and upload
- However, the build process also needs to **delete old cache images** before uploading new ones
- `roles/artifactregistry.repoAdmin` provides full access including delete

### Fix Applied

#### Upgraded to Artifact Registry RepoAdmin Role (Full Access)
```bash
PROJECT_ID="sql-practice-project-489106"
PROJECT_NUMBER="192834930119"
COMPUTE_DEV_SA="${PROJECT_NUMBER}-compute@developer.gserviceaccount.com"

# Grant Artifact Registry RepoAdmin (full access) on duckdb-ide-repo
gcloud artifacts repositories add-iam-policy-binding duckdb-ide-repo \
    --location=us-central1 \
    --member="serviceAccount:$COMPUTE_DEV_SA" \
    --role="roles/artifactregistry.repoAdmin" \
    --project="$PROJECT_ID"

# Grant Artifact Registry RepoAdmin (full access) on gcf-artifacts
gcloud artifacts repositories add-iam-policy-binding gcf-artifacts \
    --location=us-central1 \
    --member="serviceAccount:$COMPUTE_DEV_SA" \
    --role="roles/artifactregistry.repoAdmin" \
    --project="$PROJECT_ID"
```

### All Service Account Permissions Summary ✅ (Updated)

| Service Account | Roles | Purpose |
|-----------------|-------|---------|
| `192834930119@cloudbuild.gserviceaccount.com` | `roles/editor`<br>`roles/iam.serviceAccountTokenCreator` on `db-init-sa` | Cloud Functions build SA |
| `192834930119@cloudservices.gserviceaccount.com` | `roles/editor` | Compute Engine SA |
| `192834930119-compute@developer.gserviceaccount.com` | `roles/logging.logWriter`<br>`objectViewer` on `gs://gcf-v2-sources-*`<br>`roles/artifactregistry.repoAdmin` on `duckdb-ide-repo`<br>`roles/artifactregistry.repoAdmin` on `gcf-artifacts` | Compute developer SA |

### Key Learning: Artifact Registry Role Hierarchy

| Role | Permissions Included | Use Case |
|------|---------------------|----------|
| `roles/artifactregistry.reader` | downloadArtifacts, listRepositories | Pull images only |
| `roles/artifactregistry.writer` | Reader + uploadArtifacts | Pull and push images |
| `roles/artifactregistry.repoAdmin` | Writer + **deleteArtifacts**, manage repository settings | Full repository access |

Cloud Functions Gen2 build needs **repoAdmin** level access to manage cached artifacts.

### Status After Run 11

| Step | Status | Notes |
|------|--------|-------|
| GCP Configuration | ✅ Success | Project, region, zone set |
| Get Terraform Outputs | ✅ Success | All outputs retrieved correctly |
| Deploy Cloud Function | ⏳ Pending | repoAdmin permission now granted |
| Initialize Database | ⏸️ Skipped | Depends on Cloud Function |

### Next Steps

Re-run deploy-next-steps.sh:
```bash
cd /home/vagrant/Desktop/claude-code-zai/duckdb-wasm-project
./deploy-next-steps.sh
```

---

## Cloud Functions Gen2 Build Architecture Deep Dive

### Why Compute Developer SA, Not Cloud Build SA?

A common question during this deployment was: **Why are we granting permissions to the compute developer service account instead of the Cloud Build service account?**

This reveals an important architectural detail of how Cloud Functions Gen2 builds work:

```
┌────────────────────────────────────────────────────────────────┐
│ Cloud Functions Gen2 Build Architecture                        │
├────────────────────────────────────────────────────────────────┤
│                                                                │
│  gcloud functions deploy                                      │
│       │                                                        │
│       ▼                                                        │
│  ┌─────────────────────────────────────────┐                  │
│  │ Cloud Build Service Account            │                  │
│  │ (192834930119@cloudbuild.gserviceaccount.com)              │
│  │ Purpose: Orchestrate the build         │                  │
│  └─────────────────────────────────────────┘                  │
│       │                                                        │
│       │ Delegates build execution to:                          │
│       ▼                                                        │
│  ┌─────────────────────────────────────────┐                  │
│  │ Compute Developer Service Account       │                  │
│  │ (192834930119-compute@developer.gserviceaccount.com)      │
│  │ Purpose: Actually RUNS the build steps │                  │
│  │   - Fetch source from GCS             │                  │
│  │   - Pull images from Artifact Registry │                  │
│  │   - Execute build commands            │                  │
│  └─────────────────────────────────────────┘                  │
│                                                                │
└────────────────────────────────────────────────────────────────┘
```

### The Key Difference

| Service Account | Role | Why It Needs Permissions |
|-----------------|------|------------------------|
| **Cloud Build SA** | Orchestrator | Manages the build pipeline, triggers builds |
| **Compute Developer SA** | Executor | **Actually performs** the fetch/pull/push operations |

### Why This Architecture?

Cloud Functions Gen2 is built on **Cloud Run + Cloud Build**:

1. **Cloud Build** orchestrates the build (like a project manager)
2. **Cloud Build** then spins up **Compute Engine resources** to execute the actual build
3. The Compute Engine resources use the **compute developer service account** to:
   - Access GCS buckets for source code
   - Access Artifact Registry for base images
   - Write logs to Cloud Logging
   - Push built images back to Artifact Registry

### Why The Error Shows Compute Developer SA

The error messages show the compute developer SA because that's the **identity actually being denied** when it tries to:

1. **Fetch source code** from `gcf-v2-sources-*` bucket → `objectViewer` needed
2. **Pull base images** from Artifact Registry → `artifactregistry.reader` needed
3. **Write build logs** → `logging.logWriter` needed

The Cloud Build SA has editor role, but it can't just "pass through" those permissions - the actual execution context uses the compute developer SA, which needs its own explicit permissions.

### Key Learning

When troubleshooting Cloud Functions Gen2 build errors, always look at which service account is being denied in the error message:

- If the error mentions `{project_number}@cloudbuild.gserviceaccount.com` → Grant to Cloud Build SA
- If the error mentions `{project_number}-compute@developer.gserviceaccount.com` → Grant to Compute Developer SA (this was our case)
- If the error mentions `{project_number}@cloudservices.gserviceaccount.com` → Grant to Compute Engine SA

This is why we've been granting permissions to the **compute developer SA** - it's the actual "worker" in the build process.

---

## Cost Breakdown

### Resources Added After Run 4

These resources were added to fix the private service connection error:

| Resource | Type | Monthly Cost | Notes |
|----------|------|--------------|-------|
| `servicenetworking.googleapis.com` | API | **$0** | Free API - enables VPC peering |
| `google_compute_global_address.private_ip_alloc` | Global IP | **$0** | Reserves /16 range for peering |
| `google_service_networking_connection.private_vpc_connection` | VPC Peering | **$0** | Free peering to Google services |

**Total for Run 4 additions: $0/month**

### API Charges (All Enabled APIs)
**All enabled APIs are FREE** - you pay for the resources you create, not for enabling the APIs.

| API | Charges |
|-----|---------|
| `cloudbuild.googleapis.com` | Free (first 120 minutes/day) |
| `run.googleapis.com` | Free tier covers ~2M requests/month |
| `artifactregistry.googleapis.com` | Free under 0.5 GB |
| `sqladmin.googleapis.com` | Free - management API only |
| `secretmanager.googleapis.com` | ~$0.03/month per secret version |
| `cloudfunctions.googleapis.com` | Free tier covers ~2M invocations |
| `iam.googleapis.com` | Free |
| `compute.googleapis.com` | Free - management API only |
| `servicenetworking.googleapis.com` | Free |
| `vpcaccess.googleapis.com` | Free - management API only |

### Infrastructure Costs

| Resource | Terraform Resource | Monthly Cost | Notes |
|----------|-------------------|--------------|-------|
| **Networking** |
| VPC Network | `google_compute_network.vpc_network` | **$0** | Free network resource |
| Subnet | `google_compute_subnetwork.subnet` | **$0** | Free subnet (10.0.0.0/24) |
| Global IP Allocation | `google_compute_global_address.private_ip_alloc` | **$0** | Reserves /16 range for services |
| VPC Peering | `google_service_networking_connection.private_vpc_connection` | **$0** | Peering to Google services |
| VPC Connector | `google_vpc_access_connector.cloud_sql_connector` | **~$0-6** | Usage-based (free tier: 1 GB-month) |
| **Data & Security** |
| Secret Manager (2 secrets) | `google_secret_manager_secret.*` | ~$0.06 | $0.03 per secret version |
| Cloud SQL | `google_sql_database_instance.duckdb_ide` | ~$10-15 | db-f1-micro, ENTERPRISE tier |
| **Compute (All FREE under tier)** |
| Cloud Run | (deployed via Cloud Build) | **FREE** | Free tier: ~2M requests/month |
| Cloud Functions | (deployed via gcloud) | **FREE** | Free tier: ~2M invocations/month |
| Artifact Registry | `google_artifact_registry_repository.duckdb_ide` | **FREE** | Free under 0.5 GB storage |
| Cloud Build | (triggered by git push) | **FREE** | First 120 minutes/day |
| **Total Estimated Cost** | | **~$12-21/month** | After $300 credit expires |

### Key Points
- **No charges for API enablement** - only for resource usage
- **Global IP allocation is free** - we're reserving a range, not consuming static IPs
- **You pay for Cloud SQL instance** - ~$10-15/month for db-f1-micro tier
- **Free tiers cover most services** - Cloud Run, Cloud Functions, Cloud Build, Artifact Registry

---

## Terraform Taint Explained

### Why APIs Were Tainted in Run 1

When Terraform fails **mid-creation**, it marks in-flight resources as **tainted**:

1. Terraform sends the API request to GCP
2. The request may have partially succeeded on GCP's side
3. **But Terraform's state file wasn't updated (transaction failed)**
4. Terraform can't trust the resource's actual state → marks it **tainted**

**Tainted = "I don't know what state this resource is in, so destroy and recreate it to be safe"**

### Run 1 vs Run 2: Why the Difference?

| Run | State | Result |
|-----|-------|--------|
| **Run 1** | APIs were "Still creating..." when crashed | APIs marked **tainted** → `-/+ destroy and recreate` |
| **Run 2** | Clean state from successful partial apply | No taint → Only `+` (create what's missing) |

In Run 2, the tainted APIs were successfully cleaned up (destroyed/recreated), and other resources (SAs, Secrets, Artifact Registry) were successfully created with clean state.

---

## Deployment Checklist

### One-Time Setup (Terraform)
- [ ] Terraform service account created ✅
- [ ] Terraform authenticated (test `terraform init`)
- [ ] Run `terraform apply` to create:
  - [ ] APIs enabled
  - [ ] Artifact Registry repository
  - [ ] Cloud SQL instance
  - [ ] Secret Manager secrets
  - [ ] Service accounts (3 SAs)
  - [ ] IAM permissions

### Cloud Build Trigger
- [ ] Create GitHub trigger in Cloud Build console
- [ ] Configure to use `cloud-build-deployer-sa` service account

### Cloud Functions (db-init)
- [ ] Deploy db-init Cloud Function
- [ ] Test `/init` endpoint
- [ ] Test `/seed` endpoint

### Application Deployment
- [ ] Push to `gcp-deployment` branch
- [ ] Verify Cloud Run deployment
- [ ] Test application health check

---

## Resources Reference

| Resource | Name/Value |
|----------|------------|
| Project ID | `sql-practice-project-489106` |
| Region | `us-central1` |
| Cloud SQL Instance | `duckdb-ide-db` |
| Database Name | `duckdb_ide` |
| Artifact Registry | `duckdb-ide-repo` |
| Cloud Run Service | `duckdb-ide` |

---

## Service Accounts

| Service Account | Email | Purpose |
|-----------------|-------|---------|
| `cloud-build-deployer-sa` | `cloud-build-deployer-sa@sql-practice-project-489106.iam.gserviceaccount.com` | CI/CD deployment |
| `cloud-run-sa` | `cloud-run-sa@sql-practice-project-489106.iam.gserviceaccount.com` | Cloud Run app runtime |
| `db-init-sa` | `db-init-sa@sql-practice-project-489106.iam.gserviceaccount.com` | Cloud Functions db-init |
| `terraform-deployer` | `terraform-deployer@sql-practice-project-489106.iam.gserviceaccount.com` | Terraform infrastructure |

---

## Cost Estimate

| Resource | Monthly Cost |
|----------|--------------|
| Cloud SQL (db-f1-micro) | ~$10-15 |
| Secret Manager (2 secrets) | ~$0.06 |
| VPC Connector | ~$0-6 (usage-based) |
| Cloud Run | FREE tier covers typical usage |
| Cloud Functions | FREE tier covers typical usage |
| Artifact Registry | FREE (under 0.5 GB) |
| **Total** | **~$12-21/month** |

*After $300 credit expires*

---

## Automated Deployment Script

This script demonstrates the **Option 1** approach: Single Terraform + Shell Scripts using `terraform output`.

### Complete Deployment Script

Save this as `deploy-gcp.sh` in the project root:

```bash
#!/bin/bash
set -e  # Exit on error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Helper functions
log_info() { echo -e "${GREEN}[INFO]${NC} $1"; }
log_warn() { echo -e "${YELLOW}[WARN]${NC} $1"; }
log_error() { echo -e "${RED}[ERROR]${NC} $1"; }

# Check required tools
command -v terraform >/dev/null 2>&1 || { log_error "terraform required. Install from https://developer.hashicorp.com/terraform/downloads"; exit 1; }
command -v gcloud >/dev/null 2>&1 || { log_error "gcloud required. Install from https://cloud.google.com/sdk/docs/install"; exit 1; }
command -v jq >/dev/null 2>&1 || { log_error "jq required. Install: sudo apt install jq"; exit 1; }

# Script directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TERRAFORM_DIR="$SCRIPT_DIR/terraform/first-time-deployment"

# ===================================================================
# STEP 1: Terraform - Create GCP Infrastructure
# ===================================================================
log_info "=== STEP 1: Running Terraform to create GCP infrastructure ==="

cd "$TERRAFORM_DIR"

# Set credentials
if [ -f "terraform-key.json" ]; then
    export GOOGLE_APPLICATION_CREDENTIALS="$TERRAFORM_DIR/terraform-key.json"
    log_info "Using terraform-key.json for authentication"
else
    log_warn "terraform-key.json not found. Ensure you're authenticated via gcloud."
fi

# Initialize if not already done
if [ ! -d ".terraform" ]; then
    log_info "Initializing Terraform..."
    terraform init
fi

# Plan
log_info "Creating Terraform plan..."
terraform plan -out=tfplan

# Apply
log_info "Applying Terraform plan..."
terraform apply tfplan

# Get outputs
log_info "Fetching Terraform outputs..."
PROJECT_ID=$(terraform output -raw project_id)
REGION=$(terraform output -raw region)
CONNECTION_NAME=$(terraform output -raw cloudsql_connection_name)
CLOUDRUN_SA=$(terraform output -json service_accounts | jq -r '.cloud_run')
DB_INIT_SA=$(terraform output -json service_accounts | jq -r '.db_init')
CLOUDBUILD_SA=$(terraform output -json service_accounts | jq -r '.cloud_build_deployer')
DB_NAME=$(terraform output -raw db_name)
ARTIFACT_REGISTRY=$(terraform output -raw artifact_registry_repository)

log_info "Terraform outputs:"
log_info "  Project: $PROJECT_ID"
log_info "  Region: $REGION"
log_info "  Cloud SQL: $CONNECTION_NAME"
log_info "  Artifact Registry: $ARTIFACT_REGISTRY"

# ===================================================================
# STEP 2: Deploy Cloud Function (db-init)
# ===================================================================
log_info "=== STEP 2: Deploying Cloud Function (db-init-service) ==="

cd "$SCRIPT_DIR/server/cloud-functions/db-init"

# Check if function already exists
if gcloud functions describe db-init-service --region="$REGION" &>/dev/null; then
    log_warn "Cloud Function 'db-init-service' already exists. Skipping deployment."
    FUNCTION_URL=$(gcloud functions describe db-init-service --region="$REGION" --format="value(serviceConfig.uri)")
else
    log_info "Deploying db-init-service..."
    gcloud functions deploy db-init-service \
        --gen2 \
        --region="$REGION" \
        --runtime=nodejs20 \
        --source=. \
        --entry-point=initDatabase \
        --trigger-http \
        --allow-unauthenticated \
        --memory=512Mi \
        --timeout=300s \
        --vpc-connector=duckdb-ide-vpc-connector \
        --set-env-vars="DB_NAME=$DB_NAME,DB_USER=postgres" \
        --set-secrets="DB_PASSWORD=db-password:latest" \
        --service-account="$DB_INIT_SA"

    FUNCTION_URL=$(gcloud functions describe db-init-service --region="$REGION" --format="value(serviceConfig.uri)")
fi

log_info "Cloud Function URL: $FUNCTION_URL"

# ===================================================================
# STEP 3: Initialize Database
# ===================================================================
log_info "=== STEP 3: Initializing Database ==="

read -p "Initialize database now? (y/n) " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
    log_info "Running database initialization..."
    INIT_RESPONSE=$(curl -s -X POST "$FUNCTION_URL/init")
    log_info "Response: $INIT_RESPONSE"
else
    log_warn "Skipping database initialization. Run manually later:"
    log_warn "  curl -X POST $FUNCTION_URL/init"
fi

# ===================================================================
# STEP 4: Create Cloud Build Trigger
# ===================================================================
log_info "=== STEP 4: Creating Cloud Build Trigger ==="

TRIGGER_NAME="deploy-gcp-deployment"
REPO="prateekpanjla-outlook/duckdb-wasm-ide"

# Check if trigger already exists
if gcloud builds triggers list --format="value(name)" | grep -q "$TRIGGER_NAME"; then
    log_warn "Cloud Build trigger '$TRIGGER_NAME' already exists. Skipping creation."
else
    log_info "Creating Cloud Build trigger..."

    # This requires GitHub integration to be set up
    # If it fails, provide manual instructions
    if ! gcloud builds triggers create github \
        --name="$TRIGGER_NAME" \
        --branch-pattern="^gcp-deployment$" \
        --build-config="$SCRIPT_DIR/cloudbuild.yaml" \
        --service-account="$CLOUDBUILD_SA" \
        --repo="$REPO" 2>/dev/null; then

        log_warn "Automatic trigger creation failed. GitHub integration may need manual setup."
        log_warn "Create manually at: https://console.cloud.google.com/cloud-build/triggers"
        log_warn "Or setup GitHub connection first: https://console.cloud.google.com/cloud-build/github"
    fi
fi

# ===================================================================
# Summary
# ===================================================================
log_info "=== Deployment Summary ==="
log_info "✅ Terraform: Infrastructure created"
log_info "✅ Cloud Function: db-init-service deployed"
log_info "✅ Database: Ready to initialize"
log_info "⚠️  Cloud Build Trigger: May need manual setup"

echo ""
log_info "Next Steps:"
log_info "1. Test the Cloud Function:"
echo "   curl -X POST $FUNCTION_URL/init"
echo ""
log_info "2. Create Cloud Build Trigger (if needed):"
echo "   https://console.cloud.google.com/cloud-build/triggers"
echo ""
log_info "3. Deploy application:"
echo "   git push origin gcp-deployment"
echo ""
log_info "4. Get Cloud Run URL:"
echo "   gcloud run services describe duckdb-ide --region=$REGION --format='value(status.url)'"
```

### Usage

```bash
# Make script executable
chmod +x deploy-gcp.sh

# Run complete deployment
./deploy-gcp.sh
```

### Manual Step-by-Step (with Terraform outputs)

```bash
# Navigate to terraform directory
cd terraform/first-time-deployment

# Set credentials
export GOOGLE_APPLICATION_CREDENTIALS=$(pwd)/terraform-key.json

# Run Terraform
terraform init
terraform plan -out=tfplan
terraform apply tfplan

# Export outputs as environment variables
export PROJECT_ID=$(terraform output -raw project_id)
export REGION=$(terraform output -raw region)
export CONNECTION_NAME=$(terraform output -raw cloudsql_connection_name)
export DB_INIT_SA=$(terraform output -json service_accounts | jq -r '.db_init')
export CLOUDBUILD_SA=$(terraform output -json service_accounts | jq -r '.cloud_build_deployer')
export DB_NAME=$(terraform output -raw db_name)

# Deploy Cloud Function using outputs
# NOTE: This requires VPC connector to be deployed via terraform first
cd ../../server/cloud-functions/db-init
gcloud functions deploy db-init-service \
    --gen2 \
    --region=$REGION \
    --runtime=nodejs20 \
    --source=. \
    --entry-point=initDatabase \
    --trigger-http \
    --allow-unauthenticated \
    --memory=512Mi \
    --timeout=300s \
    --vpc-connector=duckdb-ide-vpc-connector \
    --set-env-vars="DB_NAME=$DB_NAME,DB_USER=postgres" \
    --set-secrets="DB_PASSWORD=db-password:latest" \
    --service-account=$DB_INIT_SA

# Initialize database
FUNCTION_URL=$(gcloud functions describe db-init-service --region $REGION --format="value(serviceConfig.uri)")
curl -X POST $FUNCTION_URL/init

# Create Cloud Build Trigger
cd ../..
gcloud builds triggers create github \
    --name="deploy-gcp-deployment" \
    --branch-pattern="^gcp-deployment$" \
    --build-config="cloudbuild.yaml" \
    --service-account=$CLOUDBUILD_SA \
    --repo="prateekpanjla-outlook/duckdb-wasm-ide"

# Deploy application
git push origin gcp-deployment
```
