import { a } from '@aws-amplify/backend';

/**
 * Enums and custom types that module schemas reference by `a.ref` and that
 * no module owns. Every API composes them: the foundation schema
 * (amplify/data/resource.ts) and each data domain's schema
 * (amplify/data/domains/registry.ts), since a GraphQL schema must define
 * every type it names and a domain API is its own schema
 * (docs/data-domains.md § 3). Defining the same enum on two APIs is fine;
 * what must not happen is a module model referencing a type only another
 * API has (lib/schema-boundaries.test.ts holds the module side).
 */
export const sharedTypes = {
  /** Lifecycle for uploaded files (used by vertical file-bearing models
   *  and the s3-file-trigger validation pipeline). */
  FileValidationStatus: a.enum(['PENDING', 'VALID', 'INVALID', 'QUARANTINED']),
};
