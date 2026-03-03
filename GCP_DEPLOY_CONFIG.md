# GCP Deployment Configuration

**Project:** DuckDB WASM IDE

---

## Project Details

| Setting | Value |
|---------|-------|
| **Project ID** | `sql-practice-project-489106` |
| **Region** | `us-central1` |
| **Cloud SQL Instance** | `duckdb-ide-db` |
| **Database Name** | `duckdb_ide` |
| **Database User** | `postgres` |

---

## Service Accounts

| Service Account | Purpose | Email Format |
|-----------------|---------|--------------|
| `cloud-build-deployer-sa` | CI/CD deployment | `cloud-build-deployer-sa@sql-practice-project-489106.iam.gserviceaccount.com` |
| `cloud-run-sa` | Cloud Run application | `cloud-run-sa@sql-practice-project-489106.iam.gserviceaccount.com` |
| `db-init-sa` | Cloud Functions db-init | `db-init-sa@sql-practice-project-489106.iam.gserviceaccount.com` |

---

## Resources

| Resource | Name/ID | Location |
|----------|---------|----------|
| **Cloud Run Service** | `duckdb-ide` | us-central1 |
| **Cloud Function** | `db-init-service` | us-central1 |
| **Artifact Registry** | `duckdb-ide-repo` | us-central1 |
| **Cloud SQL Connection** | `sql-practice-project-489106:us-central1:duckdb-ide-db` | - |

---

## Secrets (Secret Manager)

| Secret Name | Purpose | Access |
|-------------|---------|--------|
| `db-password` | Database password | cloud-run-sa, db-init-sa |
| `jwt-secret` | JWT signing secret | cloud-run-sa |

---

## Cloud Build Trigger

| Setting | Value |
|---------|-------|
| **Trigger Name** | `deploy-gcp-deployment` |
| **Branch** | `gcp-deployment` |
| **Config File** | `cloudbuild.yaml` |
| **Service Account** | `cloud-build-deployer-sa@sql-practice-project-489106.iam.gserviceaccount.com` |

---

## URLs (After Deployment)

| Service | URL Format |
|---------|------------|
| **Cloud Run App** | `https://duckdb-ide-xxxxx-uc.a.run.app` |
| **Cloud Function** | `https://db-init-service-xxxxx-uc.a.run.app` |

---

## Cost Notes

- Using **Cloud SQL Free Trial** for development (30 days + 90-day grace)
- After free tier: ~$12-16/month (db-f1-micro + Secret Manager)

---

## Setup Commands Reference

```bash
# Set project
export PROJECT_ID=sql-practice-project-489106
export REGION=us-central1

# Configure gcloud
gcloud config set project $PROJECT_ID
gcloud config set run/region $REGION

# View project
gcloud projects describe $PROJECT_ID
```

---

## Related Documentation

- [SERVICE_ACCOUNTS_SETUP.md](SERVICE_ACCOUNTS_SETUP.md) - Service accounts IAM setup
- [CLOUD_BUILD_GUIDE.md](CLOUD_BUILD_GUIDE.md) - Cloud Build configuration
- [CLOUD_BUILD_CLOUDFUNCTIONS.md](CLOUD_BUILD_CLOUDFUNCTIONS.md) - Cloud Functions deployment
- [GCP_APPLICATION_BEST_PRACTICES.md](GCP_APPLICATION_BEST_PRACTICES.md) - Best practices checklist
