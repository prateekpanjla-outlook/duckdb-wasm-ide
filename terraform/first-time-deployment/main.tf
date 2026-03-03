/**
 * First-Time GCP Deployment - Terraform Configuration
 *
 * This script automates the initial setup of all GCP resources required
 * for deploying the DuckDB WASM IDE application.
 *
 * Resources created:
 * - Enables required GCP APIs
 * - Artifact Registry repository
 * - Cloud SQL instance (PostgreSQL)
 * - Secret Manager secrets
 * - Service accounts with IAM permissions
 * - Cloud Build trigger (manual setup required - see README)
 *
 * Usage:
 *   terraform init
 *   terraform apply
 */

terraform {
  required_version = ">= 1.0"
  required_providers {
    google = {
      source  = "hashicorp/google"
      version = "~> 5.0"
    }
  }
}

/**
 * Provider Configuration
 * Project ID and region are loaded from variables.tf
 */
provider "google" {
  project = var.project_id
  region  = var.region
}

/**
 * ============================================================
 * STEP 1: Enable Required APIs
 * ============================================================
 */
resource "google_project_service" "apis" {
  for_each = toset([
    "cloudbuild.googleapis.com",
    "run.googleapis.com",
    "artifactregistry.googleapis.com",
    "sqladmin.googleapis.com",
    "secretmanager.googleapis.com",
    "cloudfunctions.googleapis.com",
    "iam.googleapis.com",
  ])

  project            = var.project_id
  service            = each.key
  disable_on_destroy = false
}

/**
 * ============================================================
 * STEP 2: Artifact Registry Repository
 * ============================================================
 */
resource "google_artifact_registry_repository" "duckdb_ide" {
  location      = var.region
  repository_id = "duckdb-ide-repo"
  description   = "Docker repository for DuckDB WASM IDE"
  format        = "DOCKER"

  depends_on = [google_project_service.apis]
}

/**
 * ============================================================
 * STEP 3: Cloud SQL Instance
 * ============================================================
 */
resource "google_sql_database_instance" "duckdb_ide" {
  name             = "duckdb-ide-db"
  region           = var.region
  database_version = "POSTGRES_15"
  project          = var.project_id

  settings {
    tier              = "db-f1-micro"
    edition           = "ENTERPRISE"  # Required for Free Trial
    disk_autoresize   = true
    disk_size         = 10
    disk_type         = "PD_SSD"
    availability_type = "REGIONAL"

    backup_configuration {
      enabled            = true
      start_time         = "03:00"
      point_in_time_recovery_enabled = false
    }

    ip_configuration {
      # Private IP only (recommended)
      ipv4_enabled    = false
      private_network = null  # Set to VPC self link for private IP
      enable_private_path_for_google_cloud_services = true

      # Require SSL connections
      ssl_mode = "ENCRYPTED_ONLY"
    }

    # Deletion protection - prevents accidental deletion
    deletion_protection_enabled = var.deletion_protection
  }

  deletion_protection = var.deletion_protection

  depends_on = [google_project_service.apis]
}

/**
 * Cloud SQL Database
 */
resource "google_sql_database" "duckdb_ide" {
  name     = var.db_name
  instance = google_sql_database_instance.duckdb_ide.name
  project  = var.project_id
}

/**
 * ============================================================
 * STEP 4: Secret Manager Secrets
 * ============================================================
 */

/**
 * Database Password Secret
 * NOTE: Initial value must be set manually after creation
 * or use Terraform's random password resource
 */
resource "google_secret_manager_secret" "db_password" {
  secret_id = "db-password"
  project   = var.project_id

  replication {
    auto {}
  }

  depends_on = [google_project_service.apis]
}

/**
 * Database Password Secret Version
 * Generates a random password on initial creation
 */
resource "google_secret_manager_secret_version" "db_password" {
  secret      = google_secret_manager_secret.db_password.id
  secret_data = var.db_password != "" ? var.db_password : random_password.db_password[0].result

  # Only create if secret doesn't exist
  count       = var.db_password == "" ? 1 : 0
}

resource "random_password" "db_password" {
  count   = var.db_password == "" ? 1 : 0
  length  = 32
  special = false
}

/**
 * JWT Secret
 */
resource "google_secret_manager_secret" "jwt_secret" {
  secret_id = "jwt-secret"
  project   = var.project_id

  replication {
    auto {}
  }

  depends_on = [google_project_service.apis]
}

resource "google_secret_manager_secret_version" "jwt_secret" {
  secret      = google_secret_manager_secret.jwt_secret.id
  secret_data = var.jwt_secret != "" ? var.jwt_secret : random_password.jwt_secret[0].result

  count       = var.jwt_secret == "" ? 1 : 0
}

resource "random_password" "jwt_secret" {
  count   = var.jwt_secret == "" ? 1 : 0
  length  = 64
  special = false
}

/**
 * ============================================================
 * STEP 5: Service Accounts
 * ============================================================
 */

/**
 * Cloud Build Deployer Service Account
 */
resource "google_service_account" "cloud_build_deployer" {
  project      = var.project_id
  account_id   = "cloud-build-deployer-sa"
  display_name = "Cloud Build Deployer"
  description  = "Service account for Cloud Build to deploy Cloud Run and Cloud Functions"
}

/**
 * Cloud Run Service Account
 */
resource "google_service_account" "cloud_run" {
  project      = var.project_id
  account_id   = "cloud-run-sa"
  display_name = "Cloud Run Application"
  description  = "Service account for duckdb-ide Cloud Run service"
}

/**
 * Cloud Functions Service Account
 */
resource "google_service_account" "db_init" {
  project      = var.project_id
  account_id   = "db-init-sa"
  display_name = "Database Initialization Service"
  description  = "Service account for db-init Cloud Function"
}

/**
 * ============================================================
 * STEP 6: IAM Permissions
 * ============================================================
 */

/**
 * Cloud Build Deployer Permissions
 */
resource "google_project_iam_member" "cloudbuild_run_developer" {
  project = var.project_id
  role    = "roles/run.developer"
  member  = "serviceAccount:${google_service_account.cloud_build_deployer.email}"
}

resource "google_project_iam_member" "cloudbuild_cloudfunctions_developer" {
  project = var.project_id
  role    = "roles/cloudfunctions.developer"
  member  = "serviceAccount:${google_service_account.cloud_build_deployer.email}"
}

resource "google_artifact_registry_repository_iam_member" "cloudbuild_artifact_writer" {
  location   = var.region
  repository = google_artifact_registry_repository.duckdb_ide.name
  role       = "roles/artifactregistry.writer"
  member     = "serviceAccount:${google_service_account.cloud_build_deployer.email}"
}

/**
 * Service Account Impersonation Permissions
 * Allows Cloud Build Deployer to act as Cloud Run and Cloud Functions SA
 */
resource "google_service_account_iam_member" "cloudbuild_impersonate_cloud_run" {
  service_account_id = google_service_account.cloud_run.name
  role               = "roles/iam.serviceAccountUser"
  member             = "serviceAccount:${google_service_account.cloud_build_deployer.email}"
}

resource "google_service_account_iam_member" "cloudbuild_impersonate_db_init" {
  service_account_id = google_service_account.db_init.name
  role               = "roles/iam.serviceAccountUser"
  member             = "serviceAccount:${google_service_account.cloud_build_deployer.email}"
}

/**
 * Cloud Run Service Account Permissions
 */
resource "google_project_iam_member" "cloudrun_cloudsql_client" {
  project = var.project_id
  role    = "roles/cloudsql.client"
  member  = "serviceAccount:${google_service_account.cloud_run.email}"
}

resource "google_secret_manager_secret_iam_member" "cloudrun_db_password" {
  secret_id = google_secret_manager_secret.db_password.id
  role      = "roles/secretmanager.secretAccessor"
  member    = "serviceAccount:${google_service_account.cloud_run.email}"
}

resource "google_secret_manager_secret_iam_member" "cloudrun_jwt_secret" {
  secret_id = google_secret_manager_secret.jwt_secret.id
  role      = "roles/secretmanager.secretAccessor"
  member    = "serviceAccount:${google_service_account.cloud_run.email}"
}

/**
 * Cloud Functions Service Account Permissions
 */
resource "google_project_iam_member" "dbinit_cloudsql_client" {
  project = var.project_id
  role    = "roles/cloudsql.client"
  member  = "serviceAccount:${google_service_account.db_init.email}"
}

resource "google_secret_manager_secret_iam_member" "dbinit_db_password" {
  secret_id = google_secret_manager_secret.db_password.id
  role      = "roles/secretmanager.secretAccessor"
  member    = "serviceAccount:${google_service_account.db_init.email}"
}

/**
 * ============================================================
 * STEP 7: Cloud SQL User (for Cloud Functions)
 * ============================================================
 */
resource "google_sql_user" "postgres" {
  name     = "postgres"
  instance = google_sql_database_instance.duckdb_ide.name
  project  = var.project_id
  password = var.db_password != "" ? var.db_password : random_password.db_password[0].result
}
