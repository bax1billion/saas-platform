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
 * The seam registries: foundation files that hold one line, or one block,
 * per module and nothing of their own (CLAUDE.md "Layout": the module
 * registry in `vertical.ts`, the domain map, the export providers, the
 * Assist helpers, the audit log policy, and the composition test that lists
 * each module's functions). A module gains a table, a command, a provider
 * or a helper by adding its own line to one of these, and while CODEOWNERS
 * held these files by path that one line held the whole PR for the lead
 * (in the first week a fifth of the held PRs had no other owned path).
 * Such an addition is module work: see `additiveRegistryChange`. `config/modules.ts` is not
 * here, since a new product is a lineup decision, and nor is anything a
 * module could widen by adding a line (an auth rule, a grant); the keys of
 * a module's block in `vertical.ts` that widen are held by name
 * (`WIDENING_KEYS`).
 */
export const REGISTRY_FILES = [
  "amplify/data/vertical.ts",
  "amplify/data/vertical.test.ts",
  "amplify/data/domains/assignments.ts",
  "amplify/data/domains/registry.ts",
  "amplify/data/export-providers.ts",
  "amplify/data/assist-helpers.ts",
  "amplify/functions/event-logger/log-policy.ts",
];
/**
 * A line of only braces, brackets and commas, a whole-line `//` comment,
 * or an `import {` opener. A block comment is not here: without the file
 * around it the rule cannot tell a block comment opened above an `it(...)`
 * and closed below it from a comment, so an opening or closing block-comment
 * mark on any changed line keeps the hold and a `*` continuation line
 * counts as code.
 */
const STRUCTURAL_LINE = /^\s*[{}[\](),;]*\s*$|^\s*\/\/|^\s*(import|export)\s+(type\s+)?\{\s*$/;
const LINE_COMMENT = /^\s*\/\//;
const BLOCK_COMMENT = /\/\*|\*\//;
/**
 * The shapes a registration takes, and the only lines the rule lets change:
 * an import line or one specifier of a spread-out import and its closing
 * `} from '...'`, a list of items (names, strings, spreads), a key and its
 * value (a name, a string, a list of them, a `new Set([...])`, or the `{`
 * or `[` that opens a block), a member of a type union, and in the
 * composition test one `expect(...)` chain as the whole line. A statement (`const`, a call, an
 * assignment, `delete`, `if`) is never a registration, whatever it names:
 * `const kitReset = ... delete verticalModuleTables[k]` names Kit and
 * empties the entitlement table.
 */
const STR = `'(?:[^'\\\\]|\\\\.)*'|"(?:[^"\\\\]|\\\\.)*"`;
const NAME = `(?:\\.\\.\\.)?[\\w$]+(?:\\.[\\w$]+)*`;
const ITEM = `(?:${STR}|${NAME})`;
const ITEMS = `${ITEM}(?:\\s*,\\s*${ITEM})*\\s*,?`;
const LIST = `\\[\\s*(?:${ITEMS})?\\s*\\]`;
const VALUE = `(?:${ITEM}|\\{|\\[|${LIST}|new Set\\(\\s*${LIST}\\s*\\))`;
const REGISTRATION_SHAPES = [
  new RegExp(`^import\\s+(?:type\\s+)?\\{[^}]*\\}\\s+from\\s+(?:${STR});?$`),
  new RegExp(`^\\}\\s+from\\s+(?:${STR});?$`),
  new RegExp(`^${ITEMS}$`),
  new RegExp(`^(?:${NAME}|${STR})\\s*:\\s*${VALUE}\\s*,?$`),
  new RegExp(`^(?:[|&]\\s*)?(?:typeof\\s+)?${NAME}\\s*[;,|&]?$`),
];
/**
 * A computed key is how the provider and helper seams register
 * (`[kitFormExportProvider.recordType]: kitFormExportProvider`), and only
 * there, only as `[name.property]: name`. The rule cannot see what a name
 * holds, so a provider registered under another module's record type is
 * the AI review's to catch; a computed key anywhere else (the audit log
 * policy's table names) keeps the hold.
 */
const COMPUTED_KEY_SEAMS = ["amplify/data/export-providers.ts", "amplify/data/assist-helpers.ts"];
const COMPUTED_ENTRY = new RegExp(`^\\[[\\w$]+\\.[\\w$]+\\]\\s*:\\s*[\\w$]+\\s*,?$`);
/**
 * The keys of a module's block in `vertical.ts` whose value reaches past
 * the module's own tables: `sharedModuleTables` lets other modules write
 * a table, `recordAccess` decides who reads a record, `foundationModels`
 * and `foundationFunctions` add operations to the foundation API, and
 * `apiSteps` runs code against the whole API. Their values live in the
 * module's own schema file, which is module work, and nothing checks whose
 * table a shared entry names (the entitlement step lets the shared entry
 * win), so a module adding `sharedModuleTables: kitSharedTables,` could
 * open another module's regulated table to its own licensees. A changed
 * line with one of these keys keeps the hold, however well it is formed:
 * bare or quoted
 * (`"apiSteps": kitApiSteps,` is the same key), and in these files a
 * spread line (`...kitBlockExtras,`) holds too, since the object it spreads
 * is module code that can carry any key. `vertical.test.ts` also fails a
 * gated, shared,
 * streamed or record-access table that is not one of the declaring
 * module's own models.
 */
const WIDENING_KEYS = {
  "amplify/data/vertical.ts": ["sharedModuleTables", "recordAccess", "foundationModels", "foundationFunctions", "apiSteps"],
};
const KEY_OF = /^(?:([\w$]+)|"([\w$]+)"|'([\w$]+)')\s*:/;
const keyOf = (line) => {
  const m = line.trim().match(KEY_OF);
  return m ? (m[1] ?? m[2] ?? m[3]) : undefined;
};
const ASSERTION_START = /^(await\s+)?expect\(/;
/**
 * One `expect(...)` chain and nothing else on the line, and nothing that
 * runs inside its parentheses: with strings masked and every bracket pair
 * folded to one mark from the inside out, each pair may hold only names,
 * strings, member paths and folded pairs (a list, an object of them), and
 * what is left must be `expect` and a chain of `.name(...)`.
 * `expect(x).toBe(1); return;`, `expect(x), hack();` and
 * `expect(vi.spyOn(v, "x").mockReturnValue(kitX))` all fail that. The composition
 * test's `.sort((a, b) => ...)` fails it too and is held.
 */
const FOLDED_ITEM = `(?:${STR}|${NAME}|@)`;
const FOLDED_ITEMS = `(?:${FOLDED_ITEM}(?:\\s*,\\s*${FOLDED_ITEM})*\\s*,?)?`;
const FOLDED_ENTRY = `(?:${NAME}|${STR}|\\[${NAME}\\])\\s*:\\s*${FOLDED_ITEM}`;
const FOLDED_ENTRIES = `(?:${FOLDED_ENTRY}(?:\\s*,\\s*${FOLDED_ENTRY})*\\s*,?)?`;
const PLAIN_PAIR = new RegExp(`^\\s*(?:${FOLDED_ITEMS}|${FOLDED_ENTRIES})\\s*$`);
function oneAssertion(text) {
  let folded = text.replace(new RegExp(STR, "g"), '""');
  for (;;) {
    const pair = folded.match(/\(([^()[\]{}]*)\)|\[([^()[\]{}]*)\]|\{([^()[\]{}]*)\}/);
    if (!pair) break;
    if (!PLAIN_PAIR.test(pair[1] ?? pair[2] ?? pair[3])) return false;
    folded = folded.slice(0, pair.index) + "@" + folded.slice(pair.index + pair[0].length);
  }
  return /^(await\s+)?expect@(\.[\w$]+@?)*;?$/.test(folded);
}
export function registrationShape(line, path) {
  const text = line.replace(/\/\/.*$/, "").trim();
  if (REGISTRATION_SHAPES.some((re) => re.test(text))) return true;
  if (COMPUTED_KEY_SEAMS.includes(path) && COMPUTED_ENTRY.test(text)) return true;
  return isTestFile(path) && ASSERTION_START.test(text) && oneAssertion(text);
}
/** One token: a string literal, a word (an identifier, a number) or one other character. */
const TOKEN = /"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|`(?:[^`\\]|\\.)*`|[A-Za-z0-9_$]+|\S/g;
/**
 * What a list grows by beside the new name: `, kit`, `: [`, `...kit`. A
 * `&` or `|` is growth only in a type (`& typeof kit`), never `&& kitGate`.
 */
const GROWTH_TOKENS = new Set([",", ":", ".", "[", "]", "{", "}", "(", ")", "typeof"]);
const CLOSER = { "[": "]", "{": "}", "(": ")" };

/** The tokens of a line, the `//` comment at its end left out. */
export function tokensOf(line) {
  const all = line.match(TOKEN) ?? [];
  const end = all.findIndex((t, i) => t === "/" && all[i + 1] === "/");
  return end < 0 ? all : all.slice(0, end);
}

/**
 * The words of a token: `publishKitForm` is publish, kit, form;
 * `SHIFT_PAYROLL_EXPORT` is shift, payroll, export; `kit214ExportProvider`
 * is kit, 214, export, provider; `'./modules/kit'` is modules, kit. A
 * module is named by a token when one of its words is the module's id.
 */
export function wordsOf(token) {
  return token
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/([A-Z]+)([A-Z][a-z])/g, "$1 $2")
    .replace(/([A-Za-z])([0-9])/g, "$1 $2")
    .replace(/([0-9])([A-Za-z])/g, "$1 $2")
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
}

/**
 * True when a registry file changed only the way a module registers
 * itself. Every changed line is a registration shape (`registrationShape`:
 * an import line or specifier, a list of items, a key and its value, a
 * type member, an `expect` line in the composition test) or structural
 * (braces, brackets, a whole-line `//` comment, an `import {` opener);
 * a statement of any kind keeps the hold. Every line is read as tokens (a
 * string, a word, one other character), the `//` comment at its end left
 * out. The file only gains: every removed line comes back as one added
 * line, or a run of them, that kept every token in order and grew only by
 * runs of tokens that name a module whose code the PR changes, plus the
 * commas, colons, brackets and dots a list grows by and the `& typeof` a
 * type union grows by (an import list or a sorted list of names growing by
 * one, a union continued onto a second line, a one-line import spread over
 * four), never inside a call's parentheses; a removed line of only
 * brackets keeps the hold. Every other
 * added line names such a module in one of its words and names no other
 * module. A module is named by a word of an identifier or a string, never
 * by a substring and never in a comment: `publishKitForm` and
 * `'KitFieldNote'` are Kit's, `already` is not Ready's, `return` is not
 * Run's, and a trailing `// kit` names nothing. A deletion, a renamed
 * word, a changed operator, a line commented out, a line naming another
 * module, a block-comment mark on any changed line and a PR that changes
 * nothing but a registry all keep the hold. (Each of these closes a way a
 * reviewer found around the first version, which read words and
 * substrings.)
 */
export function additiveRegistryChange(file, touched, moduleIds = touched) {
  if (!REGISTRY_FILES.includes(file.path) || file.status !== "M" || !touched.length) return false;
  const blank = (l) => l.trim() === "";
  const added = (file.addedLines ?? []).filter((l) => !blank(l));
  const removed = (file.removedLines ?? []).filter((l) => !blank(l) && !LINE_COMMENT.test(l));
  if (!added.length || [...added, ...removed].some((l) => BLOCK_COMMENT.test(l))) return false;
  if (![...added, ...removed].every((l) => STRUCTURAL_LINE.test(l) || registrationShape(l, file.path))) return false;
  const widening = WIDENING_KEYS[file.path];
  if (widening && [...added, ...removed].some((l) => widening.includes(keyOf(l)) || /\.\.\./.test(l))) return false;
  const own = (t) => wordsOf(t).some((w) => touched.includes(w));
  const foreign = (t) => wordsOf(t).some((w) => moduleIds.includes(w) && !touched.includes(w));
  // A run of extra tokens names the module, names no other, and is
  // otherwise list punctuation with every bracket it opens closed.
  const ownSegment = (tokens) => {
    const open = [];
    let named = false;
    for (const [k, t] of tokens.entries()) {
      if (foreign(t)) return false;
      if (own(t)) named = true;
      else if ((t === "&" || t === "|") && tokens[k + 1] === "typeof") continue;
      else if (!GROWTH_TOKENS.has(t)) return false;
      else if (CLOSER[t]) open.push(CLOSER[t]);
      else if (Object.values(CLOSER).includes(t) && open.pop() !== t) return false;
    }
    return named && open.length === 0;
  };
  // `from` survives in `into` as an ordered subsequence; what is left over
  // falls into runs, each of them the module's own.
  // A run of growth sits at the top of the line or inside a list or an
  // object literal, never inside a call's parentheses: `.toHaveProperty("X")`
  // to `.toHaveProperty("X", kit)` would change what the matcher checks.
  const grew = (from, into) => {
    if (into.length <= from.length) return false;
    const segments = [];
    const stack = [];
    let segment = null;
    let i = 0;
    for (const t of into) {
      if (i < from.length && from[i] === t) {
        i += 1;
        segment = null;
      } else {
        if (!segment) {
          if (stack[stack.length - 1] === "(") return false;
          segments.push((segment = []));
        }
        segment.push(t);
      }
      if (CLOSER[t]) stack.push(t);
      else if (Object.values(CLOSER).includes(t)) stack.pop();
    }
    return i === from.length && segments.every(ownSegment);
  };
  const addedTokens = added.map(tokensOf);
  const used = new Set();
  for (const r of removed) {
    // A removed line of brackets keeps the hold: a module registering
    // itself never moves another block's brackets, and a removed `},`
    // paired with an added one anywhere let a block be split around it.
    if (STRUCTURAL_LINE.test(r)) return false;
    const from = tokensOf(r);
    let into = null;
    for (let size = 1; size <= 8 && !into; size++) {
      for (let start = 0; start + size <= added.length && !into; start++) {
        const window = Array.from({ length: size }, (_, k) => start + k);
        if (window.some((k) => used.has(k))) continue;
        if (grew(from, window.flatMap((k) => addedTokens[k]))) into = window;
      }
    }
    if (!into) return false;
    for (const k of into) used.add(k);
  }
  // The added lines that are not a grown line balance their brackets in
  // order, as a block of the module's own: a `},` that closes another
  // module's block before `kit: {` opens does not.
  const open = [];
  for (const t of added.flatMap((a, k) => (used.has(k) ? [] : addedTokens[k]))) {
    if (CLOSER[t]) open.push(CLOSER[t]);
    else if (Object.values(CLOSER).includes(t) && open.pop() !== t) return false;
  }
  if (open.length) return false;
  return added.every((a, k) => used.has(k) || STRUCTURAL_LINE.test(a) || (addedTokens[k].some(own) && !addedTokens[k].some(foreign)));
}

/**
 * The facts of a PR:
 *   { baseRef, headRef, title, author, isDraft,
 *     integrationBranch, releaseBranch (null when there is none),
 *     commits: [{ sha, subject, addedLines: [string] }],
 *     files: [{ path, status: 'A'|'M'|'D'|'R', addedLines: [string], removedLines: [string] }],
 *     reviews: [{ user, state }], codeowners: string, moduleIds: [string] }
 * `status` is git's one letter. `addedLines` are the `+` lines of the diff
 * against the base, without the `+`; `removedLines` the `-` lines, read
 * only by the registry rule.
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

  // Tier 1 reasons. A registry file that only gained a touched module's own
  // lines is module work, whatever CODEOWNERS says of the path.
  const registryReleased = files.filter((f) => additiveRegistryChange(f, [...touched], moduleIds)).map((f) => f.path);
  const owned = files.filter((f) => !registryReleased.includes(f.path) && ownersOf(f.path, rules).length);
  if (owned.length) {
    tier1.push(`Changes files a lead owns (CODEOWNERS): ${owned.slice(0, 8).map((f) => `\`${f.path}\``).join(", ")}${owned.length > 8 ? ` and ${owned.length - 8} more` : ""}.`);
  }
  // A registry CODEOWNERS leaves to this check is held here
  // for every edit that is not the module's own line.
  const registryHeld = files.filter((f) => REGISTRY_FILES.includes(f.path) && !registryReleased.includes(f.path) && !ownersOf(f.path, rules).length);
  if (registryHeld.length) {
    tier1.push(`Changes a seam registry beyond adding this PR's own module lines (a deletion, a renamed word, another module's line, a block comment): ${registryHeld.map((f) => `\`${f.path}\``).join(", ")} (docs/pull-request-gates.md § 2, "Registry lines").`);
  }
  // A test removed anywhere, or a test edited outside the module whose code
  // the PR changes, is Tier 1. A module's own test edited beside its code is
  // module work; the AI review holds one that was weakened (an assertion
  // dropped, an expectation loosened, a case skipped) as Tier 1 by content.
  const removedTests = files.filter((f) => isTestFile(f.path) && f.status === "D");
  if (removedTests.length) {
    tier1.push(`Removes an existing test: ${removedTests.map((f) => `\`${f.path}\``).join(", ")}.`);
  }
  const foreignTests = files.filter((f) => isTestFile(f.path) && f.status === "M" && !moduleWorkOf(f.path, moduleIds) && !registryReleased.includes(f.path));
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

  return { failures, tier1, needsLead, leadApproved, approvedBy, leads, promotion, registryReleased };
}

/** The sticky comment the `tier-1 review` check leaves on the PR. */
export function tierComment(result) {
  const lines = ["<!-- pr-gates-tier1 -->"];
  const released = result.registryReleased?.length
    ? `Module work, not a hold: ${result.registryReleased.map((p) => `\`${p}\``).join(", ")} only gained this PR's own module lines (docs/pull-request-gates.md § 2).`
    : null;
  if (!result.needsLead) {
    lines.push("**Tier 2.** Nothing here needs a person's sign-off; the PR merges on its own when every check is green and the AI review has no blocking finding.");
    if (released) lines.push("", released);
    return lines.join("\n");
  }
  lines.push("**Tier 1: a lead reviewer signs off before this merges.** Why:");
  for (const r of result.tier1) lines.push(`- ${r}`);
  if (released) lines.push("", released);
  lines.push("");
  lines.push(
    result.leadApproved
      ? `Approved by ${result.approvedBy.map((u) => `@${u}`).join(", ")}; the \`tier-1 review\` check is green.`
      : `The \`tier-1 review\` check stays red until ${result.leads.map((u) => `@${u}`).join(" or ")} approves. Nothing to do on your side but keep the other checks green; if a reason above is wrong, say so in a comment.`,
  );
  return lines.join("\n");
}
