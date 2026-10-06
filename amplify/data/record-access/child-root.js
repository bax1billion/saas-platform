/**
 * Record-access step — before a child query or write: load the root record
 * the child belongs to and require view (queries) or edit (writes) access.
 * The foreign key comes from, in order: ctx.stash.access.fk (set by
 * child-load.js for update/delete), args.input[fk] (create), args[fk]
 * (by-root queries). Data source: the root table.
 */
import { util, runtime } from '@aws-appsync/utils';

/* __DECISION__ */

const FK = '__FK__';
/** 'view' or 'edit', substituted at synth. Read through indexOf so the
 *  runtime's TypeScript pass sees a string, not a literal type: written as
 *  `MODE === 'edit'`, the view step fails AppSync's code check with TS2367
 *  ("types 'view' and 'edit' have no overlap") — found with
 *  `aws appsync evaluate-code` after the first staging deploy. */
const MODE = '__MODE__';
const REQUIRES_EDIT = MODE.indexOf('edit') === 0;

export function request(ctx) {
  const acc = ctx.stash.access;
  if (!acc || acc.bypass) {
    return runtime.earlyReturn(ctx.prev.result);
  }
  const input = ctx.args.input || {};
  const id = acc.fk || input[FK] || ctx.args[FK];
  if (!id) {
    util.error('Missing ' + FK + '.', 'BadRequest');
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
  if (REQUIRES_EDIT && !canEdit(rec, acc)) {
    util.error('You do not have edit access to this record.', 'RecordAccessDenied');
  }
  return ctx.prev.result;
}
