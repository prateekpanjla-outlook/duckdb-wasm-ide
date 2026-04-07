output "cloud_run_url" {
  description = "Cloud Run service URL"
  value       = google_cloud_run_v2_service.app.uri
}

output "cloud_sql_connection_name" {
  description = "Cloud SQL connection name for Auth Proxy"
  value       = google_sql_database_instance.postgres.connection_name
}

output "artifact_registry_url" {
  description = "Artifact Registry repository URL"
  value       = "${var.region}-docker.pkg.dev/${var.project_id}/${var.artifact_registry_repo}"
}

output "runtime_sa_email" {
  description = "Cloud Run runtime service account"
  value       = google_service_account.runtime.email
}

output "deployer_sa_email" {
  description = "CI/CD deployer service account"
  value       = google_service_account.deployer.email
}

output "terraform_sa_email" {
  description = "Terraform deployer service account"
  value       = google_service_account.terraform.email
}
