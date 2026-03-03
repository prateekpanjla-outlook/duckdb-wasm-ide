/**
 * Terraform Outputs
 *
 * These values will be displayed after terraform apply completes
 */

output "project_id" {
  description = "GCP Project ID"
  value       = var.project_id
}

output "region" {
  description = "GCP Region"
  value       = var.region
}

output "cloudsql_connection_name" {
  description = "Cloud SQL connection name (for Cloud Run)"
  value       = "${var.project_id}:${var.region}:${google_sql_database_instance.duckdb_ide.name}"
}

output "cloudsql_instance_name" {
  description = "Cloud SQL instance name"
  value       = google_sql_database_instance.duckdb_ide.name
}

output "artifact_registry_repository" {
  description = "Artifact Registry repository path"
  value       = "${var.region}-docker.pkg.dev/${var.project_id}/${google_artifact_registry_repository.duckdb_ide.name}"
}

output "service_accounts" {
  description = "Service account emails"
  value = {
    cloud_build_deployer = google_service_account.cloud_build_deployer.email
    cloud_run            = google_service_account.cloud_run.email
    db_init              = google_service_account.db_init.email
  }
}

output "secrets" {
  description = "Secret Manager secret names"
  value = {
    db_password = google_secret_manager_secret.db_password.secret_id
    jwt_secret  = google_secret_manager_secret.jwt_secret.secret_id
  }
  sensitive = true
}

output "generated_passwords" {
  description = "Auto-generated passwords (if any)"
  value = {
    db_password = var.db_password == "" ? (length(random_password.db_password) > 0 ? random_password.db_password[0].result : "See Secret Manager") : "Provided via variable"
    jwt_secret  = var.jwt_secret == "" ? (length(random_password.jwt_secret) > 0 ? random_password.jwt_secret[0].result : "See Secret Manager") : "Provided via variable"
  }
  sensitive = true
}

output "next_steps" {
  description = "Next steps after Terraform deployment"
  value = <<-EOT
    1. Create GitHub Cloud Build Trigger:
       Go to: https://console.cloud.google.com/cloud-build/triggers
       Or run: gcloud builds triggers create github ...

    2. Deploy Cloud Function (db-init-service):
       cd server/cloud-functions/db-init
       gcloud functions deploy db-init-service --gen2 ...

    3. Initialize database:
       curl -X POST https://db-init-service-xxxxx.run.app/init

    4. Push code to gcp-deployment branch to trigger Cloud Build
  EOT
}
