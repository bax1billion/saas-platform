# The map engine

**Status:** v1, 2026-10-15. Foundation (product neutral). The engine in
`lib/map/` is the one map in the platform; a product gives it layers and
symbols and renders `MapView`. This file says how it is built and what a
product owes it. The product that drove the design keeps its own map plan
and tickets product-side; what is here is the part a second vertical uses
unchanged.

## 1. Three tiers, one engine

| Tier | Lives in | Holds |
|---|---|---|
| **Foundation map engine** | `lib/map/`, `amplify/custom/location/`, `amplify/custom/public-read-guard/` | No product facts: one `MapView` component and its state model, basemap providers, the geocoder, the layer contract and registry, symbol rendering from a catalog it is given, drawing and measure, the printed copy, the sign-in to the map services, the WAF on the API's public read |
| **A product with a map** | `modules/<id>/`, `lib/services/<id>/` | Its records and tables, its symbol catalog, its layers published as `MapLayer` rows from `lib/services/<id>/layers.ts`, its screens that render `MapView` |
| **Other products** | `modules/<id>/`, `lib/services/<id>/` | A published, bounded read that the registry turns into a layer; never a map of their own |

Rules that follow:

- A product that needs a map renders `MapView` with layers from the
  registry; no second map component is ever added.
- The engine holds no product words and imports nothing from `modules/`,
  `config/` or `lib/services/` (`lib/map/engine-boundary.test.ts`). It
  takes marks, symbols and layers through props and the registry, never by
  importing a module.
- A product's map tables stay product-side, on the product's data domain.

## 2. Basemaps and the provider adapter

`lib/map/providers/types.ts` is one interface, three implementations:

```ts
interface BasemapProvider {
  id: "amazon" | "pmtiles" | "grid";
  styles(): BasemapId[];                       // streets, satellite, grid
  resolve(id, { access, colorScheme, terrain }): Promise<ResolvedStyle>;
  offline: "never" | "pack";                   // what the licence allows
}
```

- **Amazon Location** (`providers/amazon.ts`): the current Maps and Places
  APIs, no per-environment map resource, IAM on the region's provider
  (`amplify/custom/location/resource.ts`). The Standard style is streets,
  Hybrid is satellite; `terrain=Hillshade` is a parameter of the Standard
  descriptor behind a product switch. A signed-in viewer's requests are
  signed with the identity pool's credentials (every org group's role is
  granted, since each group assumes its own role); a page opened with no
  account uses the public, read-only tile key the backend publishes in
  `outputs.custom.map`, restricted to `geo-maps:GetTile` and the site's
  `/share/*` referer. Amazon's tiles may not be stored or cached, so they
  are never the offline source.
- **The invented grid** (`providers/grid.ts`): a town of invented streets a
  product supplies (`GridData`), for sample data and as the fallback when a
  hosted style will not load. No real street or place name.
- **PMTiles** (`providers/pmtiles.ts`): the engine's own street tiles from
  one file, online and from a pack on the device; the provider is the
  seam, the tiles and the pack store are a later phase.

Address search (`geocode.ts`, `AddressSearch.tsx`) is the Places API:
suggestions are shown and never stored; picking one runs a search with
`IntendedUse: Storage`, and that result may be saved on a record.

## 3. Layers, classification, registry

A product publishes a layer as one row (`lib/map/layers/contract.ts`):

```ts
interface MapLayer {
  key: string;                       // "<owner>.<name>"
  owner: string;                     // the module id that owns the rows
  label: string;
  classification: Classification;    // what may leave the organization
  doors: readonly Door[];            // which doors list it
  defaultOn?: Partial<Record<Door, boolean>>;
  offline: "pack" | "live" | "never";
  style: LayerStyle;                 // point (with sprites), line, polygon, raster, heat
  read?: (bounds, window, signal) => Promise<LayerFeatures>;   // bounded by the view
  live?: boolean;
}
```

- The read is bounded by the view's bounds and a time window; the engine
  reads 350 ms after the map stops moving, one read in flight per layer, a
  new view aborts the old one. A map page never loads a whole table.
- `createRegistry` (`layers/registry.ts`) lists the rows for a door: a
  layer whose owner the organization does not hold is listed with "Turn on
  <product> to see this" and never read; a layer not built yet is "Not
  built yet".
- `classification` is the enum `PUBLIC`, `INTERNAL`, `RESTRICTED`,
  `EMS_OPERATIONAL`, `EMS_SENSITIVE`, `PERSONNEL_LOCATION`, `EVIDENCE`;
  `SHAREABLE_CLASSIFICATIONS` (`PUBLIC`, `INTERNAL`) is what a link or an
  export may ever carry. It is enforced three times: the owner's read model
  (what it returns for the caller's groups), the registry (which doors list
  it) and the product's share and export code (what leaves).
- Every feature carries `properties.key`; the engine's selection, hit
  testing and capture work by key.

## 4. Rendering

### 4.1 One map component with a state model

`MapView` (`lib/map/MapView.tsx`) owns one MapLibre instance for its life
and renders `MapState` (`lib/map/state.ts`, a pure reducer with tests):

```ts
interface MapState {
  camera: { center; zoom; bearing; pitch };
  basemap: "streets" | "satellite" | "grid";
  source: "online" | "pack";          // where tiles come from right now
  layers: Record<string, boolean>;    // visibility by registry key
  selection: string | null;           // one selected feature, by key
  mode: "view" | "draw" | "measure" | "place";
  draw: DrawState | null;             // the tool and the shape in hand
  fit, fly;                           // one-shot camera requests
}
```

Props are data and callbacks only: the layers, the sprites, the door,
ad hoc features, and handlers for select, several hits, an empty tap,
locate, camera change, drawing and problems. A product never reaches into
MapLibre. The component keeps the camera across basemap switches, meets
the Field floor for every control it draws, reports problems through
`MapProblem` (never a toast, never a MapLibre popup) and exposes a handle:
`capture({ hideLayers })` for a printed copy with the count of what was
left out, `bounds()`, `refresh()`, `cancelDraw()`, `removeDrawn()`,
`credits()`.

Accessibility is a parallel list, not a button per marker: the product's
feature list, keyboard selection moving the map's selection, `aria-live`
announcing the selected feature. The one DOM marker is the selected
feature's ring; the invented grid's labels are DOM on the sample.

### 4.2 Points, labels and clustering as symbol layers

- Every point layer is a GeoJSON source, clustered above 300 features,
  drawn by a symbol layer (icon plus optional text) with circle layers for
  the cluster bubbles and the selection halo (`layers/render.ts`).
- Sprites come from the product's catalog (`sprites.ts`): SVG entries
  rasterised on the device at the screen's pixel ratio and added as map
  images, again after every style load. A new symbol is a new entry;
  nothing is uploaded or deployed.
- Layers go under the basemap's first label layer, so a feature is never
  hidden under a street name; the selection and the drawing layer go on
  top.
- Icon size and text size are expressions on zoom that never go under the
  Field floor (`floors.ts`, pinned by a test to the theme's rem tokens);
  the basemap's own labels get the floor on the Field door.
- A tap hits within the Field target (48 px); several features under one
  finger go to `onSelectMany`, never the top one silently; a cluster opens
  to the zoom where it splits.

### 4.3 Drawing tools from a library

Terra Draw on MapLibre (`draw.ts`), never hand-rolled handlers: point,
line, polygon, circle, freehand sketch, select with vertex editing, and
measure as a line that finishes on its second point with the distance as a
tag at the midpoint (`measure.ts` is the maths). `MapView` follows
`MapState.mode` and `draw.mode` to put a tool in hand, rebuilds the layer
on every style load with the shapes it held, and hands a finished shape to
the product as GeoJSON with the tool named. The engine stores nothing: the
product saves the geometry on its own record through the outbox.

### 4.4 Styles: stock, not bespoke

The vendors' published styles are used as published (Amazon's Standard
light and dark, Hybrid; the PMTiles stock styles). The only custom work is
the layer ordering and the Field label sizes above. A bespoke style is a
product decision for later.

### 4.5 Terrain

Online, hillshade is the Standard descriptor's `terrain=Hillshade`
parameter (`MapView`'s `terrain` prop, behind a product switch). For packs
it is a data choice (Terrain-RGB tiles per district), a later phase.

## 5. Offline

The provider's `offline` and the layer's `offline` say what a pack may
hold; `MapState.source` says where tiles come from right now and is
exposed as `data-map-source` so the frame's sync state can say "Map from
the pack" (`docs/shell.md` § 7). The pack store and the service worker are
not built; the seams are.

## 6. What leaves the organization

A shared link or an export carries only layers whose classification is in
`SHAREABLE_CLASSIFICATIONS`, decided from the registry row, never from a
list in the share code; a product's public read refuses the rest
server-side as well. A printed copy from the device goes through
`MapView.capture` with the sensitive layers hidden and says how many
features were left out (`SaveMapPdf.tsx`).

## 7. Giving a vertical a map

1. Publish layers from `lib/services/<id>/layers.ts`: one `MapLayer` per
   thing the map draws, with its owner, classification, doors, style and a
   bounded read; publish its sprites as `SpriteEntry` rows.
2. Hold map state with `useMapState` and render `MapView` with the layers
   the registry says are visible for the door, the sprites, and the
   handlers; keep the basemap choice in `lib/shell/preference-store.ts`.
3. Keep the records in the product's tables; link a mark to a record by id
   on the product's row, never a column on the engine.
4. Problems through `MapProblem`; details through the product's cards;
   documents through the export service, with the on-device print as the
   exception for what is already on screen.

Checks: `npm test` (the engine's suites: state, providers, layers, sprites,
draw, measure, floors, the boundary test), `npm run check:backend` (the
Location and WAF stacks synthesize), `npx next build`.
