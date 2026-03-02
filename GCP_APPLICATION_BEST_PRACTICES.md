# Google Cloud Best Practices Checklist

**Architecture:** Node.js SPA + PostgreSQL (Cloud SQL) + Cloud Run

---

## 🔥 HIGH PRIORITY - Quick Wins (Low Complexity, Free/Low Cost)

These items are marked **HIGH PRIORITY** because they:
- Are low complexity to implement
- Have minimal or no cost
- Provide significant security or operational benefits

| # | Practice | Priority | Status | Complexity | Cost |
|---|----------|----------|--------|------------|------|
| 3 | Enable IAM Authentication for Cloud SQL | 🔥 **HIGH** | ❌ Not done | Low | Free |
| 4 | Use Private IP for Cloud SQL (no public IP) | 🔥 **HIGH** | ❌ Not done | Low | Free (saves money) |
| 6 | Enable vulnerability scanning on Artifact Registry | 🔥 **HIGH** | ❌ Not done | Low | Free |
| 12 | Configure connection timeout & idle timeout | 🔥 **HIGH** | ❌ Not done | Low | Free |
| 13 | Use SSL/TLS for database connections | 🔥 **HIGH** | ❌ Not done | Low | Free |
| 18 | Set appropriate concurrency limits | 🔥 **HIGH** | ❌ Not done | Low | Free |
| 19 | Enable Cloud Audit Logs (admin activity) | 🔥 **HIGH** | ❌ Not done | Low | Free |
| 20 | Set up error reporting (Error Reporting) | 🔥 **HIGH** | ❌ Not done | Low | Marginal |
| 25 | Configure autoscaling (min/max instances) | 🔥 **HIGH** | ❌ Not done | Low | Free (saves money) |
| 28 | Set max instances to control costs | 🔥 **HIGH** | ⚠️ Hardcoded (10) | Low | Free (saves money) |
| 29 | Use appropriate memory/CPU allocation | 🔥 **HIGH** | ⚠️ Default (512Mi/1) | Low | Free (saves money) |

---

## Complete Best Practices Checklist

| # | Practice | Priority | Status | Complexity | Cost Impact |
|---|----------|----------|--------|------------|-------------|
| **Security** | | | | | |
| 1 | Dedicated service accounts (least privilege) | ✅ Done | ✅ Implemented | Medium | **Free** |
| 2 | Store secrets in Secret Manager | ✅ Done | ✅ Implemented | Low | **Marginal** (Free tier: 6 secrets, then $0.03/month per secret) |
| 3 | Enable IAM Authentication for Cloud SQL | 🔥 **HIGH** | ❌ Not done | Low | **Free** |
| 4 | Use Private IP for Cloud SQL (no public IP) | 🔥 **HIGH** | ❌ Not done | Low | **Free** (saves ~$0.018/GB for public egress) |
| 5 | Enable Binary Authorization (image verification) | Medium | ❌ Not done | High | **Marginal** (~$0.003 per container image scanned) |
| 6 | Enable vulnerability scanning on Artifact Registry | 🔥 **HIGH** | ❌ Not done | Low | **Free** (included with Artifact Registry) |
| 7 | Use Cloud Armor for DDoS protection | Medium | ❌ Not done | Medium | **Potentially** ($0.75/million requests after free tier) |
| 8 | Restrict `.run.app` URL, use custom domain only | Low | ❌ Not done | Medium | **Marginal** (domain ~$10-20/year, SSL free) |
| **Database** | | | | | |
| 9 | Use connection pooling (`pg` Pool) | ✅ Done | ✅ Implemented | N/A | **Free** |
| 10 | Use Cloud SQL Node.js Connector (vs Auth Proxy) | Low | ❌ Using Unix socket | Medium | **Free** |
| 11 | Enable automatic backups & point-in-time recovery | Medium | ❌ Not done | Low | **Potentially** (storage cost based on retention) |
| 12 | Configure connection timeout & idle timeout | 🔥 **HIGH** | ❌ Not done | Low | **Free** |
| 13 | Use SSL/TLS for database connections | 🔥 **HIGH** | ❌ Not done | Low | **Free** (default on Cloud SQL) |
| **Application** | | | | | |
| 14 | Graceful shutdown (SIGTERM handling) | ✅ Done | ✅ Implemented | N/A | **Free** |
| 15 | Health check endpoint with DB status | ✅ Done | ✅ Implemented | N/A | **Free** |
| 16 | Stateless container design | ✅ Done | ✅ Implemented | N/A | **Free** |
| 17 | Implement request ID tracing (Cloud Trace) | Medium | ❌ Not done | Medium | **Marginal** (Free tier: 2.5M spans/day, then $1/million traces) |
| 18 | Set appropriate concurrency limits | 🔥 **HIGH** | ❌ Not done | Low | **Free** (affects scaling, not direct cost) |
| **Operations** | | | | | |
| 19 | Enable Cloud Audit Logs | 🔥 **HIGH** | ❌ Not done | Low | **Potentially** (Admin activity: Free, Data access: ~$0.002/GB) |
| 20 | Set up error reporting (Error Reporting) | 🔥 **HIGH** | ❌ Not done | Low | **Marginal** (Free tier: 5GB/month, then $0.005/GB) |
| 21 | Configure alerting (Uptime, latency, errors) | Medium | ❌ Not done | Medium | **Potentially** (Free tier: 150 metrics, then ~$0.25/metric) |
| 22 | Use Log Router to export logs (BigQuery/Pub/Sub) | Low | ❌ Not done | High | **Potentially High** (egress + destination storage costs) |
| 23 | Implement circuit breaker for DB failures | Low | ❌ Not done | High | **Free** (app code) |
| **Performance** | | | | | |
| 24 | Use regional load balancer for multi-region | Low | ❌ Not done | High | **Potentially High** ($0.012/hour + $0.008/10k requests) |
| 25 | Configure autoscaling (min/max instances) | 🔥 **HIGH** | ❌ Not done | Low | **Free** (helps control costs) |
| 26 | Enable CPU always (for consistent latency) | Low | ❌ Not done | Low | **Potentially** (~2x CPU costs when instances are running) |
| 27 | Use Cloud CDN for static assets | Medium | ❌ Not done | Medium | **Potentially** ($0.006/10k requests + egress) |
| **Cost** | | | | | |
| 28 | Set max instances to control costs | 🔥 **HIGH** | ⚠️ Hardcoded (10) | Low | **Free** (SAVES money) |
| 29 | Use appropriate memory/CPU allocation | 🔥 **HIGH** | ⚠️ Default (512Mi/1) | Low | **Free** (tuning can SAVE money) |
| 30 | Enable scale-to-zero when idle | ✅ Done | ✅ Cloud Run default | N/A | **SAVES money** |

---

## Priority Legend

| Priority | Description | Count |
|----------|-------------|-------|
| 🔥 **HIGH** | Quick Wins - Low complexity, free/low cost, high impact | **11 items** |
| **Medium** | Moderate complexity or cost, good to have | 6 items |
| **Low** | Nice to have, lower priority or high complexity | 5 items |
| ✅ **Done** | Already implemented | 8 items |

---

## Cost Impact Legend

| Category | Monthly Cost Estimate | Examples |
|----------|----------------------|----------|
| **Free** | $0 | IAM config, app code changes, SSL certificates |
| **Marginal** | $0-5 | Secret Manager ($0.03/secret), Binary Auth ($0.003/image), Error Reporting |
| **Potentially** | $5-50 | Cloud Armor ($0.75M requests), Cloud Audit Logs, backups storage, Cloud CDN |
| **Potentially High** | $50+ | Log Router export, Load Balancer, CPU always-on |

---

## Compliance Summary

```
┌─────────────────────────────────────────────────────────────┐
│  IMPLEMENTED:  8/30  (27%)                                  │
│                                                             │
│  ███████████░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░   │
│                                                             │
│  🔥 HIGH Priority:  11/30 available to implement           │
│  ✅ 8 Implemented   ⚠️ 2 Partial   ❌ 20 Not Done           │
└─────────────────────────────────────────────────────────────┘
```

### By Category

| Category | Implemented | Total | Percentage |
|----------|-------------|-------|------------|
| **Security** | 2 | 8 | 25% ████░░░░░░░ |
| **Database** | 1 | 5 | 20% ██░░░░░░░░ |
| **Application** | 4 | 5 | 80% ████████░ |
| **Operations** | 0 | 5 | 0% ░░░░░░░░░░ |
| **Performance** | 0 | 4 | 0% ░░░░░░░░░░ |
| **Cost Optimization** | 1 | 3 | 33% ███░░░░░░░ |

---

## Implementation References

- **Service Accounts:** See [SERVICE_ACCOUNTS_SETUP.md](SERVICE_ACCOUNTS_SETUP.md)
- **Cloud Build:** See [CLOUD_BUILD_GUIDE.md](CLOUD_BUILD_GUIDE.md)
- **Cloud Functions:** See [CLOUD_BUILD_CLOUDFUNCTIONS.md](CLOUD_BUILD_CLOUDFUNCTIONS.md)
- **Configuration Changes:** See [GCP_CONFIGURATION_CHANGES.md](GCP_CONFIGURATION_CHANGES.md)

---

## Sources

- [Cloud SQL Node.js Connector Codelab](https://codelabs.developers.google.cn/codelabs/deploy-application-with-database/cloud-sql-nodejs-connector-nextjs)
- [Connection Pool Limits Documentation](https://cloud.google.com/sql/docs/postgres/samples/cloud-sql-postgres-knex-limit)
- [Node.js Cloud SQL Best Practices](https://m.blog.csdn.net/gitblog_00166/article/details/148757901)
- [Secure Cloud Run Deployment](https://codelabs.developers.google.cn/secure-cloud-run-deployment)
