# Pending Tasks

Tracked in local [Vikunja](https://vikunja.io/) instance (project ID 2). Last updated: 2026-04-22.

## Bug

| # | Task |
|---|------|
| 87 | Submit Code without Run does not show query results in results panel |

## CI/CD & Deployment

| # | Task | Status |
|---|------|--------|
| 91 | Use PostgreSQL schemas for Blue/Green database isolation | Design complete |
| 92 | Establish versioning and release tagging strategy | Analysis done |
| 93 | Environment-specific Terraform deployments (dev/test/prod) | Depends on #91 |
| 95 | Enable branch protection on main — require PR with passing CI | Deferred — needs staging (#93) |
| 96 | Production switch strategy — data sync at Blue/Green cutover | Brief clone approach recommended |

## Infrastructure

| # | Task |
|---|------|
| 84 | Switch Cloud SQL from password auth to IAM database authentication |
| 88 | Stale UI after deployment — push refresh notification to clients |
| 89 | Terraform provisioning secrets from scratch (Secret Manager + initial values) |
| 14 | Add ESLint/Prettier config |

## Features

| # | Task |
|---|------|
| 59 | Add proper progress tracking with visual indicators |
| 30 | Add advanced sign-in: Google OAuth, GitHub OAuth, magic links |

## Agentic AI

| # | Task | Status |
|---|------|--------|
| 100 | Enable local/VM testing with Gemini API key | Open |

### Completed (2026-04-19 to 2026-04-20)
- ~~#31~~ Guest user access (done 2026-04-19)
- ~~#97~~ Gemini Flash 2.5 AI hints integration (done 2026-04-19)
- ~~#99~~ Question Authoring Agent — 8 tools, SSE streaming, exponential backoff (done 2026-04-20)
- ~~#101~~ SQL concept taxonomy — 38 concepts, coverage gap detection (done 2026-04-20)
- ~~#102~~ Close concept loop: save tags on question insertion (done 2026-04-19)
- ~~#90~~ CI/CD pipeline — GitHub Actions deploy workflow live (done)
- ~~#94~~ Workload Identity Federation for CI/CD (done)
- ~~#42~~ Replace DuckDB with SQL.js — closed as not planned (conflicts with window functions taxonomy)

## Email Verification (#33 — deferred)

| # | Task |
|---|------|
| 33 | Add email verification on new account signup (parent) |
| 79 | DB: Add email_verified, verification_token, verification_expires to users table |
| 80 | Register: Generate verification token, send email, defer JWT |
| 81 | Add GET /api/auth/verify endpoint |
| 82 | Gate login on email_verified=true |
| 83 | Choose and configure email provider for verification emails |

## Analysis / Investigation

| # | Task |
|---|------|
| 32 | Analyze concurrent session handling: multi-tab, multi-browser, multi-IP |
| 47 | Analyze whether Clear History button is needed |
| 58 | Analyze cloud-to-local Postgres sync strategy for debugging |

## Anti-Cheat (deferred — only if rewards/leaderboard added)

| # | Task |
|---|------|
| 72 | Harden client-side grading against casual tampering |
| 73 | Per-user or per-session randomized seed data to prevent hash sharing |
| 74 | Server-side solution and seed data rotation |
| 75 | Honeypot questions for cheat detection |
| 76 | Statistical detection of cheating patterns |

## Backlog

| # | Task |
|---|------|
| 67 | Understand git bundle (learning) |
