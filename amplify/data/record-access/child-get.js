/**
 * Record-access step — after the data step on get<Child>: load the root the
 * result points at and answer null unless the caller may view it. Data
 * source: the root table.
 */
import { util, runtime } from '@aws-appsync/utils';

/* __DECISION__ */

const FK = '__FK__';

export function request(ctx) {
  const acc = ctx.stash.access;
  const res = ctx.prev.result;
  if (!acc || acc.bypass || res === null || res === undefined) {
    return runtime.earlyReturn(res);
  }
  const fk = res[FK];
  if (!fk) {
    return runtime.earlyReturn(null);
  }
  return { operation: 'GetItem', key: util.dynamodb.toMapValues({ id: fk }) };
}

export function response(ctx) {
  if (ctx.error) {
    util.error(ctx.error.message, ctx.error.type);
  }
  const root = ctx.result;
  return root && canView(root, ctx.stash.access) ? ctx.prev.result : null;
}
