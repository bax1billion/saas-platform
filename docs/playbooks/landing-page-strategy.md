# Landing Page Strategy Playbook

A section-by-section framework for a SaaS marketing homepage, with the conversion psychology behind each choice. Pair with `brand-strategy.md` (voice, palette, typography).

---

## 1. Conversion Psychology Foundations

Design every section against these facts:

- **First impressions form in ~0.05 seconds**, from structure, spacing, fonts, and color — before anyone reads a word. Clear, concise headlines and generous spacing buy trust before comprehension.
- **F-pattern scanning:** users read the top line(s) horizontally, then scan down the left edge. Therefore:
  - Put the headline and value proposition in the first two lines.
  - Front-load headings and bullets with meaningful keywords.
  - Left-align key text; use subheadings and bullet lists to support scanning.
- **Visual hierarchy:** use **2–3 distinct element sizes** (small/medium/large). Important elements are larger; use bright color or scale to emphasize key actions. Balanced layouts distribute weight — symmetry feels stable, asymmetry adds energy.
- **Gestalt principles:**
  - *Proximity* — group related text/icons tightly; separate unrelated sections with white space.
  - *Similarity* — consistent styling (color, size, shape) signals elements belong together.
  - *Contrast* — juxtapose dissimilar elements to signal difference; use it for CTAs and error states.
  - Keep form labels next to their fields.

---

## 2. Page Structure (in order)

The canonical section order tells a story: promise → pain → solution → proof → price → exit. Each section below lists its purpose, contents, and copy rules.

### 2.1 Hero

**Purpose:** communicate the outcome and the ICP in one glance; capture the primary conversion.

- **Headline:** the outcome promise in imperative or declarative form — the customer's desired end-state, not a feature. Pattern: *"<Verb> every <thing they worry about>. Be <desired state> — always."*
- **Sub-header:** what the product is + who it's for + 2–3 concrete verbs of what they'll do with it. Pattern: *"<Product> is the <adjective> <category> built for <ICP>. <Verb> your <object>, <verb> <object> and <verb> <object> with complete confidence."*
- **Primary CTA:** first-person, value-oriented — *"Start my <outcome> trial"*. Research shows this outperforms generic labels ("Get Early Access", "Submit").
- **Secondary CTA:** a low-commitment alternative — *"See how it works"* — for visitors not ready to convert.
- **Background:** abstract geometric pattern in brand colors, optionally overlaid on a desaturated photo of the ICP's real environment.

### 2.2 Problem Statement

**Purpose:** make the visitor feel recognized before you pitch anything.

- 3 icon-and-text cards, each naming one validated pain point (one line each).
- A framing sentence that names the status quo and its cost: *"<Current tools> leave you <scrambling/exposed/guessing> before <the high-stakes moment>."*
- Source the pains from real customer research, not guesses; use the buyer's own vocabulary.

> **Example (from a compliance-SaaS launch):** cards for "disorganized data across spreadsheets, drives and email", "outdated documents with no version control", "training gaps with no visibility" — framed as "Spreadsheets and binders leave you scrambling before audits."

### 2.3 Features Grid

**Purpose:** show the product maps 1:1 onto the pains just named.

- **3–4 cards**, one per core module — no more; a longer list reads as bloat.
- Each card: succinct branded title, **one-sentence** description in the pattern *"<Verb> <object> so you always <outcome>"*, a simple graphic, subtle hover effect.
- Order the cards to mirror the buyer's workflow.

### 2.4 Product Preview

**Purpose:** proof the product exists and is simple — show, don't claim.

- One real screenshot of the highest-signal screen (typically a status dashboard with at-a-glance indicators and counts of items needing attention).
- One short explanation of the *behavioral change* it enables: proactive management instead of last-minute scrambling.

### 2.5 Credibility Signals

**Purpose:** de-risk the decision. Use this fallback hierarchy:

1. **Customer quotes** (pilot users count) — if available.
2. If not, **concise factual statements**: standards/frameworks supported, data residency ("Your data stays in the U.S." — or wherever applies), security/durability guarantees ("every record is timestamped and immutable" — whatever your defensible claim is).
- Keep each signal one line; specificity beats superlatives.

### 2.6 Pricing Teaser

**Purpose:** qualify visitors and remove the "call us" fear without a full pricing table.

- *"Plans from $X/month."*
- Lead with the pricing-model differentiator, stated as a customer benefit (e.g., *"No per-user fees. All modules included."*).
- Simple, transparent framing drives sign-ups; opaque pricing is itself a competitor pain point to exploit.

### 2.7 Footer

- Privacy policy, terms, product roadmap, contact email.
- Company legal line: `© <year> <Company name>`.
- Keep minimal and accessible.

---

## 3. Microcopy & Copywriting Rules

### CTAs
- First-person, value-oriented language everywhere, not just the hero.
- Be explicit about what happens when clicked; emphasize the user's benefit.
- Create urgency without false scarcity.
- Address objections inline where possible.

### Forms
- Explain **why** each piece of information is needed, next to the field ("Used to send your access link").
- Anticipate concerns and address them before they become blockers.
- Explanatory text: one sentence max.

### Errors
- Neutral, guiding phrasing: "That email address doesn't look correct. Please check the format."
- Never blame the user; be specific about what went wrong and what to do next.

### Tone
- Calm, neutral language conveys respect; friendly means clear and considerate, not jokey.
- Explain without overloading; avoid judgement.
- Match the brand verb list and voice defined in `brand-strategy.md`.

---

## 4. UX & Accessibility Requirements

- Generous white/light-gray space; line heights **1.5×** font size to reduce cognitive load.
- High-contrast CTA buttons (accent-on-dark or dark-on-light) with value-oriented microcopy.
- **All color combinations meet WCAG 4.5:1** contrast.
- Reserve warning/critical colors (amber/red) for actual status states — never in marketing copy; it undermines a reassuring tone.
- **Responsive** layouts for tablet and phone — assume the buyer checks from wherever they work, not just a desk.
- Body text ≥ 16px; 2–3 type sizes only; front-load keywords in headings.
- Plan **dark mode** with the same psychological principles.
- **Test with target users before launch:** palette, typography, and copy with a sample of real ICP members.

---

## 5. Pre-Launch Checklist

- [ ] Headline states an outcome, not a feature
- [ ] Sub-header names the ICP explicitly
- [ ] Primary CTA is first-person and value-oriented; secondary CTA is low-commitment
- [ ] Problem cards use research-validated pains in the buyer's vocabulary
- [ ] Features grid limited to 3–4 cards, each one sentence
- [ ] Real product screenshot present
- [ ] Credibility section has quotes or, failing that, specific factual trust statements
- [ ] Pricing teaser shows a starting price and the pricing-model differentiator
- [ ] Every text/background pairing passes 4.5:1 contrast
- [ ] Page scanned top-to-bottom follows the F-pattern (value proposition readable from headline + left edge alone)
- [ ] SEO title tag `<Product> | <category descriptor>`; meta description = ICP + top verbs/outcomes
