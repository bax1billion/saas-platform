/**
 * Entitlement pipeline step 2/3 — read the organization's settings overrides.
 * Data source: OrganizationTable.
 *
 * `Organization.settings` is an AWSJSON field, stored as a JSON string.
 * Recognized keys: `access: "comped"` (base access without a subscription)
 * and `modules: string[]` (admin-granted add-ons). See docs/modules.md.
 */
import { util, runtime } from '@aws-appsync/utils';

export function request(ctx) {
  const ent = ctx.stash.entitlement;
  if (!ent || ent.bypass) {
    return runtime.earlyReturn(ctx.prev.result);
  }
  return {
    operation: 'GetItem',
    key: util.dynamodb.toMapValues({ id: ent.orgId }),
  };
}

export function response(ctx) {
  if (ctx.error) {
    util.error(ctx.error.message, ctx.error.type);
  }
  const org = ctx.result;
  let settings = {};
  if (org && org.settings) {
    if (typeof org.settings === 'string') {
      const parsed = JSON.parse(org.settings);
      settings = parsed && typeof parsed === 'object' ? parsed : {};
    } else if (typeof org.settings === 'object') {
      settings = org.settings;
    }
  }
  ctx.stash.entitlement.comped = settings.access === 'comped';
  ctx.stash.entitlement.orgModules = Array.isArray(settings.modules)
    ? settings.modules
    : [];
  return ctx.prev.result;
}
