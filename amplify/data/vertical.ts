// When adding models, start with: import { a } from '@aws-amplify/backend';
import type { defineFunction } from '@aws-amplify/backend';
import type { Stack } from 'aws-cdk-lib';
import type * as lambda from 'aws-cdk-lib/aws-lambda';
import type * as s3 from 'aws-cdk-lib/aws-s3';
import type { RecordAccessPolicy, applyRecordAccess } from './record-access/index';
import { mergeStreamConsumers } from './stream-consumers';
import { composedModules } from '../shared/bootstrap';
import { DATA_DOMAINS, domainOf, type DataDomainId } from './domains/assignments';
import type { ApiResources } from './domains/index';

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
 * register them in `moduleContributions` below: one entry per module, the
 * same shape for every module. Everything the foundation reads
 * (`verticalModels`, `verticalFunctions`, ...) is composed from that
 * registry, filtered two ways:
 *
 *  - `BACKEND_MODULES` (amplify/shared/bootstrap.ts, docs/bootstrap.md):
 *    which modules this deploy composes at all. A fresh environment is
 *    created in stages because CloudFormation caps one stack operation at
 *    2,500 resources; an existing environment leaves it unset.
 *  - the module's data domain (amplify/data/domains/assignments.ts,
 *    docs/data-domains.md): a module on a domain keeps its tables on that
 *    domain's API, so only what EventLog needs from it (entity types,
 *    actions, seeds) reaches the foundation API here;
 *    `domainContribution()` hands the rest to the domain.
 *
 *   import { widgetsModels, widgetsEntityTypes, ... } from './modules/widgets';
 *   export const moduleContributions = {
 *     widgets: {
 *       models: widgetsModels,
 *       entityTypes: widgetsEntityTypes,
 *       eventActions: widgetsEventActions,
 *       orgSeeds: widgetsOrgSeeds,
 *       streamTables: widgetsStreamTables,
 *       moduleTables: widgetsStreamTables,
 *       moduleMutations: widgetsCommandMutations,
 *       functions: widgetsFunctions,
 *       streamConsumers: widgetsStreamConsumers,
 *     },
 *   } satisfies Record<string, ModuleContribution>;
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
 *  - Audit trail: list the model in the module's `streamTables` so the
 *    event-logger streams it into EventLog, and add its entity-type /
 *    action names to the module's lists.
 *
 * Example (compliance vertical):
 *
 *   export const widgetsModels = {
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
 *   export const widgetsEntityTypes = ['PROJECT'];
 *   export const widgetsEventActions = ['PROJECT_ARCHIVED'];
 */

/** What one module hands the platform. Every field is optional but `models`. */
export interface ModuleContribution {
  /** Domain models, enums and custom types. */
  models: Record<string, unknown>;
  /** EntityType enum values (for EventLog). */
  entityTypes?: readonly string[];
  /** EventAction enum values (for EventLog). */
  eventActions?: readonly string[];
  /** Seed records the organization-trigger Lambda writes for a new org. */
  orgSeeds?: ReadonlyArray<Record<string, unknown>>;
  /** Tables streamed into the audit trail. */
  streamTables?: readonly string[];
  /** The models whose mutations need a subscription AND this module. */
  moduleTables?: readonly string[];
  /** Model → the modules any one of which may write it (a table this module owns and another's screens write). */
  sharedModuleTables?: Record<string, string[]>;
  /** Custom (command) mutations gated like the model mutations. */
  moduleMutations?: readonly string[];
  /**
   * Lambda functions by backend construct name, granted on the schema.
   *
   * Such a handler runs as a transformer admin role and bypasses every
   * model and field rule, so it MUST enforce tenancy itself: load the row
   * and compare its `orgId` with the caller's before acting on it. See
   * docs/core-data-model.md §2.5.
   */
  functions?: Record<string, unknown>;
  /**
   * Operations a module keeps on the foundation API whatever domain its
   * tables live on: a public (API key) query the foundation alone
   * authorizes. Composed into the foundation schema; their Lambdas
   * (`foundationFunctions`) are granted there and read the module's rows
   * through the domain's published URL (amplify/shared/graphql.ts
   * `moduleApi`).
   */
  foundationModels?: Record<string, unknown>;
  foundationFunctions?: Record<string, unknown>;
  /** Table → stream consumers, named by `functions` keys. */
  streamConsumers?: Record<string, readonly string[]>;
  /** Record-level access policies. */
  recordAccess?: readonly RecordAccessPolicy[];
  /**
   * APPSYNC_JS steps applied to the API this module's tables live on
   * (key stamps, policy guards): a function of that API's resources, run
   * after the entitlement and record-access steps.
   */
  apiSteps?: ReadonlyArray<(resources: ApiResources) => void | { gatedFields: string[] }>;
}

// ── Modules ─────────────────────────────────────────────────────────
// One entry per module; a module is lifted out by deleting its entry. The
// foundation ships none.

export const moduleContributions = {} satisfies Record<string, ModuleContribution>;

export type VerticalModuleId = keyof typeof moduleContributions;
export const verticalModuleIds = Object.keys(moduleContributions) as VerticalModuleId[];

/** The modules this deploy composes (BACKEND_MODULES). */
export const composed: ReadonlySet<string> = composedModules(verticalModuleIds);

const contribution = (id: VerticalModuleId): ModuleContribution => moduleContributions[id];

/** Composed modules whose tables live on the foundation API. */
const foundationModules = verticalModuleIds.filter((id) => composed.has(id) && domainOf(id) === 'foundation');
/** Every composed module, whichever API holds its tables. */
const activeModules = verticalModuleIds.filter((id) => composed.has(id));

const concat = <T>(ids: readonly VerticalModuleId[], pick: (c: ModuleContribution) => readonly T[] | undefined): T[] =>
  ids.flatMap((id) => [...(pick(contribution(id)) ?? [])]);

/**
 * Domain models, enums, and custom types merged into the foundation schema.
 * Typed as every foundation-API module's models (the client `Schema` and
 * the Lambdas' typed operations come from this type); at run time only
 * the composed modules' are present.
 *
 * One type line per module still on the foundation API; a module that
 * moves to a domain leaves this list (its type joins the domain's in
 * amplify/data/domains/registry.ts):
 *
 *   type FoundationModels = typeof widgetsModels & typeof reportsModels;
 */
type FoundationModels = Record<never, never>;
export const verticalModels = Object.assign(
  {},
  ...foundationModules.map((id) => contribution(id).models),
  // A domain module's foundation-side operations (public queries) stay here.
  ...activeModules.map((id) => contribution(id).foundationModels ?? {})
) as FoundationModels;

/** EntityType enum values contributed by the vertical (for EventLog). */
export const verticalEntityTypes: string[] = concat(activeModules, (c) => c.entityTypes);

/** EventAction enum values contributed by the vertical (for EventLog). */
export const verticalEventActions: string[] = concat(activeModules, (c) => c.eventActions);

/**
 * Seed records provisioned for each new Organization by the
 * organization-trigger Lambda (empty = no seeding). The Lambda reads
 * BACKEND_MODULES too (amplify/backend.ts), so a staged environment never
 * seeds a table it does not have.
 */
export const verticalOrgSeeds: Array<Record<string, unknown>> = concat(activeModules, (c) => c.orgSeeds);

/** Vertical tables on the foundation API streamed into the audit trail (amplify/backend.ts). */
export const verticalStreamTables: string[] = concat(foundationModules, (c) => c.streamTables);

/**
 * Module id → the models it owns on the foundation API. Mutations on
 * these models require an active subscription AND the module
 * (amplify/data/entitlements).
 */
export const verticalModuleTables: Record<string, string[]> = Object.fromEntries(
  foundationModules.filter((id) => contribution(id).moduleTables?.length).map((id) => [id, [...contribution(id).moduleTables!]])
);

/**
 * Model → the modules any one of which may write it: a table one module
 * owns that another module's screens also write through the owner's
 * published contract. Gated on subscription AND any one of them.
 */
export const verticalSharedModuleTables: Record<string, string[]> = Object.assign(
  {},
  ...foundationModules.map((id) => contribution(id).sharedModuleTables ?? {})
);

/**
 * Module id → its custom (command) mutations. Gated exactly like the
 * generated model mutations: subscription AND module. A module whose
 * Lambda writes over IAM would otherwise let a locked org in through the
 * side door — `allow.resource` bypasses model and field rules, so the gate
 * has to sit on the command field itself.
 */
export const verticalModuleMutations: Record<string, string[]> = Object.fromEntries(
  foundationModules.filter((id) => contribution(id).moduleMutations?.length).map((id) => [id, [...contribution(id).moduleMutations!]])
);

/**
 * Module-owned Lambda functions, keyed by backend construct name. Spread
 * into defineBackend() and granted on the schema (allow.resource) by the
 * foundation files, so a module adds a command handler without editing
 * amplify/backend.ts or amplify/data/resource.ts. Each function gets
 * GRAPHQL_ENDPOINT and the appsync:GraphQL policy like the foundation
 * trigger functions.
 *
 * Typed as every module's functions (the keys are names backend.ts and
 * the stream consumers use); at run time only the composed modules' are
 * present, so backend.ts guards module-specific wiring with `composed`.
 * A product narrows the type to its modules' maps so the keys are literal:
 *
 *   type AllFunctions = typeof widgetsFunctions & typeof reportsFunctions;
 */
type AllFunctions = Record<string, ReturnType<typeof defineFunction>>;
export const verticalFunctions = Object.assign(
  {},
  ...foundationModules.map((id) => contribution(id).functions ?? {}),
  // The Lambdas behind a domain module's foundation-side operations.
  ...activeModules.map((id) => contribution(id).foundationFunctions ?? {})
) as AllFunctions;

/**
 * The functions of composed modules on a data domain, keyed by backend
 * construct name like `verticalFunctions`. Spread into defineBackend() so
 * they are instantiated (in their domain's stack, by their
 * `resourceGroupName`); the domain builder grants them on the domain API
 * and hands them both endpoints. Never granted on the foundation schema.
 */
export const verticalDomainFunctions: Record<string, unknown> = Object.assign(
  {},
  ...activeModules.filter((id) => domainOf(id) !== 'foundation').map((id) => contribution(id).functions ?? {})
);

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
 * Merged PER TABLE, not spread: two modules may consume the same table
 * (one module's events are how another reacts to them), and `{ ...a, ...b }`
 * would keep only the last module's handler on a shared key.
 */
export const verticalStreamConsumers: Record<string, Array<keyof typeof verticalFunctions>> = mergeStreamConsumers(
  ...foundationModules.map((id) => (contribution(id).streamConsumers ?? {}) as Record<string, Array<keyof typeof verticalFunctions>>)
);

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
export const verticalRecordAccess: RecordAccessPolicy[] = concat(foundationModules, (c) => c.recordAccess);

/** The composed foundation-API modules' pipeline steps (key stamps, guards), applied to the foundation API by backend.ts. */
export const verticalApiSteps = concat(foundationModules, (c) => c.apiSteps);

/**
 * What a data domain's API composes (docs/data-domains.md): the models and
 * the gated tables of every composed module on that domain. Empty when
 * none of its modules is composed, in which case backend.ts builds no API.
 */
export function domainContribution(domain: DataDomainId) {
  const ids = verticalModuleIds.filter((id) => composed.has(id) && domainOf(id) === domain);
  return {
    id: domain,
    modules: ids as string[],
    models: Object.assign({}, ...ids.map((id) => contribution(id).models)) as Record<string, unknown>,
    moduleTables: Object.fromEntries(ids.filter((id) => contribution(id).moduleTables?.length).map((id) => [id, [...contribution(id).moduleTables!]])) as Record<string, string[]>,
    /** Model → the modules any one of which may write it (a shared table this domain owns). */
    sharedModuleTables: Object.assign({}, ...ids.map((id) => contribution(id).sharedModuleTables ?? {})) as Record<string, string[]>,
    /** Module id → its command mutations, gated on this API like the model mutations. */
    moduleMutations: Object.fromEntries(ids.filter((id) => contribution(id).moduleMutations?.length).map((id) => [id, [...contribution(id).moduleMutations!]])) as Record<string, string[]>,
    /** Backend construct name → the defineFunction factory (the same objects defineBackend instantiates). */
    functions: Object.assign({}, ...ids.map((id) => contribution(id).functions ?? {})) as Record<string, unknown>,
    streamTables: concat(ids, (c) => c.streamTables),
    /** Table → the domain's functions (by construct name) that consume its stream. */
    streamConsumers: mergeStreamConsumers(...ids.map((id) => (contribution(id).streamConsumers ?? {}) as Record<string, string[]>)),
    recordAccess: concat(ids, (c) => c.recordAccess),
    apiSteps: concat(ids, (c) => c.apiSteps),
  };
}

/** Every data domain with at least one composed module; the backend builds an API per entry. */
export const composedDomains = DATA_DOMAINS.map(domainContribution).filter((d) => d.modules.length > 0);

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
  /** Module-owned Lambdas by their `verticalFunctions` key (foundation-API modules). */
  functions: Record<string, lambda.Function>;
  /** The modules this deploy composes, for wiring that only applies when a module is in. */
  composed: ReadonlySet<string>;
}

/**
 * Product-owned CDK wiring the seams above cannot express: a Step
 * Functions workflow beside a module Lambda, extra environment on a module
 * function, a product-specific managed service. (A module's own
 * APPSYNC_JS pipeline steps go in its `apiSteps` instead, so they follow
 * the module onto a data domain.) backend.ts calls it once, after the
 * foundation steps; the foundation default does nothing, so backend.ts
 * never carries a product fact. Guard module-specific wiring with
 * `composed`, since a staged deploy may leave the module out.
 *
 *   export function applyVerticalBackend({ functions, composed }: VerticalBackendContext) {
 *     if (!composed.has('widgets')) return;
 *     functions.widgetCommand.addEnvironment('WIDGET_MODE', process.env.WIDGET_MODE ?? 'off');
 *   }
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function applyVerticalBackend(_ctx: VerticalBackendContext): void {}
