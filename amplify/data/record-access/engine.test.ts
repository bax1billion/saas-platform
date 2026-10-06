import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * Runs the record-access APPSYNC_JS steps against a fixture decision with a
 * stubbed @aws-appsync/utils runtime — the behavioral contract for
 * record-level enforcement (docs/record-access.md). The product's real
 * decision snippet has its own table (amplify/data/case-access.test.ts).
 */

const EARLY = Symbol("earlyReturn");

class GqlError extends Error {
  errorType: string;
  constructor(message: string, errorType: string) {
    super(message);
    this.errorType = errorType;
  }
}

const util = {
  error: (m: string, t: string) => {
    throw new GqlError(m, t);
  },
  dynamodb: { toMapValues: (o: unknown) => o },
};
const runtime = { earlyReturn: (v: unknown) => ({ [EARLY]: true, value: v }) };

/** Fixture decision: UNIT visible to the org; otherwise named subs only; edit = named or Member/Admin on UNIT. */
const DECISION = `
function inList(list, v) { return Array.isArray(list) && list.indexOf(v) >= 0; }
function canView(rec, c) {
  if (rec.orgId !== c.orgId) return false;
  if (!rec.access || rec.access === 'UNIT') return true;
  return inList(rec.assignedSubs, c.sub) || inList(rec.grantedSubs, c.sub);
}
function canEdit(rec, c) {
  if (rec.orgId !== c.orgId) return false;
  if (!rec.access || rec.access === 'UNIT') return c.groups.indexOf('Admin') >= 0 || c.groups.indexOf('Member') >= 0;
  return inList(rec.assignedSubs, c.sub);
}
function validateWrite(existing, input, c) {
  const access = input.access || (existing ? existing.access : 'UNIT');
  const assigned = input.assignedSubs || (existing ? existing.assignedSubs : null) || [];
  if (access !== 'UNIT' && assigned.length === 0) return 'needs an assignee';
  return null;
}
`;

type Ctx = {
  identity: unknown;
  stash: Record<string, Record<string, unknown>>;
  prev: { result: unknown };
  args: Record<string, unknown>;
  result: unknown;
  error: unknown;
};
type Early = { [EARLY]: true; value: unknown };
type Step = { request: (ctx: Ctx) => Early | Record<string, unknown>; response: (ctx: Ctx) => unknown };

function load(file: string, replacements: Record<string, string> = {}): Step {
  let src = readFileSync(new URL(file, import.meta.url), "utf8");
  src = src.replace("/* __DECISION__ */", DECISION);
  for (const [k, v] of Object.entries(replacements)) src = src.split(k).join(v);
  src = src.replace(/^import .*$/m, "").replace(/export function/g, "function");
  return new Function("util", "runtime", `${src}\nreturn { request, response };`)(util, runtime) as Step;
}

const FK = { __FK__: "projectId" };
const steps = {
  caller: load("caller.js"),
  rootRead: load("root-read.js"),
  rootCreate: load("root-create.js"),
  rootWrite: load("root-write.js"),
  childView: load("child-root.js", { ...FK, __MODE__: "view" }),
  childEdit: load("child-root.js", { ...FK, __MODE__: "edit" }),
  childLoad: load("child-load.js", FK),
  childGet: load("child-get.js", FK),
  deny: load("deny.js"),
};

/** Run one step: request → (data source result) → response. Returns the step's output. */
function runStep(step: Step, ctx: Ctx, dsResult: unknown): unknown {
  const req = step.request(ctx);
  if (req && (req as Early)[EARLY]) return (req as Early).value;
  ctx.result = dsResult;
  return step.response(ctx);
}

const cognito = (sub: string, groups: string[]) => ({ sub, groups, claims: { sub } });
const member = cognito("sub-m", ["Member"]);
const admin = cognito("sub-a", ["Admin"]);
const viewer = cognito("sub-v", ["Viewer"]);
const iam = { userArn: "arn:aws:sts::1:x" };
const userRow = { items: [{ id: "u1", orgId: "org-1" }] };

const unitCase = { id: "c1", orgId: "org-1", access: "UNIT" };
const sealedCase = { id: "c2", orgId: "org-1", access: "SEALED", assignedSubs: ["sub-m"], grantedSubs: ["sub-v"] };
const otherOrgCase = { id: "c3", orgId: "org-2", access: "UNIT" };

function ctxFor(identity: unknown, extra: Partial<Ctx> = {}): Ctx {
  return { identity, stash: {}, prev: { result: "PREV" }, args: {}, result: null, error: null, ...extra };
}

function withCaller(identity: unknown, extra: Partial<Ctx> = {}): Ctx {
  const ctx = ctxFor(identity, extra);
  runStep(steps.caller, ctx, userRow);
  return ctx;
}

describe("caller step", () => {
  it("IAM callers bypass", () => {
    const ctx = ctxFor(iam);
    expect(runStep(steps.caller, ctx, null)).toBe("PREV");
    expect(ctx.stash.access.bypass).toBe(true);
  });
  it("resolves sub, groups and org for Cognito callers", () => {
    const ctx = withCaller(member);
    expect(ctx.stash.access).toEqual({ bypass: false, sub: "sub-m", groups: ["Member"], orgId: "org-1" });
  });
  it("reuses the entitlement gate's org without a lookup", () => {
    const ctx = ctxFor(member, { stash: { entitlement: { bypass: false, orgId: "org-9" } } });
    const req = steps.caller.request(ctx) as Early;
    expect(req[EARLY]).toBe(true);
    expect(ctx.stash.access.orgId).toBe("org-9");
  });
  it("requires onboarding", () => {
    const ctx = ctxFor(member);
    expect(() => runStep(steps.caller, ctx, { items: [] })).toThrow(/onboarding/);
  });
});

describe("root reads", () => {
  it("get: viewable passes, sealed-not-named becomes null, other org becomes null", () => {
    expect(runStep(steps.rootRead, withCaller(admin, { prev: { result: unitCase } }), null)).toBe(unitCase);
    expect(runStep(steps.rootRead, withCaller(admin, { prev: { result: sealedCase } }), null)).toBeNull();
    expect(runStep(steps.rootRead, withCaller(member, { prev: { result: sealedCase } }), null)).toBe(sealedCase);
    expect(runStep(steps.rootRead, withCaller(viewer, { prev: { result: sealedCase } }), null)).toBe(sealedCase);
    expect(runStep(steps.rootRead, withCaller(member, { prev: { result: otherOrgCase } }), null)).toBeNull();
  });
  it("list: filters items to what the caller may view", () => {
    const list = { items: [unitCase, sealedCase, otherOrgCase], nextToken: "t" };
    const out = runStep(steps.rootRead, withCaller(admin, { prev: { result: list } }), null) as { items: unknown[]; nextToken: string };
    expect(out.items).toEqual([unitCase]);
    expect(out.nextToken).toBe("t");
  });
  it("IAM sees everything", () => {
    const ctx = ctxFor(iam, { prev: { result: sealedCase } });
    runStep(steps.caller, ctx, null);
    expect(runStep(steps.rootRead, ctx, null)).toBe(sealedCase);
  });
});

describe("root writes", () => {
  const upd = (identity: unknown, existing: unknown, input: Record<string, unknown>) => {
    const ctx = withCaller(identity, { args: { input } });
    return () => runStep(steps.rootWrite, ctx, existing);
  };
  it("named member edits a restricted record; admin cannot even see it", () => {
    expect(upd(member, sealedCase, { id: "c2", status: "CLOSED" })()).toBe("PREV");
    expect(upd(admin, sealedCase, { id: "c2", status: "CLOSED" })).toThrow(/not found/);
  });
  it("granted viewer may view but not edit", () => {
    expect(upd(viewer, sealedCase, { id: "c2", status: "CLOSED" })).toThrow(/edit access/);
  });
  it("viewer group cannot edit a UNIT case; member can", () => {
    expect(upd(viewer, unitCase, { id: "c1", status: "CLOSED" })).toThrow(/edit access/);
    expect(upd(member, unitCase, { id: "c1", status: "CLOSED" })()).toBe("PREV");
  });
  it("product validation runs on update and create", () => {
    expect(upd(member, unitCase, { id: "c1", access: "SEALED" })).toThrow(/needs an assignee/);
    const create = withCaller(member, { args: { input: { orgId: "org-1", access: "RESTRICTED" } } });
    expect(() => runStep(steps.rootCreate, create, null)).toThrow(/needs an assignee/);
    const ok = withCaller(member, { args: { input: { orgId: "org-1", access: "RESTRICTED", assignedSubs: ["sub-m"] } } });
    expect(runStep(steps.rootCreate, ok, null)).toBe("PREV");
  });
  it("create refuses another org", () => {
    const ctx = withCaller(member, { args: { input: { orgId: "org-2", access: "UNIT" } } });
    expect(() => runStep(steps.rootCreate, ctx, null)).toThrow(/own organization/);
  });
});

describe("children", () => {
  it("by-root query: needs view on the root", () => {
    const ok = withCaller(member, { args: { projectId: "c2" } });
    expect(runStep(steps.childView, ok, sealedCase)).toBe("PREV");
    const no = withCaller(admin, { args: { projectId: "c2" } });
    expect(() => runStep(steps.childView, no, sealedCase)).toThrow(/not found/);
  });
  it("create child: needs edit on the root, fk from input", () => {
    const ok = withCaller(member, { args: { input: { projectId: "c2" } } });
    expect(runStep(steps.childEdit, ok, sealedCase)).toBe("PREV");
    const viewOnly = withCaller(viewer, { args: { input: { projectId: "c2" } } });
    expect(() => runStep(steps.childEdit, viewOnly, sealedCase)).toThrow(/edit access/);
  });
  it("update child: loads the child, stashes its fk, refuses moving it, then checks the root", () => {
    const ctx = withCaller(member, { args: { input: { id: "m1", description: "x" } } });
    expect(runStep(steps.childLoad, ctx, { id: "m1", projectId: "c2" })).toBe("PREV");
    expect(ctx.stash.access.fk).toBe("c2");
    expect(runStep(steps.childEdit, ctx, sealedCase)).toBe("PREV");
    const move = withCaller(member, { args: { input: { id: "m1", projectId: "c9" } } });
    expect(() => runStep(steps.childLoad, move, { id: "m1", projectId: "c2" })).toThrow(/cannot be moved/);
  });
  it("get child: null unless the root is viewable", () => {
    const item = { id: "m1", projectId: "c2" };
    expect(runStep(steps.childGet, withCaller(member, { prev: { result: item } }), sealedCase)).toBe(item);
    expect(runStep(steps.childGet, withCaller(admin, { prev: { result: item } }), sealedCase)).toBeNull();
    expect(runStep(steps.childGet, withCaller(admin, { prev: { result: null } }), null)).toBeNull();
  });
  it("org-wide child queries are denied for Cognito callers, allowed for IAM", () => {
    expect(() => runStep(steps.deny, withCaller(admin), null)).toThrow(/through their parent/);
    const ctx = ctxFor(iam);
    runStep(steps.caller, ctx, null);
    expect(runStep(steps.deny, ctx, null)).toBe("PREV");
  });
});
