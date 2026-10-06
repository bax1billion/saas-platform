/**
 * Record-access step — before create<Root>: the product's validateWrite
 * checks the new record's access shape (e.g. a restricted record must
 * name at least the creator). Request-only.
 */
import { util, runtime } from '@aws-appsync/utils';

/* __DECISION__ */

export function request(ctx) {
  const acc = ctx.stash.access;
  if (!acc || acc.bypass) {
    return runtime.earlyReturn(ctx.prev.result);
  }
  const input = ctx.args.input || {};
  if (input.orgId && input.orgId !== acc.orgId) {
    util.error('Records can only be created in your own organization.', 'RecordAccessDenied');
  }
  const msg = validateWrite(null, input, acc);
  if (msg) {
    util.error(msg, 'RecordAccessInvalid');
  }
  return runtime.earlyReturn(ctx.prev.result);
}

export function response(ctx) {
  return ctx.prev.result;
}
