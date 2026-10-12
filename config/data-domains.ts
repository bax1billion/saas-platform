/**
 * The module-to-data-domain map for the client (docs/data-domains.md).
 * The map itself lives under amplify/ so the backend can read it at synth;
 * this is the product-facing name client code imports.
 */
export { DATA_DOMAINS, moduleDomains, domainOf, domainStackName, type DataDomainId, type DomainId, type DomainModuleId } from "@/amplify/data/domains/assignments";
