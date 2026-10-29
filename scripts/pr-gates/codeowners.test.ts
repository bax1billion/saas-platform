import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { leadReviewers, ownersOf, parseCodeowners } from "./rules.mjs";

/**
 * .github/CODEOWNERS is read by GitHub and by the `tier-1 review` check,
 * so it has to stay true to the tree: a pattern that names a path that no
 * longer exists is a hold that silently stopped holding. And the split the
 * gates promise (product work merges on its own, the foundation needs a
 * person) is pinned on paths of each kind, for every module the tree has.
 */
const root = join(__dirname, "..", "..");
const text = readFileSync(join(root, ".github", "CODEOWNERS"), "utf8");
const rules = parseCodeowners(text);
const modulesDir = join(root, "modules");
const moduleIds = existsSync(modulesDir) ? readdirSync(modulesDir).filter((d) => statSync(join(modulesDir, d)).isDirectory()) : [];

describe(".github/CODEOWNERS", () => {
  it("every anchored pattern names a path that exists", () => {
    const missing = rules
      .map((r) => r.pattern)
      .filter((p) => p.startsWith("/") && !p.includes("*"))
      .filter((p) => p !== "/amplify/data/modules/")
      .filter((p) => !existsSync(join(root, p.replace(/^\//, "").replace(/\/$/, ""))));
    expect(missing).toEqual([]);
  });

  it("names at least one lead; a line with no owner releases a path", () => {
    expect(leadReviewers(rules).length).toBeGreaterThan(0);
    expect(rules.some((r) => r.owners.length === 0)).toBe(true);
  });

  it("holds the foundation: the backend, the app frame, the shared services, the gates, the rulebooks", () => {
    for (const held of [
      "amplify/data/resource.ts",
      "amplify/data/vertical.ts",
      "amplify/data/entitlements/index.ts",
      "amplify/data/record-access/index.ts",
      "amplify/data/assist-helpers.ts",
      "amplify/backend.ts",
      "amplify/functions/create-organization/handler.ts",
      "amplify/functions/assist-run/handler.ts",
      "app/components/AppShell.tsx",
      "app/components/ModuleShell.tsx",
      "app/(app)/layout.tsx",
      "lib/modules/index.ts",
      "lib/assist/index.ts",
      "lib/field-floor.test.ts",
      "config/modules.ts",
      "config/pricing.ts",
      "scripts/pr-gates/rules.mjs",
      ".github/workflows/ci.yml",
      ".github/CODEOWNERS",
      "package.json",
      "CLAUDE.md",
      "docs/pull-request-gates.md",
      "docs/core-data-model.md",
      "docs/data-coupling.md",
      "docs/shell.md",
    ]) {
      expect(ownersOf(held, rules), held).not.toEqual([]);
    }
  });

  it("leaves product work free: a module's screens, logic, schema file and Lambdas, its contract, shared UI, the theme, its own docs", () => {
    for (const free of [
      "modules/widgets/lib/forms.ts",
      "modules/widgets/components/Form.tsx",
      "app/(app)/widgets/page.tsx",
      "amplify/data/modules/widgets.ts",
      "lib/services/widgets/index.ts",
      "lib/services/widgets/index.test.ts",
      "lib/data-domains/group.introspection.json",
      "lib/map/MapView.tsx",
      "lib/hooks/useThing.ts",
      "components/ui/button.tsx",
      "config/theme.css",
      "config/landing.ts",
      "app/globals.css",
      "docs/widgets-changelog.md",
      "docs/widgets-module.md",
      "docs/design-system.md",
      "content/blog/post.mdx",
      "app/(marketing)/pricing/page.tsx",
      "public/icons/x.svg",
    ]) {
      expect(ownersOf(free, rules), free).toEqual([]);
    }
  });

  it("every module in the tree has its schema file and its contract released; a product adds its Lambda lines", () => {
    for (const id of moduleIds) {
      for (const p of [`amplify/data/modules/${id}.ts`, `lib/services/${id}/index.ts`]) {
        expect(ownersOf(p, rules), p).toEqual([]);
      }
    }
  });
});
