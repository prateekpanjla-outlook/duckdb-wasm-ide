terraform {
  required_version = ">= 1.5"

  required_providers {
    google = {
      source  = "hashicorp/google"
      version = "~> 5.0"
    }
  }
}

provider "google" {
  project = var.project_id
  region  = var.region
  # Impersonation handled by ADC:
  #   gcloud auth application-default login \
  #     --impersonate-service-account=sql-practice-terraform@PROJECT.iam.gserviceaccount.com
  # For GitHub Actions: WIF handles it (task #94)
}
