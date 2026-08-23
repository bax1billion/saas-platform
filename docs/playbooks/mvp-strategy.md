# MVP Strategy Playbook

A repeatable framework for picking a niche, validating it, scoping an MVP, and getting first paying customers for any consultancy-style vertical SaaS product. Domain examples are illustrative only.

## 1. Niche selection: why "boring" wins

- Sexy tech markets have heavy competition and low willingness to pay. Boring industries (back-office workflows, compliance, logistics, field operations) have huge pain and real budgets.
- Customers in these niches don't want disruption — they want efficiency, less manual work, and fewer penalties. Solve a real business problem and churn stays very low.
- Don't chase buzzwords. Look for real workflows that waste time and money.
- Zero competition ≠ no opportunity — it often means established tech skipped the space because it wasn't glamorous.

**Niche scorecard** — a strong vertical looks like:

| Factor | Target |
|---|---|
| Pain intensity | Money/penalties on the line; buyer personally blamed for failures |
| Modern tooling | Little — incumbents are spreadsheets, shared drives, paper, email, tribal knowledge |
| Willingness to pay | High — they pay for safety/relief, not novelty |
| Churn | Very low once embedded as system of record |
| Sales cycle | Short at the SMB end |
| Budget owner | Identifiable single role who owns the pain |
| Competition | Fragmented legacy tools, or enterprise suites ignoring SMB |

## 2. Frame the real problem

For the chosen niche, write down:

1. **Obligations/pressures** the buyer is subject to (regulations, customers, deadlines).
2. **Current tools** — usually Excel, shared drives, paper, email, tribal knowledge.
3. **Cost of failure** — fines, lost contracts, halted operations, reputation, personal blame.
4. **The questions the buyer actually asks** (in their words). These become your feature spec and your marketing copy. *Example from a compliance product: "Are we ready?", "Where is the evidence?", "Who signed what and when?", "Which version is current?", "Who is overdue?"*

Buyers of this kind don't want AI hype. They want **confidence**. Build for the emotion, not the technology.

## 3. Buyer targeting: sell to whoever owns the pain

- You are not selling to engineers, executives, or IT. You are selling to **the person who owns the pain** — the role that is personally blamed when things go wrong, lives in spreadsheets, and wants their life back.
- Map the buying chain explicitly:
  1. Pain-owner discovers the tool.
  2. Pain-owner validates internally.
  3. A director/ops leader signs the budget (cares about risk, cost, stability — but rarely discovers tools).
  4. Pain-owner becomes internal champion.
- **Corollary: the product must make your champion look like a hero.**
- Also write down who you do NOT target and why (CEO: too busy; CTO: not the pain owner; end workers: not buyers) — this disciplines outreach.
- Write a one-sentence ICP: *"[Role] at a [size]-employee [industry] company, [qualifying constraint], currently using [incumbent stack]."*

## 4. Competitive landscape method

- Bucket competitors into tiers: **enterprise suites** (deep features, high price, consultant-led onboarding), **mid-market tools** (good core features, per-user pricing), **adjacent/utility platforms** (low-code, generic workflow tools people repurpose). For each: strength, typical customer, price tier, and what it teaches you about must-have features.
- The exploitable gaps are usually the same four:
  1. **Usability for small customers** — incumbents assume consultants and heavy onboarding.
  2. **Execution focus** — incumbents track records but don't help the work get done right.
  3. **Modern UX for frontline teams** — legacy platforms are clunky and slow to deploy.
  4. **Simple pricing and self-serve onboarding** — incumbents mean long sales cycles, per-module/per-seat fees.
- Positioning angles that follow: "the outcome, without the enterprise price tag" / "built for frontline teams, not consultants" / "confidence, not chaos" / "lightweight, not bloated."
- Differentiate on doing the basics reliably (system of record, immutable history, visibility dashboard, one-click export) rather than out-featuring incumbents. Note enterprise players' features as a roadmap of what to *defer*, not copy.

## 5. MVP scoping rules

- Build the **smallest product that removes one major pain**. Not a platform. Not a suite. **A relief valve.**
- Pick ONE core pain to solve first, even when research surfaces three obvious modules. Not all three.
- Build-order skeleton for a system-of-record MVP: login → upload/create records → tag records to the thing that matters (requirement, client, deadline) → export → simple status dashboard.
- Explicitly defer: AI, complex workflows, automation, configurability, adjacent modules. "Just clarity and confidence."
- Add complexity only after the core experience **delights** users — expansion (adjacent workflows, scoring, integrations, portals) comes once you're trusted.
- Dashboard pattern that repeatedly works: traffic light — red = missing/broken, yellow = expiring/at-risk, green = healthy — plus counts of overdue items.

## 6. 90-day execution plan (Validate → Build → Launch)

Goal: first 3–10 paying customers. You are not trying to be perfect; you are trying to be useful and trusted.

**Phase 1 — Discovery & positioning (days 1–30), ~5–7 hrs/week**

- *Week 1:* Build a prospect list (e.g., LinkedIn saved search on target titles + industry + company size). Track name, title, company, URL, notes. Draft one positioning sentence: "I'm exploring a lightweight [outcome] tool for [role]s who are tired of [incumbent pain]."
- *Week 2:* Outreach to ~10 people/day for 5 days (50 total). No selling — only learning.
- *Week 3:* 5–10 short calls (20–30 min). Ask: What's hardest about X? What do you fear most? What tools do you use? What's broken about them? Magic-wand question. **Write down their exact phrases** — they become your landing-page copy.
- *Week 4:* Synthesize the top 3 pains, top 3 buying triggers, top 3 feature desires. Now you know what to build. Interviewees will hand you feature ideas, objections, and your marketing language — they design the product for you.

**Phase 2 — MVP build (days 31–60)**

- Build per the scoping rules above (one pain, no AI/workflows/automation).
- In parallel, ship a 1-page landing page: outcome headline ("[Outcome] without [incumbent pain]"), one-line subhead ("A lightweight [category] for [role]s"), waitlist form.

**Phase 3 — Launch & convert (days 61–90)**

- *Week 9:* Return to interviewees: "I built the tool we talked about. Want early access?"
- *Week 10:* Offer a free 14-day trial or discounted early-adopter pricing.
- *Week 11:* Collect feedback, refine.
- *Week 12:* Raise the price for new users.

**Hard rules:**

- **Do not build until 10 discovery conversations have happened.** This saves months.
- The plan fits real life: ~30 min/day outreach, ~2 hrs/week calls, ~4 hrs/week building.

## 7. Outreach scripts (curiosity + respect, never sales)

Adapt placeholders; the tone is the framework.

- **First contact:** "Hi {{Name}}, I'm exploring a small project around [outcome] for [role]s. I'm not selling anything — just trying to understand what makes [painful event] stressful in real life. Would you be open to a 15-minute chat? Thanks either way."
- **Follow-up (3–4 days):** "Just following up — I'm speaking with a few [role]s about [workflow] and learning a ton. Totally understand if now isn't a good time."
- **After they agree:** "Thank you! I'll keep it simple and respectful of your time. I'm mainly curious what's hardest in [workflow] today and what tools don't quite work."
- **Post-call:** "Thank you again — your insight was extremely helpful. I may reach out once I build something based on what I learned."
- **Re-engagement:** "I built the lightweight [outcome] tool we discussed and would love your honest feedback."

Why it works: you're listening, not selling; you position as a builder, not a marketer. Practitioners in unglamorous roles respect that.

**Where to find buyers:** LinkedIn title search, industry groups, professional associations, consultant blogs, trade newsletters, relevant Reddit/forum threads. Speak their language, not SaaS/startup language.

## 8. Pricing

- Simple, transparent, boring tiers — e.g., three flat monthly plans keyed to customer complexity (small / multi-site / regulated: think $99 / $199 / $399 as a shape, not gospel).
- **No freemium** for risk-averse B2B buyers: "They don't want free. They want safe." Free signals unserious.
- No per-user fees and no per-module gating for SMB — opaque, seat-based pricing is a top reason small buyers reject incumbents. Transparent pricing is itself a differentiator worth marketing.
- Use discounted early-adopter pricing to convert interviewees, then raise prices for new customers.

## 9. Brand and messaging

- Voice: reassuring, straightforward, professional — "boring but effective." No jargon, no AI buzzwords.
- Use outcome verbs (track, protect, prove, simplify) and speak to the buyer's anxiety ("sleep well before your next [stressful event]").
- Value-prop template: position as the "[outcome] co-pilot" for [underserved segment], with a core promise of one sentence ("Always [ready-state], with a defensible history").
- Narrative pillars that generalize: **defensibility/trust** (records are timestamped, history is complete), **simplicity/speed** (onboard in days, no hidden modules), **visibility/control** (status at a glance), **affordability** (transparent pricing).
- Content marketing: publish guides that answer the pains discovered in research (how-to checklists for the buyer's stressful events) — these double as SEO and trust-building.

## 10. Founder fit and expectations

- You do **not** need domain expertise. You need listening, translation, and execution — your job is to turn their pain into software.
- Set honest expectations: this kind of business won't be viral or famous. It will be profitable, stable, sellable, and low-stress.
- Exit shape: niche B2B SaaS at ~$5M ARR is a plausible $20M+ acquisition; private equity likes sticky compliance-ish SaaS; roll-up potential exists. Aim for durable, not unicorn.
- First concrete step, always: draft landing copy, create a waitlist form, message 20 target buyers, validate the pain language — this week.
