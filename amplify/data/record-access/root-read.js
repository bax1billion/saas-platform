/**
 * Record-access step — after the data step on root reads: a single record
 * becomes null when the caller may not view it (existence never leaks);
 * a list keeps only viewable items. Request-only (earlyReturn); the data
 * source is never called.
 */
import { runtime } from '@aws-appsync/utils';

/* __DECISION__ */

export function request(ctx) {
  const acc = ctx.stash.access;
  const res = ctx.prev.result;
  if (!acc || acc.bypass || res === null || res === undefined) {
    return runtime.earlyReturn(res);
  }
  if (res.items) {
    res.items = res.items.filter((it) => canView(it, acc));
    return runtime.earlyReturn(res);
  }
  return runtime.earlyReturn(canView(res, acc) ? res : null);
}

export function response(ctx) {
  return ctx.prev.result;
}
