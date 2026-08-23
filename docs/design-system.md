# Design System

## Overview

The product uses two component layers:

- **Marketing pages** (`app/page.tsx`, `app/blog/`): Custom Tailwind components. Already built, no changes needed.
- **App pages** (dashboard, settings, and the vertical's feature pages): [shadcn/ui](https://ui.shadcn.com) components + [TanStack React Table](https://tanstack.com/table) for data views.

shadcn components are copied into the project at `components/ui/` — they're source code we own, not a dependency. This means full control over styling and behavior.

---

## Color Palette

### Theme-Driven Palette

The palette is deployment-specific. Concrete brand hexes come from the theming layer — CSS variables in `app/globals.css` — alongside the brand name and other identity in `config/site.ts`. No specific palette is normative; the theme must supply these roles:

| Role | Usage |
|------|-------|
| Brand dark | Primary text, headings, brand accents |
| Primary action | Actions, CTAs, links, focus rings |
| Info accent | Secondary accent, info states |
| Neutral surface | Backgrounds, cards, muted areas |
| Warning | Warnings, attention states |
| Destructive | Errors, destructive actions |
| Background | Default page background |

> **Note:** Older components still reference brand-named CSS variables and utilities (e.g., `bg-navy`, `text-emerald`). The Phase-2 sweep replaces these with semantic tokens (`bg-primary`, `text-foreground`, etc.). New code must use semantic tokens only — never hardcoded hexes or brand-named utilities.

### Semantic Mapping (shadcn/ui)

shadcn components use semantic CSS variables. These are mapped to the theme palette in `app/globals.css`:

| Semantic Token | Maps To (role) | Usage |
|----------------|---------------|-------|
| `--background` | background | Page backgrounds |
| `--foreground` | brand dark | Default text |
| `--primary` | primary action | Buttons, links, active states |
| `--primary-foreground` | background | Text on primary |
| `--secondary` | neutral surface | Secondary buttons, subtle backgrounds |
| `--secondary-foreground` | brand dark | Text on secondary |
| `--muted` | neutral surface | Disabled backgrounds, subtle areas |
| `--muted-foreground` | brand dark @ 70% | Placeholder text, captions |
| `--accent` | neutral surface | Hover states, highlights |
| `--accent-foreground` | brand dark | Text on accent |
| `--destructive` | destructive | Delete buttons, error states |
| `--destructive-foreground` | background | Text on destructive |
| `--border` | brand dark @ 10% | Borders, dividers |
| `--input` | brand dark @ 15% | Input borders |
| `--ring` | primary action | Focus rings |

### Sidebar (Dark Background)

The app sidebar uses a dark brand background with light text:

| Token | Maps To | Usage |
|-------|---------|-------|
| `--sidebar` | brand dark | Sidebar background |
| `--sidebar-foreground` | white @ 80% | Sidebar text |
| `--sidebar-primary` | primary action | Active nav item |
| `--sidebar-border` | white @ 10% | Sidebar dividers |

### Charts

Chart tokens map to theme accents in `app/globals.css`:

| Token | Maps To (role) |
|-------|----------------|
| `--chart-1` | primary action |
| `--chart-2` | info accent |
| `--chart-3` | warning |
| `--chart-4` | brand dark |
| `--chart-5` | destructive |

---

## Typography

| Role | Font (current default) | Variable | Usage |
|------|------------------------|----------|-------|
| UI / Body | Inter | `--font-inter` | All body text, labels, inputs, buttons |
| Headings / Brand | Merriweather | `--font-merriweather` | Page titles, section headings, pricing, brand name |

Configured in `app/layout.tsx` via `next/font/google`. Available as Tailwind utilities: `font-sans` (body), `font-serif` (headings). Fonts are part of the theme — a deployment can swap them in `app/layout.tsx` without touching components, since components only use the Tailwind utilities.

---

## Icons

| Library | Package | Usage |
|---------|---------|-------|
| Lucide React | `lucide-react` | Primary icon library. Used by shadcn components and throughout the app. |
| Heroicons | `@heroicons/react` | Secondary. Used in a few existing marketing components. |

Prefer Lucide for all new work — it's what shadcn components expect.

---

## Component Library

### shadcn/ui Components

Installed at `components/ui/`. Config in `components.json`.

| Component | File | What it's for |
|-----------|------|---------------|
| Button | `components/ui/button.tsx` | Actions, CTAs, form submissions |
| Dialog | `components/ui/dialog.tsx` | Modals, confirmations |
| Dropdown Menu | `components/ui/dropdown-menu.tsx` | Context menus, action menus |
| Input | `components/ui/input.tsx` | Text inputs, search fields |
| Label | `components/ui/label.tsx` | Form labels (pairs with Input) |
| Select | `components/ui/select.tsx` | Dropdowns, pickers |
| Table | `components/ui/table.tsx` | Data tables (styled markup) |
| Tabs | `components/ui/tabs.tsx` | Tab navigation, section switching |
| Badge | `components/ui/badge.tsx` | Status indicators, tags, counts |
| Card | `components/ui/card.tsx` | Content containers, metric cards |
| Sonner | `components/ui/sonner.tsx` | Toast notifications |
| Separator | `components/ui/separator.tsx` | Horizontal/vertical dividers |

Add more as needed: `npx shadcn@latest add [component]`

Full list: https://ui.shadcn.com/docs/components

### Utility: `cn()`

`lib/utils.ts` exports `cn()` — a wrapper around `clsx` + `tailwind-merge`. Use it to conditionally compose class names without conflicts:

```tsx
import { cn } from "@/lib/utils";

<div className={cn("rounded-lg p-4", isActive && "bg-primary text-primary-foreground")} />
```

---

## Data Tables

Data-heavy views (the vertical's entity lists, user rosters, export histories) use **TanStack React Table** for headless table logic + **shadcn Table** for styled markup.

### Architecture

```
@tanstack/react-table  →  Sorting, filtering, pagination, column visibility, row selection
         +
components/ui/table.tsx  →  Styled <Table>, <TableHeader>, <TableRow>, <TableCell>
         =
Reusable DataTable component pattern
```

### Usage Pattern

1. Define columns with `ColumnDef<T>[]`
2. Create a table instance with `useReactTable()`
3. Render with shadcn `<Table>` components

```tsx
import { useReactTable, getCoreRowModel, flexRender } from "@tanstack/react-table";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
```

This pattern will be extracted into a reusable `<DataTable>` component when the first data-heavy app page is built.

---

## Conventions

### When to Use What

| Need | Use | Source |
|------|-----|--------|
| Button, input, dialog, dropdown, etc. | shadcn component | `components/ui/` |
| Data table with sorting/filtering | TanStack + shadcn Table | `@tanstack/react-table` + `components/ui/table.tsx` |
| Marketing-specific section (Hero, Pricing, etc.) | Custom component | `app/components/` |
| Class name composition | `cn()` | `lib/utils.ts` |
| Icons | Lucide React | `lucide-react` |

### File Organization

```
components/
  ui/           ← shadcn primitives (Button, Dialog, Table, etc.)

app/
  components/   ← custom product components (Navbar, Hero, Pricing, AuthModal, etc.)
```

### Spacing

Use Tailwind spacing scale. Common patterns:
- Page padding: `px-6`
- Section spacing: `py-20 sm:py-24` (marketing), `py-8` (app)
- Card padding: `p-6` or `p-8`
- Max width: `max-w-6xl` (marketing), `max-w-7xl` (app dashboard)
- Gap: `gap-4` (tight), `gap-6` (standard), `gap-8` (loose)

### Border Radius

`--radius: 0.5rem` (8px). shadcn components use this automatically. For custom elements, use `rounded-lg` (matches 0.5rem).

---

## Key Files

| File | Purpose |
|------|---------|
| `app/globals.css` | Theme palette (deployment-specific), shadcn theme variables, typography |
| `components.json` | shadcn/ui configuration |
| `lib/utils.ts` | `cn()` class name utility |
| `components/ui/` | shadcn component source files |
| `app/components/` | Custom product components (marketing + shared) |
