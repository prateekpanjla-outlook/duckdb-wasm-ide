#!/bin/bash
#
# Post-Terraform Deployment Script
#
# This script handles the steps after Terraform infrastructure creation:
# 1. Sets GCP configuration (project, region, zone)
# 2. Deploys Cloud Function (db-init-service)
# 3. Optionally initializes database
#
# Usage:
#   ./deploy-next-steps.sh [--init-db]

# ============================================================================
# CONFIGURATION
# ============================================================================
PROJECT_ID="sql-practice-project-489106"
REGION="us-central1"
ZONE="us-central1-a"
DB_NAME="duckdb_ide"  # Fallback if terraform output not available

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Script directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TERRAFORM_DIR="$SCRIPT_DIR/terraform/first-time-deployment"
CLOUD_FUNCTION_DIR="$SCRIPT_DIR/server/cloud-functions/db-init"

# Create logs directory
LOG_DIR="$SCRIPT_DIR/logs"
mkdir -p "$LOG_DIR"

# Log file with timestamp
TS=$(date +%Y%m%d-%H%M%S)
LOG_FILE="$LOG_DIR/deploy-next-steps-$TS.log"

# Helper functions
log_info() { echo -e "${GREEN}[INFO]${NC} $1" | tee -a "$LOG_FILE"; }
log_warn() { echo -e "${YELLOW}[WARN]${NC} $1" | tee -a "$LOG_FILE"; }
log_error() { echo -e "${RED}[ERROR]${NC} $1" | tee -a "$LOG_FILE"; }
log_step() { echo -e "${BLUE}=== $1 ===${NC}" | tee -a "$LOG_FILE"; }

# Function to run command and log output
run_cmd() {
    local cmd="$*"
    echo "" | tee -a "$LOG_FILE"
    echo "[CMD] $cmd" | tee -a "$LOG_FILE"
    eval "$cmd" 2>&1 | tee -a "$LOG_FILE"
}

# ============================================================================
# START LOGGING
# ============================================================================
log_step "Post-Terraform Deployment Started"
log_info "Log file: $LOG_FILE"
echo "" | tee -a "$LOG_FILE"

# ============================================================================
# STEP 0: Set GCP Configuration
# ============================================================================
log_step "Step 0: Setting GCP Configuration"

log_info "Setting project: $PROJECT_ID"
run_cmd "gcloud config set project $PROJECT_ID"

log_info "Setting region: $REGION"
run_cmd "gcloud config set compute/region $REGION"

log_info "Setting zone: $ZONE"
run_cmd "gcloud config set compute/zone $ZONE"

log_info "Current gcloud configuration:"
run_cmd "gcloud config list project/region/zone 2>/dev/null || true"

echo "" | tee -a "$LOG_FILE"

# ============================================================================
# STEP 1: Get Terraform Outputs
# ============================================================================
log_step "Step 1: Getting Terraform Outputs"

cd "$TERRAFORM_DIR"

# Get outputs with error handling and fallbacks
CONNECTION_NAME=$(terraform output -raw cloudsql_connection_name 2>/dev/null || echo "")
ARTIFACT_REGISTRY=$(terraform output -raw artifact_registry_repository 2>/dev/null || echo "")
VPC_CONNECTOR=$(terraform output -raw vpc_connector_name 2>/dev/null || echo "")

# Try to get db_name from terraform, otherwise use fallback
DB_NAME_OUTPUT=$(terraform output -raw db_name 2>/dev/null || echo "")
if [[ -n "$DB_NAME_OUTPUT" ]]; then
    DB_NAME="$DB_NAME_OUTPUT"
fi

# Get service accounts with error handling and fallbacks
CLOUDRUN_SA=$(terraform output -json service_accounts 2>/dev/null | jq -r '.cloud_run' // "" 2>/dev/null)
if [[ -z "$CLOUDRUN_SA" ]]; then
    CLOUDRUN_SA="cloud-run-sa@$PROJECT_ID.iam.gserviceaccount.com"
fi

DB_INIT_SA=$(terraform output -json service_accounts 2>/dev/null | jq -r '.db_init' // "" 2>/dev/null)
if [[ -z "$DB_INIT_SA" ]]; then
    DB_INIT_SA="db-init-sa@$PROJECT_ID.iam.gserviceaccount.com"
fi

CLOUDBUILD_SA=$(terraform output -json service_accounts 2>/dev/null | jq -r '.cloud_build_deployer' // "" 2>/dev/null)
if [[ -z "$CLOUDBUILD_SA" ]]; then
    CLOUDBUILD_SA="cloud-build-deployer-sa@$PROJECT_ID.iam.gserviceaccount.com"
fi

# Display outputs
{
    echo "Terraform Outputs:"
    echo "  Project:              $PROJECT_ID"
    echo "  Region:               $REGION"
    echo "  Zone:                 $ZONE"
    echo "  Cloud SQL Connection: $CONNECTION_NAME"
    echo "  Database Name:        $DB_NAME"
    echo "  Artifact Registry:    $ARTIFACT_REGISTRY"
    echo "  VPC Connector:        $VPC_CONNECTOR"
    echo ""
    echo "Service Accounts:"
    echo "  Cloud Run:       $CLOUDRUN_SA"
    echo "  DB Init:         $DB_INIT_SA"
    echo "  Cloud Build:     $CLOUDBUILD_SA"
} | tee -a "$LOG_FILE"

echo ""

# ============================================================================
# STEP 2: Deploy Cloud Function (db-init-service)
# ============================================================================
log_step "Step 2: Deploying Cloud Function (db-init-service)"

cd "$CLOUD_FUNCTION_DIR"

FUNCTION_URL=""
REDEPLOY="no"

# Check if function already exists
if gcloud functions describe db-init-service --region="$REGION" &>/dev/null; then
    FUNCTION_URL=$(gcloud functions describe db-init-service --region="$REGION" --format="value(serviceConfig.uri)" 2>/dev/null || echo "")
    echo "" | tee -a "$LOG_FILE"
    log_warn "Cloud Function 'db-init-service' already exists."
    echo -n "Redeploy? (y/N): " | tee -a "$LOG_FILE"
    read -r RESPONSE
    echo "Response: $RESPONSE" >> "$LOG_FILE"
    if [[ "$RESPONSE" =~ ^[Yy]$ ]]; then
        REDEPLOY="yes"
        log_info "Redeploying..."
    else
        log_info "Skipping Cloud Function deployment."
        log_info "Cloud Function URL: $FUNCTION_URL"
    fi
else
    REDEPLOY="yes"
fi

if [[ "$REDEPLOY" == "yes" ]]; then
    log_info "Deploying db-init-service..."

    # Build deploy command with proper handling of empty variables
    DEPLOY_ARGS=(
        --gen2
        --region="$REGION"
        --runtime=nodejs20
        --source=.
        --entry-point=initDatabase
        --trigger-http
        --allow-unauthenticated
        --memory=512Mi
        --timeout=300s
        --set-env-vars="DB_NAME=$DB_NAME,DB_USER=postgres"
        --set-secrets="DB_PASSWORD=db-password:latest"
        --service-account="$DB_INIT_SA"
    )

    # Only add --vpc-connector if VPC_CONNECTOR is not empty
    if [[ -n "$VPC_CONNECTOR" ]]; then
        DEPLOY_ARGS+=(--vpc-connector="$VPC_CONNECTOR")
    fi

    echo "" | tee -a "$LOG_FILE"
    echo "[CMD] gcloud functions deploy db-init-service ${DEPLOY_ARGS[*]}" | tee -a "$LOG_FILE"
    gcloud functions deploy db-init-service "${DEPLOY_ARGS[@]}" 2>&1 | tee -a "$LOG_FILE"

    FUNCTION_URL=$(gcloud functions describe db-init-service --region="$REGION" --format="value(serviceConfig.uri)" 2>/dev/null || echo "")

    if [[ -n "$FUNCTION_URL" ]]; then
        log_info "Cloud Function deployed successfully!"
    else
        log_error "Cloud Function deployment may have failed (URL not found)"
    fi
fi

echo "" | tee -a "$LOG_FILE"
log_info "Cloud Function URL: $FUNCTION_URL" | tee -a "$LOG_FILE"

# ============================================================================
# STEP 3: Initialize Database (optional)
# ============================================================================
log_step "Step 3: Database Initialization"

if [[ "$1" == "--init-db" ]]; then
    if [[ -z "$FUNCTION_URL" ]]; then
        log_error "Cannot initialize database - FUNCTION_URL is empty"
        log_error "Cloud Function may not have deployed successfully"
    else
        log_info "Initializing database..."

        # Wait a bit for function to be ready
        sleep 5

        echo "" | tee -a "$LOG_FILE"
        log_info "Running /init endpoint..."
        run_cmd "curl -s -X POST $FUNCTION_URL/init"

        echo "" | tee -a "$LOG_FILE"
        log_info "Running /seed endpoint..."
        run_cmd "curl -s -X POST $FUNCTION_URL/seed"
    fi
else
    log_warn "Database initialization skipped."
    echo "" | tee -a "$LOG_FILE"

    if [[ -n "$FUNCTION_URL" ]]; then
        echo "To initialize the database later, run:" | tee -a "$LOG_FILE"
        echo "  curl -X POST $FUNCTION_URL/init" | tee -a "$LOG_FILE"
        echo "  curl -X POST $FUNCTION_URL/seed" | tee -a "$LOG_FILE"
    else
        log_warn "No function URL available - check deployment errors above"
    fi
fi

echo "" | tee -a "$LOG_FILE"

# ============================================================================
# STEP 4: Cloud Build Trigger Instructions
# ============================================================================
log_step "Step 4: Cloud Build Trigger Setup"

REPO="prateekpanjla-outlook/duckdb-wasm-ide"
BRANCH="gcp-deployment"

{
    echo "Cloud Build Trigger requires manual setup via console:"
    echo ""
    echo "1. Open Cloud Build Triggers:"
    echo "   https://console.cloud.google.com/cloud-build/triggers?project=$PROJECT_ID"
    echo ""
    echo "2. Click 'Create Trigger' and configure:"
    echo "   - Name: deploy-gcp-deployment"
    echo "   - Event: Push to a branch"
    echo "   - Repository: $REPO"
    echo "   - Branch: ^$BRANCH$"
    echo "   - Build configuration: cloudbuild.yaml"
    echo "   - Service account: $CLOUDBUILD_SA"
    echo ""
    echo "Or use gcloud command (requires GitHub connection):"
    echo ""
    echo "gcloud builds triggers create github \\"
    echo "    --name=\"deploy-gcp-deployment\" \\"
    echo "    --branch-pattern=\"^$BRANCH\$\" \\"
    echo "    --build-config=\"$SCRIPT_DIR/cloudbuild.yaml\" \\"
    echo "    --service-account=\"$CLOUDBUILD_SA\" \\"
    echo "    --repo=\"$REPO\""
} | tee -a "$LOG_FILE"

echo "" | tee -a "$LOG_FILE"

# ============================================================================
# STEP 5: Deploy Application
# ============================================================================
log_step "Step 5: Deploy Application Instructions"

{
    echo "To deploy the application:"
    echo ""
    echo "1. Push to $BRANCH branch:"
    echo "   git push origin $BRANCH"
    echo ""
    echo "2. Monitor build:"
    echo "   gcloud builds list --limit=5"
    echo ""
    echo "3. Get Cloud Run URL:"
    echo "   gcloud run services describe duckdb-ide --region=$REGION --format='value(status.url)'"
} | tee -a "$LOG_FILE"

echo "" | tee -a "$LOG_FILE"

# ============================================================================
# SUMMARY
# ============================================================================
log_step "Summary"

{
    echo "✅ GCP Configuration:"
    echo "   Project: $PROJECT_ID"
    echo "   Region:  $REGION"
    echo "   Zone:    $ZONE"
    echo ""
    if [[ -n "$FUNCTION_URL" ]]; then
        echo "✅ Cloud Function: $FUNCTION_URL"
    else
        echo "❌ Cloud Function: Deployment failed - check logs above"
    fi
    echo ""
    echo "⏳  Remaining Steps:"
    echo "   1. Create Cloud Build Trigger (see instructions above)"
    echo "   2. Run: git push origin $BRANCH"
    echo ""
    echo "📁 Log file: $LOG_FILE"
} | tee -a "$LOG_FILE"

log_info "Done!"
