// When adding models, start with: import { a } from '@aws-amplify/backend';

/**
 * Vertical schema seam — the per-product edit point for domain models.
 *
 * The foundation schema (resource.ts) provides tenancy, auth, billing, and
 * audit-trail models. A product's domain models are defined HERE and merged
 * into the schema; the foundation file should not need editing.
 *
 * Products organized as modules (docs/modules.md) keep each module's
 * models in modules/<id>/schema.ts and compose them here:
 *
 *   import { widgetsModels, widgetsEntityTypes, ... } from '../../modules/widgets/schema';
 *   export const verticalModels = { ...widgetsModels };
 *
 * Conventions for vertical models (see docs/core-data-model.md):
 *  - Tenancy: every model carries `orgId: a.id().required()` plus a
 *    `belongsTo('Organization', 'orgId')`; add the matching `hasMany` on
 *    Organization ONLY if you need the relation traversal (optional).
 *    Site-scoped models add an optional `siteId`.
 *  - Indexes: one GSI per access pattern, named `<models>By<Dimension>`;
 *    chronological GSIs use a required `sortDate: a.datetime().required()`.
 *  - Authorization: Admin gets full CRUD; Member gets the working set
 *    (usually create/read/update); Viewer gets read.
 *  - Audit trail: add the model's table to `streamEventSources` in
 *    amplify/backend.ts so the event-logger streams it into EventLog, and
 *    add its entity-type / action names below.
 *
 * Example (compliance vertical):
 *
 *   export const verticalModels = {
 *     ProjectStatus: a.enum(['DRAFT', 'ACTIVE', 'ARCHIVED']),
 *     Project: a
 *       .model({
 *         orgId: a.id().required(),
 *         siteId: a.id(),
 *         name: a.string().required(),
 *         status: a.ref('ProjectStatus').required(),
 *         sortDate: a.datetime().required(),
 *         organization: a.belongsTo('Organization', 'orgId'),
 *       })
 *       .secondaryIndexes((index) => [
 *         index('orgId').sortKeys(['sortDate']).queryField('projectsByOrg'),
 *       ])
 *       .authorization((allow) => [
 *         allow.group('Admin').to(['create', 'read', 'update', 'delete']),
 *         allow.group('Member').to(['create', 'read', 'update']),
 *         allow.group('Viewer').to(['read']),
 *       ]),
 *   };
 *   export const verticalEntityTypes = ['PROJECT'];
 *   export const verticalEventActions = ['PROJECT_ARCHIVED'];
 */

/** Domain models, enums, and custom types merged into the schema. */
export const verticalModels = {};

/** EntityType enum values contributed by the vertical (for EventLog). */
export const verticalEntityTypes: string[] = [];

/** EventAction enum values contributed by the vertical (for EventLog). */
export const verticalEventActions: string[] = [];

/**
 * Seed records provisioned for each new Organization by the
 * organization-trigger Lambda (empty = no seeding).
 */
export const verticalOrgSeeds: Array<Record<string, unknown>> = [];

/** Vertical tables streamed into the audit trail (amplify/backend.ts). */
export const verticalStreamTables: string[] = [];

/**
 * Add-on module billing: module id (config/modules.ts) → Amplify secret
 * name holding that module's Stripe Price ID. Convention:
 * `STRIPE_PRICE_MODULE_<ID>` (uppercase, dashes → underscores). Consumed by
 * the create-checkout-session function; the webhook resolves modules from
 * Stripe Product metadata instead, so this map is only needed to SELL.
 *
 *   export const verticalModulePriceSecrets = {
 *     widgets: 'STRIPE_PRICE_MODULE_WIDGETS',
 *   };
 */
export const verticalModulePriceSecrets: Record<string, string> = {};
