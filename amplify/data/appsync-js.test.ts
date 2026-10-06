import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/**
 * Static guard for every APPSYNC_JS snippet in amplify/data (entitlement
 * steps, record-access steps, and a product's injected decision snippets).
 *
 * AppSync validates resolver code only at deploy time, and a rejection
 * ("The code contains one or more errors") rolls the whole data stack
 * back. The AWS ESLint plugin does not catch everything — it passed
 * `Object.prototype.hasOwnProperty.call`, which AppSync then rejected —
 * so this checks the constructs the runtime documents as unsupported
 * (docs/adding-a-module.md → Gotchas), after stripping comments/strings.
 */

const root = fileURLToPath(new URL(".", import.meta.url));

function jsFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    if (name === "node_modules") return [];
    if (statSync(p).isDirectory()) return jsFiles(p);
    return name.endsWith(".js") ? [p] : [];
  });
}

/**
 * Blank out comments and string/template contents, keeping line numbers.
 * One pass in source order, so a `//` or `/*` inside a string is string
 * content and a quote inside a comment is comment content — stripping
 * comments first and strings second (or the reverse) gets one of those
 * wrong and hides real code behind it.
 */
const NON_CODE = /\/\*[\s\S]*?\*\/|\/\/[^\n]*|'(?:[^'\\\n]|\\.)*'|"(?:[^"\\\n]|\\.)*"|`(?:[^`\\]|\\.)*`/g;
export function stripNonCode(src: string): string {
  return src.replace(NON_CODE, (m) => {
    if (m.startsWith("/*")) return m.replace(/[^\n]/g, " ");
    if (m.startsWith("//")) return "";
    // A string or template: keep delimiters so the line still reads as code.
    return `"${m.slice(1, -1).replace(/[^\n]/g, " ")}"`;
  });
}

const RULES: Array<[string, RegExp]> = [
  ["Function.prototype .call/.apply/.bind", /\.\s*(call|apply|bind)\s*\(/],
  ["Object.prototype access", /\.\s*prototype\b/],
  // Template literals are NOT listed: the runtime supports them, and the
  // deployed run-keys steps build their composite GSI keys with them.
  ["try/catch/finally", /\b(try|catch|finally)\b/],
  ["throw (use util.error)", /\bthrow\b/],
  // for…of / for…in are supported; the C-style counted loop, while and do are not.
  ["C-style for / while / do", /\bfor\s*\([^)]*;|\bwhile\s*\(|\bdo\s*\{/],
  ["continue", /\bcontinue\b/],
  ["switch", /\bswitch\b/],
  ["class", /\bclass\s+\w/],
  ["async/await/yield", /\b(async|await|yield)\b/],
  ["this", /\bthis\b/],
  ["new (constructors)", /\bnew\s+\w/],
  ["++ / -- (use += 1)", /\+\+|--/],
  [
    "regex literal",
    /(?:^|[=(,:;!&|?{}]\s*|\b(?:return|typeof|in|of|case)\s+)\/(?![/*])(?:[^/\n\\]|\\.)+\/[gimsuy]*/m,
  ],
];

const files = jsFiles(root);

describe("APPSYNC_JS snippets", () => {
  it("finds the snippets under test", () => {
    const names = files.map((f) => f.slice(root.length));
    // Foundation files only: a product's own snippets (an injected
    // record-access decision, say) are picked up by the directory walk but
    // are not required to exist.
    expect(names).toEqual(expect.arrayContaining(["record-access/root-create.js", "entitlements/user.js"]));
  });

  describe.each(files.map((f) => [f.slice(root.length), f] as const))("%s", (_name, file) => {
    const code = stripNonCode(readFileSync(file, "utf8"));
    it.each(RULES)("avoids %s", (_rule, re) => {
      const hit = code.split("\n").findIndex((line) => re.test(line));
      expect(hit === -1 ? null : `line ${hit + 1}: ${code.split("\n")[hit].trim()}`).toBeNull();
    });
  });

  it("stripNonCode ignores comments and strings", () => {
    const src = "// try this.call(x)\n/* `t` */ const a = 'x.call(y)';\n";
    expect(RULES.some(([, re]) => re.test(stripNonCode(src)))).toBe(false);
  });

  it("stripNonCode does not let a comment marker inside a string hide the code after it", () => {
    // Comments-first stripping turned `"http://x"` into an open string and
    // swallowed the real call on the same line.
    const src = 'const u = "http://x"; Object.prototype.hasOwnProperty.call(a, b);\n';
    const hits = RULES.filter(([, re]) => re.test(stripNonCode(src))).map(([n]) => n);
    expect(hits).toContain("Function.prototype .call/.apply/.bind");
    const openComment = 'const s = "a/*b"; x.call(y);\nconst t = 1;\n';
    expect(stripNonCode(openComment)).toContain("x.call(y)");
  });

  it("allows for…of and flags the C-style loop, ++ and a regex after return", () => {
    const names = (code: string) => RULES.filter(([, re]) => re.test(stripNonCode(code))).map(([n]) => n);
    expect(names("for (const k of keys) { x = k; }")).toEqual([]);
    expect(names("for (let i = 0; i < n; i += 1) {}")).toContain("C-style for / while / do");
    expect(names("i++;")).toContain("++ / -- (use += 1)");
    expect(names("return /^[a-z]+$/.test(s);")).toContain("regex literal");
  });

  it("the rules do catch the construct that broke the deploy", () => {
    const bad = "const h = Object.prototype.hasOwnProperty.call(input, 'a');";
    const hits = RULES.filter(([, re]) => re.test(stripNonCode(bad))).map(([n]) => n);
    expect(hits).toEqual(
      expect.arrayContaining(["Function.prototype .call/.apply/.bind", "Object.prototype access"])
    );
  });
});
