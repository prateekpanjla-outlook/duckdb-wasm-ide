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

---

## Security Issue: Sensitive Files in Cloud Build (2026-03-03 16:15)

### Issue Summary
During Cloud Build deployment, the entire project tarball is uploaded to Google Cloud Storage. Several **sensitive files** were found that should NOT be included in the build context.

### Files Found

| File | Risk | Status |
|------|------|--------|
| `terraform/first-time-deployment/terraform-key.json` | Service account credentials | ⚠️ CRITICAL |
| `server/.env` | Database passwords, JWT secrets | ⚠️ HIGH |
| `server/.env.development` | Development config | ⚠️ MEDIUM |
| `server/.env.production` | Production config | ⚠️ MEDIUM |
| `*.log` (firestore-debug.log, server.log) | Debug logs with possible sensitive data | ⚠️ LOW |

### Fix Applied

Updated [`.dockerignore`](.dockerignore) to exclude sensitive files:

```dockerignore
# Environment files (use secrets in Cloud Run instead)
.env
.env.local
.env.*.local
.env.development
.env.production
.env.test
server/.env
server/.env.development
server/.env.production

# Terraform / Service Account keys
terraform/
*-key.json
*.tfvars
*.pem
```

### Why .dockerignore Matters

When running `gcloud builds submit` or `gcloud run deploy --source`:
1. The entire project directory is tarballed
2. Uploaded to GCS for Cloud Build
3. Used as build context for Docker image

**Any file not in .dockerignore gets included in the Docker image!**

### Verification

To verify no sensitive files are included:

```bash
# Check what would be included in build
docker build --no-cache -t test .

# Inspect image for sensitive files
docker run --rm -it test ls -la /app
docker run --rm -it test cat /app/terraform-key.json  # Should fail
```

### Best Practices

1. **Never commit secrets** to git
2. **Use .dockerignore** to exclude sensitive files from builds
3. **Use Secret Manager** for production secrets (already configured)
4. **Use environment-specific .env files** only for local development
5. **Rotate credentials** if accidentally exposed

### Service Account Key Security

The `terraform-key.json` file is especially dangerous:
- Contains full service account credentials
- Grants broad permissions (Editor role on project)
- Should be rotated if exposed

To rotate (if needed):
```bash
gcloud iam service-accounts keys delete terraform-key.json \
    --iam-account=terraform-deployer@sql-practice-project-489106.iam.gserviceaccount.com

gcloud iam service-accounts keys create terraform-key.json \
    --iam-account=terraform-deployer@sql-practice-project-489106.iam.gserviceaccount.com
```

---

## Cloud Build Deployment Errors (2026-03-03 17:10+)

### Error 1: Substitution Variables Not Matched

**Error Message:**
```
ERROR: (gcloud.builds.submit) INVALID_ARGUMENT: generic::invalid_argument:
key "_DEPLOY_REGION" in the substitution data is not matched in the template
```

**Root Cause:**
When running `gcloud builds submit` with `--substitutions`, you must provide **ALL** substitution variables that are defined in the `cloudbuild.yaml`. The default values in the YAML are only used when running via Cloud Build triggers, not direct CLI invocation.

**Fix:**
Either:
1. **Remove unused substitutions** from `cloudbuild.yaml` (recommended)
2. **Provide all substitutions** via `--substitutions` flag

**Fixed cloudbuild.yaml:**
```yaml
# Only include variables that are actually used in steps
substitutions:
  _CLOUDSQL_CONNECTION: 'your-project:us-central1:duckdb-ide-db'
  _DB_NAME: 'duckdb_ide'
  _DB_USER: 'postgres'
  _DB_PASSWORD_SECRET: 'db-password'
  _JWT_SECRET_SECRET: 'jwt-secret'
```

### Error 2: Invalid Docker Tag Format

**Error Message:**
```
invalid argument "us-central1-docker.pkg.dev/.../duckdb-ide:" for "-t, --tag" flag:
invalid reference format
```

**Root Cause:**
The `$COMMIT_SHA` variable is empty when running builds directly (not from a git trigger). This results in a trailing colon in the tag name: `duckdb-ide:` which is invalid Docker syntax.

**Fix:**
Use `latest` tag for direct builds, or use `$BUILD_ID` which is always set by Cloud Build:

```yaml
# Before (broken):
- 'us-central1-docker.pkg.dev/$PROJECT_ID/duckdb-ide-repo/duckdb-ide:$COMMIT_SHA'

# After (fixed):
- 'us-central1-docker.pkg.dev/$PROJECT_ID/duckdb-ide-repo/duckdb-ide:latest'
```

### Error 3: Missing Secret Manager Secrets

**Potential Error:**
```
ERROR: (gcloud.run.deploy) spec.template.spec.containers[0].env:
Referencing secret with name 'jwt-secret' in environment variable 'JWT_SECRET',
but secret 'jwt-secret' does not exist
```

**Root Cause:**
The `cloudbuild.yaml` references Secret Manager secrets that may not exist:
- `db-password`
- `jwt-secret`

**Fix:**
Verify secrets exist or create them:

```bash
# Check if secrets exist
gcloud secrets list

# Create secrets if needed
echo "your-password" | gcloud secrets create db-password --data-file=-
echo "your-jwt-secret" | gcloud secrets create jwt-secret --data-file=-
```

### Error 4: Service Account Permissions

**Potential Errors:**
```
ERROR: (gcloud.run.deploy) Permission 'run.services.create' denied
ERROR: build step 0 "gcr.io/cloud-builders/docker" failed:
unauthorized: authentication required
```

**Required Permissions:**

| Service Account | Required Role | Purpose |
|----------------|---------------|---------|
| Cloud Build SA | `roles/run.developer` | Deploy to Cloud Run |
| Cloud Build SA | `roles/artifactregistry.writer` | Push/pull images |
| Cloud Run SA | `roles/cloudsql.client` | Connect to Cloud SQL |
| Cloud Run SA | `roles/secretmanager.secretAccessor` | Access secrets |

**Verification Command:**
```bash
PROJECT_ID="sql-practice-project-489106"
CLOUD_BUILD_SA="${PROJECT_NUMBER}@cloudbuild.gserviceaccount.com"

gcloud projects get-iam-policy "$PROJECT_ID" \
  --filter="bindings.members:serviceAccount:$CLOUD_BUILD_SA"
```

### Error 5: Cloud SQL Connection String Format

**Correct Format:**
```
PROJECT_ID:REGION:INSTANCE_NAME
```

**Example:**
```
sql-practice-project-489106:us-central1:duckdb-ide-db
```

**Common Mistakes:**
| Wrong | Right |
|-------|-------|
| `duckdb-ide-db` | `sql-practice-project-489106:us-central1:duckdb-ide-db` |
| `us-central1:duckdb-ide-db` | `sql-practice-project-489106:us-central1:duckdb-ide-db` |
| `projects/.../instances/duckdb-ide-db` | `sql-practice-project-489106:us-central1:duckdb-ide-db` |

### Error 6: Docker Build Failures

**Potential Error:**
```
Step #0 - "build": ERROR [controller] Cannot build: failed to solve:
executor failed running [/bin/sh -c npm ci --only=production]
```

**Root Causes:**
1. `package.json` or `package-lock.json` missing from build context
2. `.dockerignore` is too aggressive (excludes needed files)
3. Network issues downloading npm packages

**Debugging:**
```bash
# Test Docker build locally
docker build -t test .

# Check .dockerignore isn't excluding needed files
cat .dockerignore | grep -E "package|node_modules"
```

### Summary of Cloud Build Fixes Applied

| Issue | File | Fix |
|-------|------|-----|
| Unused substitution variables | `cloudbuild.yaml` | Removed `_DEPLOY_REGION`, `_MEMORY`, `_CPU`, `_MAX_INSTANCES` |
| Empty COMMIT_SHA variable | `cloudbuild.yaml` | Changed to use `latest` tag |
| Sensitive files in build | `.dockerignore` | Added `terraform/`, `*-key.json`, `server/.env*` |

### Working Cloud Build Command

```bash
cd /home/vagrant/Desktop/claude-code-zai/duckdb-wasm-project && \
gcloud builds submit --config cloudbuild.yaml \
  --substitutions=_CLOUDSQL_CONNECTION=sql-practice-project-489106:us-central1:duckdb-ide-db,_DB_NAME=duckdb_ide,_DB_USER=postgres,_DB_PASSWORD_SECRET=db-password,_JWT_SECRET_SECRET=jwt-secret
```

### After Successful Build

Get the Cloud Run URL:
```bash
gcloud run services describe duckdb-ide --region=us-central1 --format='value(status.url)'
```

Expected output:
```
https://duckdb-ide-xxxxx-uc.a.run.app
```

---

# Current Status & Next Steps (2026-03-03 End of Day)

## Completed Today ✅

1. **Terraform Deployment** - All infrastructure created
2. **Cloud Function (db-init-service)** - Deployed successfully
3. **Security Fixes** - Updated `.dockerignore` to exclude sensitive files:
   - `terraform/` directory
   - `*-key.json` files (service account keys)
   - `server/.env*` files (environment secrets)
   - `*.log` files

4. **Cloud Build Configuration Fixes**:
   - Removed unused substitution variables (`_DEPLOY_REGION`, `_MEMORY`, `_CPU`, `_MAX_INSTANCES`)
   - Fixed Docker tag to use `$BUILD_ID` instead of `$COMMIT_SHA`
   - Documented all common Cloud Build errors

5. **IAM Permissions Granted**:
   - `roles/storage.objectViewer` to compute developer SA
   - `roles/artifactregistry.repoAdmin` on both repositories
   - All Cloud Functions Gen2 build permissions

## Files Modified Today

| File | Changes |
|------|---------|
| `.dockerignore` | Added exclusions for sensitive files |
| `cloudbuild.yaml` | Fixed substitution variables and Docker tags |
| `GCP_DEPLOYMENT_EXECUTION.md` | Added security issue docs and Cloud Build errors |

## Current Infrastructure State

| Resource | Status | URL/Reference |
|----------|--------|---------------|
| **Cloud SQL** | ⚠️ Being deleted (cost saving) | Will recreate tomorrow |
| **Cloud Function** | ⚠️ Being deleted (cost saving) | Will recreate tomorrow |
| **Secret Manager** | ✅ Keeping | `db-password`, `jwt-secret` |
| **Artifact Registry** | ✅ Created | `duckdb-ide-repo` |
| **Cloud Run** | ⏳ Not deployed | - |
| **VPC Connector** | ✅ Created | `duckdb-ide-vpc-connector` |

**Note:** Cloud SQL and Cloud Function are being deleted overnight to save costs (~$10-15/month). They will be recreated tomorrow before deployment.

## Next Steps (Tomorrow)

### Step 0: Recreate Cloud SQL and Cloud Function (Deleted for Cost Savings)

**Why deleted?** Cloud SQL db-f1-micro costs ~$10-15/month even when idle.

#### 0A. Recreate Cloud SQL Instance

```bash
cd /home/vagrant/Desktop/claude-code-zai/duckdb-wasm-project/terraform/first-time-deployment

# Only apply Cloud SQL resources
terraform apply -target=google_sql_database_instance.duckdb_ide \
                -target=google_sql_database.default_db \
                -target=google_sql_database_instance.duckdb_ide \
                -target=google_sql_user.internal_user
```

Or use `gcloud` directly (faster):
```bash
gcloud sql instances create duckdb-ide-db \
    --project=sql-practice-project-489106 \
    --region=us-central1 \
    --tier=db-f1-micro \
    --edition=ENTERPRISE \
    --database-version=POSTGRES_15 \
    --root-password=your-root-password \
    --storage-auto-increase \
    --cpu=1 \
    --memory=384MiB
```

#### 0B. Recreate Cloud Function (db-init-service)

After Cloud SQL is ready, redeploy the Cloud Function:

```bash
cd /home/vagrant/Desktop/claude-code-zai/duckdb-wasm-project/server/cloud-functions/db-init

gcloud functions deploy db-init-service \
    --gen2 \
    --region=us-central1 \
    --runtime=nodejs20 \
    --source=. \
    --entry-point=initDatabase \
    --trigger-http \
    --allow-unauthenticated \
    --memory=512Mi \
    --timeout=300s \
    --vpc-connector=duckdb-ide-vpc-connector \
    --set-env-vars="DB_NAME=duckdb_ide,DB_USER=postgres" \
    --set-secrets="DB_PASSWORD=db-password:latest" \
    --service-account=db-init-sa@sql-practice-project-489106.iam.gserviceaccount.com
```

#### 0C. Initialize Database

```bash
# Get Cloud Function URL
FUNCTION_URL=$(gcloud functions describe db-init-service --region=us-central1 --format="value(serviceConfig.uri)")

# Initialize database tables
curl -X POST ${FUNCTION_URL}/init
```

### Step 1: Deploy Main Application to Cloud Run

```bash
cd /home/vagrant/Desktop/claude-code-zai/duckdb-wasm-project && \
gcloud builds submit --config cloudbuild.yaml \
  --substitutions=_CLOUDSQL_CONNECTION=sql-practice-project-489106:us-central1:duckdb-ide-db,_DB_NAME=duckdb_ide,_DB_USER=postgres,_DB_PASSWORD_SECRET=db-password,_JWT_SECRET_SECRET=jwt-secret
```

**Expected behavior:**
1. Uploads source (~75 MB tarball, .dockerignore applied)
2. Builds Docker image
3. Pushes to Artifact Registry
4. Deploys to Cloud Run

### Step 2: Get Application URL

```bash
gcloud run services describe duckdb-ide --region=us-central1 --format='value(status.url)'
```

### Step 3: Initialize Database (if not done)

```bash
# Trigger Cloud Function to create tables
curl -X POST https://db-init-service-192834930119.us-central1.run.app/init
```

### Step 4: Test the Application

1. Open the Cloud Run URL
2. Verify frontend loads
3. Test database connectivity
4. Verify user signup/login works

### Step 5: Create Cloud Build Trigger (Optional)

For automated deployments on git push:

1. Go to: https://console.cloud.google.com/cloud-build/triggers?project=sql-practice-project-489106
2. Click "Create Trigger"
3. Configure:
   - Name: `deploy-gcp-deployment`
   - Event: Push to branch `gcp-deployment`
   - Config: `cloudbuild.yaml`
4. Then just `git push origin gcp-deployment` to deploy

### Step 6: Create Cloud Run Functions Using Python (Future Consideration)

**Why Python?**
- Python has excellent libraries for data processing (pandas, polars, duckdb)
- Better suited for data analysis and ETL tasks
- Rich ecosystem for ML/AI workloads

**Options for Python on Cloud Run:**

#### Option A: Pure Python (Framework)

Create a lightweight Python service using standard library or frameworks like FastAPI/Flask:

```dockerfile
# Dockerfile for Python Cloud Run
FROM python:3.11-slim

WORKDIR /app
COPY requirements.txt .
RUN pip install -r requirements.txt --no-cache

COPY . .

# Cloud Run runs on port 8080
ENV PORT=8080
CMD ["python", "-m", "main"]
```

```python
# main.py
import os
from duckdb import connect

def hello_http(request):
    # Process data using DuckDB
    conn = connect(':memory:')
    # ... your processing logic ...
    return {'status': 'success'}, 200
```

#### Option B: Python + DuckDB Web Service

```bash
# Deploy Python service with DuckDB
gcloud run deploy duckdb-python-service \
  --source . \
  --region=us-central1 \
  --allow-unauthenticated \
  --port=8080 \
  --memory=1Gi \
  --cpu=2 \
  --set-env-vars=DUCKDB_MEMORY_LIMIT=1GB
```

#### Option C: Multi-Service Architecture

| Service | Language | Purpose |
|---------|----------|---------|
| `duckdb-ide` | Node.js | Frontend + basic backend (current) |
| `duckdb-python-processor` | Python | Data processing/ETL |
| `duckdb-analytics` | Python | Analytics queries |

**When to Consider:**
- Heavy data processing (pandas/numpy workloads)
- ML model serving
- Complex ETL pipelines
- DuckDB-based analytics services

**Deployment would be similar to main app:**
```bash
gcloud builds submit --config cloudbuild-python.yaml \
  --substitutions=_SERVICE_NAME=duckdb-python-processor
```

## Upload Size Optimization (2026-03-04)

### Problem

When running `gcloud builds submit`, the entire project directory was being uploaded, including:

| Item | Size | Needed for Build? |
|------|------|-------------------|
| `node_modules` | 664 MB | ❌ No (installed via `npm ci` in container) |
| `server/node_modules` | 15 MB | ❌ No (installed via `npm ci` in container) |
| `.git` | 24 MB | ❌ No |
| `tests/` | 308 KB | ❌ No |
| `*.md` docs | ~5 MB | ❌ No |
| `terraform/` | ~1 MB | ❌ No |
| **Total wasted** | **~709 MB** | |

**Upload time @ 10 Mbps**: ~10 minutes

### Solution: `.gcloudignore` File

Created [`.gcloudignore`](/.gcloudignore) to exclude unnecessary files from the Cloud Build tarball:

```gcloudignore
# Node modules (will be rebuilt in container)
node_modules
server/node_modules

# Development files
.git
.gitignore

# Documentation
*.md
docs
README.md

# Test files
tests
test-results
playwright-report
screenshots
*.log
coverage
.nyc_output
vitest.config.js
playwright.config.js

# Environment files (use secrets in Cloud Run instead)
.env
.env.local
.env.*.local
.env.development
.env.production
.env.test
server/.env
server/.env.example

# Terraform / Service Account keys
terraform
*-key.json
*.tfvars
*.pem
logs

# ... (see full file for all exclusions)
```

### Result

| Before | After |
|--------|-------|
| **~709 MB** | **~92 MB** |
| ~10 minutes @ 10 Mbps | ~1 minute @ 10 Mbps |

### What Actually Gets Uploaded

| File/Folder | Size | Reason |
|-------------|------|--------|
| `package*.json` | 143 KB | Dependency manifest for `npm ci` |
| `server/package*.json` | 16 KB | Backend dependencies |
| `Dockerfile` | 2 KB | Build instructions |
| `cloudbuild.yaml` | 3 KB | Cloud Build config |
| `index.html` | 9 KB | Frontend entry point |
| `css/` | 32 KB | Styles |
| `js/` | 256 KB | Frontend JS (app logic) |
| `libs/duckdb-wasm/` | 73 MB | **WASM binaries** - client needs these! |
| `server/` | 16 MB | Backend code |

**Note**: `node_modules` is NOT uploaded because the Dockerfile runs `npm ci` inside the container, which:
- Installs fresh, platform-specific binaries for Alpine Linux
- Ensures reproducible builds using `package-lock.json`
- Is faster than uploading 680 MB

### Difference: `.dockerignore` vs `.gcloudignore`

| File | When It Applies |
|------|-----------------|
| `.dockerignore` | During Docker build (after tarball uploaded) |
| `.gcloudignore` | During `gcloud builds submit` (tarball creation) |

**Both are needed** - `.gcloudignore` reduces upload time, `.dockerignore` prevents files from being layered into the Docker image.

## Important Notes

1. **Upload Size Optimization**: `.gcloudignore` reduces upload from ~709 MB to ~92 MB
2. **Storage Permission Issue**: Compute developer SA now has `storage.objectViewer` - this should fix the previous upload errors
3. **BUILD_ID Variable**: Cloud Build automatically provides this - no empty tag issue anymore
4. **Sensitive Files Excluded**: Both `.dockerignore` and `.gcloudignore` prevent terraform keys and .env files from being uploaded

## Troubleshooting Commands

```bash
# Check Cloud Build logs
gcloud builds list --limit=5
gcloud builds log <BUILD_ID>

# Check Cloud Run services
gcloud run services list --region=us-central1

# Check Cloud Run logs
gcloud run services logs duckdb-ide --region=us-central1 --follow

# Check for secret errors
gcloud secrets list

# Verify service account permissions
gcloud projects get-iam-policy sql-practice-project-489106 \
  --filter="bindings.members:serviceAccount:192834930119-compute@developer.gserviceaccount.com"
```

## Cost Status

| Resource | Monthly Cost | Action |
|----------|--------------|--------|
| **Cloud SQL (db-f1-micro)** | ~$10-15 | ⚠️ Deleting overnight, will recreate tomorrow |
| **Cloud Function** | Free tier (within limits) | ⚠️ Deleting overnight, will recreate tomorrow |
| **Cloud Run** | Free tier (within limits) | ✅ Will deploy tomorrow |
| **Secret Manager** | ~$0.06 | ✅ Keeping |
| **Artifact Registry** | Free (under 0.5 GB) | ✅ Keeping |
| **VPC Connector** | Free tier covers usage | ✅ Keeping |

**Overnight Cost Saving:** ~$10-15/month by deleting Cloud SQL

**Note:** Cloud SQL is the only significant cost. Everything else is covered by free tier or costs pennies.

---

# Cloud Build Deployment Attempt (2026-03-04)

## Build ID: c6e19130-48b3-4fa4-8f12-341b2832e36a

### What Worked ✅

| Step | Status | Details |
|------|--------|---------|
| **Upload optimization** | ✅ Success | `.gcloudignore` reduced upload from ~709 MB to ~92 MB |
| **Docker build** | ✅ Success | Image built successfully |
| **Artifact Registry push** | ✅ Success | Image pushed to `us-central1-docker.pkg.dev/.../duckdb-ide:latest` |
| **Build duration** | ✅ Improved | Much faster upload with .gcloudignore |

### What Failed ❌

| Step | Status | Error |
|------|--------|-------|
| **Cloud Run deploy** | ❌ Failed | `PERMISSION_DENIED: Permission 'run.services.get' denied` |

### Root Cause Analysis: IAM Permission Issue

#### The Error
```
ERROR: (gcloud.run.deploy) PERMISSION_DENIED: Permission 'run.services.get' denied on resource 
'namespaces/sql-practice-project-489106/services/duckdb-ide' (or resource may not exist). 
This command is authenticated as 192834930119-compute@developer.gserviceaccount.com
```

#### Why This Happened

```
┌─────────────────────────────────────────────────────────────────┐
│  Cloud Build Execution Flow                                     │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  1. User runs: gcloud builds submit                             │
│     → Authenticated as: user@gmail.com                          │
│                                                                 │
│  2. Cloud Build creates a tarball and uploads                   │
│     → Uses worker SA: {project_number}-compute@developer...     │
│                                                                 │
│  3. Cloud Build runs the deployment step from cloudbuild.yaml   │
│     → Executes: gcloud run deploy duckdb-ide ...                │
│     → Authenticated as: compute developer SA                    │
│                                                                 │
│  4. gcloud run deploy attempts:                                 │
│     a. GET /services/duckdb-ide (check if exists)              │
│     b. CREATE or UPDATE accordingly                             │
│                                                                 │
│  5. FAILURE: compute developer SA lacks 'run.services.get'      │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

#### Key Insight

The error message says `run.services.get` denied, but this happens **because the service doesn't exist**.

**Logic flow:**
1. `gcloud run deploy` first tries to GET the service (to decide: create vs update)
2. If GET fails → deployment fails, even if CREATE permission exists
3. Service doesn't exist → GET returns PERMISSION_DENIED (not NOT_FOUND)
4. This is a security feature to prevent information leakage

#### Service Accounts Involved

| Service Account | Has `roles/run.developer`? | Purpose |
|-----------------|---------------------------|---------|
| `cloud-build-deployer-sa` | ✅ Yes | Intended for deployment |
| `{project_number}-compute@developer.gserviceaccount.com` | ❌ No (initially) | Cloud Build worker SA |
| `cloud-run-sa` | N/A | Runtime identity for the service |

### Fix Applied

Granted `roles/run.developer` to the compute developer service account:

```bash
PROJECT_NUMBER="192834930119"
COMPUTE_DEV_SA="${PROJECT_NUMBER}-compute@developer.gserviceaccount.com"

gcloud projects add-iam-policy-binding sql-practice-project-489106 \
    --member="serviceAccount:$COMPUTE_DEV_SA" \
    --role="roles/run.developer"
```

### Lessons Learned

#### 1. Dependency Planning: IAM Permissions Must Be Pre-Configured

**Issue:** Cloud Build deployment step failed because the worker SA lacked Cloud Run permissions.

**Root Cause:** Terraform configured permissions for `cloud-build-deployer-sa` but NOT for the `compute developer SA` that actually runs the build steps.

**Solution Needed:** Either:
- **Option A:** Grant `roles/run.developer` to compute developer SA
- **Option B:** Configure Cloud Build to impersonate cloud-build-deployer-sa for deployment steps

#### 2. Dependency Planning Matrix

| Resource | Depends On | Status |
|----------|-----------|--------|
| **Docker build** | None (just code) | ✅ |
| **Artifact Registry push** | `artifactregistry.writer` on compute dev SA | ✅ |
| **Cloud Run deploy** | `run.developer` on compute dev SA | ⚠️ Was missing |
| **Cloud SQL connection** | Cloud SQL instance exists | ⚠️ Deleted for cost savings |
| **Secret Manager access** | `secretAccessor` on cloud-run-sa | ✅ |

#### 3. Service Account Hierarchy for Cloud Build

```
User Account (prateek.panjal.outlook@gmail.com)
    │
    ├── Triggers: gcloud builds submit
    │
    ↓
Cloud Build Service
    │
    ├── Uses: {project_number}-compute@developer.gserviceaccount.com
    │   Purpose: Executes build steps (docker, gcloud commands)
    │   Needs: artifactregistry.writer, run.developer, etc.
    │
    ├── Should impersonate: cloud-build-deployer-sa
    │   Purpose: Least-privilege deployment account
    │   Needs: run.developer, cloudfunctions.developer
    │
    ↓
Cloud Run Service
    │
    └── Runs as: cloud-run-sa
        Purpose: Runtime identity for the application
        Needs: cloudsql.client, secretAccessor
```

### Next Steps

1. ✅ **DONE**: Granted `roles/run.developer` to compute developer SA
2. ⏳ **TODO**: Re-run deployment to verify fix works
3. ⏳ **TODO**: Update Terraform to grant this permission automatically
4. ⏳ **TODO**: Consider using service account impersonation for better security

### Files Modified Today

| File | Change |
|------|--------|
| `.gcloudignore` | Created - reduces upload from ~709 MB to ~92 MB |
| `GCP_DEPLOYMENT_EXECUTION.md` | Added this documentation section |

---


---

# Terraform Authentication Issue (2026-03-04)

## Build ID: N/A (terraform plan failed)

### Error Encountered

When running `terraform plan`, got multiple errors:

```
Error: Error when reading or editing Project Service: 
oauth2: "invalid_grant" "Account has been deleted"
```

### Root Cause Analysis

**Issue:** `GOOGLE_APPLICATION_CREDENTIALS` environment variable was not set.

```
┌─────────────────────────────────────────────────────────────────┐
│  What Happened                                                  │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  1. terraform-key.json file EXISTS locally ✅                   │
│  2. Service account EXISTS in GCP ✅                           │
│  3. Key ID in file MATCHES active key in GCP ✅                │
│                                                                 │
│  BUT:                                                           │
│  → GOOGLE_APPLICATION_CREDENTIALS was BLANK                    │
│  → Terraform couldn't find the credentials file                │
│  → Got misleading error: "Account has been deleted"            │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### Solution

Set the environment variable to point to the terraform key file:

```bash
export GOOGLE_APPLICATION_CREDENTIALS=/path/to/terraform/first-time-deployment/terraform-key.json
```

### Commands to Diagnose This Issue

| Command | Purpose |
|---------|---------|
| `echo "GOOGLE_APPLICATION_CREDENTIALS=$GOOGLE_APPLICATION_CREDENTIALS"` | Check if variable is set |
| `ls -la terraform-key.json` | Check if key file exists locally |
| `grep -o '"private_key_id": "[^"]*"' terraform-key.json` | Get key ID from local file |
| `gcloud iam service-accounts keys list --iam-account=...` | List active keys in GCP |
| `gcloud iam service-accounts describe terraform-deployer@...` | Verify SA exists |

### Why the Error Was Misleading

The error message `"Account has been deleted"` is confusing because:
- The key file exists on disk
- The service account exists in GCP
- The key ID matches an active key

**But:** When `GOOGLE_APPLICATION_CREDENTIALS` is not set, Terraform can't locate the credentials, and the authentication failure produces this generic error.

### Fix Commands (Full Sequence)

```bash
# 1. Set the environment variable
export GOOGLE_APPLICATION_CREDENTIALS=/home/vagrant/Desktop/claude-code-zai/duckdb-wasm-project/terraform/first-time-deployment/terraform-key.json

# 2. Verify it's set
echo "GOOGLE_APPLICATION_CREDENTIALS=$GOOGLE_APPLICATION_CREDENTIALS"

# 3. Run terraform plan
cd terraform/first-time-deployment
TS=$(date +%Y%m%d-%H%M%S) && terraform plan -out=tfplan-$TS.plan 2>&1 | tee terraform-plan-$TS.log
```

### Making It Permanent

To avoid setting this every session, add to `~/.bashrc` or `~/.zshrc`:

```bash
echo 'export GOOGLE_APPLICATION_CREDENTIALS=/home/vagrant/Desktop/claude-code-zai/duckdb-wasm-project/terraform/first-time-deployment/terraform-key.json' >> ~/.bashrc
source ~/.bashrc
```

### Lessons Learned

1. **Terraform requires `GOOGLE_APPLICATION_CREDENTIALS` to be set** - it doesn't automatically look for key files in the current directory
2. **Error messages can be misleading** - "Account has been deleted" may actually mean "credentials not found"
3. **Always check environment variables first** when encountering OAuth/credential errors

### Status

✅ **RESOLVED** - Issue was missing environment variable, not a deleted account


---

# Cloud SQL Recreation (2026-03-04)

## Terraform Apply - Successful

### Log File
`terraform/first-time-deployment/terraform-apply-20260304-094936.log`

### What Was Executed
1. **terraform plan** - ✅ Successful (detected Cloud SQL was deleted)
2. **terraform apply tfplan-20260304-094936.plan** - ✅ Successful

### Resources Created

| Resource | Creation Time | ID/Reference |
|----------|---------------|--------------|
| **Cloud SQL Instance** | 14m 1s | `duckdb-ide-db` |
| **SQL User (postgres)** | 5s | `postgres//duckdb-ide-db` |
| **SQL Database (duckdb_ide)** | 13s | `projects/sql-practice-project-489106/instances/duckdb-ide-db/databases/duckdb_ide` |

### Terraform Output

```
Apply complete! Resources: 3 added, 0 changed, 0 destroyed.

Outputs:
- cloudsql_connection_name = "sql-practice-project-489106:us-central1:duckdb-ide-db"
- cloudsql_instance_name = "duckdb-ide-db"
- db_name = "duckdb_ide"
- project_id = "sql-practice-project-489106"
- region = "us-central1"
```

### Authentication Fix Applied

**Issue:** Initial terraform plan failed with `"Account has been deleted"` error.

**Root Cause:** `GOOGLE_APPLICATION_CREDENTIALS` environment variable was not set.

**Fix:** 
```bash
export GOOGLE_APPLICATION_CREDENTIALS=/home/vagrant/Desktop/claude-code-zai/duckdb-wasm-project/terraform/first-time-deployment/terraform-key.json
```

**Lesson:** The terraform key file exists locally and is valid, but the environment variable must be set for Terraform to use it.

### Current Infrastructure State

| Resource | Status | Details |
|----------|--------|---------|
| **Cloud SQL** | ✅ Created | `duckdb-ide-db` (POSTGRES_15, db-f1-micro) |
| **Database** | ✅ Created | `duckdb_ide` |
| **SQL User** | ✅ Created | `postgres` with password from Secret Manager |
| **Secret Manager** | ✅ Exists | `db-password`, `jwt-secret` |
| **VPC Connector** | ✅ Exists | `duckdb-ide-vpc-connector` |
| **Service Accounts** | ✅ Exist | 3 SAs with appropriate permissions |
| **Artifact Registry** | ✅ Exists | `duckdb-ide-repo` |
| **Docker Image** | ✅ Exists | `duckdb-ide:latest` (from earlier build) |

### Next Steps

1. **Deploy Cloud Function (db-init-service)** - To initialize database tables
2. **Deploy Main Application** - Via Cloud Build to Cloud Run
3. **Initialize Database** - Run the Cloud Function to create tables and seed data

### Cost Note

Cloud SQL db-f1-micro is now running at approximately **$10-15/month**. To stop costs:
```bash
gcloud sql instances delete duckdb-ide-db --project=sql-practice-project-489106
```


---

# Cloud Function Deployment (2026-03-04)

## Cloud Function (db-init-service) Deployed Successfully

### Log File
`logs/deploy-next-steps-<timestamp>.log`

### What Was Executed
```bash
./deploy-next-steps.sh --init-db
```

### Deployment Details

| Step | Status | Details |
|------|--------|---------|
| **GCP Configuration** | ✅ Success | Project, region, zone configured |
| **Terraform Outputs** | ✅ Success | All outputs retrieved correctly |
| **Cloud Function Deploy** | ✅ Success | `db-init-service` deployed to us-central1 |
| **Database Initialization** | ✅ Success | Tables created and seeded |

### Cloud Function Configuration

| Setting | Value |
|----------|-------|
| **Name** | `db-init-service` |
| **Runtime** | Node.js 20 |
| **Region** | `us-central1` |
| **Memory** | 512Mi |
| **Timeout** | 300s |
| **Trigger** | HTTP |
| **Authentication** | Allow unauthenticated |
| **Service Account** | `db-init-sa` |
| **VPC Connector** | `duckdb-ide-vpc-connector` |

### Database Initialization Completed

| Action | Status |
|--------|--------|
| **Create tables** | ✅ Users, Questions, User Attempts, User Sessions |
| **Create indexes** | ✅ 3 indexes created |
| **Seed questions** | ✅ 7 practice questions inserted |

### Tables Created

| Table | Purpose |
|-------|---------|
| `users` | User accounts (email, password_hash) |
| `questions` | SQL practice questions with solutions |
| `user_attempts` | Tracks user quiz attempts |
| `user_sessions` | Active practice sessions |

### Cloud Function Endpoints

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/` | GET | Health check |
| `/migrate` | POST | Run database migrations |
| `/seed` | POST | Seed practice questions |
| `/init` | POST | Full initialization (migrate + seed) |

### Current Infrastructure State

| Resource | Status | URL/Reference |
|----------|--------|---------------|
| **Cloud SQL** | ✅ Active | `duckdb-ide-db` (POSTGRES_15) |
| **Database** | ✅ Ready | `duckdb_ide` with tables |
| **Cloud Function** | ✅ Active | Deployed and initialized |
| **Docker Image** | ✅ Ready | `duckdb-ide:latest` in Artifact Registry |
| **Secret Manager** | ✅ Ready | `db-password`, `jwt-secret` |
| **Cloud Run** | ⏳ Not deployed | - |

### Cost Note

Current running costs:
- Cloud SQL (db-f1-micro): ~$10-15/month
- Cloud Function: Free tier
- Everything else: Free tier or ~$0.06

---

# Cloud Run Deployment - IAM Permission Fix (2026-03-04)

## Build ID: eb388255-48d4-41a1-b6b6-5cb4117f38c0

### Error Encountered

```
ERROR: (gcloud.run.deploy) [192834930119-compute@developer.gserviceaccount.com] does not have permission
to access namespaces instance [sql-practice-project-489106] (or it may not exist):
Permission 'iam.serviceaccounts.actAs' denied on service account cloud-run-sa@sql-practice-project-489106.iam.gserviceaccount.com
```

### Root Cause

When deploying to Cloud Run with `--service-account=cloud-run-sa`, the compute developer SA needs to **impersonate** (act as) the runtime service account. This requires the `iam.serviceAccounts.actAs` permission (Service Account Token Creator role).

This is the **same pattern** as the Cloud Function deployment issue - the compute developer SA needs to impersonate the runtime SA during deployment.

### Fix Applied

Granted `roles/iam.serviceAccountTokenCreator` to compute developer SA on cloud-run-sa:

```bash
PROJECT_ID="sql-practice-project-489106"
PROJECT_NUMBER="192834930119"

gcloud iam service-accounts add-iam-policy-binding "cloud-run-sa@${PROJECT_ID}.iam.gserviceaccount.com" \
    --member="serviceAccount:${PROJECT_NUMBER}-compute@developer.gserviceaccount.com" \
    --role="roles/iam.serviceAccountTokenCreator" \
    --project="$PROJECT_ID"
```

### Result

```
bindings:
- members:
  - serviceAccount:192834930119-compute@developer.gserviceaccount.com
  role: roles/iam.serviceAccountTokenCreator
- members:
  - serviceAccount:cloud-build-deployer-sa@sql-practice-project-489106.iam.gserviceaccount.com
  role: roles/iam.serviceAccountUser
etag: BwZMMIAMVPg=
version: 1
Updated IAM policy for serviceAccount [cloud-run-sa@sql-practice-project-489106.iam.gserviceaccount.com].
```

### Comparison: Cloud Function vs Cloud Run

| Component | Runtime SA | Impersonator | Token Creator Status |
|-----------|------------|--------------|---------------------|
| Cloud Function | `db-init-sa` | Cloud Build SA | ✅ Granted (Post-Deployment Run 6) |
| Cloud Run | `cloud-run-sa` | Compute Developer SA | ✅ Granted (2026-03-04) |

### Service Account Impersonation Pattern

```
┌─────────────────────────────────────────────────────────────────┐
│  Cloud Run Deployment Flow                                      │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  gcloud run deploy duckdb-ide --service-account=cloud-run-sa   │
│       │                                                         │
│       │ Authenticated as: 192834930119-compute@developer...    │
│       │                                                         │
│       ▼                                                         │
│  Compute Developer SA needs to IMPERSONATE cloud-run-sa        │
│       │                                                         │
│       │ Requires: roles/iam.serviceAccountTokenCreator         │
│       │                                                         │
│       ▼                                                         │
│  cloud-run-sa runs as the container identity                   │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### Next Steps

Re-run the deployment command:

```bash
cd /home/vagrant/Desktop/claude-code-zai/duckdb-wasm-project && \
gcloud builds submit --config cloudbuild.yaml \
  --substitutions=_CLOUDSQL_CONNECTION=sql-practice-project-489106:us-central1:duckdb-ide-db,_DB_NAME=duckdb_ide,_DB_USER=postgres,_DB_PASSWORD_SECRET=db-password,_JWT_SECRET_SECRET=jwt-secret
```

---

# Cloud Run Deployment - Final Success (2026-03-04)

## Build ID: 318cf98b-ec53-4156-93f8-2b6db80b1e7e

### Status: ✅ SUCCESS

After multiple IAM permission attempts, the deployment succeeded.

### Root Cause

The compute developer SA (`192834930119-compute@developer.gserviceaccount.com`) lacked sufficient project-level permissions to deploy to Cloud Run.

### Final Fix Applied

1. **Granted `roles/editor` to compute developer SA** (project-level):
```bash
gcloud projects add-iam-policy-binding sql-practice-project-489106 \
    --member="serviceAccount:192834930119-compute@developer.gserviceaccount.com" \
    --role="roles/editor"
```

2. **Granted both impersonation roles on `cloud-run-sa`**:
```bash
# Token Creator
gcloud iam service-accounts add-iam-policy-binding "cloud-run-sa@..." \
    --member="serviceAccount:192834930119-compute@developer..." \
    --role="roles/iam.serviceAccountTokenCreator"

# Service Account User
gcloud iam service-accounts add-iam-policy-binding "cloud-run-sa@..." \
    --member="serviceAccount:192834930119-compute@developer..." \
    --role="roles/iam.serviceAccountUser"
```

### Deployment Details

| Step | Status | Details |
|------|--------|---------|
| **Upload** | ✅ Success | ~92 MB with .gcloudignore |
| **Docker Build** | ✅ Success | Image built and tagged |
| **Artifact Registry Push** | ✅ Success | Pushed to `duckdb-ide-repo` |
| **Cloud Run Deploy** | ✅ Success | Service deployed |

### Application URL

**https://duckdb-ide-frxi6yk4jq-uc.a.run.app**

### Infrastructure State - Complete

| Resource | Status | URL/Reference |
|----------|--------|---------------|
| **Cloud SQL** | ✅ Active | `duckdb-ide-db` (POSTGRES_15) |
| **Database** | ✅ Ready | `duckdb_ide` with tables & seed data |
| **Cloud Function** | ✅ Active | `db-init-service` deployed |
| **Cloud Run** | ✅ **LIVE** | **https://duckdb-ide-frxi6yk4jq-uc.a.run.app** |
| **Docker Image** | ✅ Ready | `duckdb-ide:latest` |
| **Secret Manager** | ✅ Ready | `db-password`, `jwt-secret` |

### Final IAM Permissions Summary

| Service Account | Roles | Purpose |
|-----------------|-------|---------|
| `192834930119-compute@developer` | `roles/editor`, `roles/run.developer` | Cloud Build deployment |
| On `cloud-run-sa` | `serviceAccountTokenCreator`, `serviceAccountUser` | Impersonation by compute dev SA |
| `cloud-run-sa` | `cloudsql.client`, `secretAccessor` | Runtime permissions |

### Cost Summary

| Resource | Monthly Cost |
|----------|--------------|
| Cloud SQL (db-f1-micro) | ~$10-15 |
| Cloud Run | FREE (within tier) |
| Cloud Functions | FREE (within tier) |
| Artifact Registry | FREE (<0.5 GB) |
| Secret Manager | ~$0.06 |
| **Total** | **~$12-21/month** |

---
# Cloud Run Public Access IAM Fix (2026-03-04)

## Issue: 403 Forbidden Error

### Error
```
Error: Forbidden
Your client does not have permission to get URL / from this server.
```

### Root Cause

Cloud Run service was deployed with `--allow-unauthenticated` flag, but the **IAM policy** was empty - no permissions were granted to invoke the service.

The `--allow-unauthenticated` flag sets the service-level configuration, but a **separate IAM binding** is required to allow `allUsers` (public) to invoke the service.

### Fix Applied

Granted `roles/run.invoker` to `allUsers`:

```bash
gcloud run services add-iam-policy-binding duckdb-ide \
    --region=us-central1 \
    --member="allUsers" \
    --role="roles/run.invoker" \
    --project="sql-practice-project-489106"
```

### Result
```
bindings:
- members:
  - allUsers
  role: roles/run.invoker
```

### Propagation Time

**IAM policy changes propagate immediately** (within seconds). No redeployment needed.

### Key Learning

Cloud Run has TWO layers of access control:

| Layer | Setting | Purpose |
|-------|---------|---------|
| **Service Config** | `--allow-unauthenticated` flag | Allows unauthenticated requests at service level |
| **IAM Policy** | `roles/run.invoker` to `allUsers` | **Required** - grants invocation permission |

**Both are required for public access.** The IAM policy is the authoritative access control.

---

# CodeMirror Local Bundling + CSP Fix (2026-03-04)

## Build ID: b3fefec5-66e7-44d4-beff-044f55a5c3c6

### Status: ✅ SUCCESS

### Issue

After initial deployment, the application loaded but was **not clickable** due to CSP violations:

```
Refused to load script from 'https://cdnjs.cloudflare.com/ajax/libs/codemirror/...'
Refused to execute inline script (CSP directive: script-src 'self')
ReferenceError: CodeMirror is not defined
```

### Root Cause

1. **CodeMirror was loaded from Cloudflare CDN** (`cdnjs.cloudflare.com`)
2. **Production CSP with Helmet defaults** blocked external scripts
3. **Local development worked** because CSP was disabled when `NODE_ENV != production`

### User Requirement

**"I don't want anything served from Cloudflare, put it in our package"**

The user explicitly requested bundling CodeMirror locally instead of using external CDN.

### Solution Implemented

#### 1. Install CodeMirror as npm dependency
```bash
npm install codemirror@5.65.16 --save
```

#### 2. Bundle CodeMirror files locally
```bash
mkdir -p public/lib/codemirror
cp -r node_modules/codemirror/lib public/lib/codemirror/
cp -r node_modules/codemirror/mode public/lib/codemirror/
cp -r node_modules/codemirror/addon public/lib/codemirror/
cp -r node_modules/codemirror/theme public/lib/codemirror/
```

#### 3. Update index.html
Changed from CDN URLs to local paths:

| Before (CDN) | After (Local) |
|--------------|---------------|
| `https://cdnjs.cloudflare.com/ajax/libs/codemirror/5.65.16/codemirror.min.css` | `/lib/codemirror/lib/codemirror.css` |
| `https://cdnjs.cloudflare.com/ajax/libs/codemirror/5.65.16/theme/dracula.min.css` | `/lib/codemirror/theme/dracula.css` |
| `https://cdnjs.cloudflare.com/ajax/libs/codemirror/5.65.16/codemirror.min.js` | `/lib/codemirror/lib/codemirror.js` |
| `https://cdnjs.cloudflare.com/ajax/libs/codemirror/5.65.16/mode/sql/sql.min.js` | `/lib/codemirror/mode/sql/sql.js` |
| `https://cdnjs.cloudflare.com/ajax/libs/codemirror/5.65.16/addon/hint/show-hint.min.js` | `/lib/codemirror/addon/hint/show-hint.js` |
| `https://cdnjs.cloudflare.com/ajax/libs/codemirror/5.65.16/addon/hint/sql-hint.min.js` | `/lib/codemirror/addon/hint/sql-hint.js` |

#### 4. Update CSP configuration ([server/config/index.js](server/config/index.js:81-98))
Removed all Cloudflare CDN references:

```javascript
// Before
'script-src': ["'self'", "'unsafe-inline'", "'unsafe-eval'", 'cdnjs.cloudflare.com'],
'style-src': ["'self'", "'unsafe-inline'", 'cdnjs.cloudflare.com'],
'font-src': ["'self'", 'cdnjs.cloudflare.com'],

// After
'script-src': ["'self'", "'unsafe-inline'", "'unsafe-eval'"],
'style-src': ["'self'", "'unsafe-inline'"],
'font-src': ["'self'"],
```

### Files Modified

| File | Changes |
|------|---------|
| [index.html](index.html:175-182) | CDN URLs → Local paths |
| [server/config/index.js](server/config/index.js:81-98) | CSP: Removed CDN references |
| [package.json](package.json:28-29) | Added `codemirror: ^5.65.16` |
| [public/lib/codemirror/](public/lib/codemirror/) | Added bundled CodeMirror files |

### Deployment

```bash
git add index.html package.json package-lock.json server/config/index.js public/
git commit -m "Bundle CodeMirror locally instead of loading from CDN"
git push origin gcp-deployment

# Manual Cloud Build (no trigger configured)
gcloud builds submit --config=cloudbuild.yaml \
  --substitutions=_CLOUDSQL_CONNECTION=sql-practice-project-489106:us-central1:duckdb-ide-db,_DB_NAME=duckdb_ide,_DB_USER=postgres,_DB_PASSWORD_SECRET=db-password,_JWT_SECRET_SECRET=jwt-secret
```

### Deployment Details

| Step | Status | Details |
|------|--------|---------|
| **Upload** | ✅ Success | 322 files, 75.3 MiB (before compression) |
| **Docker Build** | ✅ Success | |
| **Artifact Registry Push** | ✅ Success | |
| **Cloud Run Deploy** | ✅ Success | |
| **Duration** | | 1M14S |

### Benefits

1. **No external CDN dependency** - All assets served from own domain
2. **CSP compliant** - All scripts/styles from `'self'` origin
3. **Better privacy** - No requests to third-party domains
4. **Faster loading** - No DNS lookup/connection to CDN
5. **Works offline** - All dependencies bundled locally

### Application URL

**https://duckdb-ide-frxi6yk4jq-uc.a.run.app**

---
