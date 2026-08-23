# Design Principles

Research-backed product and marketing-site design principles for any B2B SaaS product built on this platform. Sources: Nielsen Norman Group (visual design, color, F-pattern), WCAG, and UX-writing research.

## First impressions

- Users form an impression of a site in ~0.05 seconds based on structure, spacing, fonts, and color. The first screen must communicate value instantly — polish is not optional.
- Clear, concise headlines and subheads reduce cognitive load; put the most important information in the first two paragraphs.

## Color

**Emotional associations** (use as defaults, not laws):

| Color | Signal | Typical use |
|---|---|---|
| Blue (dark) | Trust, reliability, professionalism | Primary brand color for trust-critical products |
| Blue (bright) | Calm, security | Links, highlights, secondary accents |
| Green | Growth, health, harmony, success | Success states, positive progress |
| Red | Urgency, excitement | CTAs (sparingly), errors, critical status |
| Amber/Yellow | Optimism, attention | Warnings, expiring/at-risk status |
| Black | Sophistication | Premium positioning |
| Neutrals (white/grey) | Whitespace, breathing room | Backgrounds — avoid pure white; a warm light grey reduces eye fatigue |

**Rules:**

- Limit the palette to 2–3 main colors for harmony; add semantic status colors (green/amber/red) separately.
- Reserve warm alert colors (red/amber) for warnings and critical states only. Never let them bleed into marketing copy — keep the overall tone reassuring.
- Color meanings are cultural, not universal — validate the palette with users in your target market.
- Contrast is non-negotiable: minimum 4.5:1 text-to-background ratio (WCAG AA). Test every text/background pair. Do not de-emphasize text by lowering contrast below legible levels.
- Provide dark-mode alternatives built on the same principles.
- Status dashboards benefit from traffic-light semantics (green = healthy, amber = expiring/at-risk, red = broken/missing) — universally scannable.

## Typography

- **Serif** fonts signal seriousness, credibility, authority, tradition — good for long-form content and headings on trust-oriented brands.
- **Sans-serif** fonts signal modernity, clarity, approachability — best for screen body text and scanning.
- **Slab serif** conveys confidence and stability — headline use only. **Script/display** fonts reduce readability — logo only, if at all.
- A proven pairing for trust-oriented B2B: sans-serif body (e.g., Inter, IBM Plex Sans) + serif headings (e.g., Merriweather, Libre Baskerville). An all-sans system (e.g., Inter + Montserrat headings) reads more modern/technical. Pick per product personality.
- Body text minimum 16px; line height ~1.5× font size; adequate letter spacing.
- Use multiple weights of a familiar, web-safe family to build hierarchy (light body, semi-bold headings, bold CTAs) rather than adding more typefaces.
- Typography measurably moves brand perception — good typography lifts positive response by up to ~13%.

## Layout, hierarchy, and Gestalt

- **Scale:** important elements are bigger. Use only 2–3 type sizes (small/medium/large) to guide the eye; too many sizes destroys hierarchy.
- **Balance:** distribute visual weight; symmetry feels stable, asymmetry adds energy. No single area should overwhelm.
- **Contrast:** juxtapose color/size/weight to signal difference. Use it to make CTAs and errors pop.
- **Gestalt principles:** users perceive wholes, not parts — similarity, continuation, closure, proximity, common region, figure/ground, symmetry. **Proximity is the most load-bearing:** group related elements tightly, separate unrelated ones with whitespace. Place form labels adjacent to their fields; crowding confuses.
- **F-pattern scanning:** users scan the top line, then down the left edge, focusing on the first paragraphs. Left-align key text, front-load headings and bullets with meaningful words, use subheadings and bullet lists.
- Generous whitespace and large line heights reduce cognitive load throughout.

## Copywriting and microcopy

- **Microcopy reduces doubt.** At every hesitation point (forms, payment, destructive actions), add short explanatory text: why the information is needed, what happens next. Example: an email field with "Used to send your access link."
- **Tone:** calm, neutral, considerate. Friendly ≠ jokey. In errors, guide to resolution without blame ("That email address doesn't look correct — please check the format," never "You entered an invalid email").
- **Headlines** convert via emotional triggers: curiosity, fear of missing out, problem-solving, self-improvement, simplification.
- **CTAs:**
  - State clearly what happens on click.
  - Emphasize the user's benefit, not your action — "Get My Free Strategy Guide," never "Submit."
  - Use first-person language ("Start my trial").
  - Create urgency without false scarcity; address objections near the button.
- **Trust signals:** concise, concrete credibility statements near conversion points (data residency, certifications/standards supported, security posture).
- Microcopy must align with brand values and tone across the whole customer journey — a word in a headline or CTA decides whether a user engages or leaves.

## Marketing homepage structure

A proven section order for a B2B SaaS landing page:

1. **Hero** — succinct outcome headline (state the result, with a timeframe if honest — e.g., "Audit-ready in days, not months"), one-sentence sub-header explaining what it is and for whom, single high-contrast CTA.
2. **Problem statement** — the top 2–4 pains as horizontal cards: icon + one sentence each, in the buyer's own words.
3. **Features grid** — 3–4 cards for core modules: title, one-sentence benefit, simple graphic, subtle hover.
4. **Product preview** — a real screenshot of the most visually legible screen (dashboards work well); explain what it lets the user do proactively.
5. **Credibility** — testimonials if available; otherwise concrete statements (standards supported, data residency).
6. **Pricing teaser** — "Plans from $X/month," lead with the pricing simplicity itself (e.g., no per-user fees) to drive sign-ups.
7. **Footer** — privacy, terms, roadmap, contact. Minimal.

This structure supports F-pattern scanning: value is stated immediately, then scannable sections.

## Product UX rules

- High-contrast CTA buttons with clear microcopy.
- Responsive layouts — assume users check the product on phones/tablets in the field, not just at desks.
- Provide a short onboarding tour of the 2–3 core actions.
- Resist navigation sprawl: limit top-level nav to ~6 items mapped to core workflows; push secondary links into settings or contextual menus.

## Launch checklist

1. Test all text/background pairs against 4.5:1 contrast; ship dark mode on the same tokens.
2. Verify consistent scale/spacing; most important info in the first two paragraphs of every page.
3. Every CTA states its value in first person; every form field that could cause hesitation has microcopy.
4. Validate palette, type, and copy with a small sample of real target-role users before launch — emotional resonance is testable, not assumable.
