/**
 * Resource-cycle check over the templates `npm run check:backend` just
 * synthesized (.amplify/local-check). CDK does not catch a cycle that runs
 * through a nested stack's Parameters — CloudFormation does, at deploy
 * time, as CloudformationResourceCircularDependencyError — so the local
 * synth says OK and the Amplify Hosting build fails twenty minutes later.
 *
 * This replays CloudFormation's rule on each template: a resource depends
 * on every resource it names in DependsOn, Ref or Fn::GetAtt. Any strongly
 * connected component larger than one resource is a cycle. The classic
 * shape it catches: an APPSYNC_JS function created in the top-level data
 * stack whose data source table lives in a model's nested stack, while
 * that nested stack's resolvers reference the function back
 * (docs/adding-a-module.md → Gotchas).
 *
 * Usage: runs as the second half of `npm run check:backend`.
 */
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", ".amplify", "local-check");

function templatesUnder(dir) {
  if (!existsSync(dir)) return [];
  const out = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...templatesUnder(full));
    else if (entry.endsWith(".template.json")) out.push(full);
  }
  return out;
}

/** Logical ids a property tree references via Ref or Fn::GetAtt. */
function references(node, out) {
  if (Array.isArray(node)) {
    for (const n of node) references(n, out);
    return;
  }
  if (!node || typeof node !== "object") return;
  if (typeof node.Ref === "string") out.add(node.Ref);
  if (node["Fn::GetAtt"] !== undefined) {
    const g = node["Fn::GetAtt"];
    out.add(Array.isArray(g) ? g[0] : String(g).split(".")[0]);
  }
  for (const v of Object.values(node)) references(v, out);
}

/** Tarjan's strongly connected components; returns only components > 1. */
function cycles(adjacency) {
  let index = 0;
  const stack = [];
  const onStack = new Set();
  const low = new Map();
  const num = new Map();
  const found = [];
  const visit = (v) => {
    num.set(v, index);
    low.set(v, index);
    index += 1;
    stack.push(v);
    onStack.add(v);
    for (const w of adjacency.get(v)) {
      if (!num.has(w)) {
        visit(w);
        low.set(v, Math.min(low.get(v), low.get(w)));
      } else if (onStack.has(w)) {
        low.set(v, Math.min(low.get(v), num.get(w)));
      }
    }
    if (low.get(v) === num.get(v)) {
      const component = [];
      let w;
      do {
        w = stack.pop();
        onStack.delete(w);
        component.push(w);
      } while (w !== v);
      if (component.length > 1) found.push(component.sort());
    }
  };
  for (const v of adjacency.keys()) if (!num.has(v)) visit(v);
  return found;
}

const templates = templatesUnder(root);
if (templates.length === 0) {
  console.error(`✗ no templates under ${root} — run the synth first (npm run check:backend)`);
  process.exit(1);
}

let total = 0;
for (const file of templates) {
  const template = JSON.parse(readFileSync(file, "utf8"));
  const resources = template.Resources ?? {};
  const ids = new Set(Object.keys(resources));
  const adjacency = new Map();
  for (const [id, resource] of Object.entries(resources)) {
    const out = new Set();
    references(resource.Properties ?? {}, out);
    for (const dep of [].concat(resource.DependsOn ?? [])) out.add(dep);
    adjacency.set(id, [...out].filter((x) => ids.has(x) && x !== id));
  }
  for (const component of cycles(adjacency)) {
    total += 1;
    console.error(`✗ cycle in ${file.slice(root.length + 1)} (${component.length} resources):`);
    for (const id of component) console.error(`    ${resources[id].Type}  ${id}`);
  }
}

if (total) {
  console.error(`✗ ${total} resource cycle(s) — CloudFormation will reject this deploy`);
  process.exit(1);
}
console.log(`✓ no resource cycles in ${templates.length} templates`);
