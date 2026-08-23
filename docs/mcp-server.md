# MCP Server

## Overview

The product exposes a Model Context Protocol (MCP) server so that external AI agents — Claude Desktop, customer-built agents, third-party orchestrators — can interact with product data programmatically. The MCP server is a thin adapter layer over the same shared service layer that powers the in-app assistant and REST API.

**Build trigger:** This is not an MVP feature. Build it when customers ask: "Can I connect Claude / our internal agent to the product?"

---

## Architecture

```
┌─────────────────────────┐
│  External AI Agent      │
│  (Claude, custom agent) │
└──────────┬──────────────┘
           │  MCP protocol (tool discovery + invocation)
           ▼
┌──────────────────────────────────────────────┐
│  MCP Server  (AgentCore Runtime)             │
│                                              │
│  1. Validate OAuth2 token → tenant + scopes  │
│  2. Filter available tools by caller's scope │
│  3. Execute tool → call lib/services/*       │
│  4. Return structured result                 │
└──────────┬───────────────────────────────────┘
           │
           ▼
┌──────────────────────┐
│  lib/services/*      │  ← Same handlers used by the
│  (tool handlers)     │     in-app assistant and REST API
└──────────┬───────────┘
           │
           ▼
┌──────────────────────┐
│  AppSync / GraphQL   │
│  (tenant-scoped)     │
└──────────────────────┘
```

The MCP server does **not** contain domain logic. It translates MCP tool calls into service layer function calls and returns structured results. AppSync remains the canonical API and auth/tenancy enforcement point.

---

## Hosting Decision: AWS AgentCore Runtime

| Option | Streaming/Long-Lived | Scaling | Verdict |
|---|---|---|---|
| **AgentCore Runtime** | Purpose-built for MCP | Managed, burst-optimized | **Chosen** — simplest path for MCP hosting on AWS |
| ECS Fargate + ALB | Full control | Manual scaling rules | Fallback — use if multi-region, VPC-only egress, or custom transport needed |
| Lambda + API Gateway | Awkward — timeouts, cold starts | Auto-scaling | Rejected — fights the platform for streaming/long-lived connections |
| Next.js API routes | Possible but couples to frontend | Shared with app | Rejected — can't scale independently, not designed for long-lived MCP connections |

**Why AgentCore over Fargate:**
- Purpose-built for MCP server hosting — avoids gateway timeout constraints
- Managed runtime — less operational overhead than Fargate
- AWS-native operational patterns (logging, metrics)

**When Fargate is better:**
- Multi-region deployment with global ALB/CloudFront
- VPC-only egress controls
- Custom proxies or unusual transport requirements
- Need "plain HTTPS endpoint" that any customer environment can audit

---

## Tools

Tools are **outcome-oriented, not CRUD**. They map to domain workflows, not database tables. This prevents agents from having overly broad data access and keeps tool calls meaningful.

### Tool Catalog

The catalog is defined by the vertical built on the foundation. **Example (compliance vertical)** — a hypothetical catalog for a manufacturing-compliance product:

| Tool | Description | Service Handler |
|---|---|---|
| `audit.getReadinessScore` | Compliance score + top gaps + urgency for a standard/site | `getReadinessScore()` |
| `audit.listTopRisks` | Requirements at highest risk (missing evidence, expired training) | `listTopGaps()` |
| `audit.exportPacket` | Generate audit packet (async job, returns jobId) | `createAuditPacket()` |
| `audit.getExportStatus` | Job progress + signed download URL when complete | `getExportJobStatus()` |
| `sop.getCurrent` | Current SOP version + approval status + change summary | `getDocumentStatus()` |
| `training.getOverdue` | Overdue training records — people, items, due dates | `listOverdueTraining()` |
| `training.getStatus` | Training matrix overview for a site | `getTrainingStatus()` |
| `evidence.find` | Evidence artifacts + provenance for a requirement | `findEvidence()` |
| `evidence.getCoverage` | Which requirements have evidence, which don't | `getEvidenceCoverage()` |

**Avoid exposing:** raw CRUD (`listX`, `createX`, `updateX`) as primary tools. That turns the MCP server into a generic data API and is too easy to abuse. CRUD access belongs on the REST API with explicit API key scoping.

All tools call the same `lib/services/*` handlers used by the in-app assistant and REST API. See [architecture.md](./architecture.md) for the full handler list and design principles.

---

## Auth & Tenancy

MCP is an external integration surface. Treat it like a public API.

### Authentication

| Mechanism | Detail |
|---|---|
| **Protocol** | OAuth2 / OIDC |
| **Token type** | Short-lived JWTs issued per tenant |
| **Scopes** | Named per vertical, e.g. `readiness:read`, `evidence:read`, `export:write` |
| **Identity mapping** | Token → `tenant_id` + `user_id` + `roles` |

### Tool-Level Authorization

Even with a valid token, not all tools are available to every caller:

- **Scope gating:** The tool registry filters available tools based on the caller's JWT scopes. In the example catalog, a token with `readiness:read` can call `audit.getReadinessScore` but not `audit.exportPacket` (which requires `export:write`).
- **Role gating:** Tool availability can also be filtered by the caller's role (e.g., only Admin-scoped tokens can access export tools).
- **Tier gating:** Tools may be gated by the org's subscription tier (e.g., MCP access only on Growth/Scale plans).

### Row-Level Tenancy

Every tool call includes tenant context. The service layer passes the caller's auth token to AppSync, which enforces `orgId` scoping at the resolver level. The MCP server never filters client-side and never uses a superuser credential.

---

## Async Job Pattern

Expensive operations (large exports, bulk analyses) must not block the MCP tool call. Use the async job pattern (shown here with the example-catalog tools):

```
Agent calls audit.exportPacket(standard, siteId, format)
    │
    ▼
MCP server → createAuditPacket() handler
    │
    ├── Writes Job record to DynamoDB (status: PENDING)
    ├── Enqueues work via SQS or Step Functions
    └── Returns { jobId } immediately

Agent polls audit.getExportStatus(jobId)
    │
    ▼
MCP server → getExportJobStatus() handler
    │
    └── Returns { status: COMPLETED, downloadUrl: <signed S3 URL> }
```

This keeps tool calls fast and reliable, makes bursts manageable, and avoids long-held connections.

### Idempotency

Write-ish tools (like `audit.exportPacket`) require an `idempotencyKey` parameter. The handler stores `(tenant_id, idempotencyKey) → jobId` and returns the existing job if the key has been seen before. This prevents duplicate exports from agent retries.

---

## Operational Concerns

### Rate Limiting

Per-tenant throttles on all tools, with tighter limits on write/export tools:

| Tool Category | Example Limit |
|---|---|
| Read tools | 60 requests/minute per tenant |
| Export tools | 5 requests/minute per tenant |

### Circuit Breakers

Deny export requests if too many jobs are already running for a tenant. Prevents runaway agents from overwhelming the export pipeline.

### Audit Logging

Every MCP tool call produces an EventLog record: who called what tool, with what parameters, what was returned. This is mandatory — the product's own integrations must be as auditable as any user action, especially in regulated verticals.

### Structured Logging

Log every tool call with: tenant_id, tool name, parameters, latency, success/failure. Essential for debugging agent behavior and monitoring usage patterns.

---

## Aggregate Snapshot Caching

Derived scores and rollups are expensive when computed live from many records across the vertical's domain entities. To keep MCP calls fast during bursts:

- Precompute a snapshot record per relevant scope (in the compliance example: a `ReadinessSnapshot` per site + standard)
- Refresh on: writes to the contributing domain entities, plus a nightly cron
- Read tools (e.g., `audit.getReadinessScore`) read from the snapshot, not from a live aggregation

This is a shared optimization — the in-app assistant and dashboard also benefit from it.

---

## Build Sequence

The MCP server is Phase 5 in the overall build sequence (see [architecture.md](./architecture.md#build-sequence)). It depends on the shared service layer from Phase 2 being in place.

| Step | What | Depends On |
|---|---|---|
| 1 | Service layer handlers (`lib/services/*`) | Built in tandem with UI features (Phase 2) |
| 2 | OAuth2 / OIDC token issuance for tenants | Cognito or external IdP setup |
| 3 | MCP server scaffold on AgentCore Runtime | Step 1 + Step 2 |
| 4 | Tool registry with scope-based filtering | Step 3 |
| 5 | Rate limiting, circuit breakers, audit logging | Step 3 |
| 6 | Aggregate snapshot caching | Step 1 (optimization, can come later) |

---

## Related Docs

- [Architecture](./architecture.md) — system diagram, shared service layer, build sequence
- [In-App Copilot](./in-app-copilot.md) — the in-app assistant uses the same tool handlers
- [AI Features](./ai-features.md) — AI-assisted capabilities within the product
- [Onboarding & Permissions](./onboarding-and-permissions.md) — RBAC groups and tenant model
- [Subscriptions & Payments](./subscriptions-and-payments.md) — tier-based feature gating
