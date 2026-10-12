/**
 * The data domains and which one each module's tables live in
 * (docs/data-domains.md). A domain is one AppSync API with its own stack
 * tree, one per product group; the foundation (organizations, users,
 * entitlements, EventLog, the shared services) is the default API and
 * needs no line here. Lives under amplify/ because the backend reads it at
 * synth (a file outside this tree loads as CommonJS and breaks named
 * imports); the client imports it through config/data-domains.ts.
 *
 * Downstream-owned, like amplify/data/vertical.ts: the foundation ships no
 * domain, so every module stays on the foundation API until the product
 * declares its groups. Adding a domain is one id in `DATA_DOMAINS` (plus
 * its type line in ./registry.ts); adding a module to it is one line in
 * `moduleDomains`. The backend builds a domain's API once a module is on
 * it, and `npm run generate:domains` writes its introspection for the
 * client.
 *
 *   export const DATA_DOMAINS = ['operations', 'people'] as const;
 *   export const moduleDomains = {
 *     widgets: 'operations',
 *     reports: 'operations',
 *     roster: 'people',
 *   } as const satisfies Record<string, DataDomainId>;
 */
export const DATA_DOMAINS = [] as const;
export type DataDomainId = (typeof DATA_DOMAINS)[number];
export type DomainId = 'foundation' | DataDomainId;

export const moduleDomains = {} as const satisfies Record<string, DataDomainId>;

export type DomainModuleId = keyof typeof moduleDomains;

/** A module's domain; the foundation API for a module with no line here. */
export function domainOf(moduleId: string): DomainId {
  return (moduleDomains as Record<string, DomainId>)[moduleId] ?? 'foundation';
}

/**
 * The nested stack a domain's API lives in. A domain module's functions
 * declare it as their `resourceGroupName` so they share the stack with the
 * API they are granted on: a function elsewhere would read the API's URL
 * from this stack while the API's data source names the function's ARN,
 * which is a cycle between stacks (the same reason a module's Step
 * Functions workflow sits in the stack of the Lambda it drives).
 */
export const domainStackName = (domain: DataDomainId) => `${domain}-domain`;

/**
 * Where a domain publishes its API URL for the foundation's own Lambdas
 * (export providers, Assist helpers): an SSM parameter under this prefix,
 * read at run time. A CloudFormation token would make the data stack
 * depend on the domain stack, which already depends on the data stack.
 */
export const domainUrlParameterPrefix = (rootStackName: string) => `/amplify-data-domains/${rootStackName}`;
export const domainUrlParameterName = (rootStackName: string, domain: DataDomainId) => `${domainUrlParameterPrefix(rootStackName)}/${domain}/url`;
