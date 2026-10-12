import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

const root = join(__dirname, "..", "..");
const ALLOWED = "lib/shell/preference-store.ts";

function walk(dir: string, out: string[]) {
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name.startsWith(".")) continue;
    const full = join(dir, name);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.(ts|tsx)$/.test(name) && !/\.test\.ts$/.test(name)) out.push(full);
  }
}

/**
 * Browser storage is a per-viewer convenience, never audited state, and it
 * lives in one file so the swap to `MemberPreference` is one change
 * (docs/shell.md). Anything else that wants to remember something goes
 * through that store or a model.
 */
describe("browser storage guard", () => {
  it("keeps localStorage inside the preference store", () => {
    const files: string[] = [];
    // A product with no modules/ directory yet has nothing there to check.
    for (const d of ["app", "lib", "modules", "config", "components"]) if (existsSync(join(root, d))) walk(join(root, d), files);
    const offenders = files
      .filter((f) => readFileSync(f, "utf8").includes("localStorage"))
      .map((f) => relative(root, f))
      .filter((f) => f !== ALLOWED);
    expect(offenders).toEqual([]);
    expect(readFileSync(join(root, ALLOWED), "utf8")).toContain("localStorage");
  });
});
