/**
 * Runs the APPSYNC_JS entitlement resolvers (amplify/data/entitlements/*.js)
 * through a decision table with a stubbed @aws-appsync/utils runtime.
 * Pure Node — no AWS. Exits non-zero on any mismatch.
 *
 * Usage: npm run check:entitlements
 */
import { readFileSync } from "node:fs";

const dir = new URL("../amplify/data/entitlements/", import.meta.url);
const EARLY = Symbol("earlyReturn");

class GqlError extends Error {
  constructor(message, errorType) {
    super(message);
    this.errorType = errorType;
  }
}
const util = {
  error: (m, t) => {
    throw new GqlError(m, t);
  },
  dynamodb: { toMapValues: (o) => o },
};
const runtime = { earlyReturn: (v) => ({ [EARLY]: true, value: v }) };

const load = (file, replacements = {}) => {
  let src = readFileSync(new URL(file, dir), "utf8");
  for (const [k, v] of Object.entries(replacements)) src = src.replace(k, v);
  src = src.replace(/^import .*$/m, "").replace(/export function/g, "function");
  return new Function("util", "runtime", `${src}\nreturn { request, response };`)(util, runtime);
};

const FIELD_MODULE = { createWidget: "widgets", createSite: null };
const steps = [
  load("user.js"),
  load("org.js"),
  load("subscription.js", { __FIELD_MODULE__: JSON.stringify(FIELD_MODULE) }),
];

function run({ identity, user, org, sub, field }) {
  const ctx = {
    identity,
    stash: {},
    prev: { result: "PREV" },
    info: { fieldName: field },
    result: null,
    error: null,
  };
  const results = [{ items: user ? [user] : [] }, org ?? null, { items: sub ? [sub] : [] }];
  try {
    steps.forEach((fn, i) => {
      const req = fn.request(ctx);
      if (req && req[EARLY]) return;
      ctx.result = results[i];
      const out = fn.response(ctx);
      if (out !== "PREV") throw new Error("step must pass ctx.prev.result through");
    });
    return "ALLOW";
  } catch (e) {
    return e.errorType ?? `THREW: ${e.message}`;
  }
}

const cognito = { claims: { sub: "sub-1" } };
const member = { orgId: "org-1" };
const cases = [
  ["IAM caller bypasses", { identity: { userArn: "arn:aws:sts::1:assumed-role/x" }, field: "createWidget" }, "ALLOW"],
  ["no identity (API key) → bypass; model auth limits API key", { identity: null, field: "createSite" }, "ALLOW"],
  ["no User record → onboarding", { identity: cognito, user: null, field: "createSite" }, "OnboardingRequired"],
  ["User without org → onboarding", { identity: cognito, user: { orgId: null }, field: "createSite" }, "OnboardingRequired"],
  ["no subscription → denied", { identity: cognito, user: member, org: { id: "org-1" }, sub: null, field: "createSite" }, "SubscriptionRequired"],
  ["CANCELED → denied", { identity: cognito, user: member, org: { id: "org-1" }, sub: { status: "CANCELED" }, field: "createSite" }, "SubscriptionRequired"],
  ["INCOMPLETE → denied", { identity: cognito, user: member, org: { id: "org-1" }, sub: { status: "INCOMPLETE" }, field: "createSite" }, "SubscriptionRequired"],
  ["PAST_DUE → allowed (grace)", { identity: cognito, user: member, org: { id: "org-1" }, sub: { status: "PAST_DUE" }, field: "createSite" }, "ALLOW"],
  ["TRIALING → allowed", { identity: cognito, user: member, org: { id: "org-1" }, sub: { status: "TRIALING" }, field: "createSite" }, "ALLOW"],
  ["ACTIVE, module missing → denied", { identity: cognito, user: member, org: { id: "org-1" }, sub: { status: "ACTIVE", modules: [] }, field: "createWidget" }, "ModuleRequired"],
  ["ACTIVE + module line item", { identity: cognito, user: member, org: { id: "org-1" }, sub: { status: "ACTIVE", modules: ["widgets"] }, field: "createWidget" }, "ALLOW"],
  ["comped org, module via settings", { identity: cognito, user: member, org: { id: "org-1", settings: '{"access":"comped","modules":["widgets"]}' }, sub: null, field: "createWidget" }, "ALLOW"],
  ["comped org, module NOT granted", { identity: cognito, user: member, org: { id: "org-1", settings: '{"access":"comped"}' }, sub: null, field: "createWidget" }, "ModuleRequired"],
  ["settings already an object", { identity: cognito, user: member, org: { id: "org-1", settings: { modules: ["widgets"] } }, sub: { status: "TRIALING" }, field: "createWidget" }, "ALLOW"],
  ["ungated field with active sub", { identity: cognito, user: member, org: { id: "org-1" }, sub: { status: "ACTIVE" }, field: "updateOrganization" }, "ALLOW"],
];

let failed = 0;
for (const [name, input, expected] of cases) {
  const got = run(input);
  const ok = got === expected;
  if (!ok) failed++;
  console.log(`${ok ? "✓" : "✗"} ${name.padEnd(36)} → ${got}${ok ? "" : `   (expected ${expected})`}`);
}
if (failed) {
  console.error(`\n${failed} entitlement case(s) failed`);
  process.exit(1);
}
console.log(`\n✓ ${cases.length} entitlement cases pass`);
