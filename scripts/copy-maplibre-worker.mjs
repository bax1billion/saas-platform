/**
 * maplibre-gl resolves its vector-tile-parsing worker script relative to its
 * own bundled module's `import.meta.url`. Under Turbopack dev that resolves
 * to an internal dev-server path with no matching static file, so the
 * worker request 404s (served as HTML) and the map hangs forever with no
 * tiles and no error (see lib/map/MapView.tsx, which points maplibre at
 * this copy via `setWorkerUrl`).
 *
 * Runs on `npm install` (postinstall) so it stays in sync with whatever
 * maplibre-gl version is actually installed.
 */
import { copyFileSync, existsSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..");
const distDir = join(root, "node_modules/maplibre-gl/dist");
const destDir = join(root, "public");

// The worker script imports its shared chunk via a relative path
// (`./maplibre-gl-shared.mjs`), so both must live side by side.
const files = ["maplibre-gl-worker.mjs", "maplibre-gl-shared.mjs"];

mkdirSync(destDir, { recursive: true });
for (const file of files) {
  const src = join(distDir, file);
  if (!existsSync(src)) {
    console.warn("[copy-maplibre-worker] source not found, skipping:", src);
    continue;
  }
  copyFileSync(src, join(destDir, file));
}
console.log("[copy-maplibre-worker] copied maplibre-gl worker files to public/");
