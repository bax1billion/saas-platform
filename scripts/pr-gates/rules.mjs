// The pull request gates, as pure rules over the facts of one PR
// (docs/pull-request-gates.md). `check.mjs` gathers the facts from git and
// the GitHub CLI and prints what these return; `rules.test.ts` pins each
// rule. Nothing here reads the file system or the network, so the same
// rule can be tried in a test with a made-up PR.
//
// Two kinds of result:
//   - a *failure* fails the `conventions` check until the author fixes it;
//   - a *Tier 1 reason* does not fail anything by itself: it labels the PR
//     and holds the `tier-1 review` check until a lead reviewer approves
//     (CLAUDE.md "Tier 1 review": a person, never only an agent).

/**
 * The words that must not appear in a `foundation:` commit (CLAUDE.md
 * "Commits") come from the product: `facts.productWords`, read by check.mjs
 * from scripts/pr-gates/product-words.mjs. With none given, nothing fails.
 */
const NO_WORDS = /$^/;

/**
 * Commit subjects (CLAUDE.md "Commits"): `<area>: <imperative subject> [<ticket>]`.
 * Several areas may share a subject (`alpha, beta: move ...`); a scope in
 * parentheses is Dependabot's `chore(deps): ...`. Merges, reverts and fixup
 * commits pass as git writes them.
 */
export const SUBJECT_PATTERN = /^[a-z][a-z0-9-]*(,\s?[a-z][a-z0-9-]*)*(\([^)]*\))?!?: \S/;
const GIT_OWN_SUBJECT = /^(Merge |Revert |fixup! |squash! )/;

/** Files that never belong in a commit (CLAUDE.md "How Claude works here" 6). */
export const FORBIDDEN_FILES = [
  [/(^|\/)amplify_outputs[^/]*$/, "amplify_outputs is generated per environment and gitignored"],
  [/(^|\/)amplifyconfiguration[^/]*$/, "amplifyconfiguration is generated per environment"],
  [/(^|\/)\.env(?!\.sandbox\.example$)[^/]*$/, "environment files hold secrets"],
  [/^amplify\/\.sandbox-operators$/, "personal sandbox bootstrap, never shared"],
  [/\.pem$/, "a private key"],
];

/**
 * Where a toast must not be added (CLAUDE.md "No button that only shows a
 * message", v4.6 D22: "a toast is never done"). `components/ui/sonner.tsx`
 * is the Toaster itself and the one place the import belongs.
 */
const SCREEN_FILE = /^(app|components|modules|lib)\/.*\.tsx?$/;
const TOAST_LINE = /\btoast(\.\w+)?\(|from\s+["']sonner["']/;
const TOASTER = /^components\/ui\/sonner\.tsx$/;

/**
 * Where a hex colour must not be added (CLAUDE.md "Styling": no hex literals
 * outside `config/theme.css`). The two symbol catalogues carry the colours
 * standards fix (NFPA 704 placards, map symbols) and are exempt; a line that
 * must carry one elsewhere says `hex-ok:` and why, like `copy-ok:`.
 */
const STYLED_FILE = /^(app|components|modules|lib|config)\/.*\.(tsx?|css)$/;
const HEX_EXEMPT = [/^config\/theme\.css$/, /^lib\/services\/atlas\/symbols\.ts$/, /^lib\/map\/custom-symbols\.ts$/, /\/generated\//];
const HEX_LITERAL = /(^|[^\w&])#([0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})\b/i;

/**
 * Logic that must come with a test when it changes (CLAUDE.md "How Claude
 * works here" 3: "Add or update tests for logic you change"). Schema files,
 * Lambda entry points and type-only files are left out: synth and the
 * typecheck are their tests.
 */
const LOGIC_FILE = /^(modules\/[^/]+\/lib\/.*\.ts|lib\/.*\.ts|amplify\/data\/.*\.js|amplify\/functions\/[^/]+-shared\/.*\.ts|amplify\/shared\/.*\.ts)$/;
const LOGIC_EXEMPT = /(\.test\.ts|\.d\.ts|\/types\.ts|\/index\.ts|\/generated\/|\/introspection\.json)$|\/generated\//;
export const isTestFile = (p) => /\.test\.tsx?$/.test(p);

/**
 * Content a path cannot show (CLAUDE.md "Tier 1 review": permissions, and
 * anything that sends outside the organization). A module's schema file and its
 * Lambdas are module work by path; one that widens who may read a table,
 * or that reaches outside without `dispatch()`, is held for a person.
 */
const MODULE_SCHEMA = /^amplify\/data\/modules\/[^/]+\.ts$/;
const MODULE_LAMBDA = /^amplify\/functions\/[a-z0-9]+-[^/]+\//;
const WIDENED_AUTH = /allow\.(publicApiKey|guest|authenticated)\(/;
const OUTBOUND = /\bfetch\(|@aws-sdk\/client-(ses|sesv2|sns|pinpoint|pinpoint-sms-voice)/;

/**
 * CODEOWNERS, parsed. Each line is a pattern and its owners; the last
 * matching pattern wins, as GitHub applies it. Patterns follow gitignore:
 * a leading `/` anchors to the repo root, a trailing `/` means a directory,
 * `*` never crosses a `/`, `**` does, and a pattern with no `/` matches at
 * any depth.
 */
export function parseCodeowners(text) {
  const rules = [];
  for (const raw of text.split("\n")) {
    const line = raw.replace(/\\#/g, "\u0000").split("#")[0].replace(/\u0000/g, "#").trim();
    if (!line) continue;
    const [pattern, ...owners] = line.split(/\s+/);
    rules.push({ pattern, owners, regex: codeownersRegex(pattern) });
  }
  return rules;
}

export function codeownersRegex(pattern) {
  let p = pattern;
  let anchored = false;
  if (p.startsWith("/")) {
    anchored = true;
    p = p.slice(1);
  } else if (p.includes("/") && !p.startsWith("**")) {
    // A pattern with a slash in the middle is relative to the root too.
    anchored = true;
  }
  let dirOnly = false;
  if (p.endsWith("/")) {
    dirOnly = true;
    p = p.slice(0, -1);
  }
  let re = "";
  for (let i = 0; i < p.length; i++) {
    const c = p[i];
    if (c === "*") {
      if (p[i + 1] === "*") {
        re += p[i + 2] === "/" ? "(?:.*/)?" : ".*";
        i += p[i + 2] === "/" ? 2 : 1;
      } else re += "[^/]*";
    } else if (c === "?") re += "[^/]";
    else re += c.replace(/[.+^${}()|[\]\\]/g, "\\$&");
  }
  const prefix = anchored ? "^" : "^(?:.*/)?";
  // A pattern that names a directory (trailing slash, or no extension in
  // its last segment) owns everything under it; a file pattern owns the file.
  const suffix = dirOnly ? "/.*$" : "(?:/.*)?$";
  return new RegExp(prefix + re + suffix);
}

/** The owners of one path, or [] when no pattern names it. */
export function ownersOf(path, rules) {
  let owners = [];
  for (const r of rules) if (r.regex.test(path)) owners = r.owners;
  return owners;
}

/** Every distinct owner named in CODEOWNERS, without the `@` (the lead reviewers). */
export function leadReviewers(rules) {
  return [...new Set(rules.flatMap((r) => r.owners))].map((o) => o.replace(/^@/, "").toLowerCase());
}

/**
 * The module a path belongs to, when it is module work: `modules/<id>/`,
 * `app/(app)/<id>/`, `amplify/data/modules/<id>.ts` and a Lambda folder
 * named `<id>-<verb>` under `amplify/functions/`.
 */
export function moduleOf(path, moduleIds) {
  const m =
    path.match(/^modules\/([^/]+)\//) ??
    path.match(/^app\/\(app\)\/([^/]+)\//) ??
    path.match(/^amplify\/data\/modules\/([^/.]+)\.ts$/) ??
    path.match(/^amplify\/functions\/([a-z0-9]+)-[^/]+\//);
  const id = m?.[1];
  return id && moduleIds.includes(id) ? id : null;
}

/**
 * Module work in the wider sense: `moduleOf` plus the module's published
 * contract under `lib/services/<id>/`. A test in one of these trees is the
 * module's own.
 */
export function moduleWorkOf(path, moduleIds) {
  const id = path.match(/^lib\/services\/([^/]+)\//)?.[1];
  return id && moduleIds.includes(id) ? id : moduleOf(path, moduleIds);
}

/**
 * The facts of a PR:
 *   { baseRef, headRef, title, author, isDraft,
 *     integrationBranch, releaseBranch (null when there is none),
 *     commits: [{ sha, subject, addedLines: [string] }],
 *     files: [{ path, status: 'A'|'M'|'D'|'R', addedLines: [string] }],
 *     reviews: [{ user, state }], codeowners: string, moduleIds: [string] }
 * `status` is git's one letter. `addedLines` are the `+` lines of the diff
 * against the base, without the `+`.
 */
export function evaluate(facts) {
  const failures = [];
  const tier1 = [];
  const files = facts.files ?? [];
  const commits = facts.commits ?? [];
  const rules = parseCodeowners(facts.codeowners ?? "");

  // Base and head. Every PR targets the integration branch (the repository's
  // default branch); the one exception is the promotion of that branch into
  // the release branch, when the repository has one. Branch names and PR
  // titles are a habit, not a gate.
  const integration = facts.integrationBranch ?? "main";
  const promotion = Boolean(facts.releaseBranch) && facts.baseRef === facts.releaseBranch && facts.headRef === integration;
  if (facts.baseRef !== integration && !promotion) {
    failures.push(`PRs target \`${integration}\`, never \`${facts.baseRef}\` (CLAUDE.md "Branches"). Retarget the PR; a change meant for another branch waits for that branch to merge first.`);
  }

  // Commit subjects, and no product words in a foundation commit.
  const productWords = facts.productWords ?? NO_WORDS;
  for (const c of commits) {
    if (GIT_OWN_SUBJECT.test(c.subject)) continue;
    if (!SUBJECT_PATTERN.test(c.subject)) {
      failures.push(`Commit ${c.sha.slice(0, 8)} "${c.subject}" is not \`<area>: <imperative subject> [<ticket>]\` (CLAUDE.md "Commits"). Reword it: \`git rebase -i\` or amend, then force-push the branch.`);
    }
    if (/^foundation:/.test(c.subject)) {
      const hit = [c.subject, ...(c.addedLines ?? [])].find((l) => productWords.test(l));
      if (hit) failures.push(`Commit ${c.sha.slice(0, 8)} is \`foundation:\` and carries a product word: "${hit.trim().slice(0, 100)}". A foundation commit has no product facts (CLAUDE.md "Commits"); split it or rename the area.`);
    }
  }

  // Files that never ship.
  for (const f of files) {
    if (f.status === "D") continue;
    for (const [re, why] of FORBIDDEN_FILES) if (re.test(f.path)) failures.push(`\`${f.path}\` must not be committed: ${why}. Remove it from the branch (\`git rm --cached\`) and rotate anything it held.`);
  }

  // The toast and hex rules read only the lines this PR adds.
  for (const f of files) {
    if (f.status === "D") continue;
    const added = f.addedLines ?? [];
    if (SCREEN_FILE.test(f.path) && !TOASTER.test(f.path)) {
      const hit = added.find((l) => TOAST_LINE.test(l) && !l.includes("toast-ok:"));
      if (hit) failures.push(`\`${f.path}\` adds a toast: "${hit.trim().slice(0, 100)}". A control changes real state, shows an honest empty state, is hidden or names its ticket inline; a toast is never done (CLAUDE.md "No button that only shows a message").`);
    }
    if (STYLED_FILE.test(f.path) && !HEX_EXEMPT.some((re) => re.test(f.path))) {
      const hit = added.find((l) => HEX_LITERAL.test(l) && !l.includes("hex-ok:"));
      if (hit) failures.push(`\`${f.path}\` adds a hex colour: "${hit.trim().slice(0, 100)}". Colours are semantic tokens; a new value goes in \`config/theme.css\` (CLAUDE.md "Styling").`);
    }
  }

  // Module work carries its build-state record.
  const moduleIds = facts.moduleIds ?? [];
  const changed = new Set(files.map((f) => f.path));
  const touched = new Set(files.map((f) => moduleOf(f.path, moduleIds)).filter(Boolean));
  for (const id of touched) {
    const records = [`docs/${id}-changelog.md`, `docs/${id}-module.md`, `docs/${id}-design.md`];
    if (!records.some((r) => changed.has(r))) {
      failures.push(`The PR changes \`${id}\` but not \`docs/${id}-changelog.md\` (or \`docs/${id}-module.md\`). The build-state record is updated in the same change as the code (CLAUDE.md "Conventions").`);
    }
  }

  // Logic that changed without a test.
  const logicChanged = files.filter((f) => f.status !== "D" && LOGIC_FILE.test(f.path) && !LOGIC_EXEMPT.test(f.path));
  const testsChanged = files.filter((f) => f.status !== "D" && isTestFile(f.path));
  if (logicChanged.length && !testsChanged.length) {
    failures.push(`Logic changed with no test added or updated: ${logicChanged.slice(0, 5).map((f) => `\`${f.path}\``).join(", ")}${logicChanged.length > 5 ? ` and ${logicChanged.length - 5} more` : ""}. Tests are colocated \`*.test.ts\` (CLAUDE.md "How Claude works here" 3).`);
  }

  // Tier 1 reasons.
  const owned = files.filter((f) => ownersOf(f.path, rules).length);
  if (owned.length) {
    tier1.push(`Changes files a lead owns (CODEOWNERS): ${owned.slice(0, 8).map((f) => `\`${f.path}\``).join(", ")}${owned.length > 8 ? ` and ${owned.length - 8} more` : ""}.`);
  }
  // A test removed anywhere, or a test edited outside the module whose code
  // the PR changes, is Tier 1. A module's own test edited beside its code is
  // module work; the AI review holds one that was weakened (an assertion
  // dropped, an expectation loosened, a case skipped) as Tier 1 by content.
  const removedTests = files.filter((f) => isTestFile(f.path) && f.status === "D");
  if (removedTests.length) {
    tier1.push(`Removes an existing test: ${removedTests.map((f) => `\`${f.path}\``).join(", ")}.`);
  }
  const foreignTests = files.filter((f) => isTestFile(f.path) && f.status === "M" && !moduleWorkOf(f.path, moduleIds));
  if (foreignTests.length) {
    tier1.push(`Changes an existing test outside module work (a change to a shared test is Tier 1): ${foreignTests.map((f) => `\`${f.path}\``).join(", ")}.`);
  }
  for (const f of files) {
    if (f.status === "D") continue;
    const added = f.addedLines ?? [];
    if (MODULE_SCHEMA.test(f.path)) {
      const hit = added.find((l) => WIDENED_AUTH.test(l));
      if (hit) tier1.push(`\`${f.path}\` widens who may reach a table: "${hit.trim().slice(0, 100)}". A public, guest or authenticated rule is a permissions change (CLAUDE.md "Tier 1 review").`);
    }
    if (MODULE_LAMBDA.test(f.path) && moduleOf(f.path, moduleIds)) {
      const hit = added.find((l) => OUTBOUND.test(l));
      if (hit) tier1.push(`\`${f.path}\` reaches outside the organization: "${hit.trim().slice(0, 100)}". Sends go through \`dispatch()\`; anything that leaves the organization is Tier 1 (CLAUDE.md "Tier 1 review").`);
    }
  }
  if (facts.labels?.includes("tier-1-by-review")) {
    tier1.push("The AI review classified this PR as Tier 1 by its content.");
  }

  // A lead's latest decisive review counts: an approval stands through later
  // comment-only reviews and falls to a later "changes requested" or a
  // dismissal. Reviews arrive in the order they were submitted.
  const leads = leadReviewers(rules);
  const latest = new Map();
  for (const r of facts.reviews ?? []) {
    const user = String(r.user).toLowerCase();
    if (!leads.includes(user)) continue;
    if (["APPROVED", "CHANGES_REQUESTED", "DISMISSED"].includes(r.state)) latest.set(user, { user: r.user, state: r.state });
  }
  const approvedBy = [...latest.values()].filter((r) => r.state === "APPROVED").map((r) => r.user);
  const needsLead = tier1.length > 0;
  const leadApproved = approvedBy.length > 0;

  return { failures, tier1, needsLead, leadApproved, approvedBy, leads, promotion };
}

/** The sticky comment the `tier-1 review` check leaves on the PR. */
export function tierComment(result) {
  const lines = ["<!-- pr-gates-tier1 -->"];
  if (!result.needsLead) {
    lines.push("**Tier 2.** Nothing here needs a person's sign-off; the PR merges on its own when every check is green and the AI review has no blocking finding.");
    return lines.join("\n");
  }
  lines.push("**Tier 1: a lead reviewer signs off before this merges.** Why:");
  for (const r of result.tier1) lines.push(`- ${r}`);
  lines.push("");
  lines.push(
    result.leadApproved
      ? `Approved by ${result.approvedBy.map((u) => `@${u}`).join(", ")}; the \`tier-1 review\` check is green.`
      : `The \`tier-1 review\` check stays red until ${result.leads.map((u) => `@${u}`).join(" or ")} approves. Nothing to do on your side but keep the other checks green; if a reason above is wrong, say so in a comment.`,
  );
  return lines.join("\n");
}
