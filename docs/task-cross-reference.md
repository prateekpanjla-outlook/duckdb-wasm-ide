# Task Cross-Reference: Vikunja ↔ GitHub Issues

Generated 2026-04-13, updated 2026-04-22. Maps Vikunja task IDs to GitHub Issue numbers after the migration.

## Migrated tasks (Vikunja → GitHub Issues)

| Vikunja # | Vikunja Title | GitHub # | Status |
|-----------|--------------|----------|--------|
| 14 | Add ESLint/Prettier config | 2 | Open |
| 30 | Add advanced sign-in: Google OAuth, GitHub OAuth, magic links | 3 | Open |
| 31 | Guest user access — instant start without registration | 4 | **Closed** (2026-04-22) |
| 32 | Analyze concurrent session handling: multi-tab, multi-browser, multi-IP | 5 | Open |
| 33 | Add email verification on new account signup | 6 | Open |
| 42 | Replace DuckDB WASM with SQL.js for broader browser support | 7 | **Closed** — not planned (conflicts with window functions taxonomy) |
| 47 | Analyze whether Clear History button is needed | 8 | Open |
| — | Analyze cloud to local Postgres sync strategy for debugging | 9 | Open |
| — | Add proper progress tracking with visual indicators | 10 | Open |
| — | Understand git bundle | 11 | Open |
| — | Harden client-side grading against casual tampering | 12 | Open |
| — | Per-user OR per-session randomized seed data | 13 | Open |
| — | Server-side solution and seed data rotation | 14 | Open |
| — | Honeypot questions for cheat detection | 15 | Open |
| — | Statistical detection of cheating patterns | 16 | Open |
| — | DB: Add email_verified columns to users table | 17 | Open |
| — | Register: Generate verification token, send email, defer JWT | 18 | Open |
| — | Add GET /api/auth/verify endpoint | 19 | Open |
| — | Gate login on email_verified=true | 20 | Open |
| — | Choose and configure email provider for verification emails | 21 | Open |
| — | Switch Cloud SQL to IAM database authentication | 22 | Open |
| — | Bug: Submit Code without Run doesn't show results | 23 | Open |
| — | Analyze stale UI after deployment — push refresh to clients | 24 | Open |
| — | Analyze: Terraform provisioning secrets from scratch | 25 | Open |
| — | Establish CI/CD pipeline and release strategy | 26 | **Closed** |
| — | Use PostgreSQL schemas for Blue/Green database isolation | 27 | Open |
| — | Establish versioning and release tagging strategy | 28 | Open |
| — | Environment-specific Terraform deployments (dev/test/prod) | 29 | Open |
| — | Use Workload Identity Federation for Terraform and CI/CD | 30 | **Closed** |
| — | Enable branch protection on main | 31 | Open |
| — | Production switch strategy — data sync at Blue/Green cutover | 32 | Open |
| — | Integrate Gemini Flash 2 for AI-powered SQL hints | 33 | **Closed** (deployed 2026-04-14) |

## Vikunja-only tasks (completed, not migrated)

These tasks were completed before the migration and exist only in Vikunja.

| Vikunja # | Title | Status |
|-----------|-------|--------|
| 1 | E2E tests: rewrite for real backend | Done |
| 2 | Fix AuthManager modal wiring issue | Done |
| 3 | Fix Arrow batch processing — only first batch used | Done |
| 4 | Add query timeout to prevent browser freeze | Done |
| 5 | Fix token refresh — 401 after 7 days | Done |
| 6 | Fix N+1 query in /api/practice/questions | Done |
| 7 | Replace process.exit(-1) on DB pool error | Done |
| 8 | Add transaction to UserAttempt.create() | Done |
| 9 | Move answer grading to server-side | Done |
| 10 | Consolidate auth: use apiClient for all API calls | Done |
| 11 | Restore practice session on page refresh | Done |
| 12 | Test Docker deployment locally | Done |
| 13 | Deploy to GCP Cloud Run | Done |
| 15 | Add missing DB indexes | Done |
| 16 | Fix CORS config: origin * with credentials true | Done |
| 17 | Setup Vagrant VM for testing | Done |
| 18 | Debug DuckDB WASM instantiate() not completing with COI bundle | Done |
| 19 | Load all practice SQL into DuckDB on login | Done |
| 20 | GCloud Deploy: Enable required APIs | Done |
| 21 | GCloud Deploy: Create Cloud SQL PostgreSQL instance | Done |
| 22 | GCloud Deploy: Create database and set postgres password | Done |
| 23 | GCloud Deploy: Update Dockerfile for EH bundle | Done |
| 24 | GCloud Deploy: Build and push Docker image | Done |
| 25 | GCloud Deploy: Set up Cloud Run service | Done |
| 27 | GCloud Deploy: Smoke test | Done |
| 28 | GCloud Deploy: Secure Cloud SQL connectivity | Done |
| 29 | POC: Cloud Run to Cloud SQL connectivity | Done |
| 34 | GCloud Deploy: Enable required APIs | Done |
| 35 | GCloud Deploy: Create Cloud SQL PostgreSQL instance | Done |
| 36 | GCloud Deploy: Create database and set postgres password | Done |
| 37 | GCloud Deploy: Create secrets in Secret Manager | Done |
| 38 | GCloud Deploy: Build and push Docker image | Done |
| 39 | GCloud Deploy: Deploy Cloud Run service | Done |
| 40 | GCloud Deploy: Smoke test | Done |
| 41 | Playwright E2E tests for Cloud Run deployment | Done |
| 43 | Hide query editor before login | Done |
| 44 | Remove DuckDB WebAssembly IDE title text | Done |
| 45 | Remove Export Results button | Done |
| 46 | Decide on new app title/branding | Done |
| 48 | Audit and update all markdown documentation | Done |
| 49 | Rewrite README.md from scratch | Done |
| 50 | Update server/README.md | Done |
| 51 | Update docs/duckdb-initialization-pattern.md | Done |

## GitHub-only tasks (created after migration)

These tasks were created directly in GitHub Issues and have no Vikunja equivalent.

| GitHub # | Title | Notes |
|----------|-------|-------|
| 9-16 | Anti-cheat & analysis tasks | Created during migration as new breakdown |
| 17-21 | Email verification subtasks | Broken out from Vikunja #33 |
| 22-29 | Infrastructure & CI/CD tasks | Created during Terraform/deploy work |
| 30 | WIF for Terraform and CI/CD | Created for #94 equivalent work |
| 31-32 | Branch protection, Blue/Green | Created during CI/CD planning |
| 33 | Gemini AI integration | **Closed** (deployed 2026-04-14) |
| 34 | Learn GitHub Actions internals | Created 2026-04-14 |
| 35 | Question Authoring Agent with Gemini function calling | **Closed** (deployed 2026-04-20) |
| 36 | Enable local/VM testing with Gemini API key | Open |
| 37 | SQL concept taxonomy and per-question tagging | **Closed** (deployed 2026-04-20) |
| 38 | Close concept loop: save tags on insertion | Closed |
| 39 | Fix Gemini response truncation: cap thinking tokens | Open |
| 40 | QA Agent improvements: formatting, transparency | Open |
| 41 | Session 5: Agent upgrades — ReACT labels | Open |
| 42 | Agent sometimes stops mid-workflow | Open |

## Vikunja tasks created 2026-04-19

| Vikunja # | Title | GitHub # | Status |
|-----------|-------|----------|--------|
| 97 | Gemini Flash 2.5 AI hints integration | 33 | **Closed** (2026-04-14) |
| 99 | Question Authoring Agent with Gemini function calling | 35 | **Closed** (2026-04-20) |
| 100 | Enable local/VM testing with Gemini API key | 36 | Open |
| 101 | SQL concept taxonomy and per-question tagging | 37 | **Closed** (2026-04-20) |
| 102 | Close concept loop: save tags on insertion | 38 | **Closed** |

## Notes

- Vikunja task numbers are **not** preserved in GitHub — GitHub assigns its own sequential numbers
- Vikunja remains accessible at http://localhost:3456 (requires Vagrant VM running)
- GitHub Projects board: https://github.com/users/prateekpanjla-outlook/projects/2
- Vikunja tasks #60 (isFirstSuccess bug), #71 (client-side grading), #77 (Terraform), #78 (service accounts), #90 (CI/CD), #94 (WIF) were completed but not individually migrated — their work is reflected in closed GitHub issues or completed commits
