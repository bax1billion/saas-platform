/**
 * Local CDK assembly of the Amplify backend — the same synth `ampx` runs in
 * Amplify Hosting, minus AWS. Catches schema/transformer errors (relationship
 * mismatches, mutation name collisions, ESM/CJS import boundaries, bad
 * indexes) in ~20s instead of a failed cloud build.
 *
 * Usage: npm run check:backend   (node --import tsx scripts/check-backend.mjs)
 */
import { mkdirSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

// CDK finishes writing assets at process exit, so the out dir must outlive
// this script. .amplify/ is gitignored; the dir is reset on every run.
const outDir = join(dirname(fileURLToPath(import.meta.url)), "..", ".amplify", "local-check");
rmSync(outDir, { recursive: true, force: true });
mkdirSync(outDir, { recursive: true });
process.env.CDK_OUTDIR = outDir;
process.env.CDK_DEFAULT_ACCOUNT ??= "123456789012";
process.env.CDK_DEFAULT_REGION ??= "us-east-1";
process.env.AWS_REGION ??= process.env.CDK_DEFAULT_REGION;
process.env.CDK_CONTEXT_JSON ??= JSON.stringify({
  "amplify-backend-namespace": "localcheck",
  "amplify-backend-name": "check",
  "amplify-backend-type": "sandbox",
});

try {
  await import("../amplify/backend.ts");
  console.log("✓ backend synth OK");
} catch (err) {
  console.error("✗ backend synth FAILED");
  let depth = 0;
  for (let c = err; c && depth < 8; c = c.cause, depth++) {
    const msg = String(c.message ?? c).split("\n").slice(0, 6).join("\n");
    console.error(`${"  ".repeat(depth)}∟ [${c.name ?? "Error"}] ${msg}`);
  }
  process.exitCode = 1;
}
