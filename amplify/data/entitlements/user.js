/**
 * Entitlement pipeline step 1/3 — resolve the caller's organization.
 * Data source: UserTable. Runs as APPSYNC_JS inside every gated mutation.
 *
 * Cognito callers carry `identity.claims.sub`; IAM callers (the webhook and
 * onboarding Lambdas) do not and bypass enforcement — they ARE the system.
 */
import { util, runtime } from '@aws-appsync/utils';

export function request(ctx) {
  const identity = ctx.identity;
  const sub = identity && identity.claims ? identity.claims.sub : null;
  if (!sub) {
    ctx.stash.entitlement = { bypass: true };
    return runtime.earlyReturn(ctx.prev.result);
  }
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
    util.error(
      'Complete onboarding before creating records.',
      'OnboardingRequired'
    );
  }
  ctx.stash.entitlement = { bypass: false, orgId: user.orgId };
  return ctx.prev.result;
}
