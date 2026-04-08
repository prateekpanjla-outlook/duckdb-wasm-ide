terraform {
  backend "gcs" {
    bucket = "sql-practice-terraform-state"
    prefix = "terraform/state"
  }
}
