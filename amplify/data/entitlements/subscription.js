/**
 * Entitlement pipeline step 3/3 — latest subscription + the decision.
 * Data source: OrgSubscriptionTable.
 *
 * Mirrors lib/modules resolveEntitledModules() on the server:
 *   active  = status ∈ {ACTIVE, TRIALING, PAST_DUE}  or  operator-comped
 *   modules = OrgSubscription.modules ∪ OrgEntitlementOverride.modules
 * A gated field needs `active`; a module field additionally needs its
 * module id in `modules`. FIELD_MODULE is injected at synth from the
 * gated-field map (amplify/data/entitlements/index.ts).
 */
import { util, runtime } from '@aws-appsync/utils';

const FIELD_MODULE = __FIELD_MODULE__;
const ACTIVE_STATUSES = ['ACTIVE', 'TRIALING', 'PAST_DUE'];

export function request(ctx) {
  const ent = ctx.stash.entitlement;
  if (!ent || ent.bypass) {
    return runtime.earlyReturn(ctx.prev.result);
  }
  return {
    operation: 'Query',
    index: 'orgSubscriptionsByOrgIdAndSortDate',
    query: {
      expression: '#orgId = :orgId',
      expressionNames: { '#orgId': 'orgId' },
      expressionValues: util.dynamodb.toMapValues({ ':orgId': ent.orgId }),
    },
    scanIndexForward: false,
    limit: 1,
  };
}

export function response(ctx) {
  if (ctx.error) {
    util.error(ctx.error.message, ctx.error.type);
  }
  const ent = ctx.stash.entitlement;
  const sub = ctx.result && ctx.result.items ? ctx.result.items[0] : null;
  const status = sub ? sub.status : null;
  const active = ent.comped || (status !== null && ACTIVE_STATUSES.includes(status));

  if (!active) {
    util.error(
      'An active subscription is required for this organization.',
      'SubscriptionRequired'
    );
  }

  // One module id, or a list of ids any one of which may write (a table one
  // module owns whose writes another module's screens also make).
  const required = FIELD_MODULE[ctx.info.fieldName];
  if (required) {
    const anyOf = Array.isArray(required) ? required : [required];
    const subModules = sub && Array.isArray(sub.modules) ? sub.modules : [];
    const granted = subModules.concat(ent.orgModules || []);
    const held = anyOf.filter((m) => granted.includes(m));
    if (held.length === 0) {
      util.error(
        'The "' + anyOf.join('" or "') + '" module is not licensed for this organization.',
        'ModuleRequired'
      );
    }
  }
  return ctx.prev.result;
}
