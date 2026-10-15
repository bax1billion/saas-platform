# The app frame: sidebar states, section rail, doors

**Status:** v1, 2026-10-06. Foundation (product neutral): the places, the
strings and the Admin homes are a product's values in `config/shell.ts`;
the rules and the pieces are here. A product's own navigation record says
what and why; this file says how it is built.

## 1. One frame, no flag

The frame could have shipped behind a per-environment flag with the
earlier sidebar kept beside it. It did not: a flag would only have kept
two shells, two door mechanisms and a byte-identical legacy branch alive
with nobody to protect. The old sidebar, drawer and phone header, and any
per-module door context and toggle, go in the same change that adopts the
frame. The per-environment rule in `CLAUDE.md` still governs anything that
is staging-only (module stages); it has nothing to govern here.

## 2. The layout rule

`lib/hooks/layout-mode.ts` is the whole decision; `useLayoutMode` renders
it from three `matchMedia` queries (the `useFieldStationMode` shape), the
door and `SidebarContext`. Breakpoints are the Tailwind pair the repo
already switches on: `md` 768, `lg` 1024, `xl` 1280.

| Width | Field door | Station and Admin doors |
|---|---|---|
| under 768 (phone) | toolbar, no sidebar | toolbar, no sidebar |
| 768 to 1023 (tablet) | toolbar | COMPACT rail |
| 1024 to 1279 | toolbar | COMPACT rail |
| 1280 and up | FULL; COMPACT while a section rail is open | FULL; COMPACT while a section rail is open |

A manual choice (the toggle at the bottom of the sidebar, the avatar menu,
Me) wins whenever a sidebar is on screen and can never force one onto a
phone. "Reset sidebar" returns to the rule. The table is
`lib/hooks/layout-mode.test.ts`.

Sizes are plain pixel variables in `config/theme.css`: `--sidebar-compact-w`
72, `--topbar-h` 56, `--toolbar-h` 64, `--bs-top-h` 56 (the sticky top bar)
and `--bs-rail-h` (the sticky chip strip writes its height at runtime).
They are plain `px` on purpose: the scroll spy reads them with
`getPropertyValue`, which returns raw text. FULL is `w-60` (240 px).

## 3. Pieces (`app/components/shell/`)

| Piece | What |
|---|---|
| `ShellFrame` | Reads the rule once; draws `Sidebar`, `TopBar`, the banners, `<main id="main">` and `FloatingToolbar`; sets the text size attribute on `<html>`; gives the canvas bottom padding equal to the capsule plus the safe area on the toolbar layout |
| `Sidebar` | FULL: wordmark, organization, the places, the module lineup by group, a product's extra sections (`shellSidebarSections`), Settings, Flag it, the member row, the toggle. COMPACT: 72 px, icons with 11 px labels, group headers as thin rules in the group colour, Flag it as an icon; every item still reachable |
| `SidebarToggle` | 44 px, `aria-expanded`, `aria-controls="global-sidebar"`; writes the manual choice |
| `TopBar` | Sticky, in flow, 56 px: `Breadcrumbs` left, `AvatarMenu` right; Flag it rides here on the toolbar layout. A search button and a bell take their places when a product builds them |
| `Breadcrumbs` | `crumbsFor(pathname)` from `lib/modules/breadcrumbs.ts`: Home, module, tab from the registry nav, record id; places by label. On a phone the last two crumbs |
| `AvatarMenu` | shadcn dropdown: Door (from `useDoorChoices`), Use automatic door, Text size, Reset sidebar, Me, Organization, Billing (managers), Sign out |
| `FloatingToolbar` | Phone capsule, 64 px plus the safe area, the places at 48 px targets, Quick (56 px round) attached to the right end; never auto hides. Quick opens the shared Radix `Dialog` pinned to the bottom edge; until a product builds the universal input it offers Flag it |
| `SectionRail`, `SectionRailContext` | Section 4 |
| `PlacePage`, `HonestEmpty` | The canvas for a place and the honest empty state that may name its ticket |
| `Wordmark`, `Mark` (`app/components/Wordmark.tsx`) | The product name with its logo from `public/`; a product replaces the mark with its own |

Places are data in `config/shell.ts` (`shellPlaces`; the foundation ships
Home `/dashboard` and Me `/me`) with lucide icon names mapped in
`place-icons.ts`; a product adds its places and their pages. Me is real:
door, text size, sidebar preference, Flag it, Organization, Billing, Sign
out (`app/(app)/me/page.tsx`).

Text size is `data-text-size` on `<html>` (`large` 112.5 percent,
`largest` 125 percent) so rem spacing scales with the type, the way a
browser zoom does; `body` is `1rem`. Standard clears the attribute. Known
limit: values written in `px` do not scale. That is deliberate for the bar
heights (the scroll spy reads them as plain pixels) and incidental for the
Field floor (`text-[17px]` in a few places), so at Largest the canvas grows
and the bars do not.

## 4. Section rail

### What a module rail is

The rail "lists sections, record tabs or workflow stages" of the record
or workflow on screen; route-level tabs and in-page sections are two
different jobs, so the rail never reads `nav` or `navOverride`, with the
one exception of the Admin door:

- **A module rail is a navigator a page registers for the record or
  workflow on screen**: sections, stages or record tabs, through
  `useSections`. Only then does the global sidebar collapse, because only
  then is there something to make room for.
- **Route tabs stay in the module header.** They are the module's level-2
  pages, not sections of one page. A module with three tabs and no open
  record keeps the full sidebar.
- **The Admin door's menu is a rail.** On any `/<module>/admin` path
  `ModuleShell` registers the admin pages as a `routes` rail (links with
  `aria-current="page"`) and hides its header tabs; a page's own sections
  override it while mounted.
- **A module whose pages register nothing never collapses the sidebar.**
  That is module adoption, not a frame change.

A page declares its sections once with `useSections({ mode, label, items })`
and spreads `sectionProps(id)` plus `className={SECTION_CLASS}` on each
section wrapper. The frame draws the navigator; the page never does.

| Width and door | Variant | Sticky | Global sidebar |
|---|---|---|---|
| desktop, sidebar layout | rail (vertical, beside the canvas) | yes, under the top bar | COMPACT while open |
| desktop, Field door (toolbar) | strip | yes | hidden |
| tablet | strip | yes | COMPACT for desk doors, hidden for Field |
| phone | strip | no (chrome budget) | hidden |
| fewer than 3 sections (2 in tabs mode) | nothing | | the rule as if no rail existed |

The strip wraps its chips onto as many rows as they need instead of
scrolling sideways: every chip stays in view and nothing on a phone
scrolls sideways.

Modes: `sections` and `stages` run the scroll spy and `aria-current`
(`location`, `step`); `tabs` is a `tablist` whose selection the page owns
(`activeId`, `onSelect`); `routes` draws links to pages (`aria-current`
`page`), used by the Admin door. A registration can be the frame's default
(`{ fallback: true }`); a page's own registration wins over it.

Scroll spy (`lib/hooks/useScrollSpy.ts`, math in `scroll-spy.ts`): one
`IntersectionObserver`, root margin from the live bar heights, the first
section in document order that touches the band wins, the last section
wins at the bottom of the page. A click sets the highlight and suppresses
the observer until the next real user scroll or `scrollend`; no timer.
Arrow keys, Home and End move focus along the rail's axis; Enter jumps;
focus lands on the section so the next Tab continues from it. Reduced
motion makes the jump instant. The rail is `print:hidden`.

`ModuleShell` mounts `SectionRailProvider` and both variants under the
module header (an additive slot; `navOverride` and `headerExtra` are
untouched). Each variant returns null unless it is the active one. Only
the vertical rail calls `setRailOpen(true)`.

## 5. Doors

`app/components/DoorContext.tsx` mounts in `app/(app)/layout.tsx` around
`AppShell`, inside the gate. The rule is `lib/shell/door.ts`:

| Situation | Door |
|---|---|
| `/<module>/admin...` and the member is in the Admin group | admin |
| Admin URL, member is not an Admin | the choice, else the pointer guess; `adminBlocked` is true |
| The member picked Field or Station | that choice; never clobbered by a pointer change |
| No choice, coarse pointer | field |
| No choice, fine pointer | station |
| Picking Admin | navigate to the module's Admin home (`adminHomes` in `config/shell.ts`); never stored |
| Picking Field or Station on an Admin URL | store it and go to the module home |

Admin is offered only to `isOrgAdmin` members (never `canManageOrg`: an
Operator is not an organization Admin) and only on a module with an
`adminHomes` line (a product adds its line the day the module's Admin
route exists). The door grants nothing; writes stay with Cognito groups,
entitlement steps and record access.

A module whose tabs change with the door reads `useDoor()` and passes its
door-aware nav as `navOverride`; its `nav.ts` takes the frame's `Door`
type. The frame shows one door control, in the avatar menu and on Me. The
parity table against the per-module formulas the frame replaced stays in
`lib/shell/door.test.ts` as the behaviour contract it inherited.

## 6. Persistence

`lib/shell/preference-store.ts` is the one file that touches browser
storage (`lib/shell/storage-guard.test.ts` fails any other). It holds the
sidebar choice, the door choice, the text size and a product's small
per-viewer extras as one key, in memory first and mirrored to
`localStorage` in try/catch, so a private window works for the session.
It is an external store (`subscribe`, `read`), which is why no component
sets state inside an effect to pick a value up.

A `MemberPreference` model with `allow.ownerDefinedIn('cognitoSub')` is
the server-side version (a schema change; `User` is Admin write only, so
a member cannot store a preference there). When it lands, only this file
changes: `EntitlementsContext` reads the row once and calls
`primeShellPreference`, and `writeShellPreference` also updates the row.
Open with it: a Field choice saved on a phone also applies on a desktop,
which then shows the toolbar layout; one stored value or a value per
device class is the decision to make.

## 7. What is not here yet

Search or jump to, the bell and in-app notifications, the save chip, a
product's places beyond Home and Me, theme (the dark palette has no QA
pass; `ThemeProvider` is light only), `MemberPreference`. None of these is
faked: a control that is not built is hidden or names its ticket.

The save chip, when it comes, also carries the map's source: a screen
whose map draws from a pack on the device (`MapState.source` is `pack`,
exposed as `data-map-source` on `MapView`, `lib/map/MapView.tsx`) shows
"Map from the pack" beside the sync state, so a person knows the streets
are the stored copy (`docs/map-engine.md` § 5).

## 8. Checks

`npm test`, `npx tsc --noEmit`, `npx eslint . --max-warnings=0`,
`npm run check:backend`, `npx next build`. Nothing here touches `amplify/`.
The frame renders only for a signed-in member, so a browser walk needs a
sandbox (`npm run sandbox`), at 390, 768, 1024, 1280 and 1440.
