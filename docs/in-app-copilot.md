# In-App AI Assistant

## Overview

The product includes an AI-powered assistant embedded in the app UI. Users ask natural-language questions about their data, and the assistant translates them into structured queries, fetches the relevant data, and streams back an explanation with suggested actions.

The assistant is **not** a general-purpose chatbot. It is a domain-focused tool that operates within the user's permissions and only accesses the data they're authorized to see.

---

## Architecture

```
┌──────────────────────────────────────────────────────────────┐
│  Browser                                                     │
│                                                              │
│  Chat Panel UI                                               │
│  ┌─────────────────────────────────────────────────────────┐ │
│  │  User: "What needs attention before month end?"         │ │
│  │                                                         │ │
│  │  Assistant: Based on your current data...               │ │
│  │  • 87% completion score                                 │ │
│  │  • 3 items overdue                                      │ │
│  │  • 2 records missing required data                      │ │
│  │                                                         │ │
│  │  [Generate report]  [View overdue items]                │ │
│  └─────────────────────────────────────────────────────────┘ │
│         │  POST + SSE stream                                 │
└─────────┼────────────────────────────────────────────────────┘
          │
          ▼
┌──────────────────────────────────────────────────────────────┐
│  Next.js API Route  (app/api/assistant/route.ts)             │
│  ── Orchestrator ──                                          │
│                                                              │
│  1. Validate Cognito session                                 │
│  2. Parse user message + conversation history                │
│  3. LLM call → decide which tool handlers to invoke          │
│  4. Call tool handlers (import from lib/services/*)          │
│  5. LLM call → generate response using tool results          │
│  6. Stream response back via SSE                             │
└──────┬───────────────────────────────┬───────────────────────┘
       │                               │
       ▼                               ▼
┌──────────────┐              ┌──────────────────┐
│ lib/services │              │ Bedrock / Claude  │
│ (tool        │              │ API               │
│  handlers)   │              │ (server-side      │
│              │              │  only)            │
└──────┬───────┘              └──────────────────┘
       │
       ▼
┌──────────────┐
│ AppSync      │
│ GraphQL      │
│ (with user's │
│  auth token) │
└──────────────┘
```

---

## Hosting Decision: Next.js API Route

The orchestrator is a **Next.js API route** (`app/api/assistant/route.ts`), not a Lambda or AppSync custom mutation.

| Option Considered | Streaming Support | Verdict |
|---|---|---|
| **Next.js API route** | Native (`ReadableStream`, SSE) | **Chosen** — already have the server, no extra infra |
| AppSync custom mutation | No (single response) | Rejected — can't stream chat responses |
| Lambda + Function URL | Yes, but requires extra wiring | Rejected — adds compute layer, cold start latency |
| API Gateway WebSocket | Yes, but complex | Rejected — overkill for in-app assistant |

**Rationale:**
- The assistant streams LLM responses token-by-token. Next.js API routes support this natively.
- The Next.js server is already running — no reason to add another compute layer for an in-app feature.
- Lambda cold starts add latency to a user-facing chat experience.
- The orchestrator imports tool handlers directly from `lib/services/` — no network hop.

---

## Tool Handlers

Tool handlers are plain TypeScript functions that the orchestrator imports and calls. They are **not** endpoints. They live in `lib/services/` and are shared across all API surfaces (assistant, REST API, MCP server).

See [architecture.md](./architecture.md) for the full handler list, directory structure, and design principles.

### How the Orchestrator Uses Them

The orchestrator uses the LLM's tool-use / function-calling capability to decide which handlers to invoke. The walkthrough below is a worked example using handlers from a hypothetical compliance vertical:

1. **User sends message** — "Who is overdue on training at the Austin plant?"
2. **First LLM call** — orchestrator sends the message + available tool definitions (JSON schema describing each handler's name, parameters, and purpose). The LLM responds with a tool call: `listOverdueTraining({ siteId: "austin-01", criticalOnly: false })`
3. **Orchestrator executes** — calls the handler with the user's auth token. The handler queries AppSync and returns structured data.
4. **Second LLM call** — orchestrator sends the tool result back to the LLM. The LLM generates a natural-language response incorporating the data.
5. **Stream response** — the LLM output is streamed to the browser via SSE. Structured action suggestions (buttons/cards) are included as metadata alongside the text.

### Tool Definitions for the LLM

Each handler is described to the LLM as a tool with a JSON schema. The orchestrator maintains a registry. Example (compliance vertical) registry entries:

```typescript
// lib/assistant/tool-registry.ts

export const assistantTools = [
  {
    name: 'getReadinessScore',
    description: 'Get the compliance readiness score for a standard at a site',
    parameters: {
      type: 'object',
      properties: {
        standardId: { type: 'string', description: 'The standard to check (e.g., ISO 9001)' },
        siteId: { type: 'string', description: 'The site to scope the check to (optional)' },
      },
      required: ['standardId'],
    },
  },
  {
    name: 'listOverdueTraining',
    description: 'List employees with overdue or expiring training records',
    parameters: {
      type: 'object',
      properties: {
        siteId: { type: 'string' },
        criticalOnly: { type: 'boolean', description: 'Only show safety-critical training' },
      },
    },
  },
  // ... one entry per handler in lib/services/
];
```

### Multi-Step Tool Calls

The LLM may request multiple tool calls in sequence to answer a complex question. Example (compliance vertical):

> "Are we ready for next month's ISO 9001 audit?"

1. LLM calls `getReadinessScore({ standardId: 'iso-9001' })`
2. LLM sees the score is 74% and calls `listTopGaps({ standardId: 'iso-9001' })` for details
3. LLM calls `listOverdueTraining({ siteId: 'main' })` to check the training gap
4. LLM synthesizes all three results into a single response

The orchestrator loops until the LLM returns a final text response (no more tool calls), with a configurable max iteration limit to prevent runaway loops.

---

## Request Flow

```typescript
// app/api/assistant/route.ts (simplified)

export async function POST(req: Request) {
  // 1. Validate Cognito session
  const session = await getAuthSession(req);
  if (!session) return new Response('Unauthorized', { status: 401 });

  // 2. Parse request
  const { message, conversationHistory } = await req.json();

  // 3. Build messages array with tool definitions
  const messages = [...conversationHistory, { role: 'user', content: message }];

  // 4. Agentic tool-use loop
  let response = await llm.invoke({ messages, tools: assistantTools });

  while (response.hasToolCalls) {
    const toolResults = await executeToolCalls(response.toolCalls, session.token);
    messages.push(response.message, ...toolResults);
    response = await llm.invoke({ messages, tools: assistantTools });
  }

  // 5. Stream final response
  const stream = await llm.stream({ messages, tools: assistantTools });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
    },
  });
}
```

---

## Guardrails

These are non-negotiable from day 1.

### Data Minimization

The orchestrator fetches only the fields needed for the user's question. Tool handlers return focused, structured results — not raw database dumps. The LLM sees summarized data, not full records.

### Role-Based Enforcement

The assistant inherits the user's Cognito session and RBAC group (Admin / Member / Viewer). It calls AppSync with the user's auth token. A Viewer's assistant cannot create records, approve changes, or trigger exports. AppSync enforces this at the resolver level — the assistant doesn't need its own permission logic.

### Write Actions Require Confirmation

The assistant can **suggest** write actions but never auto-executes them. Suggestions are returned as structured action metadata (button label + mutation details). The user clicks to confirm, and the frontend executes the mutation directly — not through the assistant.

Examples (compliance vertical):
- "Generate audit packet" → button that triggers the corresponding export mutation
- "Assign training to Jane" → button that opens the assignment form

### Audit Logging

Every assistant interaction is logged to EventLog:
- What the user asked
- Which tool handlers were called (with parameters)
- What data was returned
- What the assistant suggested

The assistant's actions must be as auditable as any user's — table stakes for any product serving regulated or audit-sensitive verticals.

### Async for Expensive Operations

Operations like large export or report generation are handled via the async job pattern (see [architecture.md](./architecture.md#async-job-pattern)). The assistant kicks off the job and tells the user it's processing — it doesn't block on long-running work.

### Iteration Limits

The agentic tool-use loop has a configurable max iterations (default: 5) to prevent runaway LLM behavior. If the limit is hit, the assistant returns a graceful message asking the user to refine their question.

---

## Chat UI

### Placement

A collapsible panel on the right side of the app (or a floating button that expands). Always accessible from any app page. Does not navigate the user away from their current context.

### Components

- **Message list** — user messages + assistant responses (markdown-rendered)
- **Input field** — text input with send button
- **Action cards** — structured suggestions rendered as clickable buttons/cards below the assistant's text response
- **Streaming indicator** — shows the assistant is generating a response
- **Conversation history** — maintained in client state for the session. Optionally persisted server-side for cross-session continuity (future).

### Streaming

The frontend uses `EventSource` or `fetch` with a `ReadableStream` reader to consume the SSE stream from the API route. Tokens are appended to the response in real-time.

---

## Conversation Context

The orchestrator receives the full conversation history with each request (client sends it). This allows multi-turn conversations:

> **User:** "Show me overdue items"
> **Assistant:** (calls `listOverdueItems`, shows 5 results)
> **User:** "Just the Austin site"
> **Assistant:** (calls `listOverdueItems({ siteId: 'austin' })`, shows 2 results)

Conversation history is trimmed to a rolling window (e.g., last 20 messages) to stay within LLM context limits.

---

## What the Assistant Is Not

- **Not a general chatbot.** It answers questions about the product's domain using the tenant's data. It does not answer unrelated questions.
- **Not a superuser.** It operates under the same permissions as the user.
- **Not autonomous.** It suggests actions but never executes writes without user confirmation.
- **Not a replacement for the UI.** It complements the dashboard, tables, and forms — it doesn't replace them. Users can always do everything through the standard UI.

---

## Build Sequence

The assistant is built in Phase 3, after 3-4 tool handlers exist from Phase 2 (see [architecture.md](./architecture.md#build-sequence)).

| Step | What | Depends On |
|---|---|---|
| 1 | Tool handlers in `lib/services/` | Built in tandem with UI features (Phase 2) |
| 2 | Tool registry (`lib/assistant/tool-registry.ts`) | Step 1 — one registry entry per handler |
| 3 | Orchestrator API route (`app/api/assistant/route.ts`) | Step 2 + Bedrock/Claude API access |
| 4 | Chat panel UI component | Step 3 |
| 5 | Audit logging for assistant interactions | Step 3 |
| 6 | Conversation persistence (optional, future) | Step 4 |

---

## Key Files (Planned)

| File | Purpose |
|---|---|
| `lib/services/*.ts` | Shared tool handler functions |
| `lib/assistant/tool-registry.ts` | Tool definitions (JSON schema) for the LLM |
| `lib/assistant/orchestrator.ts` | Core loop: parse → plan → execute tools → stream LLM response |
| `app/api/assistant/route.ts` | Next.js API route — POST endpoint, SSE streaming |
| `app/components/AssistantPanel.tsx` | Chat panel UI component |

---

## Related Docs

- [Architecture](./architecture.md) — system diagram, shared service layer, build sequence
- [MCP Server](./mcp-server.md) — external agent access to the same tool handlers
- [AI Features](./ai-features.md) — AI-assisted capabilities beyond the assistant (inline AI actions embedded in the UI)
- [Onboarding & Permissions](./onboarding-and-permissions.md) — RBAC groups that the assistant inherits
