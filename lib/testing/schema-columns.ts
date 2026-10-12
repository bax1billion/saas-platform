/**
 * Source-text parsers for the schema-contract tests
 * (modules/<id>/lib/schema-contract.test.ts): the columns a schema file
 * declares on each model, the keys a row interface carries, and the
 * table → row-type map a store's Tables interface spells out. Importing
 * the Amplify schema itself costs minutes (it pulls the CDK in), so the
 * tests read the files as text and these helpers do the parsing.
 *
 * Test-side only (vitest, node). Never imported by app or backend code.
 */

/** Comments removed and string literals emptied, so braces and colons
 *  inside them cannot confuse the bracket matching. Length changes. */
export function stripCommentsAndStrings(src: string): string {
  let out = "";
  let i = 0;
  while (i < src.length) {
    const ch = src[i];
    const next = src[i + 1];
    if (ch === "/" && next === "/") {
      const nl = src.indexOf("\n", i);
      i = nl === -1 ? src.length : nl;
      continue;
    }
    if (ch === "/" && next === "*") {
      const end = src.indexOf("*/", i + 2);
      i = end === -1 ? src.length : end + 2;
      continue;
    }
    if (ch === '"' || ch === "'" || ch === "`") {
      let j = i + 1;
      while (j < src.length && src[j] !== ch) {
        if (src[j] === "\\") j += 1;
        j += 1;
      }
      out += '""';
      i = j + 1;
      continue;
    }
    out += ch;
    i += 1;
  }
  return out;
}

const OPEN: Record<string, string> = { "{": "}", "(": ")", "[": "]" };

/** The text between the bracket at `open` and its match, and the index
 *  just past the closing bracket. Expects stripped source. */
function block(src: string, open: number): { body: string; end: number } {
  const stack: string[] = [];
  for (let i = open; i < src.length; i += 1) {
    const ch = src[i];
    if (ch in OPEN) stack.push(OPEN[ch]);
    else if (ch === "}" || ch === ")" || ch === "]") {
      if (stack.pop() !== ch) throw new Error(`schema-columns: unbalanced "${ch}" at ${i}`);
      if (stack.length === 0) return { body: src.slice(open + 1, i), end: i + 1 };
    }
  }
  throw new Error("schema-columns: block never closed");
}

/** Depth-0 entries of a block body, split at `,`, `;`, and at a newline
 *  that starts a new `key:` entry (interface members need no `;`). */
function entries(body: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let start = 0;
  const push = (end: number) => {
    const text = body.slice(start, end).trim();
    if (text) out.push(text);
    start = end + 1;
  };
  for (let i = 0; i < body.length; i += 1) {
    const ch = body[i];
    if (ch in OPEN) depth += 1;
    else if (ch === "}" || ch === ")" || ch === "]") depth -= 1;
    else if (depth === 0) {
      if (ch === "," || ch === ";") push(i);
      else if (ch === "\n" && /^\s*\w+\s*\??\s*:/.test(body.slice(i + 1, i + 120)) && body.slice(start, i).trim()) push(i);
    }
  }
  push(body.length);
  return out;
}

type Member = { key: string; value: string };

function members(body: string): Member[] {
  const out: Member[] = [];
  for (const e of entries(body)) {
    const m = /^(\w+)\s*\??\s*:\s*([\s\S]*)$/.exec(e);
    if (m) out.push({ key: m[1], value: m[2].trim() });
  }
  return out;
}

/** Every `Name: a.model({ ... })` (or `Name: a\n .model({`) in a schema
 *  file → the names of the model's top-level fields, relationships included. */
export function modelColumns(schemaSource: string): Map<string, Set<string>> {
  const src = stripCommentsAndStrings(schemaSource);
  const out = new Map<string, Set<string>>();
  const re = /(\w+):\s*a\s*\n?\s*\.model\(\s*\{/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(src))) {
    const open = m.index + m[0].length - 1;
    const { body, end } = block(src, open);
    out.set(m[1], new Set(members(body).map((x) => x.key)));
    re.lastIndex = end;
  }
  return out;
}

function interfaceMembers(source: string, name: string): Member[] {
  const src = stripCommentsAndStrings(source);
  const re = new RegExp(`export\\s+interface\\s+${name}\\b[^{]*\\{`);
  const m = re.exec(src);
  if (!m) throw new Error(`schema-columns: interface ${name} not found`);
  return members(block(src, m.index + m[0].length - 1).body);
}

/** The property names of `export interface <name> { ... }`. */
export function interfaceKeys(source: string, name: string): Set<string> {
  return new Set(interfaceMembers(source, name).map((x) => x.key));
}

/** From `export interface <name> { Model: RowType; ... }`, model → row type name. */
export function tableRowMap(source: string, interfaceName: string): Map<string, string> {
  const out = new Map<string, string>();
  for (const { key, value } of interfaceMembers(source, interfaceName)) {
    const type = /^(\w+)/.exec(value)?.[1];
    if (type) out.set(key, type);
  }
  return out;
}

/** Keys every row carries that the schema adds for it, never declared. */
export const GENERATED_COLUMNS = new Set(["id", "createdAt", "updatedAt"]);

/**
 * For one table: the row keys (minus the generated ones) missing from the
 * model's declared columns. Empty means the row type and the model agree.
 */
export function missingColumns(rowKeys: Iterable<string>, model: Set<string> | undefined): string[] {
  if (!model) return ["(model not found in schema)"];
  return [...rowKeys].filter((k) => !GENERATED_COLUMNS.has(k) && !model.has(k));
}
