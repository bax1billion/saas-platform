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

// Template body size. CloudFormation refuses a template over 1,000,000
// bytes, and only at deploy time (the data nested stack crossed it in
// October 2026). amplify/backend.ts #9 synthesizes every stack compact;
// this fails the local check if a template is indented again (a CDK
// upgrade renaming the private flag) or nears the limit either way.
const LIMIT = 1_000_000;
const WARN = 0.85 * LIMIT;
let sizeFails = 0;
for (const file of templates) {
  const raw = readFileSync(file, "utf8");
  const name = file.slice(root.length + 1);
  if (/^\{\n\s+"/.test(raw)) {
    sizeFails += 1;
    console.error(`✗ ${name} is indented: the compact-template aspect in amplify/backend.ts no longer applies`);
  }
  if (raw.length > LIMIT) {
    sizeFails += 1;
    console.error(`✗ ${name} is ${raw.length} bytes; CloudFormation refuses a template over ${LIMIT}`);
  } else if (raw.length > WARN) {
    console.warn(`! ${name} is ${raw.length} bytes, ${Math.round((raw.length / LIMIT) * 100)}% of the CloudFormation limit`);
  }
}
if (sizeFails) process.exit(1);
const largest = templates.map((f) => [readFileSync(f).length, f.slice(root.length + 1)]).sort((a, b) => b[0] - a[0])[0];
console.log(`✓ largest template ${largest[1]} is ${largest[0]} bytes (${Math.round((largest[0] / LIMIT) * 100)}% of the limit)`);

// A stack operation may touch at most 2,500 resources across the nested
// tree (docs/bootstrap.md). The number printed is the fresh-create total of
// what BACKEND_MODULES composes: what the FIRST deploy of a new environment
// would create, and the ceiling a later stage subtracts the previous stage's
// total from (a stage creates only its difference). With the variable set,
// a total over the cap is a warning that this set cannot be the first
// stage; with it unset, the whole backend is expected to be over.
const OPERATION_LIMIT = 2_500;
const freshCreateTotal = templates.reduce((n, f) => n + Object.keys(JSON.parse(readFileSync(f, "utf8")).Resources ?? {}).length, 0);
const staged = (process.env.BACKEND_MODULES ?? "").trim();
if (freshCreateTotal > OPERATION_LIMIT && staged) {
  console.warn(`! BACKEND_MODULES=${staged} composes ${freshCreateTotal} resources: not a first stage (cap ${OPERATION_LIMIT} per operation); as a later stage it creates the difference from the stage before it (docs/bootstrap.md)`);
} else {
  console.log(`${freshCreateTotal > OPERATION_LIMIT ? "·" : "✓"} ${freshCreateTotal} resources across ${templates.length} templates${freshCreateTotal > OPERATION_LIMIT ? `; over ${OPERATION_LIMIT}, so a fresh environment is bootstrapped in stages (docs/bootstrap.md)` : ` (fits in one deploy as a first stage, cap ${OPERATION_LIMIT})`}`);
}

// One line per API stack (the foundation data stack and each data domain,
// docs/data-domains.md): the two caps that bite a growing schema are the
// 500 resources and 1,000,000 bytes of the stack that holds the API.
const RESOURCE_LIMIT = 500;
for (const file of templates) {
  const raw = readFileSync(file, "utf8");
  const template = JSON.parse(raw);
  const resources = Object.values(template.Resources ?? {});
  if (!resources.some((r) => r.Type === "AWS::AppSync::GraphQLApi")) continue;
  const api = resources.find((r) => r.Type === "AWS::AppSync::GraphQLApi");
  const label = api.Properties?.Name ?? file.slice(root.length + 1);
  const n = resources.length;
  const models = resources.filter((r) => r.Type === "AWS::CloudFormation::Stack").length;
  const mark = n > 0.85 * RESOURCE_LIMIT || raw.length > WARN ? "!" : "✓";
  console.log(
    `${mark} API ${typeof label === "string" ? label : "(foundation)"}: ${n} of ${RESOURCE_LIMIT} resources (${models} model stacks), ${raw.length} bytes (${Math.round((raw.length / LIMIT) * 100)}%)`
  );
}
