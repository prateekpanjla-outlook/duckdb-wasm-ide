# Terraform Learnings & Gotchas

Documented during initial Terraform setup for sql-practice-project-489106.

## 1. ADC impersonation requires explicit tokenCreator grant

**Problem:** `roles/owner` at project level includes `iam.serviceAccounts.getAccessToken`, but ADC-based impersonation still fails with `Permission 'iam.serviceAccounts.getAccessToken' denied`.

**Root cause:** ADC uses Google's OAuth client (`764086051850-...`) which goes through a different code path than `gcloud` CLI. The SA-level IAM binding is evaluated before project-level inheritance in this flow.

**Fix:** Grant `roles/iam.serviceAccountTokenCreator` explicitly on the SA resource:

```bash
gcloud iam service-accounts add-iam-policy-binding \
  sql-practice-terraform@PROJECT.iam.gserviceaccount.com \
  --member="user:YOUR_EMAIL" \
  --role="roles/iam.serviceAccountTokenCreator"
```

**Lesson:** Always grant `tokenCreator` explicitly on the SA when using impersonation, even if you have `roles/owner`.

## 2. gcloud auth login != Application Default Credentials

Two separate credential stores on the same machine:

| Store | Created by | Used by |
|-------|-----------|---------|
| gcloud auth | `gcloud auth login` | gcloud CLI only |
| ADC | `gcloud auth application-default login` | Terraform, Python SDKs, Node SDKs |

Having one does not give you the other. Terraform needs ADC.

For impersonation, use:
```bash
gcloud auth application-default login \
  --impersonate-service-account=sql-practice-terraform@PROJECT.iam.gserviceaccount.com
```

This creates an ADC file that automatically exchanges your user token for SA tokens.

## 3. terraform plan can propose destroying Cloud SQL — check disk_type

**Problem:** First `terraform plan` proposed replacing (destroy + create) the Cloud SQL instance.

**Root cause:** TF config had `disk_type` defaulting to `PD_SSD`, but actual instance uses `PD_HDD`. Since `disk_type` forces replacement, Terraform wanted to destroy the database.

**Fix:** Match `disk_type` in TF config to actual value. Always run `terraform plan` before `apply` and check for `# forces replacement`.

**Lesson:** After import, always run `plan` and look for `destroy` or `forces replacement` before touching `apply`.

## 4. GCP APIs can be imported as Terraform resources

`google_project_service` resources represent enabled GCP APIs. Importing them into Terraform state means:
- Terraform tracks which APIs are enabled
- New environments get the same APIs automatically
- `disable_on_destroy = false` prevents accidental API disabling

## 5. Cloud Build custom SA needs storage.objectViewer

**Problem:** Cloud Build with a custom service account fails with storage permission error.

**Root cause:** Cloud Build uploads source to a GCS bucket. The default Cloud Build SA has implicit access, but custom SAs need explicit `roles/storage.objectViewer`.

**Fix:** Grant `roles/storage.objectViewer` to the deployer SA.

## 6. Double impersonation breaks Terraform

If ADC is configured with `--impersonate-service-account` AND `providers.tf` has `impersonate_service_account`, Terraform tries to impersonate twice and fails.

**Rule:** Use one or the other, not both:
- ADC with `--impersonate-service-account` (simpler, no TF config change)
- ADC without impersonation + `impersonate_service_account` in providers.tf (declarative, visible in code)
