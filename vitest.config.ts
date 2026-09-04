import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

/**
 * Unit-test config (npm test). Colocated `*.test.ts` files, node
 * environment, no globals (import from 'vitest' explicitly).
 *
 * Scope: pure logic — entitlement decisions, resolver code, signers,
 * parsers, config helpers. Infrastructure wiring is validated by
 * `npm run check:backend` (full CDK synth), not here.
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
  },
});
