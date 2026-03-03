# GCP Deployment Log

Track progress and notes for GCP deployment of DuckDB WASM IDE.

---

## 2026-03-03

### Terraform Service Account Setup

**Actions Taken:**
- User ran `./setup-auth.sh` from terminal after doing `gcloud auth login`
- Key file command was not correct (`--key-type` should be `--key-file-type`)
- Fixed it in script and ran command manually
- Command in file to create key is still not tested

**Status:** ⚠️ Service account created, key downloaded manually, script fixed (not re-tested)

**Next Steps:**
- [ ] Run `terraform init` to verify authentication works
- [ ] Run `terraform plan` to preview resources
- [ ] Run `terraform apply` to create GCP resources

---

## Deployment Checklist

### One-Time Setup (Terraform)
- [ ] Terraform service account created ✅
- [ ] Terraform authenticated (test `terraform init`)
- [ ] Run `terraform apply` to create:
  - [ ] APIs enabled
  - [ ] Artifact Registry repository
  - [ ] Cloud SQL instance
  - [ ] Secret Manager secrets
  - [ ] Service accounts (3 SAs)
  - [ ] IAM permissions

### Cloud Build Trigger
- [ ] Create GitHub trigger in Cloud Build console
- [ ] Configure to use `cloud-build-deployer-sa` service account

### Cloud Functions (db-init)
- [ ] Deploy db-init Cloud Function
- [ ] Test `/init` endpoint
- [ ] Test `/seed` endpoint

### Application Deployment
- [ ] Push to `gcp-deployment` branch
- [ ] Verify Cloud Run deployment
- [ ] Test application health check

---

## Resources Reference

| Resource | Name/Value |
|----------|------------|
| Project ID | `sql-practice-project-489106` |
| Region | `us-central1` |
| Cloud SQL Instance | `duckdb-ide-db` |
| Database Name | `duckdb_ide` |
| Artifact Registry | `duckdb-ide-repo` |
| Cloud Run Service | `duckdb-ide` |

---

## Service Accounts

| Service Account | Email | Purpose |
|-----------------|-------|---------|
| `cloud-build-deployer-sa` | `cloud-build-deployer-sa@sql-practice-project-489106.iam.gserviceaccount.com` | CI/CD deployment |
| `cloud-run-sa` | `cloud-run-sa@sql-practice-project-489106.iam.gserviceaccount.com` | Cloud Run app runtime |
| `db-init-sa` | `db-init-sa@sql-practice-project-489106.iam.gserviceaccount.com` | Cloud Functions db-init |
| `terraform-deployer` | `terraform-deployer@sql-practice-project-489106.iam.gserviceaccount.com` | Terraform infrastructure |

---

## Cost Estimate

| Resource | Monthly Cost |
|----------|--------------|
| Cloud SQL (db-f1-micro) | ~$10-15 |
| Secret Manager (2 secrets) | ~$0.06 |
| Cloud Run | FREE tier covers typical usage |
| Cloud Functions | FREE tier covers typical usage |
| Artifact Registry | FREE (under 0.5 GB) |
| **Total** | **~$12-16/month** |

*After $300 credit expires*
