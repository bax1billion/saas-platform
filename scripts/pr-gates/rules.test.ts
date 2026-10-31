import { describe, expect, it } from "vitest";
import {
  REGISTRY_FILES,
  SUBJECT_PATTERN,
  additiveRegistryChange,
  codeownersRegex,
  evaluate,
  leadReviewers,
  moduleOf,
  moduleWorkOf,
  ownersOf,
  parseCodeowners,
  tierComment,
} from "./rules.mjs";

const CODEOWNERS = `
# comment
/.github/            @lead
/amplify/            @lead
/amplify/data/modules/
/amplify/data/modules/run.ts @lead
/lib/                @lead
/CLAUDE.md           @lead
/app/(app)/layout.tsx @lead
/docs/data-coupling.md @lead @second
`;

const base = {
  baseRef: "staging",
  integrationBranch: "staging",
  releaseBranch: "main" as string | null,
  headRef: "ba-1234-kit-forms",
  title: "[1234] Kit forms",
  author: "dev",
  isDraft: false,
  labels: [] as string[],
  commits: [{ sha: "a".repeat(40), subject: "kit: add the 214 form [1234]", addedLines: [] as string[] }],
  files: [
    { path: "modules/kit/lib/forms.ts", status: "M", addedLines: ["export const x = 1;"] },
    { path: "modules/kit/lib/forms.test.ts", status: "A", addedLines: ["it('x')"] },
    { path: "docs/kit-changelog.md", status: "M", addedLines: ["- forms"] },
  ],
  reviews: [] as { user: string; state: string }[],
  codeowners: CODEOWNERS,
  moduleIds: ["kit", "run", "shift"],
  productWords: /acme|widgetco/i,
};

describe("subject pattern", () => {
  it("accepts the repo's commit subjects and refuses the rest", () => {
    for (const ok of ["foundation: declare the sending identities [1808]", "run, atlas: move onto the Respond data domain", "chore(deps): bump next from 16.1.6 to 16.4.3", "fix: pin @aws-sdk/types"]) {
      expect(SUBJECT_PATTERN.test(ok), ok).toBe(true);
    }
    for (const bad of ["Add forms", "WIP", "kit:no space", "Kit: capitalised area"]) {
      expect(SUBJECT_PATTERN.test(bad), bad).toBe(false);
    }
  });
});

describe("CODEOWNERS", () => {
  it("parses patterns and owners, skipping comments", () => {
    const rules = parseCodeowners(CODEOWNERS);
    expect(rules.map((r) => r.pattern)).toEqual(["/.github/", "/amplify/", "/amplify/data/modules/", "/amplify/data/modules/run.ts", "/lib/", "/CLAUDE.md", "/app/(app)/layout.tsx", "/docs/data-coupling.md"]);
    expect(rules[2].owners).toEqual([]);
    expect(rules[7].owners).toEqual(["@lead", "@second"]);
    expect(leadReviewers(rules)).toEqual(["lead", "second"]);
  });

  it("matches like gitignore: anchored directories, files, any-depth globs", () => {
    expect(codeownersRegex("/lib/").test("lib/json.ts")).toBe(true);
    expect(codeownersRegex("/lib/").test("modules/kit/lib/x.ts")).toBe(false);
    expect(codeownersRegex("/CLAUDE.md").test("CLAUDE.md")).toBe(true);
    expect(codeownersRegex("/CLAUDE.md").test("docs/CLAUDE.md")).toBe(false);
    expect(codeownersRegex("*.test.ts").test("modules/kit/lib/forms.test.ts")).toBe(true);
    expect(codeownersRegex("/app/(app)/layout.tsx").test("app/(app)/layout.tsx")).toBe(true);
    expect(codeownersRegex("/app/(app)/layout.tsx").test("app/(app)/kit/layout.tsx")).toBe(false);
    expect(codeownersRegex("/modules/run/").test("modules/run/components/X.tsx")).toBe(true);
    expect(codeownersRegex("/app/**/layout.tsx").test("app/(app)/kit/layout.tsx")).toBe(true);
    expect(codeownersRegex("docs/*.md").test("docs/shell.md")).toBe(true);
    expect(codeownersRegex("docs/*.md").test("docs/playbooks/x.md")).toBe(false);
  });

  it("the last matching pattern wins", () => {
    const rules = parseCodeowners("/docs/ @lead\n/docs/kit-changelog.md\n");
    expect(ownersOf("docs/shell.md", rules)).toEqual(["@lead"]);
    expect(ownersOf("docs/kit-changelog.md", rules)).toEqual([]);
    expect(ownersOf("modules/kit/lib/x.ts", rules)).toEqual([]);
  });
});

describe("moduleOf", () => {
  it("finds the module in each of its homes and ignores the Spine", () => {
    const ids = ["kit", "shift"];
    expect(moduleOf("modules/kit/lib/forms.ts", ids)).toBe("kit");
    expect(moduleOf("app/(app)/shift/roster/page.tsx", ids)).toBe("shift");
    expect(moduleOf("amplify/data/modules/kit.ts", ids)).toBe("kit");
    expect(moduleOf("amplify/functions/shift-roster-command/handler.ts", ids)).toBe("shift");
    expect(moduleOf("app/(app)/dashboard/page.tsx", ids)).toBeNull();
    expect(moduleOf("lib/services/kit/index.ts", ids)).toBeNull();
  });

  it("moduleWorkOf adds the published contract under lib/services", () => {
    const ids = ["kit", "shift"];
    expect(moduleWorkOf("lib/services/kit/index.ts", ids)).toBe("kit");
    expect(moduleWorkOf("modules/shift/lib/store.test.ts", ids)).toBe("shift");
    expect(moduleWorkOf("lib/services/other/index.ts", ids)).toBeNull();
    expect(moduleWorkOf("lib/charts/grid.test.ts", ids)).toBeNull();
  });
});

describe("evaluate: a clean module PR", () => {
  it("passes every convention and is Tier 2", () => {
    const r = evaluate(base);
    expect(r.failures).toEqual([]);
    expect(r.tier1).toEqual([]);
    expect(r.needsLead).toBe(false);
    expect(tierComment(r)).toContain("Tier 2");
  });
});

describe("evaluate: conventions", () => {
  it("fails a PR that does not target staging, except the promotion", () => {
    expect(evaluate({ ...base, baseRef: "main" }).failures.join()).toMatch(/target `staging`/);
    const promo = evaluate({ ...base, baseRef: "main", headRef: "staging", title: "Staging to Main", commits: [] });
    expect(promo.failures).toEqual([]);
    expect(promo.promotion).toBe(true);
  });

  it("a repository with one branch: every PR targets it, nothing is a promotion", () => {
    const one = { ...base, integrationBranch: "main", releaseBranch: null, baseRef: "main" };
    expect(evaluate(one).failures).toEqual([]);
    expect(evaluate({ ...one, baseRef: "staging" }).failures.join()).toMatch(/target `main`/);
    expect(evaluate({ ...one, baseRef: "main", headRef: "staging" }).promotion).toBe(false);
  });

  it("fails a stacked PR (base is another feature branch)", () => {
    expect(evaluate({ ...base, baseRef: "ba-acad-4-ui-browser-checks" }).failures.join()).toMatch(/target `staging`/);
  });

  it("does not gate a branch name or a PR title (the lead, Oct 28, 2026)", () => {
    expect(evaluate({ ...base, headRef: "shift-phase-4e" }).failures).toEqual([]);
    expect(evaluate({ ...base, headRef: "Feature/Thing", title: "Kit forms" }).failures).toEqual([]);
    expect(evaluate({ ...base, title: "[9999] Kit forms" }).failures).toEqual([]);
  });

  it("fails a commit subject off the pattern and a foundation commit with a product word", () => {
    const r = evaluate({
      ...base,
      commits: [
        { sha: "b".repeat(40), subject: "Add forms", addedLines: [] },
        { sha: "c".repeat(40), subject: "foundation: a seam", addedLines: ["const name = 'Acme Fire';"] },
        { sha: "d".repeat(40), subject: "Merge remote-tracking branch 'origin/staging' into x", addedLines: [] },
      ],
    });
    expect(r.failures.filter((f) => /not `<area>:/.test(f))).toHaveLength(1);
    expect(r.failures.filter((f) => /product word/.test(f))).toHaveLength(1);
  });

  it("fails a committed outputs or env file but not the example", () => {
    const r = evaluate({ ...base, files: [...base.files, { path: "amplify_outputs.json", status: "A", addedLines: [] }, { path: ".env.local", status: "A", addedLines: [] }, { path: ".env.sandbox.example", status: "M", addedLines: [] }] });
    expect(r.failures.filter((f) => /must not be committed/.test(f))).toHaveLength(2);
  });

  it("fails a new toast or sonner import in a screen, not in the Toaster, not with toast-ok", () => {
    const screen = (line: string, path = "modules/kit/components/Form.tsx") => evaluate({ ...base, files: [...base.files, { path, status: "M", addedLines: [line] }] }).failures.filter((f) => /adds a toast/.test(f));
    expect(screen('import { toast } from "sonner";')).toHaveLength(1);
    expect(screen("toast.success('Saved')")).toHaveLength(1);
    expect(screen("toast('Saved') // toast-ok: the Toaster test")).toHaveLength(0);
    expect(screen('import { Toaster } from "sonner";', "components/ui/sonner.tsx")).toHaveLength(0);
    expect(screen("const toaster = makeToaster();")).toHaveLength(0);
  });

  it("fails a new hex colour outside the theme and the symbol catalogues", () => {
    const styled = (line: string, path = "modules/kit/components/Form.tsx") => evaluate({ ...base, files: [...base.files, { path, status: "M", addedLines: [line] }] }).failures.filter((f) => /hex colour/.test(f));
    expect(styled('<div style={{ color: "#c0392b" }} />')).toHaveLength(1);
    expect(styled("background: #fff;", "modules/kit/components/kit.css")).toHaveLength(1);
    expect(styled("--module-kit: #c0392b;", "config/theme.css")).toHaveLength(0);
    expect(styled('fill: "#ff0000", // hex-ok: NFPA 704 red', "lib/map/layers.ts")).toHaveLength(0);
    expect(styled("color: '#1a2b3c'", "lib/services/atlas/symbols.ts")).toHaveLength(0);
    expect(styled('href="#faq"')).toHaveLength(0);
    expect(styled("ticket #1808 and &#8217;")).toHaveLength(0);
  });

  it("fails module work without its changelog or spec", () => {
    const r = evaluate({ ...base, files: base.files.filter((f) => !f.path.startsWith("docs/")) });
    expect(r.failures.join()).toMatch(/docs\/kit-changelog\.md/);
    const design = evaluate({ ...base, files: [...base.files.filter((f) => !f.path.startsWith("docs/")), { path: "docs/kit-design.md", status: "M", addedLines: [] }] });
    expect(design.failures).toEqual([]);
  });

  it("fails logic changed without any test change, and allows type-only and schema files", () => {
    const noTest = evaluate({ ...base, files: base.files.filter((f) => !f.path.endsWith(".test.ts")) });
    expect(noTest.failures.join()).toMatch(/no test added or updated/);
    const types = evaluate({ ...base, files: [{ path: "modules/kit/lib/types.ts", status: "M", addedLines: [] }, { path: "docs/kit-changelog.md", status: "M", addedLines: [] }] });
    expect(types.failures).toEqual([]);
    const schema = evaluate({ ...base, files: [{ path: "amplify/data/modules/kit.ts", status: "M", addedLines: [] }, { path: "docs/kit-changelog.md", status: "M", addedLines: [] }] });
    expect(schema.failures).toEqual([]);
    const step = evaluate({ ...base, files: [{ path: "amplify/data/entitlements/check.js", status: "M", addedLines: [] }] });
    expect(step.failures.join()).toMatch(/no test added or updated/);
  });
});

describe("evaluate: Tier 1", () => {
  it("an owned path holds the PR for a lead; a line with no owner releases a module's path under one", () => {
    const owned = evaluate({ ...base, files: [...base.files, { path: "lib/json.ts", status: "M", addedLines: [] }] });
    expect(owned.needsLead).toBe(true);
    expect(owned.tier1.join()).toMatch(/CODEOWNERS.*`lib\/json\.ts`/);
    expect(owned.leadApproved).toBe(false);
    expect(tierComment(owned)).toMatch(/stays red until @lead or @second approves/);

    const schema = (path: string, addedLines: string[] = []) => evaluate({ ...base, files: [...base.files, { path, status: "M", addedLines }] });
    expect(schema("amplify/data/modules/kit.ts").needsLead).toBe(false);
    expect(schema("amplify/data/modules/run.ts").tier1.join()).toMatch(/CODEOWNERS/);
    expect(schema("amplify/data/resource.ts").tier1.join()).toMatch(/CODEOWNERS/);
  });

  it("a test removed, or a shared test edited, is Tier 1; a module's own test edited beside its code is not", () => {
    const withFile = (path: string, status: string) => evaluate({ ...base, files: [...base.files, { path, status, addedLines: [] }] });
    expect(withFile("modules/kit/lib/old.test.ts", "M").tier1).toEqual([]);
    expect(withFile("modules/kit/lib/old.test.ts", "D").tier1.join()).toMatch(/Removes an existing test/);
    // lib/ is owned in the fixture, so take the owner off to see the test rule alone.
    const free = { ...base, codeowners: "/.github/ @lead" };
    expect(evaluate({ ...free, files: [...base.files, { path: "lib/services/kit/index.test.ts", status: "M", addedLines: [] }] }).tier1).toEqual([]);
    expect(evaluate({ ...free, files: [...base.files, { path: "lib/charts/grid.test.ts", status: "M", addedLines: [] }] }).tier1.join()).toMatch(/shared test/);
    expect(evaluate({ ...free, files: [...base.files, { path: "lib/charts/grid.test.ts", status: "A", addedLines: [] }] }).tier1).toEqual([]);
  });

  it("a module schema that widens access, or a module Lambda that reaches outside, is Tier 1 by content", () => {
    const widened = evaluate({ ...base, files: [...base.files, { path: "amplify/data/modules/kit.ts", status: "M", addedLines: ["    .authorization((allow) => [allow.publicApiKey()])"] }] });
    expect(widened.tier1.join()).toMatch(/widens who may reach a table/);
    const standard = evaluate({ ...base, files: [...base.files, { path: "amplify/data/modules/kit.ts", status: "M", addedLines: ["    .authorization((allow) => [allow.groups(['Admin', 'Member']).to(['read'])])"] }] });
    expect(standard.tier1).toEqual([]);
    const free = { ...base, codeowners: "/.github/ @lead" };
    const outbound = evaluate({ ...free, files: [...base.files, { path: "amplify/functions/kit-shared/send.ts", status: "M", addedLines: ['import { SESv2Client } from "@aws-sdk/client-sesv2";'] }] });
    expect(outbound.tier1.join()).toMatch(/reaches outside the organization/);
    const viaDispatch = evaluate({ ...free, files: [...base.files, { path: "amplify/functions/kit-shared/send.ts", status: "M", addedLines: ["await dispatch(message);"] }] });
    expect(viaDispatch.tier1).toEqual([]);
    const foundation = evaluate({ ...free, files: [...base.files, { path: "amplify/functions/create-asset/handler.ts", status: "M", addedLines: ["await fetch(url);"] }] });
    expect(foundation.tier1).toEqual([]);
  });

  it("a lead's approval releases it; a non-lead's does not", () => {
    const files = [...base.files, { path: "lib/json.ts", status: "M", addedLines: [] }];
    expect(evaluate({ ...base, files, reviews: [{ user: "dev2", state: "APPROVED" }] }).leadApproved).toBe(false);
    expect(evaluate({ ...base, files, reviews: [{ user: "Lead", state: "APPROVED" }] }).leadApproved).toBe(true);
    expect(evaluate({ ...base, files, reviews: [{ user: "lead", state: "DISMISSED" }] }).leadApproved).toBe(false);
    // The latest decisive review wins; a comment in between does not withdraw an approval.
    expect(evaluate({ ...base, files, reviews: [{ user: "lead", state: "APPROVED" }, { user: "lead", state: "CHANGES_REQUESTED" }] }).leadApproved).toBe(false);
    expect(evaluate({ ...base, files, reviews: [{ user: "lead", state: "APPROVED" }, { user: "lead", state: "COMMENTED" }] }).leadApproved).toBe(true);
    expect(evaluate({ ...base, files, reviews: [{ user: "lead", state: "CHANGES_REQUESTED" }, { user: "lead", state: "APPROVED" }] }).leadApproved).toBe(true);
    const ok = evaluate({ ...base, files, reviews: [{ user: "lead", state: "APPROVED" }] });
    expect(tierComment(ok)).toMatch(/Approved by @lead/);
  });

  it("the AI review's label is a Tier 1 reason", () => {
    expect(evaluate({ ...base, labels: ["tier-1-by-review"] }).needsLead).toBe(true);
  });
});

describe("evaluate: a module's own line in a seam registry is module work", () => {
  const registry = (path: string, addedLines: string[], removedLines: string[] = [], files = base.files, extra: Partial<typeof base> = {}) =>
    evaluate({ ...base, ...extra, files: [...files, { path, status: "M", addedLines, removedLines }] });
  const held = (r: ReturnType<typeof evaluate>) => expect(r.tier1.join()).toMatch(/CODEOWNERS|seam registry|shared test/);

  it("names the seam registries and nothing a module could widen", () => {
    expect(REGISTRY_FILES).toContain("amplify/data/export-providers.ts");
    expect(REGISTRY_FILES).not.toContain("config/modules.ts");
    expect(REGISTRY_FILES).not.toContain("amplify/data/resource.ts");
  });

  it("releases a provider, a helper and a domain line added for the module the PR changes", () => {
    const provider = registry("amplify/data/export-providers.ts", ["import { kit214ExportProvider } from '../functions/kit-shared/export';", "  [kit214ExportProvider.recordType]: kit214ExportProvider,"]);
    expect(provider.tier1).toEqual([]);
    expect(provider.registryReleased).toEqual(["amplify/data/export-providers.ts"]);
    expect(tierComment(provider)).toMatch(/Module work, not a hold: `amplify\/data\/export-providers\.ts`/);
    expect(registry("amplify/data/assist-helpers.ts", ["  [kitFormFillHelper.id]: kitFormFillHelper,"]).tier1).toEqual([]);
    expect(registry("amplify/data/domains/assignments.ts", ["  kit: 'prepare',"]).tier1).toEqual([]);
    expect(registry("amplify/functions/event-logger/log-policy.ts", ["  KitAgencySettings: 'KIT_SETTINGS',", "  'KitFieldNote',"]).tier1).toEqual([]);
  });

  it("releases an import or a sorted list that grows by the module's own names, braces and `//` comments included", () => {
    const grown = registry(
      "amplify/data/vertical.ts",
      ["import { kitModels, kitCommandMutations } from './modules/kit';", "import {", "  kitFunctions,", "} from './modules/kit';", "  kit: {", "    // Kit's commands", "    moduleMutations: kitCommandMutations,", "  },"],
      ["import { kitModels } from './modules/kit';"],
    );
    expect(grown.tier1).toEqual([]);
    const list = registry("amplify/data/vertical.test.ts", ['      "alertCommand", "kitCommand", "readyCommand",'], ['      "alertCommand", "readyCommand",']);
    expect(list.tier1).toEqual([]);
    // The module's name as a word of a longer one, a union continued onto a
    // new line, a one-line import spread over four, a spread: all still the
    // module's own addition.
    const embedded = registry("amplify/data/vertical.test.ts", ['    expect(v.prepare.moduleMutations).toMatchObject({ ready: ["decideReadyLedgerRow"], kit: ["publishKitForm"] });'], ['    expect(v.prepare.moduleMutations).toMatchObject({ ready: ["decideReadyLedgerRow"] });']);
    expect(embedded.tier1).toEqual([]);
    const union = registry("amplify/data/vertical.ts", ["  typeof vitalsFoundationFunctions &", "  typeof kitFunctions;"], ["  typeof vitalsFoundationFunctions;"]);
    expect(union.tier1).toEqual([]);
    const reflow = registry("amplify/data/domains/registry.ts", ["import {", "  shiftModels,", "  kitModels,", "} from '../modules/shift';"], ["import { shiftModels } from '../modules/shift';"]);
    expect(reflow.tier1).toEqual([]);
    // A spread grows a list in the composition test; in vertical.ts itself a spread line is held (below).
    const spread = registry("amplify/data/vertical.test.ts", ["  ...shiftModels, ...kitModels,", "  kitModuleTables,"], ["  ...shiftModels,"]);
    expect(spread.tier1).toEqual([]);
    const setGrown = registry("amplify/functions/event-logger/log-policy.ts", ["  KitMember: new Set(['notifyPhoneE164', 'kitPin']),"], ["  KitMember: new Set(['notifyPhoneE164']),"]);
    expect(setGrown.tier1).toEqual([]);
  });

  it("keeps the hold for a deletion, a renamed token, another module's line, or a PR that changes no module", () => {
    held(registry("amplify/data/export-providers.ts", ["  [kitFormExportProvider.recordType]: kitFormExportProvider,"], ["  [stationReportExportProvider.recordType]: stationReportExportProvider,"]));
    held(registry("amplify/data/vertical.ts", ["import { kitModels, kitCommands } from './modules/kit';"], ["import { kitModels, kitMutations } from './modules/kit';"]));
    held(registry("amplify/data/domains/assignments.ts", ["  kit: 'people',"], ["  kit: 'prepare',"]));
    held(registry("amplify/data/domains/assignments.ts", ["  shift: 'people',"]));
    held(registry("amplify/data/export-providers.ts", ["  [kitFormExportProvider.recordType]: kitFormExportProvider,"], [], [{ path: "docs/kit-changelog.md", status: "M", addedLines: [] }]));
    held(registry("amplify/data/vertical.test.ts", ['      "kitCommand",'], ['      "alertCommand", "readyCommand",']));
    // A removed bracket line, wherever it comes back: a module never moves another block's brackets.
    held(registry("amplify/data/vertical.ts", ["  kitModuleTables,"], ["  ],"]));
    held(registry("amplify/data/vertical.ts", ["  ],", "  kitModuleTables,"], ["  ],"]));
    expect(additiveRegistryChange({ path: "config/modules.ts", status: "M", addedLines: ["  kitModule,"], removedLines: [] }, ["kit"])).toBe(false);
  });

  it("keeps the hold for what only looks additive: a block comment, a changed operator, a line commented out, a name by substring, a trailing comment, another module's word", () => {
    // `/* kit` above an existing test and `*/` below it would disable it.
    held(registry("amplify/data/vertical.test.ts", ["/* kit", "*/"]));
    held(registry("amplify/data/vertical.test.ts", ["/* */ kitHack();"]));
    // `&&` to `||` keeps every word; a line commented out keeps every word.
    held(registry("amplify/data/vertical.ts", ["  kit: 'prepare',", "  const ok = a || contribution(id).kitReady;"], ["  const ok = a && contribution(id).kitReady;"]));
    held(registry("amplify/data/vertical.test.ts", ["  'KitFieldNote',", '  // expect(v.verticalModels).toHaveProperty("Site");'], ['  expect(v.verticalModels).toHaveProperty("Site");']));
    // A word that only contains the module's id, and a module named only in a comment.
    const ready = { moduleIds: ["kit", "run", "shift", "ready"], files: [{ path: "modules/ready/lib/x.ts", status: "M", addedLines: [] }, { path: "docs/ready-changelog.md", status: "M", addedLines: [] }] };
    held(registry("amplify/data/vertical.ts", ["  const already = true;"], [], ready.files, { moduleIds: ready.moduleIds }));
    held(registry("amplify/data/vertical.ts", ["  applyHack(foundationModules); // kit"]));
    // A line that also names a module the PR does not touch: shared writers, a renamed `&&` hidden by another module's name.
    held(registry("amplify/data/vertical.ts", ['  ShiftMember: ["shift", "kit"],']));
    held(registry("amplify/data/vertical.ts", ["  typeof shiftFunctions & typeof kitFunctions;"], ["  typeof vitalsFunctions;"]));
    // A JSDoc line reworded: the rule cannot see it is a comment, so it is a changed line of code.
    held(registry("amplify/functions/event-logger/log-policy.ts", [" * KitFieldNote is a member's own words;", "  'KitFieldNote',"], [" * The private notes are a member's own words."]));
  });

  it("keeps the hold for a statement, however it is named, and for `&&` growth: only registration shapes change", () => {
    held(registry("amplify/data/vertical.ts", ["  const kitReset = Object.keys(verticalModuleTables).forEach((k) => delete verticalModuleTables[k]);"]));
    held(registry("amplify/data/vertical.ts", ["  const kitGate = false;", "  foundationModules.filter((id) => contribution(id).moduleTables?.length && kitGate)"], ["  foundationModules.filter((id) => contribution(id).moduleTables?.length)"]));
    held(registry("amplify/data/vertical.ts", ["  compose(models, kitFlag);"], ["  compose(models);"]));
    held(registry("amplify/data/vertical.ts", ["  if (kitOn) applyKit(models);"]));
    held(registry("amplify/data/vertical.ts", ["  kitTables = [];"]));
    // An `expect` line is a registration shape only in the composition test, and only one chain as the whole line.
    held(registry("amplify/data/vertical.ts", ['  expect(kitModels).toBeDefined();']));
    expect(registry("amplify/data/vertical.test.ts", ['    expect(v.prepare.moduleTables.kit).toContain("KitFieldNote");']).tier1).toEqual([]);
    expect(registry("amplify/data/vertical.test.ts", ['    expect(v.prepare.modelNames).toContain("KitCheckIn");', '    expect(v.prepare.moduleMutations).toMatchObject({ ready: ["decideReadyLedgerRow"], kit: ["publishKitForm"] });']).tier1).toEqual([]);
    // Nothing runs inside an assertion's parentheses: names, strings and member paths only.
    held(registry("amplify/data/vertical.test.ts", ['    expect(vi.spyOn(v, "x").mockReturnValue(kitX)).toBeDefined();']));
    held(registry("amplify/data/vertical.test.ts", ['    await expect(load("kit,muster")).rejects.toThrow(/muster/);']));
    held(registry("amplify/data/vertical.test.ts", ['    expect(v.prepare.modules).toEqual(["kit", "station"].sort((a, b) => ids.indexOf(a) - ids.indexOf(b)));']));
    held(registry("amplify/data/vertical.test.ts", ["    expect(kitModels).toBeDefined(); return;"]));
    held(registry("amplify/data/vertical.test.ts", ["    expect(kitModels), vi.mock('./entitlements', () => kitStub);"]));
    held(registry("amplify/data/vertical.test.ts", ["    expect(kitModels).toBeDefined() || process.exit(0);"]));
    // A computed key registers only in the provider and helper seams, and only as `[name.property]: name`.
    held(registry("amplify/data/export-providers.ts", ["  [kitAlias]: kitProvider,"]));
    held(registry("amplify/functions/event-logger/log-policy.ts", ["  [kitAliasTable]: new Set([]),"]));
    held(registry("amplify/data/vertical.ts", ["  [kitKey.id]: kitContribution,"]));
    // Unmatched added lines balance their brackets in order: closing another module's block to reopen under Kit moves its registration.
    held(registry("amplify/data/vertical.ts", ["  },", "  kit: {", "    models: kitModels,"]));
    held(registry("amplify/data/vertical.ts", ["  kit: {", "    models: kitModels,"]));
    expect(registry("amplify/data/vertical.ts", ["  kit: {", "    models: kitModels,", "    moduleTables: ['KitCheckIn'],", "  },"]).tier1).toEqual([]);
    // Another module's closing `},` reindented and a `},` + `kit: {` inserted in its block: the diff shows one removed `},` and three added lines.
    held(registry("amplify/data/vertical.ts", ["  },", "  kit: {", "   },"], ["  },"]));
    // Growth inside a call's parentheses changes what runs: a matcher's extra argument, an extra call argument.
    held(registry("amplify/data/vertical.test.ts", ['    expect(v.verticalModels).not.toHaveProperty("KitCheckIn", kit);'], ['    expect(v.verticalModels).not.toHaveProperty("KitCheckIn");']));
    held(registry("amplify/functions/event-logger/log-policy.ts", ["  KitMember: new Set(kitFields, ['notifyPhoneE164']),"], ["  KitMember: new Set(['notifyPhoneE164']),"]));
    // The shapes that do register: a key with a `new Set` of strings, a key opening a block, a union member.
    expect(registry("amplify/functions/event-logger/log-policy.ts", ["  KitMember: new Set(['notifyPhoneE164', 'notifyPushTokens']),"]).tier1).toEqual([]);
    expect(registry("amplify/data/vertical.ts", ["  kit: {", "    models: kitModels,", "  },", "  | typeof kitModels"]).tier1).toEqual([]);
  });

  it("holds the keys of a module's block whose value reaches past its own tables, and releases the others", () => {
    // `sharedModuleTables: kitSharedTables,` is a module's own, well-formed line, and its value
    // (module code) could name another module's regulated table.
    for (const key of ["sharedModuleTables", "recordAccess", "foundationModels", "foundationFunctions", "apiSteps"]) {
      held(registry("amplify/data/vertical.ts", [`    ${key}: kit${key[0].toUpperCase()}${key.slice(1)},`]));
      held(registry("amplify/data/vertical.ts", ["  kit: {", "    models: kitModels,", `    ${key}: [kitThing],`, "  },"]));
      held(registry("amplify/data/vertical.ts", [`    ${key}: kitThing, // kit`], [`    ${key}: {},`]));
      // A quoted key is the same key.
      held(registry("amplify/data/vertical.ts", [`    "${key}": kitThing,`]));
      held(registry("amplify/data/vertical.ts", [`    '${key}': kitThing,`]));
    }
    // A spread in a module's block can carry any key from the module's own schema file, so it is held in vertical.ts.
    held(registry("amplify/data/vertical.ts", ["    ...kitBlockExtras,"]));
    held(registry("amplify/data/vertical.ts", ["  kit: {", "    models: kitModels,", "    ...kitBlockExtras,", "  },"]));
    held(registry("amplify/data/vertical.ts", ["  ...shiftModels, ...kitModels,"], ["  ...shiftModels,"]));
    expect(registry("amplify/data/vertical.ts", ["  kit: {", "    models: kitModels,", "    moduleTables: kitModuleTables,", "    moduleMutations: kitCommands,", "    functions: kitFunctions,", "    streamConsumers: kitStreamConsumers,", "  },"]).tier1).toEqual([]);
  });

  it("holds an edit beyond the module's own lines itself when CODEOWNERS leaves the registry to the check", () => {
    const released = { codeowners: CODEOWNERS + "/amplify/data/export-providers.ts\n/amplify/data/vertical.ts\n" };
    const own = registry("amplify/data/export-providers.ts", ["  [kitFormExportProvider.recordType]: kitFormExportProvider,"], [], base.files, released);
    expect(own.tier1).toEqual([]);
    expect(own.needsLead).toBe(false);
    const deletion = registry("amplify/data/export-providers.ts", [], ["  [stationReportExportProvider.recordType]: stationReportExportProvider,"], base.files, released);
    expect(deletion.tier1).toEqual([expect.stringMatching(/^Changes a seam registry beyond adding this PR's own module lines .*`amplify\/data\/export-providers\.ts`/)]);
    expect(deletion.needsLead).toBe(true);
    const other = registry("amplify/data/vertical.ts", ["  shift: shiftContribution,"], [], base.files, released);
    expect(other.tier1.join()).toMatch(/seam registry/);
    expect(other.tier1.join()).not.toMatch(/CODEOWNERS/);
  });
});
