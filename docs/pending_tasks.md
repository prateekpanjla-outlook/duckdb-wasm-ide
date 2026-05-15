# Pending Tasks

Tracked in [GitHub Issues](https://github.com/prateekpanjla-outlook/duckdb-wasm-ide/issues) and local [Vikunja](https://vikunja.io/) instance (project ID 2). Last updated: 2026-05-16.

## Bug

| GH# | Vikunja# | Task |
|-----|----------|------|
| 23 | 87 | Submit Code without Run does not show query results in results panel |
| 63 | 114 | Stale Mermaid error persists in Prefab UI across agent runs |
| 64 | 115 | LLM generates invalid Mermaid erDiagram types — detect and self-correct |

## CI/CD & Deployment

| GH# | Vikunja# | Task | Status |
|-----|----------|------|--------|
| 27 | 91 | Use PostgreSQL schemas for Blue/Green database isolation | Design complete |
| 28 | 92 | Establish versioning and release tagging strategy | Analysis done |
| 29 | 93 | Environment-specific Terraform deployments (dev/test/prod) | Depends on #27 |
| 31 | 95 | Enable branch protection on main — require PR with passing CI | Deferred — needs staging (#29) |
| 32 | 96 | Production switch strategy — data sync at Blue/Green cutover | Brief clone approach recommended |

## Infrastructure

| GH# | Vikunja# | Task |
|-----|----------|------|
| 22 | 84 | Switch Cloud SQL from password auth to IAM database authentication |
| 24 | 88 | Stale UI after deployment — push refresh notification to clients |
| 25 | 89 | Terraform provisioning secrets from scratch (Secret Manager + initial values) |
| 2 | 14 | Add ESLint/Prettier config |
| 44 | 107 | Custom domain mapping for Cloud Run |
| 62 | 113 | Analyze Cloud Run TLS termination impact on both services |

## Features

| GH# | Vikunja# | Task |
|-----|----------|------|
| 10 | 59 | Add proper progress tracking with visual indicators |
| 3 | 30 | Add advanced sign-in: Google OAuth, GitHub OAuth, magic links |
| 65 | 116 | Per-question attempt history — show last attempt when revisiting a question |
| — | 111 | Add Mermaid ER diagrams to main question interface |

## Agentic AI / MCP

| GH# | Vikunja# | Task | Status |
|-----|----------|------|--------|
| 54 | 100 | Enable local/VM testing with Gemini API key | Open |
| 57 | 103 | Fix Gemini response truncation: cap thinking tokens separately | Open |
| 58 | 104 | QA Agent improvements: step-by-step display, formatting, transparency | Open |
| 60 | — | Agent sometimes stops mid-workflow to report instead of continuing | Open |
| 47 | 110 | Fix agent for Gemini 3.x: parallel tool calls + enable paid AI Studio tier | Open |
| 46 | 109 | Model-agnostic LLM adapter layer for multi-provider support | Open |
| 66 | 117 | Evolve v2 agent from question-authoring to general-purpose platform assistant | Open |
| 67 | 118 | Investigate MCP 409 Conflict on reconnect after network drop | Open |
| 68 | 119 | Reactive Prefab UI with interactive Approve button | Open |
| — | 106 | Split into two Cloud Run services: student + admin | Open |

## Learning / Exploration

| GH# | Vikunja# | Task |
|-----|----------|------|
| 52 | 98 | Learn GitHub Actions internals — lifecycle hooks, post steps, reusable workflows |
| 45 | 108 | Explore DuckDB Foundation endorsement and trademark permission |
| 11 | 67 | Understand git bundle |

## Email Verification (#6 — deferred)

| GH# | Vikunja# | Task |
|-----|----------|------|
| 6 | 33 | Add email verification on new account signup (parent) |
| 17 | 79 | DB: Add email_verified, verification_token, verification_expires to users table |
| 18 | 80 | Register: Generate verification token, send email, defer JWT |
| 19 | 81 | Add GET /api/auth/verify endpoint |
| 20 | 82 | Gate login on email_verified=true |
| 21 | 83 | Choose and configure email provider for verification emails |

## Analysis / Investigation

| GH# | Vikunja# | Task |
|-----|----------|------|
| 5 | 32 | Analyze concurrent session handling: multi-tab, multi-browser, multi-IP |
| 8 | 47 | Analyze whether Clear History button is needed |
| 9 | 58 | Analyze cloud-to-local Postgres sync strategy for debugging |

## Anti-Cheat (deferred — only if rewards/leaderboard added)

| GH# | Vikunja# | Task |
|-----|----------|------|
| 12 | 72 | Harden client-side grading against casual tampering |
| 13 | 73 | Per-user or per-session randomized seed data to prevent hash sharing |
| 14 | 74 | Server-side solution and seed data rotation |
| 15 | 75 | Honeypot questions for cheat detection |
| 16 | 76 | Statistical detection of cheating patterns |

## Completed (recent)

- ~~#4/31~~ Guest user access (2026-04-19)
- ~~#33/97~~ Gemini Flash 2.5 AI hints integration (2026-04-19)
- ~~#35/99~~ Question Authoring Agent — 8 tools, SSE streaming, exponential backoff (2026-04-20)
- ~~#36/101~~ SQL concept taxonomy — 38 concepts, coverage gap detection (2026-04-20)
- ~~#37/102~~ Close concept loop: save tags on question insertion (2026-04-19)
- ~~#30/90~~ CI/CD pipeline — GitHub Actions deploy workflow live
- ~~#26/94~~ Workload Identity Federation for CI/CD
- ~~#59/105~~ Session 5: v2 ReACT agent with reasoning framework (2026-05-13)
- ~~#42~~ Replace DuckDB with SQL.js — closed as not planned
