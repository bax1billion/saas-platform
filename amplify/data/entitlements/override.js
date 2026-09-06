/**
 * Entitlement pipeline step 2/3 — read the org's operator-granted override.
 * Data source: OrgEntitlementOverrideTable.
 *
 * OrgEntitlementOverride records are written only by the Operator group
 * (pilots, comps, offline check/PO purchases). The latest record per org
 * wins; a record past its expiresAt grants nothing. Replaces the old
 * Organization.settings overrides, which org Admins could write themselves.
 */
import { util, runtime } from '@aws-appsync/utils';

export function request(ctx) {
  const ent = ctx.stash.entitlement;
  if (!ent || ent.bypass) {
    return runtime.earlyReturn(ctx.prev.result);
  }
  return {
    operation: 'Query',
    index: 'orgEntitlementOverridesByOrgIdAndSortDate',
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
  const item =
    ctx.result && ctx.result.items ? ctx.result.items[0] : null;
  let comped = false;
  let orgModules = [];
  if (item) {
    const expired =
      typeof item.expiresAt === 'string' &&
      item.expiresAt.length > 0 &&
      item.expiresAt <= util.time.nowISO8601();
    if (!expired) {
      comped = item.access === 'comped';
      orgModules = Array.isArray(item.modules) ? item.modules : [];
    }
  }
  ctx.stash.entitlement.comped = comped;
  ctx.stash.entitlement.orgModules = orgModules;
  return ctx.prev.result;
}
