/**
 * Runs `ampx sandbox` with the staged-bootstrap switch set (docs/bootstrap.md).
 *
 *   npm run sandbox -- --profile sandbox --modules none --once
 *   npm run sandbox -- --modules widgets,reports        # defaults from .env.sandbox
 *   npm run sandbox -- --delete
 *
 * Flags:
 *   --profile <name>     AWS profile (SSO); default AWS_PROFILE from .env.sandbox or the shell
 *   --modules <list>     BACKEND_MODULES for this deploy: "all", "none" or "widgets,reports"
 *                        (default from .env.sandbox, else unset = all)
 *   --identifier <name>  sandbox identifier (default: the system user)
 *   --once               deploy once and exit instead of watching
 *   --delete             tear the sandbox down
 *   anything else is passed to ampx unchanged
 *
 * `.env.sandbox` (gitignored; copy .env.sandbox.example) holds per-developer
 * defaults as KEY=VALUE lines: AWS_PROFILE, BACKEND_MODULES, SANDBOX_IDENTIFIER,
 * and anything else the synth reads (SANDBOX_SEED, SANDBOX_SEED_PASSWORD).
 * A flag wins over the file; the file wins over the shell.
 */
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function readEnvFile(path) {
  if (!existsSync(path)) return {};
  const out = {};
  for (const raw of readFileSync(path, "utf8").split("\n")) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq < 0) continue;
    out[line.slice(0, eq).trim()] = line.slice(eq + 1).trim().replace(/^["']|["']$/g, "");
  }
  return out;
}

const file = readEnvFile(join(root, ".env.sandbox"));
const args = process.argv.slice(2);
const flags = { profile: file.AWS_PROFILE ?? process.env.AWS_PROFILE, modules: file.BACKEND_MODULES ?? process.env.BACKEND_MODULES, identifier: file.SANDBOX_IDENTIFIER };
const passthrough = [];
let once = false;
let del = false;
for (let i = 0; i < args.length; i++) {
  const a = args[i];
  const value = () => args[++i];
  if (a === "--profile") flags.profile = value();
  else if (a === "--modules") flags.modules = value();
  else if (a === "--identifier") flags.identifier = value();
  else if (a === "--once") once = true;
  else if (a === "--delete") del = true;
  else passthrough.push(a);
}

const ampxArgs = ["ampx", "sandbox", ...(del ? ["delete"] : []), ...(flags.profile ? ["--profile", flags.profile] : []), ...(flags.identifier ? ["--identifier", flags.identifier] : []), ...(once && !del ? ["--once"] : []), ...passthrough];
// Every KEY in .env.sandbox reaches the synth (SANDBOX_SEED, SANDBOX_SEED_PASSWORD, ...).
const env = { ...process.env, ...file };
if (flags.profile) env.AWS_PROFILE = flags.profile;
if (flags.modules !== undefined) env.BACKEND_MODULES = flags.modules;
else delete env.BACKEND_MODULES;

console.log(`sandbox: profile ${flags.profile ?? "(default chain)"}, identifier ${flags.identifier ?? "(system user)"}, BACKEND_MODULES ${env.BACKEND_MODULES ?? "unset (every module)"}${del ? ", delete" : once ? ", once" : ", watch"}`);
if (!del && !env.BACKEND_MODULES) {
  console.log("sandbox: a fresh environment cannot take every module in one deploy (docs/bootstrap.md); pass --modules none first if this sandbox does not exist yet.");
}
const result = spawnSync("npx", ampxArgs, { cwd: root, env, stdio: "inherit" });
process.exit(result.status ?? 1);
