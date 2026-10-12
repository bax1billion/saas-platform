import { SignatureV4 } from '@aws-sdk/signature-v4';
import { Sha256 } from '@aws-crypto/sha256-js';
import { HttpRequest } from '@aws-sdk/protocol-http';
import { defaultProvider } from '@aws-sdk/credential-provider-node';
import { domainOf } from '../data/domains/assignments';

/**
 * IAM (SigV4) signed AppSync GraphQL client for Lambdas — the "call back
 * into AppSync" half of the stored-procedure pattern (docs/core-data-model.md
 * §1). Requires the function to be granted on the schema via
 * `allow.resource(fn)` and to have GRAPHQL_ENDPOINT in its environment
 * (set for every function in allTriggerFunctions by amplify/backend.ts).
 */

/** Which API a call goes to: the foundation (default) or a data domain. */
export interface GraphqlTarget {
  /** A data domain id (docs/data-domains.md); the foundation API when absent or 'foundation'. */
  domain?: string;
}

/**
 * The API a module's rows live on, for a call that touches them: its data
 * domain, or the foundation while the module has no assignment. A handler
 * writes `graphql(query, vars, moduleApi('widgets'))` for its own rows and
 * another module's, and the plain call for the foundation's rows (users, organizations).
 */
export const moduleApi = (moduleId: string): GraphqlTarget => ({ domain: domainOf(moduleId) });

// GRAPHQL_ENDPOINT is set by amplify/backend.ts; AMPLIFY_DATA_GRAPHQL_ENDPOINT
// is Amplify's own SSM-resolved value on schema-granted functions. Resolved
// lazily so the SSM banner has run before we read it. A domain's URL comes
// from DATA_DOMAIN_ENDPOINTS (JSON, domain id to URL), set on a domain's
// functions by amplify/data/domains/index.ts.
// A domain's URL: a domain's own functions carry it in DATA_DOMAIN_ENDPOINTS;
// a foundation function (an export provider, an Assist helper) reads it once
// from the SSM parameter the domain stack wrote (amplify/data/domains/index.ts
// grantDomainUrlLookup), since a token would tie the data stack to the domain's.
const domainUrls = new Map<string, Promise<string>>();

async function domainEndpoint(domain: string): Promise<string> {
  const raw = process.env.DATA_DOMAIN_ENDPOINTS;
  const fromEnv = raw ? (JSON.parse(raw) as Record<string, string>)[domain] : undefined;
  if (fromEnv) return fromEnv;
  const prefix = process.env.DATA_DOMAIN_PARAMETER_PREFIX;
  if (!prefix) throw new Error(`This function has no way to reach the "${domain}" data domain (neither DATA_DOMAIN_ENDPOINTS nor DATA_DOMAIN_PARAMETER_PREFIX is set)`);
  let pending = domainUrls.get(domain);
  if (!pending) {
    pending = (async () => {
      const { SSMClient, GetParameterCommand } = await import('@aws-sdk/client-ssm');
      const res = await new SSMClient({}).send(new GetParameterCommand({ Name: `${prefix}/${domain}/url` }));
      const value = res.Parameter?.Value;
      if (!value) throw new Error(`No URL published for the "${domain}" data domain (${prefix}/${domain}/url); is a module deployed on it?`);
      return value;
    })();
    domainUrls.set(domain, pending);
    pending.catch(() => domainUrls.delete(domain));
  }
  return pending;
}

async function endpoint(target?: GraphqlTarget): Promise<string> {
  if (target?.domain && target.domain !== 'foundation') return domainEndpoint(target.domain);
  const url =
    process.env.GRAPHQL_ENDPOINT || process.env.AMPLIFY_DATA_GRAPHQL_ENDPOINT;
  if (!url) throw new Error('GRAPHQL_ENDPOINT is not configured');
  return url;
}

let signer: SignatureV4 | undefined;

function getSigner(): SignatureV4 {
  if (!signer) {
    signer = new SignatureV4({
      credentials: defaultProvider(),
      region: process.env.AWS_REGION!,
      service: 'appsync',
      sha256: Sha256,
    });
  }
  return signer;
}

export async function graphql<T = unknown>(
  query: string,
  variables?: Record<string, unknown>,
  target?: GraphqlTarget
): Promise<T> {
  const graphqlEndpoint = await endpoint(target);
  const url = new URL(graphqlEndpoint);
  const body = JSON.stringify({ query, variables });

  const request = new HttpRequest({
    method: 'POST',
    hostname: url.hostname,
    path: url.pathname,
    headers: {
      'Content-Type': 'application/json',
      host: url.hostname,
    },
    body,
  });

  const signed = await getSigner().sign(request);

  const response = await fetch(graphqlEndpoint, {
    method: 'POST',
    headers: signed.headers,
    body,
  });

  const json = (await response.json()) as {
    data?: T;
    errors?: Array<{ message: string }>;
  };
  if (json.errors?.length) {
    throw new Error(json.errors[0].message);
  }
  return json.data as T;
}

/** Drain a paginated list query. */
export async function listAll<T>(
  query: string,
  variables: Record<string, unknown>,
  pick: (data: Record<string, unknown>) => { items: T[]; nextToken?: string | null },
  target?: GraphqlTarget
): Promise<T[]> {
  const out: T[] = [];
  let nextToken: string | null | undefined;
  do {
    const data = await graphql<Record<string, unknown>>(query, { ...variables, nextToken }, target);
    const page = pick(data);
    out.push(...page.items);
    nextToken = page.nextToken;
  } while (nextToken);
  return out;
}

/** Drain a `<field>(…, limit, nextToken)` list query by field name. */
export const listByField = <T>(
  field: string,
  args: string,
  vars: string,
  fields: string,
  variables: Record<string, unknown>,
  limit = 1000,
  target?: GraphqlTarget
) =>
  listAll<T>(
    `query L(${args}, $nextToken: String) { ${field}(${vars}, limit: ${limit}, nextToken: $nextToken) { items { ${fields} } nextToken } }`,
    variables,
    (d) => d[field] as { items: T[]; nextToken?: string | null },
    target
  );
