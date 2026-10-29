import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

/**
 * Unit-test config (npm test). Colocated `*.test.ts` files, node
 * environment, no globals (import from 'vitest' explicitly).
 *
 * Scope: pure logic — entitlement decisions, resolver code, signers,
 * parsers, config helpers. Infrastructure wiring is validated by
 * `npm run check:backend` (full CDK synth), not here.
 *
 * Coverage (npm run test:coverage, run by CI): measured over the directories
 * that hold pure logic, with a line floor per directory family. The floors
 * are a ratchet (docs/pull-request-gates.md § 3): set a little under what the
 * tree had when they were introduced, they may go up when coverage does and
 * never down in the same PR that lowers it. Lowering one is a change to a
 * test: Tier 1, with the numbers in the PR. Screens (`.tsx`), schema files,
 * Lambda entry points and generated code are not measured; synth, the
 * typecheck and the build are their checks.
 */
export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL(".", import.meta.url)),
    },
  },
  test: {
    environment: "node",
    include: ["**/*.test.ts"],
    exclude: ["**/node_modules/**", ".next/**", ".amplify/**"],
    coverage: {
      provider: "v8",
      reporter: ["text-summary", "json-summary"],
      reportsDirectory: "coverage",
      include: ["modules/*/lib/**", "lib/**", "amplify/data/**", "amplify/functions/**", "amplify/shared/**", "config/**", "scripts/pr-gates/**", "scripts/deploy-status/**"],
      exclude: ["**/*.test.ts", "**/*.tsx", "**/*.d.ts", "**/*.json", "**/*.sh", "**/generated/**", "**/resource.ts", "scripts/pr-gates/check.mjs", "scripts/deploy-status/handler.mjs"],
      thresholds: {
        "lib/**": { lines: 60 },
        "config/**": { lines: 5 },
        "amplify/data/**": { lines: 8 },
        "amplify/shared/**": { lines: 55 },
        "amplify/functions/**": { lines: 10 },
        "scripts/**": { lines: 90 },
      },
    },
  },
});
