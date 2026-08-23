# AI Features

## Overview

AI is **built into the product, not branded as a feature**. There is no "AI tier" or "AI toggle." Every pricing tier gets the same AI capabilities. The product is smart by default.

AI features fall into two categories:

1. **Assistant** — natural-language interface for querying product data and triggering workflows (see [in-app-copilot.md](./in-app-copilot.md))
2. **Inline AI** — context-specific AI actions embedded directly in the UI, triggered by buttons or automatic suggestions — not through the chat assistant

This document covers the inline AI features. For the assistant, see [in-app-copilot.md](./in-app-copilot.md).

---

## Inline AI Features

The concrete inline AI features are defined by the vertical built on the foundation — the foundation provides the pattern, the LLM plumbing, and the guardrails. The subsections below describe the recurring patterns, illustrated with short **Example (compliance vertical)** callouts from a hypothetical manufacturing-compliance product.

### Content Drafting & Editing

AI-assisted authoring for the vertical's document-style entities.

| Capability | Description | Where in UI |
|---|---|---|
| **Draft generation** | Generate a first draft of a document from a prompt | Content editor — "Draft with AI" button |
| **Rewrite / refine** | Improve writing quality, simplify technical jargon, make instructions clearer | Content editor — select text → "Refine" |
| **Summarize** | Generate a concise summary of a long document | Content viewer — "Summarize" button |
| **Translate** | Translate content into other languages for multi-site orgs | Content viewer — future |

*Example (compliance vertical):* drafting an SOP from a prompt like "Write an SOP for incoming material inspection per ISO 9001 clause 8.4."

**Implementation:** Server-side LLM call (Bedrock / Claude API) via an AppSync custom mutation. The user's content is sent to the LLM with a system prompt scoped to the vertical's writing domain. The result is returned to the editor for user review — never auto-saved.

### Change Summary Generation

When a new version of a versioned entity is created, AI generates a structured summary of what changed between versions.

| Capability | Description | Where in UI |
|---|---|---|
| **Version diff summary** | Structured summary of what changed between the two versions | Version history — auto-generated on new version approval |

*Example (compliance vertical):* "Section 4.2 updated: added PPE requirement for chemical handling. Section 6.1 removed: obsolete calibration reference."

**Implementation:** Triggered by a version-status Lambda when a version changes to APPROVED. Compares the new version's content against the previous version and writes the summary to the version record.

### Assessment Generation

AI generates quizzes and assessments to verify comprehension of the vertical's content — relevant for verticals with training- or certification-style features.

| Capability | Description | Where in UI |
|---|---|---|
| **Quiz generation** | Generate multiple-choice or short-answer questions from a source document | Course setup — "Generate assessment" button |
| **Answer key** | Generate correct answers + explanations for each question | Course setup — alongside quiz |
| **Difficulty tuning** | Adjust question complexity based on the learner's role or the content's criticality | Course setup — difficulty selector |

*Example (compliance vertical):* generating a comprehension quiz from an approved SOP before sign-off.

**Implementation:** Server-side LLM call via AppSync custom mutation. Input: source content + desired difficulty + number of questions. Output: structured JSON (questions, options, correct answers, explanations) stored on the vertical's course/assessment record.

### Completeness & Gap Suggestions

AI reviews the records linked to a domain entity and identifies gaps.

| Capability | Description | Where in UI |
|---|---|---|
| **Gap detection** | Flag entities missing expected linked records, with a human-readable explanation | Entity detail view — inline suggestion |
| **Link mapping** | Suggest which existing records could satisfy unlinked entities | Entity list — "Suggest links" button |

*Example (compliance vertical):* "Requirement 7.1.2 has a training log but no corresponding SOP. Consider attaching the relevant work instruction."

**Implementation:** A service layer handler (e.g., `getEvidenceCoverage` in the compliance example) provides the structured data. An LLM call interprets the gaps and generates human-readable suggestions. Can run on-demand (button click) or as a background analysis.

### AI-Enhanced Scoring & Alerts

AI-enhanced status assessment that goes beyond counting completed items.

| Capability | Description | Where in UI |
|---|---|---|
| **Risk-weighted scoring** | Weights gaps by severity rather than treating all incomplete items equally | Dashboard — score widget |
| **Predictive alerts** | Project how the score changes if upcoming expirations or deadlines are missed | Dashboard — alerts panel |

*Example (compliance vertical):* "3 training records expire in the next 30 days. If not renewed, your readiness score drops to 71%."

**Implementation:** A service handler (e.g., `getReadinessScore`) computes the structured score. The LLM can optionally be used to generate the narrative summary and predictive alerts, but the core score is deterministic (not LLM-dependent).

---

## Implementation Pattern

All inline AI features follow the same pattern:

```
User triggers action (button click)
    │
    ▼
Frontend calls AppSync custom mutation
    │
    ▼
Lambda handler:
  1. Fetches relevant data (the domain records the action operates on)
  2. Constructs a scoped prompt (system prompt + user data)
  3. Calls Bedrock / Claude API
  4. Returns structured result
    │
    ▼
Frontend displays result for user review
```

**Key constraints:**
- LLM calls are always server-side (Lambda or Next.js server). Never from the browser.
- Results are presented for user review. AI never auto-saves, auto-approves, or auto-publishes.
- Prompts are scoped — the LLM receives only the data relevant to the action, not broad database access.
- All AI-generated content is flagged as such in the UI and audit trail.

---

## LLM Provider

| Option | Fit |
|---|---|
| **Amazon Bedrock** (Claude models) | Best AWS integration — IAM auth, no API key management, stays within AWS network |
| **Claude API** (direct) | More model control, latest features, but requires API key management |

Decision deferred until implementation. Both are viable. Bedrock is the default path given the all-AWS stack.

---

## What AI Does Not Do

- **Auto-approve content.** AI can draft, refine, and suggest — but approval requires a human signature.
- **Replace the audit trail.** AI-generated content is logged the same as any user action. "AI suggested this" is recorded.
- **Make domain decisions.** AI surfaces data and identifies gaps. The responsible human decides what to do about them.
- **Access data beyond the user's permissions.** All AI features operate within the user's RBAC group.

---

## Build Sequence

Inline AI features are built incrementally as the UI features they enhance are developed:

| Feature Pattern | Depends On | Phase |
|---|---|---|
| Content drafting & editing | The vertical's content management UI + editor | Phase 2 |
| Change summary generation | Versioning + approval workflow | Phase 2 |
| Assessment generation | The vertical's training/assessment UI | Phase 2 |
| Completeness & gap suggestions | Record-linking UI + a coverage service handler | Phase 2 |
| AI-enhanced scoring (narrative) | Dashboard + a scoring service handler | Phase 2-3 |

These are incremental additions to existing features, not a separate "AI phase."

---

## Related Docs

- [In-App Copilot](./in-app-copilot.md) — the chat-based AI assistant (separate from inline features)
- [Architecture](./architecture.md) — shared service layer, LLM integration points
- [MCP Server](./mcp-server.md) — external agent access to the same capabilities
- [Subscriptions & Payments](./subscriptions-and-payments.md) — "AI is built in, not branded" pricing philosophy
