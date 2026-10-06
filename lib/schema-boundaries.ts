/**
 * Schema boundary check: a module's schema file may reference only the
 * models and enums it declares itself, plus the core models in
 * amplify/data/resource.ts. Cross-module `a.ref`, `belongsTo`, `hasMany` or
 * `hasOne` is the coupling docs/data-coupling.md forbids (rule 3): a module
 * that needs another module's record stores the id.
 *
 * Pure text analysis on the Amplify schema source (no TypeScript parsing),
 * so it runs in a unit test with no backend imports.
 */

export interface SchemaFile {
  /** Module id or "core", for the report. */
  name: string;
  text: string;
}

export interface CrossModuleRef {
  file: string;
  kind: "ref" | "belongsTo" | "hasMany" | "hasOne";
  target: string;
  line: number;
}

/** Blanks out line comments and block comments so documentation cannot trip the check. */
export function stripComments(text: string): string {
  return text
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " "))
    .replace(/(^|[^:\\])\/\/[^\n]*/g, (m, lead: string) => lead + " ".repeat(m.length - lead.length));
}

/** Model, enum and custom type names declared in a schema object literal. */
export function declaredNames(text: string): Set<string> {
  const out = new Set<string>();
  const re = /^\s{2,}([A-Z][A-Za-z0-9]*):\s*a(?:\s*$|\.(?:model|enum|customType)\b)/gm;
  for (const m of stripComments(text).matchAll(re)) out.add(m[1]);
  return out;
}

/** Every relationship or ref target the file names, with the line it is on. */
export function references(text: string): Omit<CrossModuleRef, "file">[] {
  const out: Omit<CrossModuleRef, "file">[] = [];
  const clean = stripComments(text);
  const re = /\b(?:a\.(ref)|(belongsTo)|(hasMany)|(hasOne))\(\s*['"]([A-Za-z0-9]+)['"]/g;
  for (const m of clean.matchAll(re)) {
    const kind = (m[1] ?? m[2] ?? m[3] ?? m[4]) as CrossModuleRef["kind"];
    const line = clean.slice(0, m.index).split("\n").length;
    out.push({ kind, target: m[5], line });
  }
  return out;
}

/**
 * References in module files whose target is neither declared in the same
 * file nor a core name. Empty means the boundary holds.
 */
export function findCrossModuleRefs(moduleFiles: SchemaFile[], coreNames: Set<string>): CrossModuleRef[] {
  const bad: CrossModuleRef[] = [];
  for (const f of moduleFiles) {
    const own = declaredNames(f.text);
    for (const r of references(f.text)) {
      if (own.has(r.target) || coreNames.has(r.target)) continue;
      bad.push({ file: f.name, ...r });
    }
  }
  return bad;
}
