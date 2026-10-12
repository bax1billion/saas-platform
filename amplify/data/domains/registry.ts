import { a, type ClientSchema } from '@aws-amplify/backend';
import { sharedTypes } from '../shared-types';
import { composedDomains, domainContribution } from '../vertical';
import { DATA_DOMAINS, type DataDomainId } from './assignments';

/**
 * Every data domain's composed schema, by id (docs/data-domains.md § 3).
 * The run-time models are what this deploy composes (BACKEND_MODULES and
 * the module assignments); the type is every module the domain can hold,
 * so the client's `Schema` for a domain does not change with a deploy.
 * One type line per module here when it moves onto a domain; everything
 * else about a domain is derived.
 *
 * Downstream-owned, like ./assignments.ts. The foundation ships no domain;
 * a product writes one `a.schema(...)` line per domain:
 *
 *   import { a, type ClientSchema } from '@aws-amplify/backend';
 *   import { widgetsModels } from '../modules/widgets';
 *   import { reportsModels } from '../modules/reports';
 *
 *   export const domainSchemas = {
 *     operations: a.schema(domainModels('operations') as Shared & typeof widgetsModels & typeof reportsModels),
 *     people: a.schema(domainModels('people') as NoModels),
 *   } satisfies Record<DataDomainId, unknown>;
 */

/** A domain no module has moved to yet: its schema is empty and its client types nothing. */
export type NoModels = Record<string, never>;

/** The shared enums every domain schema composes (amplify/data/shared-types.ts). */
export type Shared = typeof sharedTypes;

/**
 * A domain's composed models plus the shared enums module schemas reference
 * (amplify/data/shared-types.ts); a GraphQL schema must define every type it
 * names. A domain with no module stays empty.
 */
export function domainModels(domain: DataDomainId) {
  const own = domainContribution(domain).models;
  return Object.keys(own).length ? { ...sharedTypes, ...own } : own;
}

export const domainSchemas = {} satisfies Record<DataDomainId, unknown>;

/** The schema of a domain nothing has moved to yet: no models (`a.schema(x as NoModels)`). */
type EmptySchema = ReturnType<typeof a.schema<NoModels>>;

/**
 * The schema behind a domain id. With no domain declared (the foundation's
 * default) the id type is `never` and the lookup would hand `ClientSchema`
 * the type `never`, whose expansion does not terminate; the empty schema
 * stands in for exactly that case (the tuple keeps the check from
 * distributing). A declared domain's schema is its own.
 */
type SchemaOf<D extends DataDomainId> = [D] extends [never] ? EmptySchema : (typeof domainSchemas)[D];

/** The typed client surface of a domain's API (lib/data-client.ts). */
export type DomainSchema<D extends DataDomainId> = ClientSchema<SchemaOf<D>>;

/** The domains this deploy builds: each composed domain with its schema. */
export const domainDefinitions = composedDomains.map((d) => ({ ...d, schema: domainSchemas[d.id] }));

export { DATA_DOMAINS };
export type { DataDomainId };
