import { describe, expect, it } from "vitest";
import { DATA_DOMAINS, domainSchemas, type DataDomainId } from "@/amplify/data/domains/registry";
import { moduleDomains } from "@/config/data-domains";
import { modules } from "@/config/modules";
import { verticalModels } from "@/amplify/data/vertical";
import { introspections } from "./introspections";
import { domainOf, domainOutput } from "./index";

/**
 * The committed introspection of each domain is current with its schema
 * (regenerate with `npm run generate:domains`), a module's tables live in
 * exactly one API, and the client routes by the module's domain.
 */
const modelsIn = (sdl: string) => [...sdl.matchAll(/^type (\w+) @model/gm)].map((m) => m[1]).sort();
// Indexed by id so the checks read the same with no domain declared yet.
const schemas = domainSchemas as Record<string, { transform(): { schema: string } }>;
const committed = introspections as Record<string, { models: Record<string, unknown> }>;

describe("data domains", () => {
  it("every domain has a committed introspection naming the schema's models", () => {
    for (const id of DATA_DOMAINS) {
      const declared = modelsIn(schemas[id].transform().schema);
      const generated = Object.keys(committed[id].models).sort();
      expect(generated, `${id}: run npm run generate:domains`).toEqual(declared);
    }
  });

  it("a model composed into a domain is not also in the foundation API, and in one domain only", () => {
    const foundation = new Set(Object.keys(verticalModels));
    const seen = new Map<string, string>();
    for (const id of DATA_DOMAINS) {
      for (const model of modelsIn(schemas[id].transform().schema)) {
        expect(foundation.has(model), `${model} is in both the foundation API and the ${id} domain`).toBe(false);
        expect(seen.get(model), `${model} is in both ${seen.get(model)} and ${id}`).toBeUndefined();
        seen.set(model, id);
      }
    }
  });

  it("every module with a domain line is a registered module on a known domain, and the rest route to the foundation", () => {
    const ids = new Set(modules.map((m) => m.id));
    for (const [moduleId, domain] of Object.entries(moduleDomains)) {
      expect(ids.has(moduleId), moduleId).toBe(true);
      expect(DATA_DOMAINS).toContain(domain);
    }
    expect(domainOf("not-a-module")).toBe("foundation");
  });

  it("reads a domain's outputs entry and refuses a partial one", () => {
    // Any id: the reader is the same for every domain the product declares.
    const operations = "operations" as unknown as DataDomainId;
    expect(domainOutput({}, operations)).toBeNull();
    expect(domainOutput({ custom: { dataDomains: { operations: { url: "https://x/graphql" } } } }, operations)).toBeNull();
    expect(domainOutput({ custom: { dataDomains: { operations: { url: "https://x/graphql", region: "us-east-2" } } } }, operations)).toEqual({
      url: "https://x/graphql",
      region: "us-east-2",
    });
  });
});
