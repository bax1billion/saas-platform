/**
 * Record-access step — org-wide child queries (`list<Child>`,
 * `<children>ByOrg`) cannot be filtered per record without a lookup per
 * item, so Cognito callers are refused and pointed at the by-root query.
 * IAM callers pass. Request-only.
 */
import { util, runtime } from '@aws-appsync/utils';

/* __DECISION__ */

export function request(ctx) {
  const acc = ctx.stash.access;
  if (!acc || acc.bypass) {
    return runtime.earlyReturn(ctx.prev.result);
  }
  util.error('Query these records through their parent record.', 'RecordAccessDenied');
}

export function response(ctx) {
  return ctx.prev.result;
}
