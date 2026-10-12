/**
 * Which product modules this deploy composes (docs/bootstrap.md).
 *
 * CloudFormation caps one stack operation at 2,500 resources across the
 * root and every nested stack it touches, and the whole backend is far
 * past that, so a fresh environment is created in stages: the foundation
 * first, then modules in batches. `BACKEND_MODULES` is the one switch:
 *
 *   unset or "all"      every module (every deploy of an existing environment)
 *   "none"              the foundation alone (the first deploy of a new one)
 *   "widgets,reports"   the foundation plus the named modules
 *
 * Amplify Hosting reads it from the branch's environment variables, CI
 * and `ampx` from the process environment (`npm run sandbox -- --modules`).
 * An unknown id fails the synth rather than silently composing nothing.
 */
export function composedModules(all: readonly string[], raw: string | undefined = process.env.BACKEND_MODULES): Set<string> {
  const value = raw?.trim();
  if (!value || value === 'all') return new Set(all);
  if (value === 'none') return new Set();
  const ids = value
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  const unknown = ids.filter((id) => !all.includes(id));
  if (unknown.length) {
    throw new Error(`BACKEND_MODULES names ${unknown.join(', ')}; known modules: ${all.join(', ')} (or "all", "none")`);
  }
  return new Set(ids);
}

/** What a synth log line says about the switch. */
export function describeComposition(composed: ReadonlySet<string>, all: readonly string[], raw: string | undefined = process.env.BACKEND_MODULES): string {
  const setting = raw?.trim() ? `BACKEND_MODULES=${raw.trim()}` : 'BACKEND_MODULES unset';
  const list = composed.size === all.length ? 'every module' : composed.size ? [...composed].join(', ') : 'the foundation alone';
  return `Backend composes ${list} (${setting})`;
}
