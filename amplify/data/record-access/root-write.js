/**
 * Record-access step — before update|delete<Root>: load the record, require
 * edit access, and let the product validate the change. Data source: the
 * root table.
 */
import { util, runtime } from '@aws-appsync/utils';

/* __DECISION__ */

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
  const acc = ctx.stash.access;
  const rec = ctx.result;
  if (!rec || !canView(rec, acc)) {
    util.error('Record not found.', 'NotFound');
  }
  if (!canEdit(rec, acc)) {
    util.error('You do not have edit access to this record.', 'RecordAccessDenied');
  }
  const msg = validateWrite(rec, ctx.args.input || {}, acc);
  if (msg) {
    util.error(msg, 'RecordAccessInvalid');
  }
  return ctx.prev.result;
}
