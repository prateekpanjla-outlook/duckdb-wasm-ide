# =============================================================================
# GCP APIs
# =============================================================================

resource "google_project_service" "apis" {
  for_each = toset([
    "run.googleapis.com",
    "sqladmin.googleapis.com",
    "artifactregistry.googleapis.com",
    "secretmanager.googleapis.com",
    "cloudbuild.googleapis.com",
    "iam.googleapis.com",
  ])

  service            = each.value
  disable_on_destroy = false
}

# =============================================================================
# Artifact Registry
# =============================================================================

resource "google_artifact_registry_repository" "app" {
  location      = var.region
  repository_id = var.artifact_registry_repo
  format        = "DOCKER"

  depends_on = [google_project_service.apis]
}

# =============================================================================
# Cloud SQL — PostgreSQL 16
# =============================================================================

resource "google_sql_database_instance" "postgres" {
  name             = var.cloud_sql_instance_name
  database_version = "POSTGRES_16"
  region           = var.region

  settings {
    tier              = var.cloud_sql_tier
    disk_size         = var.cloud_sql_disk_size
    disk_autoresize   = false
    availability_type = "ZONAL"

    ip_configuration {
      ipv4_enabled = true  # needed for Cloud SQL Auth Proxy from Cloud Run
    }

    backup_configuration {
      enabled = false  # cost optimization for practice project
    }
  }

  deletion_protection = true

  depends_on = [google_project_service.apis]
}

resource "google_sql_database" "app" {
  name     = var.database_name
  instance = google_sql_database_instance.postgres.name
}

resource "google_sql_user" "app" {
  name     = var.database_user
  instance = google_sql_database_instance.postgres.name
  password = data.google_secret_manager_secret_version.db_password.secret_data
}

# =============================================================================
# Secret Manager
# =============================================================================

resource "google_secret_manager_secret" "db_password" {
  secret_id = "db-password"

  replication {
    auto {}
  }

  depends_on = [google_project_service.apis]
}

resource "google_secret_manager_secret" "jwt_secret" {
  secret_id = "jwt-secret"

  replication {
    auto {}
  }

  depends_on = [google_project_service.apis]
}

# Read current secret values (for Cloud SQL user password)
data "google_secret_manager_secret_version" "db_password" {
  secret = google_secret_manager_secret.db_password.id
}

# =============================================================================
# Cloud Run
# =============================================================================

resource "google_cloud_run_v2_service" "app" {
  name     = var.cloud_run_service_name
  location = var.region

  template {
    service_account = google_service_account.runtime.email

    scaling {
      max_instance_count = var.cloud_run_max_instances
    }

    containers {
      image = "${var.region}-docker.pkg.dev/${var.project_id}/${var.artifact_registry_repo}/${var.cloud_run_service_name}:latest"

      ports {
        container_port = 8080
      }

      resources {
        limits = {
          cpu    = var.cloud_run_cpu
          memory = var.cloud_run_memory
        }
      }

      env {
        name  = "DB_HOST"
        value = "/cloudsql/${var.project_id}:${var.region}:${var.cloud_sql_instance_name}"
      }
      env {
        name  = "DB_PORT"
        value = "5432"
      }
      env {
        name  = "DB_NAME"
        value = var.database_name
      }
      env {
        name  = "DB_USER"
        value = var.database_user
      }
      env {
        name  = "JWT_EXPIRES_IN"
        value = "7d"
      }
      env {
        name  = "NODE_ENV"
        value = "production"
      }
      env {
        name = "DB_PASSWORD"
        value_source {
          secret_key_ref {
            secret  = google_secret_manager_secret.db_password.secret_id
            version = "latest"
          }
        }
      }
      env {
        name = "JWT_SECRET"
        value_source {
          secret_key_ref {
            secret  = google_secret_manager_secret.jwt_secret.secret_id
            version = "latest"
          }
        }
      }
    }

    volumes {
      name = "cloudsql"
      cloud_sql_instance {
        instances = ["${var.project_id}:${var.region}:${var.cloud_sql_instance_name}"]
      }
    }
  }

  depends_on = [
    google_project_service.apis,
    google_sql_database_instance.postgres,
  ]
}

# Allow unauthenticated access (public web app)
resource "google_cloud_run_v2_service_iam_member" "public" {
  name     = google_cloud_run_v2_service.app.name
  location = var.region
  role     = "roles/run.invoker"
  member   = "allUsers"
}
