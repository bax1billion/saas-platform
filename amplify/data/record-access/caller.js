/**
 * Record-access step — resolve the caller: `{ sub, groups, orgId }` into
 * ctx.stash.access. Data source: UserTable.
 *
 * IAM callers (Lambdas) have no sub and bypass. When the entitlement gate
 * already resolved the org on this request (gated mutations run it
 * first), reuse it instead of a second User lookup.
 */
import { util, runtime } from '@aws-appsync/utils';

/* __DECISION__ */

export function request(ctx) {
  const identity = ctx.identity;
  const sub = identity && identity.sub ? identity.sub : identity && identity.claims ? identity.claims.sub : null;
  if (!sub) {
    ctx.stash.access = { bypass: true };
    return runtime.earlyReturn(ctx.prev.result);
  }
  const groups =
    (identity.groups && identity.groups.length ? identity.groups : null) ||
    (identity.claims && identity.claims['cognito:groups']) ||
    [];
  const ent = ctx.stash.entitlement;
  if (ent && !ent.bypass && ent.orgId) {
    ctx.stash.access = { bypass: false, sub: sub, groups: groups, orgId: ent.orgId };
    return runtime.earlyReturn(ctx.prev.result);
  }
  ctx.stash.access = { bypass: false, sub: sub, groups: groups, orgId: null };
  return {
    operation: 'Query',
    index: 'usersByCognitoSub',
    query: {
      expression: '#cognitoSub = :sub',
      expressionNames: { '#cognitoSub': 'cognitoSub' },
      expressionValues: util.dynamodb.toMapValues({ ':sub': sub }),
    },
    limit: 1,
  };
}

export function response(ctx) {
  if (ctx.error) {
    util.error(ctx.error.message, ctx.error.type);
  }
  const user = ctx.result && ctx.result.items ? ctx.result.items[0] : null;
  if (!user || !user.orgId) {
    util.error('Complete onboarding before accessing records.', 'OnboardingRequired');
  }
  ctx.stash.access.orgId = user.orgId;
  return ctx.prev.result;
}
