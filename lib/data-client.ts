"use client";

import { generateClient } from "aws-amplify/data";
import { addSchemaToClient, type BaseClient } from "@aws-amplify/data-schema/runtime";
import { getInternals } from "@aws-amplify/api-graphql";
import outputs from "@/amplify_outputs.json";
import type { Schema } from "@/amplify/data/resource";
import type { DomainSchema } from "@/amplify/data/domains/registry";
import { introspections } from "@/lib/data-domains/introspections";
import { domainOf, domainOutput, type DataDomainId, type DomainId, type DomainModuleId } from "@/lib/data-domains";
import type { moduleDomains } from "@/config/data-domains";

/**
 * Shared, lazily created Amplify Data clients for client components.
 * Amplify.configure() runs in AmplifyProvider at module scope, so by the
 * time any component calls this the configuration is in place.
 *
 * `getDataClient()` is the foundation API (organizations, users, subscriptions, the audit trail).
 * `getDomainClient(domain)` is a product group's own API
 * (docs/data-domains.md § 3.3): Amplify's `generateClient` takes a custom
 * endpoint but leaves `models` as a throwing proxy on such a client, so
 * the typed surface is attached here with the same runtime bridge Amplify
 * uses for the default client, fed the domain's introspection (generated
 * by `npm run generate:domains`) and its URL from the custom outputs.
 * `getModuleClient(moduleId)` routes by the module's domain.
 */

type DomainOptions = { endpoint: string; authMode: "userPool" };
type FoundationClient = ReturnType<typeof generateClient<Schema>>;
type ClientFor<D extends DataDomainId> = ReturnType<typeof generateClient<DomainSchema<D>, DomainOptions>>;

/** A lookup, not a conditional type: the client types are too deep to compare generically. */
type DomainClients = { foundation: FoundationClient } & { [D in DataDomainId]: ClientFor<D> };
export type DomainClient<D extends DomainId> = DomainClients[D];
export type ModuleClient<M extends DomainModuleId> = DomainClients[(typeof moduleDomains)[M]];

const clients: Partial<Record<DomainId, unknown>> = {};

function buildDomainClient(domain: DataDomainId) {
  const out = domainOutput(outputs, domain);
  if (!out) {
    throw new Error(
      `The ${domain} data domain is not in amplify_outputs.json (custom.dataDomains.${domain}); no module is deployed on it in this environment.`
    );
  }
  const client = generateClient<DomainSchema<typeof domain>, DomainOptions>({ endpoint: out.url, authMode: "userPool" });
  // The same config shape Amplify.getConfig().API.GraphQL carries for the default API.
  const config = {
    endpoint: out.url,
    region: out.region,
    defaultAuthMode: "userPool",
    modelIntrospection: (introspections as Record<string, unknown>)[domain],
  };
  addSchemaToClient(client as unknown as BaseClient, config as Parameters<typeof addSchemaToClient>[1], getInternals);
  return client;
}

export function getDataClient() {
  return getDomainClient("foundation");
}

export function getDomainClient<D extends DomainId>(domain: D): DomainClient<D> {
  if (!clients[domain]) {
    clients[domain] = domain === "foundation" ? generateClient<Schema>() : buildDomainClient(domain as DataDomainId);
  }
  return clients[domain] as unknown as DomainClient<D>;
}

/** The client for a module's own tables (its domain's API). */
export function getModuleClient<M extends DomainModuleId>(moduleId: M): ModuleClient<M> {
  return getDomainClient(domainOf(moduleId)) as unknown as ModuleClient<M>;
}

export type { Schema, DomainSchema };
