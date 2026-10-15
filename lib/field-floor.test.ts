import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/**
 * The Field door's floors are theme tokens (`app/globals.css`: `text-field`,
 * `min-h-target`, `min-h-primary`), written in rem so they scale with the
 * member's text size and live in one place. A screen that writes the pixel
 * literal instead drifts from the rule and stops scaling, so this fails
 * the build on one. The bar heights the scroll spy measures are pixels on
 * purpose and are not what this looks for.
 */
const repo = fileURLToPath(new URL("../", import.meta.url));
const ROOTS = ["app", "components", "lib", "modules"];
const LITERALS = [/text-\[17px\]/, /min-h-\[54px\]/];

function* files(dir: string): Generator<string> {
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name.startsWith(".")) continue;
    const p = join(dir, name);
    if (statSync(p).isDirectory()) yield* files(p);
    else if (/\.(tsx?|css)$/.test(name) && !name.endsWith(".test.ts")) yield p;
  }
}

describe("Field floor tokens", () => {
  it("no screen writes the 17 px or 54 px literal; it uses text-field and min-h-primary", () => {
    const hits: string[] = [];
    // A foundation checkout has no modules/ folder yet; a product's roots are scanned where they exist.
    for (const root of ROOTS.filter((r) => existsSync(join(repo, r)))) {
      for (const f of files(join(repo, root))) {
        const text = readFileSync(f, "utf8");
        for (const re of LITERALS) if (re.test(text)) hits.push(`${relative(repo, f)}: ${re.source}`);
      }
    }
    expect(hits).toEqual([]);
  });

  it("the theme defines the three tokens in rem", () => {
    const css = readFileSync(join(repo, "app/globals.css"), "utf8");
    expect(css).toMatch(/--text-field:\s*1\.0625rem/);
    expect(css).toMatch(/--spacing-target:\s*3rem/);
    expect(css).toMatch(/--spacing-primary:\s*3\.375rem/);
  });
});
