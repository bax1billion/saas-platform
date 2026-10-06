// When adding models, start with: import { a } from '@aws-amplify/backend';
import type { defineFunction } from '@aws-amplify/backend';
import type { Stack } from 'aws-cdk-lib';
import type * as lambda from 'aws-cdk-lib/aws-lambda';
import type * as s3 from 'aws-cdk-lib/aws-s3';
import type { RecordAccessPolicy, applyRecordAccess } from './record-access/index';
import { mergeStreamConsumers } from './stream-consumers';

/**
 * Vertical schema seam — the per-product edit point for domain models.
 *
 * The foundation schema (resource.ts) provides tenancy, auth, billing, and
 * audit-trail models. A product's domain models are defined HERE and merged
 * into the schema; the foundation file should not need editing.
 *
 * Products organized as modules (docs/modules.md) keep each module's
 * models in amplify/data/modules/<id>.ts (inside the ESM backend tree —
 * files outside amplify/ load as CommonJS and break named imports) and
 * compose them here:
 *
 *   import { widgetsModels, widgetsEntityTypes, ... } from './modules/widgets';
 *   export const verticalModels = { ...widgetsModels };
 *
 * Conventions for vertical models (see docs/core-data-model.md):
 *  - Tenancy: every model carries `orgId: a.id().required()` with an
 *    orgId-partitioned GSI. Do NOT add `belongsTo('Organization', 'orgId')`
 *    — Amplify requires the matching `hasMany` on Organization (a foundation
 *    model in resource.ts) and fails synth without it ("Unable to find
 *    associated relationship definition in Organization"). Relationships
 *    between a module's own models (parent hasMany ↔ child belongsTo) are
 *    fine. Site-scoped models add an optional `siteId`.
 *  - Indexes: one GSI per access pattern, named `<models>By<Dimension>`;
 *    chronological GSIs use a required `sortDate: a.datetime().required()`.
 *  - Authorization: Admin gets full CRUD; Member gets the working set
 *    (usually create/read/update); Viewer gets read.
 *  - Audit trail: list the model's table in `verticalStreamTables` so the
 *    event-logger streams it into EventLog, and add its entity-type /
 *    action names below.
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
 * Module id → the models it owns. Mutations on these models require an
 * active subscription AND the module (amplify/data/entitlements).
 */
export const verticalModuleTables: Record<string, string[]> = {};

/**
 * Module id → its custom (command) mutations. Gated exactly like the
 * generated model mutations: subscription AND module. A module whose
 * Lambda writes over IAM would otherwise let a locked org in through the
 * side door — `allow.resource` bypasses model and field rules, so the gate
 * has to sit on the command field itself.
 *
 *   export const verticalModuleMutations = {
 *     widgets: ['requestWidget', 'approveWidget'],
 *   };
 */
export const verticalModuleMutations: Record<string, string[]> = {};

/**
 * Module-owned Lambda functions, keyed by backend construct name. Spread
 * into defineBackend() and granted on the schema (allow.resource) by the
 * foundation files, so a module adds a command handler without editing
 * amplify/backend.ts or amplify/data/resource.ts. Each function gets
 * GRAPHQL_ENDPOINT and the appsync:GraphQL policy like the foundation
 * trigger functions.
 *
 * Such a handler runs as a transformer admin role and bypasses every model
 * and field rule, so it MUST enforce tenancy itself: load the row and
 * compare its `orgId` with the caller's before acting on it. See
 * docs/core-data-model.md §2.5.
 *
 *   export const verticalFunctions = { widgetCommand: widgetCommandFunction };
 */
export const verticalFunctions: Record<string, ReturnType<typeof defineFunction>> = {};

/**
 * Table → stream consumers, named by their `verticalFunctions` key. This
 * is the platform's DEFAULT shape for server-authoritative logic
 * (docs/modules.md → "Backend business logic"): the client writes what it
 * owns, field rules keep the server-owned columns write-to-nobody, and a
 * handler on the table stream fills them over IAM. backend.ts adds the
 * EventSourceMapping and stream-read policy — no per-module edit.
 *
 * Listing a table here enables its stream even if the table is NOT in
 * `verticalStreamTables` — so a model that must never reach the audit log
 * can still drive a handler.
 *
 * Compose module maps with `mergeStreamConsumers`, which merges PER TABLE:
 * two modules may consume the same table (one module's events are how
 * another reacts to them), and `{ ...a, ...b }` would keep only the last
 * module's handler on a shared key.
 *
 *   export const verticalStreamConsumers = mergeStreamConsumers(widgetsStreamConsumers);
 */
export const verticalStreamConsumers: Record<string, Array<keyof typeof verticalFunctions>> =
  mergeStreamConsumers();

/**
 * Add-on module billing: prices come from the one STRIPE_MODULE_PRICES
 * secret (a JSON map of module id to Stripe Price id), bound by the
 * create-checkout-session function only where a module is sellable
 * (amplify/data/sellable.ts). Nothing per module is declared here; the
 * webhook resolves modules from Stripe Product metadata (`module=<id>`).
 */

/**
 * Record-level access policies (amplify/data/record-access,
 * docs/record-access.md): a root model whose rows carry an access decision
 * plus the child models that inherit it. The product supplies the decision
 * snippet; the engine inserts the APPSYNC_JS steps. Empty = group rules only.
 */
export const verticalRecordAccess: RecordAccessPolicy[] = [];

/**
 * What `applyVerticalBackend` receives from amplify/backend.ts, after every
 * foundation construct and pipeline step exists.
 */
export interface VerticalBackendContext {
  /** `backend.data.resources`: hand it to APPSYNC_JS step installers. */
  data: Parameters<typeof applyRecordAccess>[0];
  /** The stack that owns the GraphQL API, where stream mappings and steps live. */
  dataStack: Stack;
  /** The root stack, for CfnOutputs. */
  rootStack: Stack;
  /** The storage bucket, for extra grants. */
  bucket: s3.IBucket;
  /** Module-owned Lambdas by their `verticalFunctions` key. */
  functions: Record<string, lambda.Function>;
}

/**
 * Product-owned CDK wiring the seams above cannot express: a product's own
 * APPSYNC_JS pipeline steps (built like amplify/data/record-access), a
 * Step Functions workflow beside a module Lambda, extra environment on a
 * module function, a product-specific managed service. backend.ts calls it
 * once, after the foundation steps; the foundation default does nothing,
 * so backend.ts never carries a product fact.
 *
 *   export function applyVerticalBackend({ data, dataStack, functions }: VerticalBackendContext) {
 *     applyWidgetGuards(data);
 *     functions.widgetCommand.addEnvironment('WIDGET_MODE', process.env.WIDGET_MODE ?? 'off');
 *   }
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function applyVerticalBackend(_ctx: VerticalBackendContext): void {}
