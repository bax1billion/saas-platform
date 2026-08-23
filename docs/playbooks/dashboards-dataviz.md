# Dashboards & Data Visualization

Foundation guidance for building product dashboards. Two parts: the chart-library decision (a settled decision record) and the visualization method every product's dashboards should follow.

## Library decision: Recharts

**Use Recharts** for dashboard visualizations. (Not yet installed — adopt when the app shell/dashboard work begins.)

SaaS dashboards overwhelmingly need standard chart types — status breakdowns, trend lines, categorical comparisons — not bespoke interactive visualizations. Recharts fits that scope.

| Library | Verdict | Reason |
|---------|---------|--------|
| **Recharts** | **Selected** | Declarative React components, lightweight (~40KB gz), tree-shakeable, accepts CSS-variable colors, built-in `ResponsiveContainer`, renders SVG (inspectable, screen-reader friendly) |
| D3.js | Rejected | Imperative DOM manipulation fights React; built for novel custom visualizations — overkill for standard charts |
| Chart.js | Rejected | Canvas-based (no CSS control over elements); wrapper layer adds friction |
| Nivo | Rejected | Heavier bundle; opinionated design system that fights Tailwind-token styling |
| Tremor | Rejected | Tightly coupled to its own component design system; less layout flexibility |

Revisit only if a product genuinely needs novel visualization (network graphs, maps) — and then add D3 for that one view, don't replace Recharts.

All chart components need `"use client"` (Recharts requires browser APIs).

## Color: semantic tokens, never hex literals

Charts must read colors from the theme's CSS variables so a white-label re-theme re-colors every dashboard with zero chart-code changes. The shadcn token set in `globals.css` already defines the two palettes charts need:

| Job | Tokens | Rule |
|---|---|---|
| **Status** (state of a thing) | success / warning / destructive semantic tokens | Reserved exclusively for meaning: complete/healthy, expiring/at-risk, overdue/failed. Never reuse a status color as "series 4". Status is never color-alone — pair with an icon or label. |
| **Categorical** (identity of a series) | `--chart-1` … `--chart-5` | Fixed assignment order, never cycled or generated. A 6th+ series folds into "Other" or splits into small multiples. Color follows the entity: filtering series in/out must not repaint the survivors. |
| **Sequential** (magnitude) | one hue, light→dark steps of it | Never a rainbow. |
| **Neutral / context** | muted/border tokens at low emphasis | Backgrounds, remainders of donuts, gridlines. |

```tsx
// Read tokens at render time — never bake hexes into chart code
const css = (name: string) =>
  getComputedStyle(document.documentElement).getPropertyValue(name).trim();
<Cell fill={`var(--chart-1)`} />   // Recharts accepts CSS vars in SVG fills
```

When a product's theme replaces the chart tokens, validate the categorical palette for colorblind separation and surface contrast (light and dark surfaces separately) before shipping — this is computable; don't eyeball it.

## Method rules (apply to every chart)

1. **Form first, color last.** Pick the chart type from the data's job: single headline number → stat tile (not a chart); composition → donut/stacked bar; comparison → bars; change over time → line/area; two-dimensional status grid → heatmap.
2. **One axis.** Never dual-axis charts. Two measures of different scale → two charts or index both to a common base.
3. **Legends & labels.** ≥2 series always gets a legend; a single series doesn't (the title names it). Direct-label selectively (endpoints, extremes) — never a number on every point. Text wears text tokens, never the series color.
4. **Marks.** Thin marks, subtle rounded data-ends, 2px lines, small gaps between adjacent/stacked fills, recessive grid and axes.
5. **Hover is the default.** Tooltips on every plot (crosshair for line/area, per-mark for bars/cells); hit targets larger than the mark; filters in one row above the charts.
6. **Dark mode is designed, not flipped.** Chart tokens get their own dark-mode values validated against the dark surface.
7. **Offer a table view** for any chart whose data users may need to act on — it's also the accessibility fallback.

## Standard SaaS dashboard patterns

Generalized from the original product's dashboard spec — most verticals need instances of these:

### Overview (primary dashboard)
| Pattern | Chart type | Generic shape |
|---|---|---|
| Headline health score | Stat tile or radial/donut | One % or count that answers "am I OK?" |
| Status breakdown | Donut / stacked bar | Entity counts by lifecycle status (e.g. approved / in-review / draft / overdue) |
| Coverage / completeness | Horizontal bar | Items with X vs. without, grouped by category |
| Workload by state and group | Stacked bar | Status × team/department/site |
| Attention queue | Simple bar + list | Overdue/failing items by category — always linked to the drill-down |

### Trends
| Pattern | Chart type |
|---|---|
| Health score over time | Area |
| Activity per period (created/completed/approved) | Line |
| Backlog opened vs. closed | Bar |

### Drill-downs
| Pattern | Chart type |
|---|---|
| Per-category readiness/score | Grouped bar |
| Entity × dimension status grid | Heatmap (custom grid of cells) |
| Gap analysis | Horizontal bar sorted ascending — gaps first |

Example (from the compliance vertical): "readiness score" = % of requirements with current evidence; the heatmap was employees × training courses colored by status. New verticals substitute their own entities into the same shapes.
