#!/bin/bash
#
# Setup Terraform Service Account for GCP Authentication
#
# This script creates a dedicated service account for Terraform
# with appropriate permissions and downloads the credentials file.
#
# Usage:
#   ./setup-auth.sh

set -e

# Configuration
PROJECT_ID="sql-practice-project-489106"
SA_NAME="terraform-deployer"
SA_DISPLAY_NAME="Terraform Deployer"
KEY_FILE="terraform-key.json"

echo "========================================"
echo "Terraform Service Account Setup"
echo "========================================"
echo "Project: $PROJECT_ID"
echo ""

# Check if gcloud is installed
if ! command -v gcloud &> /dev/null; then
    echo "❌ Error: gcloud CLI is not installed"
    echo "Install from: https://cloud.google.com/sdk/docs/install"
    exit 1
fi

# Check current authentication
echo "📋 Checking current authentication..."
if gcloud auth list --filter="status:ACTIVE" --format="value(account)" | grep -q .; then
    CURRENT_ACCOUNT=$(gcloud auth list --filter="status:ACTIVE" --format="value(account)")
    echo "✅ Currently authenticated as: $CURRENT_ACCOUNT"
else
    echo "⚠️  No active authentication found"
    echo "Please run: gcloud auth login"
    exit 1
fi

# Create service account
echo ""
echo "🔧 Creating service account: $SA_NAME..."
if gcloud iam service-accounts describe "$SA_NAME@$PROJECT_ID.iam.gserviceaccount.com" --project="$PROJECT_ID" &> /dev/null; then
    echo "⚠️  Service account already exists"
else
    gcloud iam service-accounts create "$SA_NAME" \
        --project="$PROJECT_ID" \
        --display-name="$SA_DISPLAY_NAME" \
        --description="Service account for Terraform infrastructure deployment"
    echo "✅ Service account created"
fi

SA_EMAIL="$SA_NAME@$PROJECT_ID.iam.gserviceaccount.com"

# Grant permissions
echo ""
echo "🔐 Granting permissions..."

# Editor role (broad but required for creating resources)
echo "  - roles/editor"
gcloud projects add-iam-policy-binding "$PROJECT_ID" \
    --member="serviceAccount:$SA_EMAIL" \
    --role="roles/editor" \
    --condition=None \
    --quiet 2>/dev/null || echo "    (Already has permissions)"

# Service Account User (to manage other service accounts)
echo "  - roles/iam.serviceAccountUser"
gcloud projects add-iam-policy-binding "$PROJECT_ID" \
    --member="serviceAccount:$SA_EMAIL" \
    --role="roles/iam.serviceAccountUser" \
    --condition=None \
    --quiet 2>/dev/null || echo "    (Already has permissions)"

# Service Usage Admin (to enable APIs)
echo "  - roles/serviceusage.serviceUsageAdmin"
gcloud projects add-iam-policy-binding "$PROJECT_ID" \
    --member="serviceAccount:$SA_EMAIL" \
    --role="roles/serviceusage.serviceUsageAdmin" \
    --condition=None \
    --quiet 2>/dev/null || echo "    (Already has permissions)"

echo "✅ Permissions granted"

# Check if key file already exists
if [ -f "$KEY_FILE" ]; then
    echo ""
    read -p "⚠️  $KEY_FILE already exists. Overwrite? (y/N): " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        echo "Keeping existing key file"
        echo ""
        echo "✅ Setup complete!"
        echo ""
        echo "Set the environment variable:"
        echo "  export GOOGLE_APPLICATION_CREDENTIALS=$(pwd)/$KEY_FILE"
        exit 0
    fi
    rm -f "$KEY_FILE"
fi

# Create and download key
echo ""
echo "🔑 Creating service account key..."
gcloud iam service-accounts keys create "$KEY_FILE" \
    --project="$PROJECT_ID" \
    --iam-account="$SA_EMAIL" \
    --key-type="TYPE_GOOGLE_CREDENTIALS_FILE"

# Set permissions on key file
chmod 600 "$KEY_FILE"

echo ""
echo "========================================"
echo "✅ Setup Complete!"
echo "========================================"
echo ""
echo "Service Account: $SA_EMAIL"
echo "Key File: $KEY_FILE"
echo ""
echo "Next steps:"
echo ""
echo "1. Set the environment variable:"
echo "   export GOOGLE_APPLICATION_CREDENTIALS=$(pwd)/$KEY_FILE"
echo ""
echo "2. Verify authentication:"
echo "   terraform init"
echo "   terraform plan"
echo ""
echo "3. Apply the infrastructure:"
echo "   terraform apply"
echo ""
echo "⚠️  SECURITY NOTES:"
echo "   - Never commit $KEY_FILE to git"
echo "   - $KEY_FILE is already in .gitignore"
echo "   - Keep this file secure and private"
echo "   - Rotate keys periodically"
echo ""
