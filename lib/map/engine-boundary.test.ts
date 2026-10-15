import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * The map engine is foundation code (docs/map-engine.md § 1): it holds no
 * product facts, so a second vertical uses it unchanged. The rule as the
 * repo can check it: nothing under lib/map imports a product's folders
 * (modules/, config/) or a product's published contracts (lib/services/),
 * and nothing names a product. A vertical that mirrors this repo adds its
 * own product words to the list in its copy of this test.
 */
const PRODUCT_IMPORT = /from\s+["'](@\/)?(modules|config|lib\/services)\//;
const PRODUCT_WORDS = /\b(acme)\b/i;

const ENGINE_DIR = join(__dirname);

/** Every source file under the engine, subfolders included, by path relative to lib/map. */
function engineFiles(dir = ""): string[] {
  return readdirSync(join(ENGINE_DIR, dir), { withFileTypes: true })
    .flatMap((entry) => {
      const rel = dir ? `${dir}/${entry.name}` : entry.name;
      if (entry.isDirectory()) return engineFiles(rel);
      return /\.(ts|tsx)$/.test(entry.name) && rel !== "engine-boundary.test.ts" ? [rel] : [];
    })
    .sort();
}

describe("the map engine stays product-free", () => {
  it("has the engine files", () => {
    expect(engineFiles()).toContain("MapView.tsx");
    expect(engineFiles()).toContain("layers/contract.ts");
  });

  it("imports nothing from modules/, config/ or lib/services/, and names no product", () => {
    const hits: string[] = [];
    for (const rel of engineFiles()) {
      const text = readFileSync(join(ENGINE_DIR, rel), "utf8");
      text.split("\n").forEach((line, i) => {
        if (PRODUCT_IMPORT.test(line) || PRODUCT_WORDS.test(line)) hits.push(`${rel}:${i + 1}: ${line.trim()}`);
      });
    }
    expect(hits).toEqual([]);
  });
});
