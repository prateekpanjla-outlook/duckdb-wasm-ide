/**
 * Terraform Variables for First-Time GCP Deployment
 *
 * Configure these values before running terraform apply
 */

variable "project_id" {
  description = "GCP Project ID"
  type        = string
  default     = "sql-practice-project-489106"
}

variable "region" {
  description = "GCP Region for resources"
  type        = string
  default     = "us-central1"
}

variable "db_name" {
  description = "Cloud SQL database name"
  type        = string
  default     = "duckdb_ide"
}

variable "db_password" {
  description = "Database password (leave empty to auto-generate)"
  type        = string
  default     = ""
  sensitive   = true
}

variable "jwt_secret" {
  description = "JWT secret (leave empty to auto-generate)"
  type        = string
  default     = ""
  sensitive   = true
}

variable "deletion_protection" {
  description = "Enable deletion protection on Cloud SQL instance"
  type        = bool
  default     = true
}
