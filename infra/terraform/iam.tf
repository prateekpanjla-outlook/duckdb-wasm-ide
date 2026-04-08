# =============================================================================
# Service Accounts
# =============================================================================

resource "google_service_account" "terraform" {
  account_id   = "sql-practice-terraform"
  display_name = "SQL Practice Terraform Deployer"
}

resource "google_service_account" "deployer" {
  account_id   = "sql-practice-deployer"
  display_name = "SQL Practice CI/CD Deployer"
}

resource "google_service_account" "runtime" {
  account_id   = "sql-practice-runtime"
  display_name = "SQL Practice Cloud Run Runtime"
}

# =============================================================================
# Terraform SA — project-level roles (10)
# =============================================================================

resource "google_project_iam_member" "terraform" {
  for_each = toset([
    "roles/iam.serviceAccountTokenCreator",
    "roles/run.admin",
    "roles/iam.serviceAccountUser",
    "roles/artifactregistry.admin",
    "roles/secretmanager.admin",
    "roles/cloudsql.admin",
    "roles/iam.serviceAccountAdmin",
    "roles/resourcemanager.projectIamAdmin",
    "roles/serviceusage.serviceUsageAdmin",
    "roles/storage.admin",
  ])

  project = var.project_id
  role    = each.value
  member  = "serviceAccount:${google_service_account.terraform.email}"
}

# =============================================================================
# CI/CD Deployer SA — project-level roles (4)
# =============================================================================

resource "google_project_iam_member" "deployer" {
  for_each = toset([
    "roles/run.developer",
    "roles/artifactregistry.writer",
    "roles/secretmanager.secretAccessor",
    "roles/logging.logWriter",
    "roles/storage.objectViewer",
    "roles/serviceusage.serviceUsageConsumer",
    "roles/cloudbuild.builds.editor",
  ])

  project = var.project_id
  role    = each.value
  member  = "serviceAccount:${google_service_account.deployer.email}"
}

# Deployer can act-as runtime SA only (scoped, not project-wide)
resource "google_service_account_iam_member" "deployer_acts_as_runtime" {
  service_account_id = google_service_account.runtime.name
  role               = "roles/iam.serviceAccountUser"
  member             = "serviceAccount:${google_service_account.deployer.email}"
}

# =============================================================================
# Runtime SA — project-level roles (2)
# =============================================================================

resource "google_project_iam_member" "runtime" {
  for_each = toset([
    "roles/cloudsql.client",
    "roles/secretmanager.secretAccessor",
  ])

  project = var.project_id
  role    = each.value
  member  = "serviceAccount:${google_service_account.runtime.email}"
}

# Note: runtime SA has secretmanager.secretAccessor at project level (above),
# not at individual secret level. This is sufficient for 2 secrets.
# If the project grows, consider scoping to specific secrets.
