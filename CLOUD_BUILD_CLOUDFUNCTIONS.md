# Cloud Functions 2nd Gen - Database Initialization Service
#
# This file documents how to use Cloud Functions for database initialization
# instead of running migrations in the Cloud Build pipeline.
#
# Benefits:
# - Separate service from main application
# - Manual control over when to run migrations
# - Can be triggered via HTTP request
# - No need to redeploy app to re-run migrations

---

## Architecture

```
┌──────────────────┐
│  Cloud Run        │ ← Main application (duckdb-ide)
│  duckdb-ide       │
└─────────┬──────────┘
          │
          ▼
┌──────────────────┐
│  Cloud SQL        │
│  duckdb-ide-db    │
└─────────┬──────────┘
          ▲
          │
┌─────────┴──────────┐
│  Cloud Functions   │ ← Init function (HTTP trigger)
│  db-init-service   │   https://db-init-xxx.run.app
└────────────────────┘
```

---

## Function Code

**File:** `server/cloud-functions/db-init/index.js`

```javascript
/**
 * Cloud Function for database initialization
 * Provides HTTP endpoints for database operations
 *
 * Trigger: HTTP
 * Runtime: Node.js 18
 */

import { migrateDatabase } from '../../scripts/migrateDatabase.js';
import { seedDatabase } from '../../scripts/seedDatabase.js';
import config from '../../config/index.js';

// Cloud Functions 2nd Gen with Hono framework
import { Hono } from 'hono';
import { serve } from '@hono/node-server';

const app = new Hono();

// Health check
app.get('/', async (c) => {
    return c.json({
        service: 'db-init-service',
        status: 'running',
        endpoints: ['/migrate', '/seed', '/init']
    });
});

// Run database migrations
app.post('/migrate', async (c) => {
    try {
        console.log('Starting database migrations...');
        await migrateDatabase();
        return c.json({
            status: 'ok',
            message: 'Database migrations completed successfully'
        });
    } catch (error) {
        console.error('Migration error:', error);
        return c.json({
            status: 'error',
            error: error.message
        }, 500);
    }
});

// Seed database with questions
app.post('/seed', async (c) => {
    try {
        console.log('Starting database seeding...');
        await seedDatabase();
        return c.json({
            status: 'ok',
            message: 'Database seeded successfully'
        });
    } catch (error) {
        console.error('Seed error:', error);
        return c.json({
            status: 'error',
            error: error.message
        }, 500);
    }
});

// Initialize (migrate + seed)
app.post('/init', async (c) => {
    try {
        console.log('Starting database initialization...');

        // Run migrations
        await migrateDatabase();
        console.log('✅ Migrations completed');

        // Seed database
        await seedDatabase();
        console.log('✅ Seeding completed');

        return c.json({
            status: 'ok',
            message: 'Database initialized successfully (migrated + seeded)'
        });
    } catch (error) {
        console.error('Init error:', error);
        return c.json({
            status: 'error',
            error: error.message
        }, 500);
    }
});

// Export for Cloud Functions 2nd Gen
export default app;
```

---

## Deployment Commands

### 1. Deploy the Function

```bash
# Deploy Cloud Function
gcloud functions deploy db-init-service \
    --gen2 \
    --region=us-central1 \
    --runtime=nodejs18 \
    --source=./server/cloud-functions/db-init \
    --entry-point=index \
    --trigger-http \
    --allow-unauthenticated \
    --memory=512Mi \
    --timeout=300s \
    --set-cloudsql-instances=PROJECT_ID:us-central1:duckdb-ide-db \
    --set-env-vars=DB_NAME=duckdb_ide,DB_USER=postgres \
    --set-secrets=DB_PASSWORD=db-password:latest
```

### 2. Get Function URL

```bash
gcloud functions describe db-init-service --region us-central1 --format="value(serviceConfig.uri)"
```

Output: `https://db-init-service-xxxxx-xxxxx-uc.a.run.app`

---

## Usage

### Manual Initialization

```bash
# Initialize database (migrate + seed)
curl -X POST https://db-init-service-xxxxx.run.app/init

# Or run separately
curl -X POST https://db-init-service-xxxxx.run.app/migrate
curl -X POST https://db-init-service-xxxxx.run.app/seed
```

### After Deploying Cloud Run

```bash
# Deploy Cloud Run first (without DB setup)
gcloud run deploy duckdb-ide --source .

# Then initialize database
curl -X POST https://db-init-service-xxxxx.run.app/init
```

---

## Package.json Script

Add to `server/package.json`:

```json
{
  "scripts": {
    "deploy:function": "gcloud functions deploy db-init-service --gen2 --source=./server/cloud-functions/db-init --trigger-http"
  }
}
```

---

## Simplified cloudbuild.yaml (Main App)

Since migrations are now handled by Cloud Functions, the main deployment pipeline is simpler:

```yaml
steps:
  # Step 1: Build the Docker image
  - name: 'gcr.io/cloud-builders/docker'
    id: 'build'
    args:
      - 'build'
      - '-t'
      - 'us-central1-docker.pkg.dev/$PROJECT_ID/duckdb-ide-repo/duckdb-ide:$COMMIT_SHA'
      - '-t'
      - 'us-central1-docker.pkg.dev/$PROJECT_ID/duckdb-ide-repo/duckdb-ide:latest'
      - '.'

  # Step 2: Push to Artifact Registry
  - name: 'gcr.io/cloud-builders/docker'
    id: 'push'
    args:
      - 'push'
      - 'us-central1-docker.pkg.dev/$PROJECT_ID/duckdb-ide-repo/duckdb-ide:$COMMIT_SHA'

  # Step 3: Deploy to Cloud Run (App only, no DB setup)
  - name: 'gcr.io/cloud-builders/gcloud'
    id: 'deploy'
    args:
      - 'run'
      - 'deploy'
      - 'duckdb-ide'
      - '--image'
      - 'us-central1-docker.pkg.dev/$PROJECT_ID/duckdb-ide-repo/duckdb-ide:$COMMIT_SHA'
      - '--region'
      - 'us-central1'
      - '--platform'
      - 'managed'
      - '--allow-unauthenticated'
      - '--port'
      - '8080'
      - '--memory'
      - '512Mi'
      - '--cpu'
      - '1'
      - '--max-instances'
      - '10'
      - '--timeout'
      - '300'
      - '--set-cloudsql-instances=$_CLOUDSQL_CONNECTION'
      - '--set-env-vars'
      - 'NODE_ENV=production,DB_NAME=$_DB_NAME,DB_USER=$_DB_USER,DB_HOST=/cloudsql/$_CLOUDSQL_CONNECTION'
      - '--set-secrets'
      - 'DB_PASSWORD=$_DB_PASSWORD_SECRET:latest,JWT_SECRET=$_JWT_SECRET_SECRET:latest'

images:
  - 'us-central1-docker.pkg.dev/$PROJECT_ID/duckdb-ide-repo/duckdb-ide:latest'

substitutions:
  _CLOUDSQL_CONNECTION: 'your-project:us-central1:duckdb-ide-db'
  _DB_NAME: 'duckdb_ide'
  _DB_USER: 'postgres'
  _DB_PASSWORD_SECRET: 'db-password'
  _JWT_SECRET_SECRET: 'jwt-secret'

options:
  logging: CLOUD_LOGGING_ONLY
  machineType: 'E2_HIGHCPU_8'
```

---

## Complete Deployment Flow

### First Time Setup (Once)

1. Create Cloud SQL Instance
2. Deploy Cloud Function (db-init-service)
3. Initialize database: `curl -X POST https://db-init-xxx/run.app/init`
4. Deploy Cloud Run app

### Subsequent Deployments

1. Push code to GitHub
2. Cloud Build deploys Cloud Run app automatically
3. (Optional) Re-run migrations if schema changed: `curl -X POST https://db-init-xxx/run.app/migrate`

---

## Cost Comparison

| Service | Free Tier | Paid |
|---------|-----------|------|
| Cloud Functions (2nd Gen) | 2M invocations/month | $0.40 per million after |
| Cloud Run | 2M requests/month | Varies |

**Estimated monthly cost with this setup:** $20-50
