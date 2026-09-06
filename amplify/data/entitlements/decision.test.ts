import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * Runs the APPSYNC_JS entitlement resolvers (user.js / org.js /
 * subscription.js) against a decision table with a stubbed
 * @aws-appsync/utils runtime. This is the behavioral contract for backend
 * entitlement enforcement — keep it in step with the client's
 * resolveEntitledModules().
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
  time: { nowISO8601: () => new Date().toISOString() },
};
const runtime = { earlyReturn: (v: unknown) => ({ [EARLY]: true, value: v }) };

type Ctx = Record<string, unknown>;
type Step = { request: (ctx: Ctx) => unknown; response: (ctx: Ctx) => unknown };

const FIELD_MODULE = { createWidget: "widgets", createSite: null };

function load(file: string, replacements: Record<string, string> = {}): Step {
  let src = readFileSync(new URL(file, import.meta.url), "utf8");
  for (const [k, v] of Object.entries(replacements)) src = src.replace(k, v);
  src = src.replace(/^import .*$/m, "").replace(/export function/g, "function");
  return new Function(
    "util",
    "runtime",
    `${src}\nreturn { request, response };`
  )(util, runtime) as Step;
}

const steps = [
  load("user.js"),
  load("override.js"),
  load("subscription.js", { __FIELD_MODULE__: JSON.stringify(FIELD_MODULE) }),
];

interface Case {
  identity?: unknown;
  user?: Record<string, unknown> | null;
  override?: Record<string, unknown> | null;
  sub?: Record<string, unknown> | null;
  field: string;
}

function run(c: Case): string {
  const ctx: Ctx = {
    identity: c.identity ?? null,
    stash: {},
    prev: { result: "PREV" },
    info: { fieldName: c.field },
    result: null,
    error: null,
  };
  const results = [
    { items: c.user ? [c.user] : [] },
    { items: c.override ? [c.override] : [] },
    { items: c.sub ? [c.sub] : [] },
  ];
  try {
    steps.forEach((fn, i) => {
      const req = fn.request(ctx) as Record<PropertyKey, unknown> | null;
      if (req && (req as Record<symbol, unknown>)[EARLY]) return;
      ctx.result = results[i];
      const out = fn.response(ctx);
      expect(out, "steps must pass ctx.prev.result through").toBe("PREV");
    });
    return "ALLOW";
  } catch (e) {
    return e instanceof GqlError ? e.errorType : `THREW: ${String(e)}`;
  }
}

const cognito = { claims: { sub: "sub-1" } };
const member = { orgId: "org-1" };
const future = new Date(Date.now() + 86_400_000).toISOString();
const past = new Date(Date.now() - 86_400_000).toISOString();

describe("backend entitlement decision table", () => {
  const cases: Array<[string, Case, string]> = [
    ["IAM caller bypasses", { identity: { userArn: "arn:aws:sts::1:x" }, field: "createWidget" }, "ALLOW"],
    ["no identity bypasses (model auth limits API key reach)", { identity: null, field: "createSite" }, "ALLOW"],
    ["no User record → onboarding", { identity: cognito, user: null, field: "createSite" }, "OnboardingRequired"],
    ["User without org → onboarding", { identity: cognito, user: { orgId: null }, field: "createSite" }, "OnboardingRequired"],
    ["no subscription → denied", { identity: cognito, user: member, sub: null, field: "createSite" }, "SubscriptionRequired"],
    ["CANCELED → denied", { identity: cognito, user: member, sub: { status: "CANCELED" }, field: "createSite" }, "SubscriptionRequired"],
    ["INCOMPLETE → denied", { identity: cognito, user: member, sub: { status: "INCOMPLETE" }, field: "createSite" }, "SubscriptionRequired"],
    ["PAST_DUE → allowed (grace)", { identity: cognito, user: member, sub: { status: "PAST_DUE" }, field: "createSite" }, "ALLOW"],
    ["TRIALING → allowed", { identity: cognito, user: member, sub: { status: "TRIALING" }, field: "createSite" }, "ALLOW"],
    ["ACTIVE, module missing → denied", { identity: cognito, user: member, sub: { status: "ACTIVE", modules: [] }, field: "createWidget" }, "ModuleRequired"],
    ["ACTIVE + module line item", { identity: cognito, user: member, sub: { status: "ACTIVE", modules: ["widgets"] }, field: "createWidget" }, "ALLOW"],
    ["operator override: comped + module", { identity: cognito, user: member, override: { access: "comped", modules: ["widgets"] }, sub: null, field: "createWidget" }, "ALLOW"],
    ["operator override: comped, module NOT granted", { identity: cognito, user: member, override: { access: "comped" }, sub: null, field: "createWidget" }, "ModuleRequired"],
    ["operator override with future expiry honored", { identity: cognito, user: member, override: { access: "comped", modules: ["widgets"], expiresAt: future }, sub: null, field: "createWidget" }, "ALLOW"],
    ["EXPIRED operator override grants nothing", { identity: cognito, user: member, override: { access: "comped", modules: ["widgets"], expiresAt: past }, sub: null, field: "createWidget" }, "SubscriptionRequired"],
    ["expired override does not shadow a live subscription", { identity: cognito, user: member, override: { access: "comped", expiresAt: past }, sub: { status: "ACTIVE", modules: ["widgets"] }, field: "createWidget" }, "ALLOW"],
    ["ungated field with active sub", { identity: cognito, user: member, sub: { status: "ACTIVE" }, field: "updateOrganization" }, "ALLOW"],
  ];


  it.each(cases)("%s", (_name, input, expected) => {
    expect(run(input)).toBe(expected);
  });
});
