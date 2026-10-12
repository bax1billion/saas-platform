import { DATA_DOMAINS, domainOf, type DataDomainId, type DomainId, type DomainModuleId } from "@/config/data-domains";

/**
 * Data domain routing for the client (docs/data-domains.md § 3.3). A
 * module's rows live in its group's API; everything else is the
 * foundation API. `lib/data-client.ts` turns a domain id into a typed
 * client; the introspection each client needs is generated into
 * ./introspections.ts by `npm run generate:domains`.
 */
export type { DataDomainId, DomainId, DomainModuleId };
export { DATA_DOMAINS, domainOf };

/** The outputs entry a domain API publishes (`amplify/data/domains/index.ts`, custom outputs). */
export interface DomainOutput {
  url: string;
  region: string;
}

export function domainOutput(outputs: unknown, domain: DataDomainId): DomainOutput | null {
  const custom = (outputs as { custom?: { dataDomains?: Record<string, Partial<DomainOutput>> } } | null)?.custom;
  const entry = custom?.dataDomains?.[domain];
  return entry?.url && entry.region ? { url: entry.url, region: entry.region } : null;
}
