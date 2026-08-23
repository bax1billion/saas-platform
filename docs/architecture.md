# Architecture

## Overview

This is a white-label SaaS foundation built on AWS Amplify Gen 2. Each product built on it serves its own vertical, with product identity (brand name, domain, copy) supplied by the config layer (`config/site.ts`). The system exposes multiple API surfaces — each serving a different consumer — all backed by a shared service layer over AppSync/GraphQL and DynamoDB.

The core principle: **one data layer, multiple interfaces.** The frontend, in-app AI assistant, customer REST API, and MCP server all access the same domain logic through shared, permission-aware service functions.

---

## System Diagram

```
                        ┌─────────────────────────────────────────────────┐
                        │                  Consumers                      │
                        │                                                 │
  ┌──────────────┐  ┌───────────────┐  ┌──────────────┐  ┌─────────────┐ │
  │  Next.js     │  │  AI Assistant │  │   REST API   │  │ MCP Server  │ │
  │  Frontend    │  │  Orchestrator │  │  (APIGW +    │  │ (AgentCore  │ │
  │              │  │               │  │   Lambda)    │  │  Runtime)   │ │
  └──────┬───────┘  └──────┬────────┘  └──────┬───────┘  └──────┬──────┘ │
         │                 │                   │                 │        │
         └─────────────────┼───────────────────┼─────────────────┘        │
                           │                   │                          │
                        ┌──▼───────────────────▼──┐                       │
                        │    Service Layer         │                       │
                        │    (Tool Handlers,       │                       │
                        │     per vertical, e.g.)  │                       │
                        │  getSummary()            │                       │
                        │  listTopItems()          │                       │
                        │  findRecords()           │                       │
                        │  getStatusOverview()     │                       │
                        │  exportDataPacket()      │                       │
                        └────────────┬─────────────┘                       │
                                     │                                     │
                        ┌────────────▼─────────────┐                       │
                        │   AppSync / GraphQL      │                       │
                        │   (Amplify Gen 2)        │                       │
                        └────┬──────────────┬──────┘                       │
                             │              │                              │
                   ┌─────────▼───┐   ┌──────▼──────┐                       │
                   │  DynamoDB   │   │     S3      │                       │
                   │  (data)     │   │  (files)    │                       │
                   └─────────────┘   └─────────────┘                       │
                                                                           │
  ┌───────────────────────────────────────────────────────────────────────┘
  │
  │  External Services
  │  ┌──────────┐  ┌──────────┐  ┌──────────────────┐  ┌──────────────┐
  │  │ Cognito  │  │  Stripe  │  │ SES (email)      │  │ Bedrock/LLM  │
  │  │ (auth)   │  │ (billing)│  │                  │  │ (AI assist)  │
  │  └──────────┘  └──────────┘  └──────────────────┘  └──────────────┘
```

---

## API Surfaces

### 1. AppSync / GraphQL — Primary API

The canonical data API. All domain models, relationships, authorization rules, and secondary indexes are defined here.

| Attribute | Detail |
|---|---|
| **Serves** | Next.js frontend, AI assistant orchestrator, Lambda triggers |
| **Hosting** | AWS AppSync (managed by Amplify Gen 2) |
| **Auth** | Cognito JWT (user pools + groups) |
| **Schema** | `amplify/data/resource.ts` — auto-generates queries, mutations, subscriptions |
| **Status** | Live |

Custom mutations (e.g., `createCheckoutSession`) are backed by Lambda functions for operations requiring external API calls or multi-step logic. See [subscriptions-and-payments.md](./subscriptions-and-payments.md) for the pattern.

### 2. In-App AI Assistant — Copilot Orchestrator

An AI-powered assistant embedded in the app UI. Users ask natural-language questions about their domain data, and the orchestrator translates them into structured service layer calls, feeds the results to an LLM, and streams back an answer with suggested actions.

| Attribute | Detail |
|---|---|
| **Serves** | Authenticated app users (all roles) |
| **Hosting** | Next.js API route (`app/api/assistant/route.ts`) — streams LLM responses via SSE |
| **Auth** | Cognito session — inherits the user's role and permissions |
| **LLM** | Amazon Bedrock (or Claude API) — called server-side only, never from browser |
| **Status** | Planned |

**Why Next.js API route (not Lambda or AppSync mutation):**
- The assistant streams LLM responses token-by-token. Next.js API routes support `ReadableStream` and Server-Sent Events natively.
- AppSync custom mutations return a single response — no streaming. Not suitable for chat.
- Lambda response streaming requires Function URLs and extra wiring. The Next.js server is already running — no reason to add another compute layer.
- Lambda cold starts add latency to a user-facing chat experience.

**Key design decisions:**
- The orchestrator is the gatekeeper. The LLM never has direct data access.
- Tool handlers are called with the user's auth context — the assistant can't do anything the user can't do.
- Write actions require explicit user confirmation (button click, not auto-executed).
- Every tool call is logged to EventLog for auditability.

See [in-app-copilot.md](./in-app-copilot.md) for the orchestrator pattern, tool handler design, and guardrails.

### 3. REST API — Customer Integrations

A RESTful API for customers to integrate the product with their own systems (ERP, HRIS, custom tooling). Listed as "API access" on every pricing tier.

**Two hosting tiers:**

| Tier | Hosting | Use Case |
|---|---|---|
| Lightweight endpoints | Next.js API routes (`app/api/`) | Webhook receivers (Stripe, SES), return URLs, simple convenience endpoints |
| Robust external API | API Gateway + Lambda | Customer-facing REST with API keys, rate limiting, versioning, OpenAPI spec |

| Attribute | Detail |
|---|---|
| **Serves** | Customer developers, third-party integrations |
| **Auth** | API keys scoped per organization (not Cognito sessions) |
| **Status** | Planned (post-MVP) |

**Design decisions:**
- Next.js API routes are not suited for heavy external integrations — they share compute with the frontend and lack native API key management, rate limiting, and usage metering.
- API Gateway + Lambda provides independent scaling, throttling, WAF integration, and usage plans.
- Both tiers call the same shared service layer functions.

### 4. MCP Server — AI Agent Integrations

A Model Context Protocol server enabling external AI agents (Claude, customer-built agents) to interact with the product programmatically.

| Attribute | Detail |
|---|---|
| **Serves** | External AI agents, "bring-your-own-agent" workflows |
| **Hosting** | AWS AgentCore Runtime (preferred) or ECS Fargate |
| **Auth** | OAuth2 / OIDC with JWT scopes (e.g., `app:reports:read`, `app:export:write`) |
| **Status** | Planned (post-MVP, demand-driven) |

**Why AgentCore over Lambda:** MCP servers benefit from long-lived connections and streaming semantics. Lambda's timeout and cold-start constraints make it awkward for MCP. AgentCore is purpose-built for this.

**Tools are outcome-oriented, not CRUD:** Expose outcome-level tools like `reports.getSummary()` and `records.find()`, not `listDocuments()` and `updateDocument()`.

See [mcp-server.md](./mcp-server.md) for hosting options, tool design, auth/tenancy enforcement, and the async job pattern.

---

## Shared Service Layer

The service layer is a set of bounded, permission-aware TypeScript functions that encapsulate domain logic. Every API surface calls these functions rather than querying AppSync directly. This ensures consistent behavior, authorization enforcement, and testability across all consumers.

### What They Are

Tool handlers are **plain TypeScript functions** — not endpoints, not Lambdas, not REST. They live in a shared directory and are imported by whatever consumer needs them. Each vertical module contributes its own service files; for example, the compliance vertical's layout looked like:

```
lib/
  services/
    readiness.ts      ← getReadinessScore(), listTopGaps()
    documents.ts      ← getDocumentStatus(), listDocumentsByStandard()
    training.ts       ← getTrainingStatus(), listOverdueTraining()
    evidence.ts       ← findEvidence(), getEvidenceCoverage()
    exports.ts        ← createAuditPacket(), getExportJobStatus()
```

Each handler takes an auth token + parameters, uses the Amplify server-side GraphQL client to call AppSync (inheriting the caller's permissions), and returns structured data:

```typescript
// lib/services/<domain>.ts
export async function getStatusOverview(
  authToken: string,
  params: { orgId: string; siteId?: string }
): Promise<StatusOverviewResult> {
  const client = getServerClient(authToken);
  // ... query AppSync, compute, return structured result
}
```

### How Each Consumer Uses Them

```
┌──────────────────────────────┐
│  Next.js API Route           │  ← AI assistant orchestrator
│  app/api/assistant/route.ts  │     imports from lib/services/*
│  (streams LLM response)     │     runs on Next.js server
└──────────────────────────────┘
                                        ┌──────────────────┐
                                        │  lib/services/*   │
┌──────────────────────────────┐        │                  │
│  API Gateway + Lambda        │  ←──── │  Pure TypeScript  │
│  (customer REST API)         │        │  functions        │
│  (returns JSON)              │        │                  │
└──────────────────────────────┘        │  No transport     │
                                        │  dependency       │
┌──────────────────────────────┐        │                  │
│  AgentCore MCP Server        │  ←──── │                  │
│  (external AI agents)        │        └──────────────────┘
│  (MCP protocol)              │
└──────────────────────────────┘
```

For MVP, everything runs on the Next.js server. The REST API (Lambda) and MCP server (AgentCore) bundle the same functions from `lib/services/` when they ship later.

### Planned Handlers

The handler catalog is defined per vertical, alongside the UI features it supports. Example (compliance vertical):

| Handler | Description | Built With Feature |
|---|---|---|
| `getReadinessScore(standardId, siteId)` | Compliance score + top gaps + urgency | Dashboard |
| `listTopGaps(standardId, siteId)` | Requirements missing evidence or with expired training | Dashboard |
| `getDocumentStatus(documentId)` | Current version, approval state, review date | Document management |
| `listDocumentsByStandard(standardId, siteId)` | SOPs/policies mapped to a standard | Document management |
| `getTrainingStatus(siteId)` | Training matrix overview — compliant, due, overdue | Training matrix |
| `listOverdueTraining(siteId, criticalOnly)` | People + items + due dates | Training matrix |
| `findEvidence(requirementId, filters)` | Evidence artifacts + provenance for a requirement | Evidence collection |
| `getEvidenceCoverage(standardId, siteId)` | Which requirements have evidence, which don't | Evidence collection |
| `createAuditPacket(standardId, siteId, format)` | Async job — generates ZIP/PDF export, returns jobId | Audit export |
| `getExportJobStatus(jobId)` | Job progress + signed download URL when complete | Audit export |

### Design Principles

- **Transport-agnostic:** Handlers are plain functions. Where they execute is an infrastructure decision that can change. Today they run on the Next.js server. Tomorrow they run in Lambda. The function doesn't care who's calling it.
- **Auth passthrough:** Handlers receive the caller's auth context (Cognito JWT or API key identity) and pass it through to AppSync. They never use a superuser credential.
- **Tenant scoping:** Every query is scoped by `orgId` at the AppSync resolver level. The service layer does not filter client-side.
- **Independently testable:** Each handler can be unit-tested without an LLM, a chat UI, or a REST framework.
- **Built in tandem:** Handlers are developed alongside the UI feature they support — not as a separate "AI phase." When a vertical feature's UI ships, its handlers ship with it.

---

## Auth & Tenancy

### Internal Users (Frontend + AI Assistant)

Authentication is handled by AWS Cognito with three permission groups (Admin / Member / Viewer, defined in `amplify/shared/constants.ts`):

| Group | Precedence | Access Level |
|---|---|---|
| Admin | 0 | Full CRUD on all org data, manage users, billing |
| Member | 1 | CRUD on domain content, read-only on org/billing |
| Viewer | 2 | Read-only across all domain data |

Authorization is enforced declaratively in the AppSync schema (`amplify/data/resource.ts`) using Amplify's `.authorization()` rules. Every model specifies which groups can perform which operations.

See [onboarding-and-permissions.md](./onboarding-and-permissions.md) for group assignment flow and the permission matrix pattern.

### External Consumers (REST API + MCP)

| Consumer | Auth Mechanism | Tenant Isolation |
|---|---|---|
| REST API | API keys scoped per organization | Key maps to `orgId`; all queries filtered by org |
| MCP Server | OAuth2/OIDC with JWT scopes | Token maps to `tenant_id` + `user_id` + roles; tool availability gated by scope |

Both external surfaces enforce tenant isolation at the AppSync resolver level (same as internal users). The service layer never "filters client-side."

### AI Assistant

The assistant inherits the authenticated user's Cognito session. It operates under the same RBAC rules as the user — an assistant serving a Viewer cannot create records.

---

## Event Architecture

### Immutable Audit Trail

All data mutations flow through DynamoDB Streams into Lambda triggers that write to the `EventLog` model. EventLog is append-only — no user-facing deletes.

```
DynamoDB table mutation
    │
    ▼
DynamoDB Stream
    │
    ▼
Lambda trigger (e.g., event-logger)
    │
    ▼
EventLog record: { orgId, actorUserId, entityType, entityId, action, payload }
```

Actions tracked: CREATED, UPDATED, APPROVED, REJECTED, STATUS_CHANGED, DELETED, EXPORTED, SIGNED, VIEWED, DOWNLOADED, COMMENT_ADDED, ASSIGNED, UNASSIGNED, RESTORED, ARCHIVED.

### Async Job Pattern

Expensive operations (large exports, bulk scans) use an async pattern to keep API calls fast:

1. Service handler writes a Job record to DynamoDB (status: PENDING)
2. Enqueues work via SQS or Step Functions
3. Worker builds artifact in S3
4. Job record updated (status: COMPLETED, s3Key populated)
5. Consumer polls `getExportJobStatus(jobId)` for signed download URL

### Outbound Webhooks (Planned)

Push events to customer-configured endpoints. Natural extension of the existing DynamoDB Streams infrastructure. Enables:
- AI agents reacting to domain events in real-time
- Slack/Teams notifications
- Zapier/Make/n8n workflow triggers

---

## Build Sequence

| Phase | What | When | Dependencies |
|---|---|---|---|
| **1** | AppSync + GraphQL schema + Lambda triggers | **Current** | — |
| **2** | Frontend UI features + service layer handlers (built in tandem) | **Next** | Phase 1 |
| **3** | AI assistant orchestrator + chat UI | After 3-4 handlers exist | Phase 2 |
| **4** | REST API (API Gateway + Lambda) | Post-MVP, demand-driven | Phase 2 |
| **5** | MCP Server (AgentCore) | Post-MVP, demand-driven | Phase 2 (+ Phase 4 for shared patterns) |
| **6** | Outbound webhooks | Post-MVP, demand-driven | Phase 1 (DynamoDB Streams) |

Phase 2 is the critical path. Every handler built during Phase 2 becomes immediately available to the AI assistant (Phase 3), REST API (Phase 4), and MCP server (Phase 5) when those surfaces are added. The service layer is the shared investment.

---

## Key Files

| Component | File |
|---|---|
| **Data schema** | `amplify/data/resource.ts` |
| **Backend wiring** | `amplify/backend.ts` |
| **Auth config** | `amplify/auth/resource.ts` |
| **Storage config** | `amplify/storage/resource.ts` |
| **Lambda functions** | `amplify/functions/*/handler.ts` |
| **Function definitions** | `amplify/functions/*/resource.ts` |
| **Auth trigger** | `amplify/auth/post-confirmation/handler.ts` |
| **Service layer (tool handlers)** | `lib/services/*.ts` (planned) |
| **AI assistant orchestrator** | `app/api/assistant/route.ts` (planned) |
| **Frontend app** | `app/` (Next.js 16 App Router) |
| **Shared UI components** | `components/ui/` (shadcn/ui) |
| **Custom components** | `app/components/` |

---

## Related Docs

- [In-App Copilot](./in-app-copilot.md) — orchestrator pattern, tool handler design, guardrails
- [MCP Server](./mcp-server.md) — hosting, tool design, auth, async job pattern
- [AI Features](./ai-features.md) — AI-assisted capabilities (drafting, assessments, etc.)
- [Subscriptions & Payments](./subscriptions-and-payments.md) — tier enforcement, Stripe integration, backend patterns
- [Onboarding & Permissions](./onboarding-and-permissions.md) — Cognito groups, RBAC, onboarding flow
- [Design System](./design-system.md) — UI components, colors, typography
