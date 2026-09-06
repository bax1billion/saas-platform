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

  const required = FIELD_MODULE[ctx.info.fieldName];
  if (required) {
    const subModules = sub && Array.isArray(sub.modules) ? sub.modules : [];
    const granted = subModules.concat(ent.orgModules || []);
    if (!granted.includes(required)) {
      util.error(
        'The "' + required + '" module is not licensed for this organization.',
        'ModuleRequired'
      );
    }
  }
  return ctx.prev.result;
}
