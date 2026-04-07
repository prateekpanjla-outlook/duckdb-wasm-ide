# Remote state in GCS — create the bucket first (task #85)
# Uncomment after bucket exists:
#
# terraform {
#   backend "gcs" {
#     bucket = "sql-practice-terraform-state"
#     prefix = "terraform/state"
#   }
# }

# Using local state until GCS bucket is created
