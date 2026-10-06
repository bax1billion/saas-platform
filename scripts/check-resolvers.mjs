/**
 * Validate every APPSYNC_JS resolver and pipeline function the backend
 * would deploy, using AppSync's own `evaluate-code` API — the only check
 * that applies the runtime's real rules. Node runs a superset of
 * APPSYNC_JS, so vitest passes code that AppSync rejects at deploy with
 * "The code contains one or more errors" (docs/adding-a-module.md →
 * Gotchas: `Function.call`, a literal comparison TypeScript can prove
 * false, `throw`, regex literals, …). Twenty minutes into an Amplify
 * Hosting build is the wrong place to learn that.
 *
 * What it checks is what deploys: the inline `Code` of each
 * AWS::AppSync::FunctionConfiguration / AWS::AppSync::Resolver with an
 * APPSYNC_JS runtime in the templates `npm run check:backend` synthesized
 * (.amplify/local-check). Decision snippets, `__FK__`/`__MODE__`
 * substitutions and the entitlement field map are therefore validated in
 * their assembled form, not as source files. Each handler (request and
 * response) is evaluated under a few generic contexts so paths that only
 * run at execution time (the runtime reports `Invalid function: call`
 * there, not statically) are covered. A domain error the code raises on
 * purpose with util.error() is a pass; only `codeErrors` fail.
 *
 * evaluate-code is read-only and creates nothing. It needs AWS
 * credentials with appsync:EvaluateCode:
 *
 *   npm run check:resolvers -- --profile <profile> [--region us-east-2]
 *   AWS_PROFILE=<profile> npm run check:resolvers
 *
 * Runs the synth first when .amplify/local-check is missing. Options:
 *   --profile <name>    AWS profile (default: AWS_PROFILE / default chain)
 *   --region <region>   default: AWS_REGION, then the profile's region
 *   --templates <dir>   validate templates from this directory instead
 *   --only <substring>  validate only functions whose name contains this
 */
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");

// ─── Arguments ────────────────────────────────────────────────────────
const args = process.argv.slice(2);
const opt = (name) => {
  const i = args.indexOf(`--${name}`);
  return i === -1 ? undefined : args[i + 1];
};
const profile = opt("profile") ?? process.env.AWS_PROFILE;
const templatesDir = opt("templates") ?? join(repoRoot, ".amplify", "local-check");
const only = opt("only");

const awsBase = ["--output", "json", ...(profile ? ["--profile", profile] : [])];

function aws(cliArgs, { allowFailure = false } = {}) {
  const r = spawnSync("aws", [...cliArgs, ...awsBase], { encoding: "utf8" });
  if (r.error) {
    console.error("✗ aws CLI not found — install AWS CLI v2 to run this check");
    process.exit(2);
  }
  if (r.status !== 0 && !allowFailure) {
    if (/Token has expired|sso|SSO|Unable to locate credentials|ExpiredToken/i.test(r.stderr)) {
      console.error("✗ no usable AWS credentials for evaluate-code.");
      console.error(profile ? `  run: aws sso login --profile ${profile}` : "  set AWS_PROFILE or pass --profile <name>, then aws sso login");
      process.exit(2);
    }
    console.error(r.stderr.trim());
    process.exit(2);
  }
  return r;
}

const region =
  opt("region") ??
  process.env.AWS_REGION ??
  (aws(["configure", "get", "region"], { allowFailure: true }).stdout.trim() || "us-east-1");

// ─── Templates ────────────────────────────────────────────────────────
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

let templates = templatesUnder(templatesDir);
if (templates.length === 0 && !opt("templates")) {
  console.log("no synthesized templates yet — running the synth (scripts/check-backend.mjs) …");
  execFileSync(process.execPath, ["--import", "tsx", join(repoRoot, "scripts", "check-backend.mjs")], {
    cwd: repoRoot,
    stdio: "inherit",
  });
  templates = templatesUnder(templatesDir);
}
if (templates.length === 0) {
  console.error(`✗ no *.template.json under ${templatesDir}`);
  process.exit(2);
}

/** Every inline APPSYNC_JS code body the templates would deploy. */
const units = [];
for (const file of templates) {
  const template = JSON.parse(readFileSync(file, "utf8"));
  for (const [logicalId, resource] of Object.entries(template.Resources ?? {})) {
    if (resource.Type !== "AWS::AppSync::FunctionConfiguration" && resource.Type !== "AWS::AppSync::Resolver") continue;
    const props = resource.Properties ?? {};
    if (props.Runtime?.Name !== "APPSYNC_JS") continue;
    const name = typeof props.Name === "string" ? props.Name : `${props.TypeName ?? ""}.${props.FieldName ?? logicalId}`;
    if (only && !name.includes(only)) continue;
    if (typeof props.Code !== "string") {
      console.log(`  ~ ${name}: code is not an inline string (asset or intrinsic) — skipped`);
      continue;
    }
    units.push({ name, code: props.Code, template: file.slice(templatesDir.length + 1) });
  }
}
if (units.length === 0) {
  console.error("✗ found no APPSYNC_JS code in the templates — is anything using the JS runtime?");
  process.exit(2);
}

// ─── Contexts ─────────────────────────────────────────────────────────
// Generic shapes that reach the common branches of our pipeline steps:
// an IAM/bypass caller, a Cognito caller with the record-access and
// entitlement stash the earlier steps would have set, and an empty
// result. util.error() raised on purpose along the way is not a failure.
const access = { bypass: false, sub: "sub-1", groups: ["Admin"], orgId: "org-1" };
const identity = { sub: "sub-1", groups: ["Admin"], claims: { sub: "sub-1", "cognito:groups": ["Admin"] } };
const record = { id: "rec-1", orgId: "org-1", access: "UNIT", status: "DRAFT" };
const CONTEXTS = [
  { stash: {}, args: { input: {} }, prev: { result: {} }, identity: null, result: null },
  {
    stash: { access, entitlement: { bypass: false, orgId: "org-1" } },
    args: { input: { ...record, projectId: "rec-1", assignedSubs: ["sub-1"] }, projectId: "rec-1", id: "rec-1" },
    prev: { result: record },
    identity,
    result: { ...record, items: [record], projectId: "rec-1" },
  },
  {
    stash: { access },
    args: { input: { id: "rec-1", access: "RESTRICTED", assignedSubs: [] } },
    prev: { result: null },
    identity,
    result: { items: [] },
  },
];

// ─── Credentials preflight ────────────────────────────────────────────
// Fail once, clearly, instead of once per handler with a raw CLI error.
{
  const who = aws(["sts", "get-caller-identity"], { allowFailure: true });
  if (who.status !== 0) {
    console.error("✗ no usable AWS credentials for evaluate-code:");
    console.error(`  ${who.stderr.trim().split("\n")[0]}`);
    console.error(profile ? `  run: aws sso login --profile ${profile}` : "  set AWS_PROFILE or pass --profile <name>, then aws sso login");
    process.exit(2);
  }
}

// ─── Evaluate ─────────────────────────────────────────────────────────
const workDir = join(templatesDir, "resolvers-check");
mkdirSync(workDir, { recursive: true });

function evaluate(codeFile, fn, context) {
  const r = aws(
    [
      "appsync", "evaluate-code",
      "--region", region,
      "--runtime", "name=APPSYNC_JS,runtimeVersion=1.0.0",
      "--code", `file://${codeFile}`,
      "--function", fn,
      "--context", JSON.stringify(context),
    ],
    { allowFailure: true }
  );
  if (r.status !== 0) {
    // AccessDenied first, and it is checked BEFORE the credentials test: an
    // assumed SSO role's ARN contains "AWSReservedSSO", which used to match
    // the /sso/i below and report a working session as an expired one.
    if (/AccessDenied|not authorized to perform/i.test(r.stderr)) {
      console.error("✗ this identity cannot call appsync:EvaluateCode.");
      console.error("  AmplifyBackendDeployFullAccess does not grant it (same gap as");
      console.error("  dynamodb:ListTables / lambda:ListFunctions). Use an identity that");
      console.error("  does, or skip this check — it validates resolver code, not the deploy.");
      process.exit(2);
    }
    if (/Token has expired|Unable to locate credentials|ExpiredToken|InvalidGrant|sso session/i.test(r.stderr)) {
      console.error("✗ AWS credentials expired or missing.");
      console.error(profile ? `  run: aws sso login --profile ${profile}` : "  set AWS_PROFILE or pass --profile <name>");
      process.exit(2);
    }
    return { fatal: r.stderr.trim() };
  }
  const body = JSON.parse(r.stdout || "{}");
  return { codeErrors: body.error?.codeErrors ?? [], message: body.error?.message ?? null };
}

console.log(`Validating ${units.length} APPSYNC_JS handler set(s) with appsync:EvaluateCode in ${region}${profile ? ` (profile ${profile})` : ""} …`);
let failed = 0;
for (const unit of units.sort((a, b) => a.name.localeCompare(b.name))) {
  const codeFile = join(workDir, `${unit.name.replace(/[^A-Za-z0-9_.-]/g, "_")}.js`);
  writeFileSync(codeFile, unit.code);
  const seen = new Set();
  const problems = [];
  for (const fn of ["request", "response"]) {
    for (const context of CONTEXTS) {
      const res = evaluate(codeFile, fn, context);
      if (res.fatal) {
        problems.push(`${fn}: ${res.fatal}`);
        break;
      }
      for (const e of res.codeErrors) {
        const line = e.location?.line ?? "?";
        const key = `${e.errorType}@${line}:${(e.value ?? "").trim()}`;
        if (seen.has(key)) continue;
        seen.add(key);
        problems.push(`${fn} line ${line}: [${e.errorType}] ${(e.value ?? res.message ?? "").trim()}`);
      }
    }
  }
  if (problems.length) {
    failed += 1;
    console.log(`✗ ${unit.name}  (${unit.template})`);
    for (const p of problems) console.log(`    ${p}`);
  } else {
    console.log(`✓ ${unit.name}`);
  }
}

if (failed) {
  console.error(`\n✗ ${failed} of ${units.length} handler set(s) would be rejected by AppSync at deploy`);
  process.exit(1);
}
console.log(`\n✓ all ${units.length} APPSYNC_JS handler set(s) compile and run under the AppSync runtime`);
