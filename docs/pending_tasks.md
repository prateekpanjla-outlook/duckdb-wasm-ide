# Pending Tasks

Tracked in local [Vikunja](https://vikunja.io/) instance (project ID 2). Last updated: 2026-04-19.

## Bug

| # | Task |
|---|------|
| 87 | Submit Code without Run does not show query results in results panel |

## CI/CD & Deployment

| # | Task | Status |
|---|------|--------|
| 90 | Establish CI/CD pipeline and release strategy | Deploy workflow live, CI deferred |
| 91 | Use PostgreSQL schemas for Blue/Green database isolation | Design complete |
| 92 | Establish versioning and release tagging strategy | Analysis done |
| 93 | Environment-specific Terraform deployments (dev/test/prod) | Depends on #91 |
| 94 | Workload Identity Federation for Terraform and CI/CD | WIF pool + provider done |
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
| ~~31~~ | ~~Guest user access — instant start without registration~~ **(DONE 2026-04-19)** |
| 30 | Add advanced sign-in: Google OAuth, GitHub OAuth, magic links |

## Agentic AI (new 2026-04-19)

| # | Task | Status |
|---|------|--------|
| 99 | Question Authoring Agent with Gemini function calling | Deployed, needs full flow testing |
| 100 | Enable local/VM testing with Gemini API key | Open |
| 101 | SQL concept taxonomy and per-question tagging | Deployed |
| 102 | Close concept loop: save tags on question insertion | Deployed |

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
| 42 | Replace DuckDB WASM with SQL.js for broader browser support |
| 67 | Understand git bundle (learning) |
