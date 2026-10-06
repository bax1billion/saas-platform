/**
 * Record-access step — before update|delete<Child>: load the child by
 * input.id and stash its foreign key for child-root.js. Data source: the
 * child table.
 */
import { util, runtime } from '@aws-appsync/utils';

/* __DECISION__ */

const FK = '__FK__';

export function request(ctx) {
  const acc = ctx.stash.access;
  if (!acc || acc.bypass) {
    return runtime.earlyReturn(ctx.prev.result);
  }
  const id = ctx.args.input ? ctx.args.input.id : null;
  if (!id) {
    util.error('Missing record id.', 'BadRequest');
  }
  return { operation: 'GetItem', key: util.dynamodb.toMapValues({ id: id }) };
}

export function response(ctx) {
  if (ctx.error) {
    util.error(ctx.error.message, ctx.error.type);
  }
  const rec = ctx.result;
  if (!rec || !rec[FK]) {
    util.error('Record not found.', 'NotFound');
  }
  // A write may not move a child to another root.
  const input = ctx.args.input || {};
  if (input[FK] && input[FK] !== rec[FK]) {
    util.error('A record cannot be moved to another ' + FK + '.', 'RecordAccessInvalid');
  }
  ctx.stash.access.fk = rec[FK];
  return ctx.prev.result;
}
