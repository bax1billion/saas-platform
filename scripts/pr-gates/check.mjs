#!/usr/bin/env node
// The pull request gates, run by a machine (.github/workflows/pr-gates.yml)
// or by hand before opening a PR:
//
//   npm run check:pr                       # the PR of the current branch
//   npm run check:pr -- 123                # PR 123
//   npm run check:pr -- --mode tier 123    # the Tier 1 decision only
//
// Gathers the facts (git for the commits and the diff against the base, the
// GitHub CLI for the title, reviews and labels) and hands them to the pure
// rules in rules.mjs. `--mode conventions` (the default) exits 1 on a rule
// failure; `--mode tier` exits 1 while a Tier 1 PR waits for a lead's
// approval. With GITHUB_OUTPUT set it also writes `needs_lead`,
// `lead_approved` and `comment_file` for the workflow. No dependencies
// beyond node and gh, so the job runs without `npm ci`.
import { execFileSync } from "node:child_process";
import { appendFileSync, existsSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { PRODUCT_WORDS, RELEASE_BRANCH } from "./local.mjs";
import { evaluate, tierComment } from "./rules.mjs";

const args = process.argv.slice(2);
const modeIx = args.indexOf("--mode");
const mode = modeIx >= 0 ? args.splice(modeIx, 2)[1] : "conventions";
const number = args.find((a) => /^\d+$/.test(a)) ?? process.env.PR_NUMBER ?? "";
const root = process.cwd();

const sh = (cmd, cmdArgs, opts = {}) =>
  execFileSync(cmd, cmdArgs, { encoding: "utf8", maxBuffer: 64 * 1024 * 1024, stdio: ["ignore", "pipe", "pipe"], ...opts });

// 1. The PR, from GitHub.
const prJson = sh("gh", [
  "pr",
  "view",
  ...(number ? [number] : []),
  "--json",
  "number,title,author,isDraft,baseRefName,headRefName,headRefOid,labels,reviews",
]);
const pr = JSON.parse(prJson);
const baseRef = pr.baseRefName;
// The integration branch is the repository's default branch; the release
// branch, if any, is this repository's own value in local.mjs.
const integrationBranch = sh("gh", ["repo", "view", "--json", "defaultBranchRef", "--jq", ".defaultBranchRef.name"]).trim();

// The commits and files come from the checkout, so it has to be the PR's
// head; otherwise the verdict would be about other code under this PR's name.
const head = sh("git", ["rev-parse", "HEAD"]).trim();
if (pr.headRefOid && head !== pr.headRefOid) {
  console.error(`The checkout is ${head.slice(0, 8)} but PR #${pr.number}'s head is ${pr.headRefOid.slice(0, 8)}. Check out the PR branch (gh pr checkout ${pr.number}) and run again.`);
  process.exit(2);
}

// 2. The commits and the diff, from git. The base is fetched so a shallow
//    checkout still has the merge base.
try {
  sh("git", ["fetch", "--quiet", "origin", baseRef], { stdio: "ignore" });
} catch {
  // Offline, or no origin: fall back to what the checkout has.
}
const baseRev = `origin/${baseRef}`;
const mergeBase = sh("git", ["merge-base", baseRev, "HEAD"]).trim();

const linesOf = (diffText, sign) =>
  diffText
    .split("\n")
    .filter((l) => l.startsWith(sign) && !l.startsWith(sign.repeat(3)))
    .map((l) => l.slice(1));
const addedLinesOf = (diffText) => linesOf(diffText, "+");

const commits = sh("git", ["log", `${mergeBase}..HEAD`, "--no-merges", "--format=%H%x00%s"])
  .split("\n")
  .filter(Boolean)
  .map((line) => {
    const [sha, subject] = line.split("\u0000");
    const addedLines = /^foundation:/.test(subject) ? addedLinesOf(sh("git", ["show", sha, "--format=%B", "-U0", "--no-color"])) : [];
    return { sha, subject, addedLines };
  });

// No rename detection: a renamed file is a deletion and an addition, so a
// test renamed away from `*.test.ts` still reads as a removed test.
const files = sh("git", ["diff", "--name-status", "--no-renames", `${mergeBase}...HEAD`])
  .split("\n")
  .filter(Boolean)
  .map((line) => {
    const parts = line.split("\t");
    const status = parts[0][0];
    const path = parts[parts.length - 1];
    let addedLines = [];
    let removedLines = [];
    if (status !== "D" && /\.(tsx?|css|mjs|js|json)$/.test(path)) {
      const diff = sh("git", ["diff", "-U0", "--no-color", `${mergeBase}...HEAD`, "--", path]);
      addedLines = addedLinesOf(diff);
      removedLines = linesOf(diff, "-");
    }
    return { path, status, addedLines, removedLines };
  });

// 3. The repo's own facts. CODEOWNERS comes from the base branch, as GitHub
//    reads it for the code owner review: a PR cannot release its own paths
//    by editing the file, and a change merged to the base applies to every
//    open PR at once (Oct 28, 2026: the first narrowing did not, because the
//    check read each head's copy until the updater merged staging in). The
//    checkout's copy is the fallback when the base cannot be read (offline).
const codeowners = (() => {
  try {
    return sh("git", ["show", `${baseRev}:.github/CODEOWNERS`]);
  } catch {
    try {
      return readFileSync(join(root, ".github", "CODEOWNERS"), "utf8");
    } catch {
      return "";
    }
  }
})();
const moduleIds = existsSync(join(root, "modules")) ? readdirSync(join(root, "modules")).filter((d) => statSync(join(root, "modules", d)).isDirectory()) : [];

const result = evaluate({
  baseRef,
  integrationBranch,
  releaseBranch: RELEASE_BRANCH,
  headRef: pr.headRefName,
  title: pr.title,
  author: pr.author?.login,
  isDraft: pr.isDraft,
  labels: (pr.labels ?? []).map((l) => l.name),
  commits,
  files,
  reviews: (pr.reviews ?? []).map((r) => ({ user: r.author?.login, state: r.state })),
  codeowners,
  moduleIds,
  productWords: PRODUCT_WORDS,
});

// 4. Report.
const out = process.env.GITHUB_OUTPUT;
if (out) {
  const commentFile = join(process.env.RUNNER_TEMP ?? root, "tier-comment.md");
  writeFileSync(commentFile, tierComment(result));
  appendFileSync(out, `needs_lead=${result.needsLead}\nlead_approved=${result.leadApproved}\ncomment_file=${commentFile}\n`);
}

console.log(`PR #${pr.number} "${pr.title}"  ${pr.headRefName} -> ${baseRef}  ${commits.length} commit(s), ${files.length} file(s)`);

if (mode === "tier") {
  console.log(result.needsLead ? `Tier 1:\n${result.tier1.map((r) => `  - ${r}`).join("\n")}` : "Tier 2: no lead sign-off needed.");
  if (result.needsLead && !result.leadApproved) {
    console.log(`\nWaiting for an approval from ${result.leads.join(" or ")}.`);
    process.exit(1);
  }
  if (result.needsLead) console.log(`\nApproved by ${result.approvedBy.join(", ")}.`);
  process.exit(0);
}

if (result.failures.length) {
  console.log(`\n${result.failures.length} convention(s) broken:\n`);
  for (const f of result.failures) console.log(`  ✗ ${f}\n`);
  process.exit(1);
}
console.log("Conventions pass.");
