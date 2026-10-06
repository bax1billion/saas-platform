import { existsSync, readdirSync, statSync } from "node:fs";
import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

/**
 * Module boundary (docs/data-coupling.md rule 8): code under modules/<a>/
 * may not import from modules/<b>/. A module that needs another module's
 * data goes through that module's published contract (lib/services/<b>) or
 * an event, never its components, lib or schema. One override per module,
 * generated from the directory listing so a new module is covered the day
 * its folder appears. A product with no modules/ directory yet gets no
 * overrides.
 */
const moduleIds = existsSync("modules")
  ? readdirSync("modules").filter((d) => statSync(`modules/${d}`).isDirectory())
  : [];
const moduleBoundaries = moduleIds.map((id) => {
  const others = moduleIds.filter((o) => o !== id);
  return {
    files: [`modules/${id}/**/*.{ts,tsx}`],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: others.flatMap((o) => [
            {
              group: [`@/modules/${o}`, `@/modules/${o}/**`, `**/modules/${o}`, `**/modules/${o}/**`, `../${o}`, `../${o}/**`, `../../${o}`, `../../${o}/**`],
              message: `modules/${id} may not import from modules/${o}. Use lib/services/${o} (its published contract) or an event. See docs/data-coupling.md.`,
            },
          ]),
        },
      ],
    },
  };
});

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  ...moduleBoundaries,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Local CDK synth output (npm run check:backend) — bundled Lambda
    // assets here are minified/500KB+ and not source ESLint should ever
    // parse; without this, running lint after check:backend has left
    // .amplify/ populated blows the heap trying to lint bundled JS.
    ".amplify/**",
  ]),
]);

export default eslintConfig;
